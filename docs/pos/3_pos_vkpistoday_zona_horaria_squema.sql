-- 3_pos_vkpistoday_zona_horaria: sales."VKpisToday" con el corte de día en America/El_Salvador.
-- Origen: prisma/migrations/3_pos_vkpistoday_zona_horaria/migration.sql (misma sentencia, carácter por carácter;
-- tests-db/pos-vkpistoday-zona-horaria.test.ts lo verifica).
-- Para Ferretería Caja: reemplaza la definición de sales."VKpisToday" de la sección VISTAS de
-- Ferreteria.PuntoVenta/Squema.sql. Es idempotente (CREATE OR REPLACE VIEW) y no toca datos.
CREATE OR REPLACE VIEW sales."VKpisToday" AS
SELECT
    COUNT(*)                    AS "TotalOrders",
    COALESCE(SUM(o."total"), 0) AS "TotalAmount",
    COALESCE(AVG(o."total"), 0) AS "AvgTicket"
FROM sales."Orders" o
WHERE (o."CreatedAt" AT TIME ZONE 'America/El_Salvador')::date
        = (now() AT TIME ZONE 'America/El_Salvador')::date
  AND o."status" = 'COMPLETADA';