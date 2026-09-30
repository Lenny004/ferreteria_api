-- 2_pos_devoluciones: devoluciones POS (aditiva). Ver docs/MIGRACIONES.md.
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

-- Parte 1: generada con prisma migrate diff --from-url <BD en 1_inventory_counts> --to-schema-datamodel prisma/schema.prisma --script
-- CreateTable
CREATE TABLE "sales"."Returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "OrderId" UUID NOT NULL,
    "CashSessionId" UUID,
    "EmployeeId" UUID NOT NULL,
    "AuthorizedByEmployeeId" UUID NOT NULL,
    "ClientRequestId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReturnType" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA',
    "FiscalStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "CreditNoteDteId" UUID,
    "ReasonCode" VARCHAR(30) NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "DiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "RefundMethod" VARCHAR(20) NOT NULL,
    "RefundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."ReturnDetails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ReturnId" UUID NOT NULL,
    "OrderDetailId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "UnitsPerPackage" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "UnitPrice" DECIMAL(12,2) NOT NULL,
    "UnitCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "DiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "TaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Restocked" BOOLEAN NOT NULL DEFAULT true,
    "RestockQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "InventoryMovementId" UUID,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."CashMovements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "CashSessionId" UUID NOT NULL,
    "MovementType" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "ReturnId" UUID,
    "EmployeeId" UUID NOT NULL,
    "AuthorizedByEmployeeId" UUID,
    "ClientRequestId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reason" VARCHAR(300),
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UqReturnsClientRequest" ON "sales"."Returns"("ClientRequestId");

-- CreateIndex
CREATE INDEX "IdxReturnsOrder" ON "sales"."Returns"("OrderId");

-- CreateIndex
CREATE INDEX "IdxReturnsCashSession" ON "sales"."Returns"("CashSessionId");

-- CreateIndex
CREATE INDEX "IdxReturnsCreatedAt" ON "sales"."Returns"("CreatedAt");

-- CreateIndex
CREATE INDEX "IdxReturnsFiscalStatus" ON "sales"."Returns"("FiscalStatus");

-- CreateIndex
CREATE INDEX "IdxReturnDetailsOrderDetail" ON "sales"."ReturnDetails"("OrderDetailId");

-- CreateIndex
CREATE INDEX "IdxReturnDetailsProduct" ON "sales"."ReturnDetails"("ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "UqReturnDetailsReturnLine" ON "sales"."ReturnDetails"("ReturnId", "OrderDetailId");

-- CreateIndex
CREATE UNIQUE INDEX "UqCashMovementsClientRequest" ON "sales"."CashMovements"("ClientRequestId");

-- CreateIndex
CREATE INDEX "IdxCashMovementsSession" ON "sales"."CashMovements"("CashSessionId");

-- CreateIndex
CREATE INDEX "IdxCashMovementsType" ON "sales"."CashMovements"("MovementType");

-- AddForeignKey
ALTER TABLE "sales"."Returns" ADD CONSTRAINT "Returns_OrderId_fkey" FOREIGN KEY ("OrderId") REFERENCES "sales"."Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Returns" ADD CONSTRAINT "Returns_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES "sales"."CashSessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Returns" ADD CONSTRAINT "Returns_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Returns" ADD CONSTRAINT "Returns_AuthorizedByEmployeeId_fkey" FOREIGN KEY ("AuthorizedByEmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Returns" ADD CONSTRAINT "Returns_CreditNoteDteId_fkey" FOREIGN KEY ("CreditNoteDteId") REFERENCES "dte"."DteIssued"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."ReturnDetails" ADD CONSTRAINT "ReturnDetails_ReturnId_fkey" FOREIGN KEY ("ReturnId") REFERENCES "sales"."Returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."ReturnDetails" ADD CONSTRAINT "ReturnDetails_OrderDetailId_fkey" FOREIGN KEY ("OrderDetailId") REFERENCES "sales"."OrderDetails"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."ReturnDetails" ADD CONSTRAINT "ReturnDetails_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."ReturnDetails" ADD CONSTRAINT "ReturnDetails_InventoryMovementId_fkey" FOREIGN KEY ("InventoryMovementId") REFERENCES "InventoryMovements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."CashMovements" ADD CONSTRAINT "CashMovements_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES "sales"."CashSessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."CashMovements" ADD CONSTRAINT "CashMovements_ReturnId_fkey" FOREIGN KEY ("ReturnId") REFERENCES "sales"."Returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."CashMovements" ADD CONSTRAINT "CashMovements_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."CashMovements" ADD CONSTRAINT "CashMovements_AuthorizedByEmployeeId_fkey" FOREIGN KEY ("AuthorizedByEmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Parte 2: objetos que Prisma no modela.
ALTER TABLE sales."Returns"
    ADD CONSTRAINT "ChkReturnsType"
    CHECK ("ReturnType" IN ('TOTAL','PARCIAL'));
ALTER TABLE sales."Returns"
    ADD CONSTRAINT "ChkReturnsStatus"
    CHECK ("status" IN ('COMPLETADA','ANULADA'));
ALTER TABLE sales."Returns"
    ADD CONSTRAINT "ChkReturnsFiscalStatus"
    CHECK ("FiscalStatus" IN ('PENDIENTE','EMITIDO','REQUIERE_VALID','NO_APLICA'));
ALTER TABLE sales."Returns"
    ADD CONSTRAINT "ChkReturnsRefundMethod"
    CHECK ("RefundMethod" IN ('EFECTIVO','TARJETA','TRANSFERENCIA','NINGUNO'));
ALTER TABLE sales."Returns"
    ADD CONSTRAINT "ChkReturnsAmounts"
    CHECK ("subtotal" >= 0 AND "DiscountAmount" >= 0 AND "TaxAmount" >= 0 AND "total" > 0);
ALTER TABLE sales."Returns"
    ADD CONSTRAINT "ChkReturnsRefund"
    CHECK ("RefundAmount" >= 0 AND "RefundAmount" <= "total"
           AND ("RefundMethod" <> 'NINGUNO' OR "RefundAmount" = 0));

ALTER TABLE sales."ReturnDetails"
    ADD CONSTRAINT "ChkReturnDetailsQuantity"
    CHECK ("quantity" > 0 AND "UnitsPerPackage" > 0);
ALTER TABLE sales."ReturnDetails"
    ADD CONSTRAINT "ChkReturnDetailsAmounts"
    CHECK ("UnitPrice" >= 0 AND "UnitCost" >= 0 AND "DiscountAmount" >= 0
           AND "subtotal" >= 0 AND "TaxAmount" >= 0);
ALTER TABLE sales."ReturnDetails"
    ADD CONSTRAINT "ChkReturnDetailsRestock"
    CHECK ("RestockQuantity" >= 0
           AND ("Restocked" OR "RestockQuantity" = 0)
           AND ("InventoryMovementId" IS NULL OR "Restocked"));

ALTER TABLE sales."CashMovements"
    ADD CONSTRAINT "ChkCashMovementsType"
    CHECK ("MovementType" IN ('DEVOLUCION_EFECTIVO','RETIRO','INGRESO'));
ALTER TABLE sales."CashMovements"
    ADD CONSTRAINT "ChkCashMovementsAmount"
    CHECK ("amount" > 0);
ALTER TABLE sales."CashMovements"
    ADD CONSTRAINT "ChkCashMovementsReturnRef"
    CHECK (("MovementType" = 'DEVOLUCION_EFECTIVO') = ("ReturnId" IS NOT NULL));

CREATE UNIQUE INDEX "UqReturnsCreditNote"
    ON sales."Returns"("CreditNoteDteId")
    WHERE "CreditNoteDteId" IS NOT NULL;
CREATE UNIQUE INDEX "UqReturnDetailsMovement"
    ON sales."ReturnDetails"("InventoryMovementId")
    WHERE "InventoryMovementId" IS NOT NULL;
CREATE UNIQUE INDEX "UqCashMovementsReturnRefund"
    ON sales."CashMovements"("ReturnId")
    WHERE "MovementType" = 'DEVOLUCION_EFECTIVO';

CREATE OR REPLACE TRIGGER "TrgReturnTimestamp"
BEFORE UPDATE ON sales."Returns"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE UNIQUE INDEX "IdxCashSessionOpenByRegister"
    ON sales."CashSessions"("CashRegisterCode")
    WHERE "status" = 'ABIERTA';
