-- La validación y el índice van en una migración separada porque InventoryMovements
-- es grande y la caja POS escribe en ella durante cada venta.
ALTER TABLE public."InventoryMovements"
  VALIDATE CONSTRAINT "FKInventoryMovementsShopOrder";

CREATE INDEX "IdxInvMovShopOrder"
  ON public."InventoryMovements"("ShopOrderId");
