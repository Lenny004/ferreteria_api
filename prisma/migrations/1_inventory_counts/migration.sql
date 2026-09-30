-- Migración 1_inventory_counts: toma física de inventario (conteos cíclicos).
-- Aditiva: solo crea las tablas nuevas "InventoryCounts" e "InventoryCountLines", sus índices y FKs.
-- No altera tablas existentes que usa el POS (Products, InventoryMovements, StockAlerts).
-- Parte 1: generada con `prisma migrate diff --from-url <BD con 0_init> --to-schema-datamodel prisma/schema.prisma --script`.
-- Parte 2: CHECKs que Prisma no modela.

-- CreateTable
CREATE TABLE "InventoryCounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Folio" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "Status" VARCHAR(15) NOT NULL DEFAULT 'ABIERTO',
    "FamilyId" UUID,
    "SubfamilyId" UUID,
    "notes" TEXT,
    "CreatedByWebUserId" UUID,
    "AppliedByWebUserId" UUID,
    "CancelledByWebUserId" UUID,
    "AppliedAt" TIMESTAMPTZ,
    "CancelledAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "CountId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "SystemStockAtStart" DECIMAL(12,3) NOT NULL,
    "CountedQuantity" DECIMAL(12,3),
    "SystemStockAtCount" DECIMAL(12,3),
    "CountedAt" TIMESTAMPTZ,
    "CountedByWebUserId" UUID,
    "VarianceQuantity" DECIMAL(12,3),
    "UnitCostAtApply" DECIMAL(12,4),
    "AdjustmentMovementId" UUID,
    "notes" VARCHAR(300),
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCountLines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCounts_Folio_key" ON "InventoryCounts"("Folio");

-- CreateIndex
CREATE INDEX "IdxInventoryCountsStatus" ON "InventoryCounts"("Status");

-- CreateIndex
CREATE INDEX "IdxInventoryCountsCreatedAt" ON "InventoryCounts"("CreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLines_AdjustmentMovementId_key" ON "InventoryCountLines"("AdjustmentMovementId");

-- CreateIndex
CREATE INDEX "IdxInventoryCountLinesCount" ON "InventoryCountLines"("CountId");

-- CreateIndex
CREATE INDEX "IdxInventoryCountLinesProduct" ON "InventoryCountLines"("ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "UqInventoryCountLinesCountProduct" ON "InventoryCountLines"("CountId", "ProductId");

-- AddForeignKey
ALTER TABLE "InventoryCounts" ADD CONSTRAINT "InventoryCounts_FamilyId_fkey" FOREIGN KEY ("FamilyId") REFERENCES "Families"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCounts" ADD CONSTRAINT "InventoryCounts_SubfamilyId_fkey" FOREIGN KEY ("SubfamilyId") REFERENCES "Subfamilies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCounts" ADD CONSTRAINT "InventoryCounts_CreatedByWebUserId_fkey" FOREIGN KEY ("CreatedByWebUserId") REFERENCES "system"."WebUsers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCounts" ADD CONSTRAINT "InventoryCounts_AppliedByWebUserId_fkey" FOREIGN KEY ("AppliedByWebUserId") REFERENCES "system"."WebUsers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCounts" ADD CONSTRAINT "InventoryCounts_CancelledByWebUserId_fkey" FOREIGN KEY ("CancelledByWebUserId") REFERENCES "system"."WebUsers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCountLines" ADD CONSTRAINT "InventoryCountLines_CountId_fkey" FOREIGN KEY ("CountId") REFERENCES "InventoryCounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCountLines" ADD CONSTRAINT "InventoryCountLines_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCountLines" ADD CONSTRAINT "InventoryCountLines_CountedByWebUserId_fkey" FOREIGN KEY ("CountedByWebUserId") REFERENCES "system"."WebUsers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryCountLines" ADD CONSTRAINT "InventoryCountLines_AdjustmentMovementId_fkey" FOREIGN KEY ("AdjustmentMovementId") REFERENCES "InventoryMovements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Parte 2: CHECKs (Prisma no los modela).
ALTER TABLE "InventoryCounts"
    ADD CONSTRAINT "ChkInventoryCountsStatus" CHECK ("Status" IN ('ABIERTO','APLICADO','CANCELADO'));

ALTER TABLE "InventoryCountLines"
    ADD CONSTRAINT "ChkInventoryCountLinesCountedQuantity" CHECK ("CountedQuantity" IS NULL OR "CountedQuantity" >= 0);

ALTER TABLE "InventoryCountLines"
    ADD CONSTRAINT "ChkInventoryCountLinesSystemStockAtStart" CHECK ("SystemStockAtStart" >= 0);
