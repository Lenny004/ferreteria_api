-- Consulta de solo lectura: no corrige datos ni modifica ninguna tabla.
WITH cancelados AS (
  SELECT
    so."id" AS pedido_id,
    so."UpdatedAt" AS cancelado_aprox_at,
    sc."FullName" AS cliente,
    sc."Email" AS cliente_email
  FROM system."ShopOrders" so
  JOIN system."ShopCustomers" sc ON sc."id" = so."ShopCustomerId"
  WHERE so."Status" = 'CANCELADA'
), salidas AS (
  SELECT
    c.pedido_id,
    im."ProductId" AS producto_id,
    SUM(ABS(im."quantity")) AS cantidad_vendida
  FROM cancelados c
  JOIN public."InventoryMovements" im
    ON (
      im."ShopOrderId" = c.pedido_id
      OR (
        im."ShopOrderId" IS NULL
        AND im."MovementType" = 'SALIDA_VENTA'
        AND im."reason" = 'Pedido tienda ' || c.pedido_id::text
      )
    )
  WHERE im."MovementType" = 'SALIDA_VENTA'
  GROUP BY c.pedido_id, im."ProductId"
), reingresos AS (
  SELECT
    c.pedido_id,
    im."ProductId" AS producto_id,
    SUM(ABS(im."quantity")) AS cantidad_reingresada
  FROM cancelados c
  JOIN public."InventoryMovements" im
    ON (
      im."ShopOrderId" = c.pedido_id
      OR (
        im."ShopOrderId" IS NULL
        AND im."MovementType" = 'ENTRADA_DEVOLUCION'
        AND im."reason" = 'Cancelación pedido tienda ' || c.pedido_id::text
      )
    )
  WHERE im."MovementType" = 'ENTRADA_DEVOLUCION'
  GROUP BY c.pedido_id, im."ProductId"
), pendientes AS (
  SELECT
    c.pedido_id,
    c.cancelado_aprox_at,
    c.cliente,
    c.cliente_email,
    s.producto_id,
    s.cantidad_vendida,
    COALESCE(r.cantidad_reingresada, 0) AS cantidad_reingresada,
    s.cantidad_vendida - COALESCE(r.cantidad_reingresada, 0) AS pendiente
  FROM cancelados c
  JOIN salidas s ON s.pedido_id = c.pedido_id
  LEFT JOIN reingresos r
    ON r.pedido_id = s.pedido_id AND r.producto_id = s.producto_id
)
SELECT
  p.pedido_id,
  p.cancelado_aprox_at,
  p.cliente,
  p.cliente_email,
  p.producto_id,
  pr."code" AS producto_codigo,
  pr."description" AS producto_descripcion,
  p.cantidad_vendida,
  p.cantidad_reingresada,
  p.pendiente
FROM pendientes p
JOIN public."Products" pr ON pr."id" = p.producto_id
WHERE p.pendiente > 0
ORDER BY p.cancelado_aprox_at, p.pedido_id, p.producto_id;
