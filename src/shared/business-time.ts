/**
 * Zona horaria del negocio y límites de periodo (día, semana, mes) calculados en PostgreSQL.
 * La tienda opera en hora de El Salvador (UTC-6, sin horario de verano); los timestamps se
 * guardan como `timestamptz`, así que los cortes se obtienen con `AT TIME ZONE` y no en UTC.
 * La zona es configurable con `BUSINESS_TZ` (por defecto `America/El_Salvador`).
 */

import { Prisma, PrismaClient } from "@prisma/client";

/** Zona horaria por defecto de la tienda. */
export const DEFAULT_BUSINESS_TZ = "America/El_Salvador";

/** Cliente Prisma normal o de transacción: ambos exponen `$queryRaw`. */
type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Indica si el nombre es una zona IANA reconocida por el runtime.
 *
 * @param timeZone - Nombre de zona, por ejemplo `America/El_Salvador`.
 * @returns `true` si `Intl` acepta la zona.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee `BUSINESS_TZ` y devuelve la zona del negocio.
 *
 * @param source - Variables de entorno (por defecto `process.env`).
 * @returns La zona configurada o `America/El_Salvador` si no se definió.
 * @throws Error si `BUSINESS_TZ` no es una zona IANA válida.
 */
export function businessTimeZone(source: NodeJS.ProcessEnv = process.env): string {
  const raw = source.BUSINESS_TZ?.trim();
  if (!raw) return DEFAULT_BUSINESS_TZ;
  if (!isValidTimeZone(raw)) throw new Error(`BUSINESS_TZ no es una zona horaria IANA válida: ${raw}`);
  return raw;
}

/**
 * Fecha calendario (`YYYY-MM-DD`) de un instante en la zona del negocio.
 * Se usa para etiquetar filas de reportes, no para filtrar rangos.
 *
 * @param date - Instante a convertir.
 * @param timeZone - Zona del negocio.
 * @returns Fecha local en formato ISO corto.
 */
export function businessDateKey(date: Date, timeZone: string = businessTimeZone()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Convierte una fecha `YYYY-MM-DD` en el `Date` que Prisma usa para columnas `@db.Date`.
 *
 * @param dateKey - Fecha calendario local.
 * @param addDays - Días calendario a sumar.
 * @returns Medianoche UTC de esa fecha (representación de `date` en Prisma).
 */
export function dateKeyToDbDate(dateKey: string, addDays = 0): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + addDays));
}

/** Límites [inicio, fin) de los periodos del dashboard en la zona del negocio. */
export interface BusinessPeriods {
  timeZone: string;
  /** 00:00 local de hoy. */
  todayStart: Date;
  /** 00:00 local de mañana (fin exclusivo de hoy, semana y mes en curso). */
  tomorrow: Date;
  /** 00:00 local de hace 6 días: la semana son los últimos 7 días incluyendo hoy. */
  weekStart: Date;
  /** 00:00 local del día 1 del mes en curso. */
  monthStart: Date;
  /** 00:00 local del día 1 del mes anterior. */
  prevMonthStart: Date;
  /** Fecha local de hoy (`YYYY-MM-DD`). */
  todayDate: string;
  /** Fecha local de inicio de la semana (`YYYY-MM-DD`). */
  weekStartDate: string;
}

type PeriodsRow = Omit<BusinessPeriods, "timeZone">;

/**
 * Calcula en PostgreSQL los límites de hoy, semana, mes y mes anterior en la zona del negocio.
 * `ts AT TIME ZONE tz` da la hora local; `date_trunc` corta en local y el segundo
 * `AT TIME ZONE tz` vuelve a convertir ese inicio local en un instante `timestamptz`.
 *
 * @param db - Cliente Prisma o transacción.
 * @param now - Instante de referencia.
 * @param timeZone - Zona del negocio (por defecto `BUSINESS_TZ`).
 * @returns Límites como instantes absolutos más las fechas locales de hoy e inicio de semana.
 */
export async function businessPeriods(
  db: Db,
  now: Date,
  timeZone: string = businessTimeZone(),
): Promise<BusinessPeriods> {
  const [row] = await db.$queryRaw<PeriodsRow[]>(Prisma.sql`
    WITH local_now AS (
      SELECT
        date_trunc('day', ${now}::timestamptz AT TIME ZONE ${timeZone}::text) AS day_start,
        date_trunc('month', ${now}::timestamptz AT TIME ZONE ${timeZone}::text) AS month_start
    )
    SELECT
      (l.day_start AT TIME ZONE ${timeZone}::text) AS "todayStart",
      ((l.day_start + interval '1 day') AT TIME ZONE ${timeZone}::text) AS "tomorrow",
      ((l.day_start - interval '6 days') AT TIME ZONE ${timeZone}::text) AS "weekStart",
      (l.month_start AT TIME ZONE ${timeZone}::text) AS "monthStart",
      ((l.month_start - interval '1 month') AT TIME ZONE ${timeZone}::text) AS "prevMonthStart",
      to_char(l.day_start, 'YYYY-MM-DD') AS "todayDate",
      to_char(l.day_start - interval '6 days', 'YYYY-MM-DD') AS "weekStartDate"
    FROM local_now l
  `);
  return { timeZone, ...row };
}

/**
 * Rango [inicio, fin) de un mes o de un año calendario en la zona del negocio.
 *
 * @param db - Cliente Prisma o transacción.
 * @param year - Año calendario.
 * @param month - Mes 1-12; si se omite, el rango cubre el año completo.
 * @param timeZone - Zona del negocio (por defecto `BUSINESS_TZ`).
 * @returns Instantes de inicio y fin exclusivo.
 */
export async function businessCalendarRange(
  db: Db,
  year: number,
  month?: number,
  timeZone: string = businessTimeZone(),
): Promise<{ start: Date; end: Date }> {
  const span = month === undefined ? "1 year" : "1 month";
  const [row] = await db.$queryRaw<Array<{ start: Date; end: Date }>>(Prisma.sql`
    WITH local_start AS (
      SELECT make_timestamp(${year}::int, ${month ?? 1}::int, 1, 0, 0, 0) AS ts
    )
    SELECT
      (l.ts AT TIME ZONE ${timeZone}::text) AS "start",
      ((l.ts + ${span}::interval) AT TIME ZONE ${timeZone}::text) AS "end"
    FROM local_start l
  `);
  return row;
}