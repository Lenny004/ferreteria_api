# Zona horaria del negocio

La tienda opera en hora de El Salvador (`America/El_Salvador`, UTC-6, sin horario de verano). Los timestamps se guardan como `timestamptz` (instantes absolutos), pero los cortes de **día, semana y mes** deben hacerse a medianoche **local**: con cortes en UTC, una venta a las 6:00 p. m. o más tarde caía en el día siguiente, y la del último día del mes después de las 6:00 p. m. caía en el mes siguiente.

## Configuración

- Variable `BUSINESS_TZ` (zona IANA). Por defecto `America/El_Salvador`.
- `loadEnv()` la valida al arrancar: una zona inválida detiene el proceso.

## Cómo se calcula

Todo en PostgreSQL con `AT TIME ZONE` (`src/shared/business-time.ts`):

```sql
-- inicio local de hoy como instante absoluto
date_trunc('day', now() AT TIME ZONE 'America/El_Salvador') AT TIME ZONE 'America/El_Salvador'
-- día local de una venta (series diarias)
("CreatedAt" AT TIME ZONE 'America/El_Salvador')::date
```

- `businessPeriods(db, now)`: devuelve hoy, mañana (fin exclusivo), inicio de semana (hoy − 6 días), inicio del mes y del mes anterior, y además las fechas locales `todayDate` y `weekStartDate`.
- `businessCalendarRange(db, year, month?)`: da el rango [inicio, fin) de un mes o de un año local.
- `businessDateKey(date)`: da la fecha local `YYYY-MM-DD` para etiquetar filas de reportes.

## Dónde se aplica

| Endpoint | Periodos |
| --- | --- |
| `GET /dashboard/summary` | Ventas (hoy, semana, mes, mes anterior, por tipo, producto, categoría y serie de 7 días), movimientos de inventario de hoy, compras del mes y documentos que vencen en 30 días (desde la fecha local de hoy). La respuesta incluye `timeZone`. |
| Libros de IVA (`/fiscal/iva-reports/...`) y listado de DTE por año/mes | Rango del mes o año local. La columna `date` de cada línea es la fecha local. |

Las alertas de stock no tienen cortes de periodo (solo estado abierta/resuelta), así que no cambian. Las columnas `date` (planilla, vencimientos) ya son fechas calendario y no se convierten.

## Vista POS `sales."VKpisToday"` (Ferretería Caja)

La definición (`0_init`) filtra con `o."CreatedAt"::date = CURRENT_DATE`. Ambas expresiones usan la zona de la **sesión** de PostgreSQL. La caja no fija la zona en su conexión y el servidor usa la zona por defecto de la imagen (`Etc/UTC`), así que en la práctica la vista corta el día en **UTC**: después de las 6:00 p. m. hora local, el "hoy" de la vista ya es el día siguiente. No se modifica desde este repositorio (la BD del POS es de erp_ferreteria). Recomendación para Ferretería Caja: filtrar con `(o."CreatedAt" AT TIME ZONE 'America/El_Salvador')::date = (now() AT TIME ZONE 'America/El_Salvador')::date`, o fijar `timezone` de la base o del rol.