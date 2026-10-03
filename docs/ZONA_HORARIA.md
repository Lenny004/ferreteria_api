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

Hasta `0_init`, la vista filtraba con `o."CreatedAt"::date = CURRENT_DATE`. Las dos expresiones usan la zona de la **sesión** de PostgreSQL; la caja no fija la zona en su conexión y el servidor usa la de la imagen (`Etc/UTC`), así que la vista cortaba el día en **UTC**: después de las 6:00 p. m. hora local, el "hoy" de la vista ya era el día siguiente.

La migración `3_pos_vkpistoday_zona_horaria` la recrea (`CREATE OR REPLACE VIEW`, mismas columnas, orden y tipos) con el corte en hora local:

```sql
WHERE (o."CreatedAt" AT TIME ZONE 'America/El_Salvador')::date
        = (now() AT TIME ZONE 'America/El_Salvador')::date
  AND o."status" = 'COMPLETADA'
```

- `"CreatedAt"` es `timestamptz`: `AT TIME ZONE` devuelve la hora local de pared (`timestamp`) y `::date` toma su fecha. El resultado no depende de la zona de la sesión.
- Una vista no recibe parámetros, así que la zona va **literal** y coincide con el valor por defecto de `BUSINESS_TZ`. Si la zona del negocio cambia, se necesita una migración nueva (y cambiar `Negocio:ZonaHoraria` del POS).
- La vista sigue siendo de **ventas brutas** (ver [VENTAS_NETAS.md](VENTAS_NETAS.md)).
- Copia para el `Squema.sql` del POS: `docs/pos/3_pos_vkpistoday_zona_horaria_squema.sql`. La prueba `tests-db/pos-vkpistoday-zona-horaria.test.ts` verifica que sea idéntica a la migración.