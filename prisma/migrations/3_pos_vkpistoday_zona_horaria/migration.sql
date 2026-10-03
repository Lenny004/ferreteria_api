-- 3_pos_vkpistoday_zona_horaria: la vista POS sales."VKpisToday" corta el día en hora del negocio (aditiva).
-- Ver docs/ZONA_HORARIA.md y docs/MIGRACIONES.md.
--
-- sales."Orders"."CreatedAt" es TIMESTAMPTZ (instante absoluto). Para ese tipo,
-- `"CreatedAt" AT TIME ZONE 'America/El_Salvador'` devuelve la hora local de pared (timestamp sin zona)
-- y `::date` toma su fecha; `now() AT TIME ZONE 'America/El_Salvador'` hace lo mismo con el instante
-- actual. Ninguna de las dos depende de la zona de la sesión. Antes (`0_init`) se comparaba
-- `"CreatedAt"::date = CURRENT_DATE`, que usa la zona de la sesión (UTC en el servidor), así que las
-- ventas de después de las 6:00 p. m. hora local contaban para el día siguiente.
--
-- Una vista no recibe parámetros: la zona va literal y coincide con el valor por defecto de BUSINESS_TZ.
-- Si la zona del negocio cambia, hace falta una migración nueva.
-- Mismas columnas, en el mismo orden y con los mismos tipos que 0_init (CREATE OR REPLACE VIEW lo exige).
-- Copia idéntica para el POS: docs/pos/3_pos_vkpistoday_zona_horaria_squema.sql.
CREATE OR REPLACE VIEW sales."VKpisToday" AS
SELECT
    COUNT(*)                    AS "TotalOrders",
    COALESCE(SUM(o."total"), 0) AS "TotalAmount",
    COALESCE(AVG(o."total"), 0) AS "AvgTicket"
FROM sales."Orders" o
WHERE (o."CreatedAt" AT TIME ZONE 'America/El_Salvador')::date
        = (now() AT TIME ZONE 'America/El_Salvador')::date
  AND o."status" = 'COMPLETADA';