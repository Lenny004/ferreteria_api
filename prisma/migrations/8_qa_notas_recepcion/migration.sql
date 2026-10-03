SET lock_timeout = '5s';
-- Fallar rápido evita quedar en cola detrás de bloqueos del POS y bloquear a otros.

ALTER TABLE purchasing."PurchaseOrders"
  ADD COLUMN "ReceivedByWebUserId" UUID NULL;

ALTER TABLE purchasing."PurchaseOrders"
  ADD CONSTRAINT "FKPurchaseOrdersReceivedByWebUser"
  FOREIGN KEY ("ReceivedByWebUserId")
  REFERENCES system."WebUsers"("id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;

CREATE INDEX "IdxPurchaseOrdersReceivedByWebUser"
  ON purchasing."PurchaseOrders"("ReceivedByWebUserId");
