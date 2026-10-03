-- Migración aditiva de seguimiento QA: referencias de transferencia enviadas por clientes.
ALTER TABLE system."ShopPayments"
  ADD COLUMN "CustomerReference" varchar(100) NULL,
  ADD COLUMN "CustomerReferenceAt" timestamptz NULL;
