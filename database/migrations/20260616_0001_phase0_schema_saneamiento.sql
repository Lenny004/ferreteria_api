-- =============================================================================
-- FlexoCable SV - Phase 0 schema sanitation
-- Date: 2026-06-16
-- Target: PostgreSQL/Supabase — Squema.sql v2.0.0 (UUID)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE dte."DteIssued"
    ALTER COLUMN "GenerationCode" SET DEFAULT gen_random_uuid();

ALTER TABLE sales."Orders"
    ADD COLUMN IF NOT EXISTS "ClientRequestId" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS "IdxOrdersClientRequest"
    ON sales."Orders"("ClientRequestId");

ALTER TABLE dte."DteIssued"
    ADD COLUMN IF NOT EXISTS "RelatedDteId" UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'FKDteIssuedRelatedDte'
    ) THEN
        ALTER TABLE dte."DteIssued"
            ADD CONSTRAINT "FKDteIssuedRelatedDte"
            FOREIGN KEY ("RelatedDteId") REFERENCES dte."DteIssued"("Id");
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IdxDteRelated"
    ON dte."DteIssued"("RelatedDteId");

INSERT INTO system."Settings" ("Key", "Value", "Description")
SELECT TRIM(BOTH '"' FROM "Key"), "Value", "Description"
FROM system."Settings"
WHERE "Key" LIKE '"%"'
ON CONFLICT ("Key") DO UPDATE SET
    "Value" = EXCLUDED."Value",
    "Description" = EXCLUDED."Description",
    "UpdatedAt" = NOW();

DELETE FROM system."Settings"
WHERE "Key" LIKE '"%"';

INSERT INTO system."Settings" ("Key", "Value", "Description")
SELECT 'Currency', "Value", "Description"
FROM system."Settings"
WHERE "Key" = 'currency'
ON CONFLICT ("Key") DO UPDATE SET
    "Value" = EXCLUDED."Value",
    "Description" = EXCLUDED."Description",
    "UpdatedAt" = NOW();

DELETE FROM system."Settings"
WHERE "Key" = 'currency';

CREATE UNIQUE INDEX IF NOT EXISTS "IdxPositionsDepartmentName"
    ON hr."Positions"("DepartmentId", "Name");

CREATE TABLE IF NOT EXISTS sales."CashSessions" (
    "Id"                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId"             UUID          NOT NULL REFERENCES hr."Employees"("Id"),
    "CashRegisterCode"       VARCHAR(50)   NOT NULL DEFAULT 'CAJA-01',
    "OpenedAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "ClosedAt"               TIMESTAMPTZ,
    "OpeningAmount"          NUMERIC(12,2) NOT NULL DEFAULT 0,
    "ClosingDeclaredAmount"  NUMERIC(12,2),
    "ClosingExpectedAmount"  NUMERIC(12,2),
    "Difference"             NUMERIC(12,2),
    "Status"                 VARCHAR(20)   NOT NULL DEFAULT 'ABIERTA',
    "Notes"                  TEXT,
    "CreatedAt"              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "UpdatedAt"              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "CashSessionStatusValid" CHECK ("Status" IN ('ABIERTA','CERRADA','CANCELADA')),
    CONSTRAINT "CashSessionAmountsValid" CHECK (
        "OpeningAmount" >= 0
        AND ("ClosingDeclaredAmount" IS NULL OR "ClosingDeclaredAmount" >= 0)
        AND ("ClosingExpectedAmount" IS NULL OR "ClosingExpectedAmount" >= 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdxCashSessionOpen"
    ON sales."CashSessions"("EmployeeId", "CashRegisterCode")
    WHERE "Status" = 'ABIERTA';

CREATE INDEX IF NOT EXISTS "IdxCashSessionStatus"
    ON sales."CashSessions"("Status");

CREATE INDEX IF NOT EXISTS "IdxCashSessionOpened"
    ON sales."CashSessions"("OpenedAt");

DROP TRIGGER IF EXISTS "TrgCashSessionTimestamp" ON sales."CashSessions";
CREATE TRIGGER "TrgCashSessionTimestamp"
BEFORE UPDATE ON sales."CashSessions"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

ALTER TABLE sales."Orders"
    ADD COLUMN IF NOT EXISTS "CashSessionId" UUID REFERENCES sales."CashSessions"("Id");

CREATE INDEX IF NOT EXISTS "IdxOrdersCashSession"
    ON sales."Orders"("CashSessionId");

CREATE TABLE IF NOT EXISTS sales."Payments" (
    "Id"            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    "OrderId"       UUID          NOT NULL REFERENCES sales."Orders"("Id") ON DELETE CASCADE,
    "CashSessionId" UUID          REFERENCES sales."CashSessions"("Id"),
    "Method"        VARCHAR(20)   NOT NULL,
    "Amount"        NUMERIC(12,2) NOT NULL,
    "Reference"     VARCHAR(100),
    "CreatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "PaymentMethodValid" CHECK ("Method" IN ('EFECTIVO','TARJETA','TRANSFERENCIA','OTRO')),
    CONSTRAINT "PaymentAmountPositive" CHECK ("Amount" > 0)
);

CREATE INDEX IF NOT EXISTS "IdxPaymentsOrder"
    ON sales."Payments"("OrderId");
CREATE INDEX IF NOT EXISTS "IdxPaymentsSession"
    ON sales."Payments"("CashSessionId");

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flexo_user') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA sales  TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA sales  TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA dte    TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dte    TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA hr     TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA hr     TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA system TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA system TO flexo_user';
    END IF;
END $$;
