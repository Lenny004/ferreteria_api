-- Migración aditiva de seguridad: rotación de sesiones y auditoría de pagos.
ALTER TABLE system."WebUsers"
  ADD COLUMN "TokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE system."ShopCustomers"
  ADD COLUMN "TokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE system."ShopPayments"
  ADD COLUMN "ConfirmedByWebUserId" uuid NULL,
  ADD COLUMN "ConfirmedAt" timestamptz NULL;

CREATE INDEX "IdxShopPaymentsConfirmedByWebUser"
  ON system."ShopPayments" ("ConfirmedByWebUserId");

ALTER TABLE system."ShopPayments"
  ADD CONSTRAINT "ShopPayments_ConfirmedByWebUserId_fkey"
  FOREIGN KEY ("ConfirmedByWebUserId")
  REFERENCES system."WebUsers"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;
