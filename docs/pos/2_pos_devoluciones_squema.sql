-- 2_pos_devoluciones: devoluciones POS (aditiva).
-- Este archivo se copia a Ferreteria.PuntoVenta/Squema.sql.

-- Parte 0: pre-chequeo. Aborta si una caja tiene más de una sesión ABIERTA.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sales."CashSessions"
        WHERE "status" = 'ABIERTA'
        GROUP BY "CashRegisterCode"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION '2_pos_devoluciones: existen cajas con más de una sesión ABIERTA; revise y cierre/cancele las sesiones duplicadas. Ver docs/MIGRACIONES.md.';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS sales."Returns" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "OrderId"                UUID NOT NULL,
    "CashSessionId"          UUID,
    "EmployeeId"             UUID NOT NULL,
    "AuthorizedByEmployeeId" UUID NOT NULL,
    "ClientRequestId"        UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReturnType"             VARCHAR(10) NOT NULL,
    "status"                 VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA',
    "FiscalStatus"           VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "CreditNoteDteId"        UUID,
    "ReasonCode"             VARCHAR(30) NOT NULL,
    "notes"                  TEXT,
    "subtotal"               DECIMAL(12,2) NOT NULL,
    "DiscountAmount"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TaxAmount"              DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total"                  DECIMAL(12,2) NOT NULL,
    "RefundMethod"           VARCHAR(20) NOT NULL,
    "RefundAmount"           DECIMAL(12,2) NOT NULL DEFAULT 0,
    "CreatedAt"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Returns_OrderId_fkey" FOREIGN KEY ("OrderId") REFERENCES sales."Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Returns_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES sales."CashSessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Returns_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES hr."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Returns_AuthorizedByEmployeeId_fkey" FOREIGN KEY ("AuthorizedByEmployeeId") REFERENCES hr."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "Returns_CreditNoteDteId_fkey" FOREIGN KEY ("CreditNoteDteId") REFERENCES dte."DteIssued"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ChkReturnsType" CHECK ("ReturnType" IN ('TOTAL','PARCIAL')),
    CONSTRAINT "ChkReturnsStatus" CHECK ("status" IN ('COMPLETADA','ANULADA')),
    CONSTRAINT "ChkReturnsFiscalStatus" CHECK ("FiscalStatus" IN ('PENDIENTE','EMITIDO','REQUIERE_VALID','NO_APLICA')),
    CONSTRAINT "ChkReturnsRefundMethod" CHECK ("RefundMethod" IN ('EFECTIVO','TARJETA','TRANSFERENCIA','NINGUNO')),
    CONSTRAINT "ChkReturnsAmounts" CHECK ("subtotal" >= 0 AND "DiscountAmount" >= 0 AND "TaxAmount" >= 0 AND "total" > 0),
    CONSTRAINT "ChkReturnsRefund" CHECK ("RefundAmount" >= 0 AND "RefundAmount" <= "total" AND ("RefundMethod" <> 'NINGUNO' OR "RefundAmount" = 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS "UqReturnsClientRequest" ON sales."Returns"("ClientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "UqReturnsCreditNote" ON sales."Returns"("CreditNoteDteId") WHERE "CreditNoteDteId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IdxReturnsOrder" ON sales."Returns"("OrderId");
CREATE INDEX IF NOT EXISTS "IdxReturnsCashSession" ON sales."Returns"("CashSessionId");
CREATE INDEX IF NOT EXISTS "IdxReturnsCreatedAt" ON sales."Returns"("CreatedAt");
CREATE INDEX IF NOT EXISTS "IdxReturnsFiscalStatus" ON sales."Returns"("FiscalStatus");

CREATE TABLE IF NOT EXISTS sales."ReturnDetails" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReturnId"            UUID NOT NULL,
    "OrderDetailId"       UUID NOT NULL,
    "ProductId"           UUID NOT NULL,
    "quantity"            DECIMAL(12,3) NOT NULL,
    "UnitsPerPackage"     DECIMAL(12,3) NOT NULL DEFAULT 1,
    "UnitPrice"           DECIMAL(12,2) NOT NULL,
    "UnitCost"            DECIMAL(12,4) NOT NULL DEFAULT 0,
    "DiscountAmount"      DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal"            DECIMAL(12,2) NOT NULL,
    "TaxAmount"           DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Restocked"           BOOLEAN NOT NULL DEFAULT TRUE,
    "RestockQuantity"     DECIMAL(12,3) NOT NULL DEFAULT 0,
    "InventoryMovementId" UUID,
    "CreatedAt"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnDetails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReturnDetails_ReturnId_fkey" FOREIGN KEY ("ReturnId") REFERENCES sales."Returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ReturnDetails_OrderDetailId_fkey" FOREIGN KEY ("OrderDetailId") REFERENCES sales."OrderDetails"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ReturnDetails_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES public."Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ReturnDetails_InventoryMovementId_fkey" FOREIGN KEY ("InventoryMovementId") REFERENCES public."InventoryMovements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ChkReturnDetailsQuantity" CHECK ("quantity" > 0 AND "UnitsPerPackage" > 0),
    CONSTRAINT "ChkReturnDetailsAmounts" CHECK ("UnitPrice" >= 0 AND "UnitCost" >= 0 AND "DiscountAmount" >= 0 AND "subtotal" >= 0 AND "TaxAmount" >= 0),
    CONSTRAINT "ChkReturnDetailsRestock" CHECK ("RestockQuantity" >= 0 AND ("Restocked" OR "RestockQuantity" = 0) AND ("InventoryMovementId" IS NULL OR "Restocked"))
);

CREATE UNIQUE INDEX IF NOT EXISTS "UqReturnDetailsReturnLine" ON sales."ReturnDetails"("ReturnId", "OrderDetailId");
CREATE UNIQUE INDEX IF NOT EXISTS "UqReturnDetailsMovement" ON sales."ReturnDetails"("InventoryMovementId") WHERE "InventoryMovementId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IdxReturnDetailsOrderDetail" ON sales."ReturnDetails"("OrderDetailId");
CREATE INDEX IF NOT EXISTS "IdxReturnDetailsProduct" ON sales."ReturnDetails"("ProductId");

CREATE TABLE IF NOT EXISTS sales."CashMovements" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "CashSessionId"          UUID NOT NULL,
    "MovementType"           VARCHAR(30) NOT NULL,
    "amount"                 DECIMAL(12,2) NOT NULL,
    "ReturnId"               UUID,
    "EmployeeId"             UUID NOT NULL,
    "AuthorizedByEmployeeId" UUID,
    "ClientRequestId"        UUID NOT NULL DEFAULT gen_random_uuid(),
    "reason"                 VARCHAR(300),
    "CreatedAt"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashMovements_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES sales."CashSessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "CashMovements_ReturnId_fkey" FOREIGN KEY ("ReturnId") REFERENCES sales."Returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "CashMovements_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES hr."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "CashMovements_AuthorizedByEmployeeId_fkey" FOREIGN KEY ("AuthorizedByEmployeeId") REFERENCES hr."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ChkCashMovementsType" CHECK ("MovementType" IN ('DEVOLUCION_EFECTIVO','RETIRO','INGRESO')),
    CONSTRAINT "ChkCashMovementsAmount" CHECK ("amount" > 0),
    CONSTRAINT "ChkCashMovementsReturnRef" CHECK (("MovementType" = 'DEVOLUCION_EFECTIVO') = ("ReturnId" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "UqCashMovementsClientRequest" ON sales."CashMovements"("ClientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "UqCashMovementsReturnRefund" ON sales."CashMovements"("ReturnId") WHERE "MovementType" = 'DEVOLUCION_EFECTIVO';
CREATE INDEX IF NOT EXISTS "IdxCashMovementsSession" ON sales."CashMovements"("CashSessionId");
CREATE INDEX IF NOT EXISTS "IdxCashMovementsType" ON sales."CashMovements"("MovementType");

CREATE UNIQUE INDEX IF NOT EXISTS "IdxCashSessionOpenByRegister"
    ON sales."CashSessions"("CashRegisterCode")
    WHERE "status" = 'ABIERTA';

CREATE OR REPLACE TRIGGER "TrgReturnTimestamp"
BEFORE UPDATE ON sales."Returns"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
