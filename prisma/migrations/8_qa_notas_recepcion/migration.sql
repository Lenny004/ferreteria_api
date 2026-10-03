-- Fallar rápido evita quedar en cola detrás de bloqueos del POS y bloquear a otros.
-- SET LOCAL limita el timeout a la transacción de esta migración: no se filtra a
-- migraciones posteriores ejecutadas en la misma sesión de `prisma migrate deploy`.
SET LOCAL lock_timeout = '5s';

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
