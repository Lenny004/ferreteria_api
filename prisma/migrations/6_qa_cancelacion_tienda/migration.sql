-- Migración aditiva de cancelación de pedidos de tienda y reposición idempotente.
ALTER TABLE purchasing."PurchaseOrders"
  ALTER COLUMN "EmployeeId" DROP NOT NULL;

ALTER TABLE purchasing."PurchaseOrders"
  ADD COLUMN "CreatedByWebUserId" UUID NULL;

ALTER TABLE purchasing."PurchaseOrders"
  ADD CONSTRAINT "FKPurchaseOrdersCreatedByWebUser"
  FOREIGN KEY ("CreatedByWebUserId")
  REFERENCES system."WebUsers"("id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;

CREATE INDEX "IdxPurchaseOrdersCreatedByWebUser"
  ON purchasing."PurchaseOrders"("CreatedByWebUserId");

-- Estas operaciones son breves y dejan la validación pesada para la migración 7.
ALTER TABLE public."InventoryMovements"
  ADD COLUMN "ShopOrderId" UUID NULL;

ALTER TABLE public."InventoryMovements"
  ADD CONSTRAINT "FKInventoryMovementsShopOrder"
  FOREIGN KEY ("ShopOrderId")
  REFERENCES system."ShopOrders"("id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION
  NOT VALID;
