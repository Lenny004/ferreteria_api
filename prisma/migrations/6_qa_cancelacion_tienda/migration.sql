-- Migración aditiva de cancelación de pedidos de tienda y reposición idempotente.
ALTER TABLE public."InventoryMovements"
  ADD COLUMN "ShopOrderId" UUID NULL;

ALTER TABLE public."InventoryMovements"
  ADD CONSTRAINT "FKInventoryMovementsShopOrder"
  FOREIGN KEY ("ShopOrderId")
  REFERENCES system."ShopOrders"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE INDEX "IdxInvMovShopOrder"
  ON public."InventoryMovements"("ShopOrderId");
