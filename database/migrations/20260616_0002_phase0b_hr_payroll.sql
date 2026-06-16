-- =============================================================================
-- FlexoCable SV - Phase 0b HR/payroll schema
-- Date: 2026-06-16
-- Target: PostgreSQL/Supabase existing databases after 20260616_0001
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Archive legacy payroll tables. WPF does not use them for cashier operations;
-- the administrative backend will use the period/run model below.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('hr."PayrollDetails"') IS NOT NULL
       AND to_regclass('hr."PayrollDetailsLegacy"') IS NULL THEN
        ALTER TABLE hr."PayrollDetails" RENAME TO "PayrollDetailsLegacy";
    END IF;

    IF to_regclass('hr."Payroll"') IS NOT NULL
       AND to_regclass('hr."PayrollLegacy"') IS NULL THEN
        ALTER TABLE hr."Payroll" RENAME TO "PayrollLegacy";
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Departments and positions aligned to the Beraka-style HR model.
-- -----------------------------------------------------------------------------
ALTER TABLE hr."Departments"
    ADD COLUMN IF NOT EXISTS "ParentId" UUID REFERENCES hr."Departments"("Id"),
    ADD COLUMN IF NOT EXISTS "Description" VARCHAR(300);

CREATE INDEX IF NOT EXISTS "IdxDepartmentsParent"
    ON hr."Departments"("ParentId");

ALTER TABLE hr."Positions"
    ADD COLUMN IF NOT EXISTS "Description" VARCHAR(500);

-- -----------------------------------------------------------------------------
-- Employee dossier expansion. Unified UUID schema (Beraka-aligned).
-- -----------------------------------------------------------------------------
UPDATE hr."Employees"
SET "ContractType" = 'PLAZO_FIJO'
WHERE "ContractType" = 'PLANILLA';

ALTER TABLE hr."Employees"
    ALTER COLUMN "ContractType" SET DEFAULT 'PLAZO_FIJO';

ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "ContractValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeGenderValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeNationalityValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeMaritalStatusValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeAcademicLevelValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeSalaryTypeValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeAfpInstitutionValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeePaymentChannelValid";
ALTER TABLE hr."Employees" DROP CONSTRAINT IF EXISTS "EmployeeTerminationReasonValid";

ALTER TABLE hr."Employees"
    ADD COLUMN IF NOT EXISTS "BirthDate" DATE,
    ADD COLUMN IF NOT EXISTS "Gender" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "Nationality" VARCHAR(20) DEFAULT 'SALVADOREÑA',
    ADD COLUMN IF NOT EXISTS "PassportNumber" VARCHAR(30),
    ADD COLUMN IF NOT EXISTS "DependentsDescription" TEXT,
    ADD COLUMN IF NOT EXISTS "DepartmentSv" VARCHAR(30),
    ADD COLUMN IF NOT EXISTS "DepartmentId" UUID REFERENCES hr."Departments"("Id"),
    ADD COLUMN IF NOT EXISTS "DirectSupervisorId" UUID REFERENCES hr."Employees"("Id"),
    ADD COLUMN IF NOT EXISTS "ContractEndDate" DATE,
    ADD COLUMN IF NOT EXISTS "SalaryType" VARCHAR(20) NOT NULL DEFAULT 'MENSUAL',
    ADD COLUMN IF NOT EXISTS "DefaultBonus" NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "DefaultViaticos" NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "AfpInstitution" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "AfpEnrollmentDate" DATE,
    ADD COLUMN IF NOT EXISTS "IsssEnrolled" BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "IsssEnrollmentDate" DATE,
    ADD COLUMN IF NOT EXISTS "PaymentChannel" VARCHAR(30) DEFAULT 'DEPOSITO_BANCARIO',
    ADD COLUMN IF NOT EXISTS "OnProbation" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "ProbationEndDate" DATE,
    ADD COLUMN IF NOT EXISTS "ProbationCompletedAt" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "TerminationReason" VARCHAR(40),
    ADD COLUMN IF NOT EXISTS "TerminationNotes" TEXT,
    ADD COLUMN IF NOT EXISTS "PinUpdatedAt" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "AttendanceEnabled" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE hr."Employees"
    ADD CONSTRAINT "ContractValid" CHECK ("ContractType" IN ('TIEMPO_PARCIAL','PLAZO_FIJO','HONORARIOS','PASANTE')),
    ADD CONSTRAINT "EmployeeGenderValid" CHECK ("Gender" IS NULL OR "Gender" IN ('MASCULINO','FEMENINO','OTRO')),
    ADD CONSTRAINT "EmployeeNationalityValid" CHECK ("Nationality" IS NULL OR "Nationality" IN ('SALVADOREÑA','EXTRANJERA')),
    ADD CONSTRAINT "EmployeeMaritalStatusValid" CHECK ("MaritalStatus" IS NULL OR "MaritalStatus" IN ('SOLTERO','CASADO','UNION_DE_HECHO','DIVORCIADO','VIUDO')),
    ADD CONSTRAINT "EmployeeAcademicLevelValid" CHECK ("AcademicLevel" IS NULL OR "AcademicLevel" IN ('SIN_ESTUDIOS','BASICO','BACHILLER','SUPERIORES')),
    ADD CONSTRAINT "EmployeeSalaryTypeValid" CHECK ("SalaryType" IN ('MENSUAL','QUINCENAL','SEMANAL')),
    ADD CONSTRAINT "EmployeeAfpInstitutionValid" CHECK ("AfpInstitution" IS NULL OR "AfpInstitution" IN ('AFP_CONFIA','AFP_CRECER')),
    ADD CONSTRAINT "EmployeePaymentChannelValid" CHECK ("PaymentChannel" IS NULL OR "PaymentChannel" IN ('DEPOSITO_BANCARIO','EFECTIVO','CHEQUE')),
    ADD CONSTRAINT "EmployeeTerminationReasonValid" CHECK (
        "TerminationReason" IS NULL OR "TerminationReason" IN (
            'RENUNCIA_VOLUNTARIA','DESPIDO_JUSTIFICADO','DESPIDO_INJUSTIFICADO',
            'MUTUO_ACUERDO','VENCIMIENTO_CONTRATO','FALLECIMIENTO','JUBILACION'
        )
    );

CREATE INDEX IF NOT EXISTS "IdxEmployeesDepartment"
    ON hr."Employees"("DepartmentId");
CREATE INDEX IF NOT EXISTS "IdxEmployeesSupervisor"
    ON hr."Employees"("DirectSupervisorId");
CREATE INDEX IF NOT EXISTS "IdxEmployeesContractType"
    ON hr."Employees"("ContractType");

-- -----------------------------------------------------------------------------
-- HR catalogs and employee dossier tables.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr."Banks" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Name"      VARCHAR(150) NOT NULL,
    "Code"      VARCHAR(10)  UNIQUE,
    "Swift"     VARCHAR(20),
    "IsActive"  BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS "TrgBankTimestamp" ON hr."Banks";
CREATE TRIGGER "TrgBankTimestamp"
BEFORE UPDATE ON hr."Banks"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TABLE IF NOT EXISTS hr."RequiredDocumentTypes" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Name"                  VARCHAR(150) NOT NULL UNIQUE,
    "Description"           TEXT,
    "IsMandatory"           BOOLEAN      NOT NULL DEFAULT TRUE,
    "AppliesToContractType" VARCHAR(20),
    "HasExpiry"             BOOLEAN      NOT NULL DEFAULT FALSE,
    "IsActive"              BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "RequiredDocContractValid" CHECK (
        "AppliesToContractType" IS NULL OR "AppliesToContractType" IN ('TIEMPO_PARCIAL','PLAZO_FIJO','HONORARIOS','PASANTE')
    )
);

CREATE TABLE IF NOT EXISTS hr."EmployeeBankAccounts" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId"    UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "BankId"        UUID NOT NULL REFERENCES hr."Banks"("Id"),
    "AccountType"   VARCHAR(30)  NOT NULL DEFAULT 'CUENTA_DE_AHORRO',
    "AccountNumber" VARCHAR(40)  NOT NULL,
    "IsPrimary"     BOOLEAN      NOT NULL DEFAULT TRUE,
    "IsActive"      BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "UpdatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "BankAccountTypeValid" CHECK ("AccountType" IN ('CUENTA_CORRIENTE','CUENTA_DE_AHORRO','CUENTA_SALARIO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdxEmployeePrimaryBankAccount"
    ON hr."EmployeeBankAccounts"("EmployeeId") WHERE "IsPrimary" = TRUE AND "IsActive" = TRUE;
CREATE INDEX IF NOT EXISTS "IdxEmployeeBankAccountsEmployee"
    ON hr."EmployeeBankAccounts"("EmployeeId");

DROP TRIGGER IF EXISTS "TrgEmployeeBankAccountTimestamp" ON hr."EmployeeBankAccounts";
CREATE TRIGGER "TrgEmployeeBankAccountTimestamp"
BEFORE UPDATE ON hr."EmployeeBankAccounts"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TABLE IF NOT EXISTS hr."SalaryHistory" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId"      UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "CurrentSalary"   NUMERIC(10,2),
    "RequestedSalary" NUMERIC(10,2) NOT NULL,
    "Reason"          VARCHAR(200),
    "EffectiveDate"   DATE         NOT NULL,
    "ApprovedBy"      UUID REFERENCES system."WebUsers"("Id"),
    "IsActive"        BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedAt"       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IdxSalaryHistoryEmployee"
    ON hr."SalaryHistory"("EmployeeId");

CREATE TABLE IF NOT EXISTS hr."EmployeeDocuments" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "DocTypeId"  UUID NOT NULL REFERENCES hr."RequiredDocumentTypes"("Id"),
    "FileUrl"    VARCHAR(500),
    "FileName"   VARCHAR(200),
    "Status"     VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE',
    "IssueDate"  DATE,
    "ExpiryDate" DATE,
    "Notes"      TEXT,
    "IsActive"   BOOLEAN      NOT NULL DEFAULT TRUE,
    "UploadedBy" UUID REFERENCES system."WebUsers"("Id"),
    "UploadedAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "VerifiedBy" UUID REFERENCES system."WebUsers"("Id"),
    "VerifiedAt" TIMESTAMPTZ,
    CONSTRAINT "EmployeeDocStatusValid" CHECK ("Status" IN ('PENDIENTE','ENTREGADO','VENCIDO','NO_APLICA'))
);

CREATE INDEX IF NOT EXISTS "IdxEmployeeDocumentsEmployee"
    ON hr."EmployeeDocuments"("EmployeeId");
CREATE INDEX IF NOT EXISTS "IdxEmployeeDocumentsStatus"
    ON hr."EmployeeDocuments"("Status");

CREATE TABLE IF NOT EXISTS hr."HealthConditionRecords" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId"            UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "ConditionType"         VARCHAR(30)  NOT NULL,
    "InitialStartDate"      DATE,
    "IncapacityEndDate"     DATE,
    "Notes"                 TEXT,
    "RequiresAccommodation" BOOLEAN      NOT NULL DEFAULT FALSE,
    "IsActive"              BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedBy"             UUID REFERENCES system."WebUsers"("Id"),
    "CreatedAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "UpdatedAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "HealthConditionTypeValid" CHECK (
        "ConditionType" IN ('ENFERMEDAD_CRONICA','ALERGIA','DISCAPACIDAD','LESION_LABORAL','EMBARAZO','OTRO')
    )
);

CREATE INDEX IF NOT EXISTS "IdxHealthConditionsEmployee"
    ON hr."HealthConditionRecords"("EmployeeId");

DROP TRIGGER IF EXISTS "TrgHealthConditionTimestamp" ON hr."HealthConditionRecords";
CREATE TRIGGER "TrgHealthConditionTimestamp"
BEFORE UPDATE ON hr."HealthConditionRecords"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- -----------------------------------------------------------------------------
-- Payroll period/run model.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr."PayrollPeriods" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Name"        VARCHAR(100) NOT NULL,
    "PeriodType"  VARCHAR(20)  NOT NULL,
    "StartDate"   DATE         NOT NULL,
    "EndDate"     DATE         NOT NULL,
    "PaymentDate" DATE         NOT NULL,
    "IsClosed"    BOOLEAN      NOT NULL DEFAULT FALSE,
    "ClosedAt"    TIMESTAMPTZ,
    "ClosedBy"    UUID REFERENCES system."WebUsers"("Id"),
    "CreatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "PayrollPeriodTypeValid" CHECK ("PeriodType" IN ('MENSUAL','QUINCENAL','SEMANAL')),
    UNIQUE ("StartDate", "EndDate")
);

CREATE INDEX IF NOT EXISTS "IdxPayrollPeriodsType"
    ON hr."PayrollPeriods"("PeriodType");

CREATE TABLE IF NOT EXISTS hr."PayrollRuns" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PeriodId"        UUID NOT NULL REFERENCES hr."PayrollPeriods"("Id"),
    "Name"            VARCHAR(150)  NOT NULL,
    "Notes"           TEXT,
    "Status"          VARCHAR(20)   NOT NULL DEFAULT 'EN_REVISION',
    "TotalGross"      NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalAfpEmp"     NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalAfpPat"     NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalIsssEmp"    NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalIsssPat"    NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalIsr"        NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalDeductions" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalNet"        NUMERIC(12,2) NOT NULL DEFAULT 0,
    "TotalPatronal"   NUMERIC(12,2) NOT NULL DEFAULT 0,
    "CreatedBy"       UUID REFERENCES system."WebUsers"("Id"),
    "ApprovedBy"      UUID REFERENCES system."WebUsers"("Id"),
    "ApprovedAt"      TIMESTAMPTZ,
    "PaidBy"          UUID REFERENCES system."WebUsers"("Id"),
    "PaidAt"          TIMESTAMPTZ,
    "CreatedAt"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "UpdatedAt"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "PayrollRunStatusValid" CHECK ("Status" IN ('EN_REVISION','APROBADA','PAGADA','ANULADA'))
);

CREATE INDEX IF NOT EXISTS "IdxPayrollRunsPeriod"
    ON hr."PayrollRuns"("PeriodId");
CREATE INDEX IF NOT EXISTS "IdxPayrollRunsStatus"
    ON hr."PayrollRuns"("Status");

DROP TRIGGER IF EXISTS "TrgPayrollRunTimestamp" ON hr."PayrollRuns";
CREATE TRIGGER "TrgPayrollRunTimestamp"
BEFORE UPDATE ON hr."PayrollRuns"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TABLE IF NOT EXISTS hr."PayrollDetails" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PayrollRunId"            UUID NOT NULL REFERENCES hr."PayrollRuns"("Id") ON DELETE CASCADE,
    "EmployeeId"              UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "PeriodId"                UUID NOT NULL REFERENCES hr."PayrollPeriods"("Id"),
    "PositionName"            VARCHAR(100),
    "BaseSalary"              NUMERIC(10,2) NOT NULL,
    "SalaryType"              VARCHAR(20)   NOT NULL,
    "ContractType"            VARCHAR(20),
    "AfpInstitution"          VARCHAR(20),
    "Nup"                     VARCHAR(20),
    "IsssNumber"              VARCHAR(20),
    "DaysWorked"              NUMERIC(5,1)  NOT NULL DEFAULT 0,
    "HoursWorked"             NUMERIC(7,2)  NOT NULL DEFAULT 0,
    "OrdinarySalary"          NUMERIC(10,2) NOT NULL DEFAULT 0,
    "OvertimeHoursDiurnal"    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    "OvertimeHoursNocturnal"  NUMERIC(5,2)  NOT NULL DEFAULT 0,
    "OvertimeHoursHoliday"    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    "OvertimeHoursTotal"      NUMERIC(5,2)  NOT NULL DEFAULT 0,
    "OvertimeAmount"          NUMERIC(10,2) NOT NULL DEFAULT 0,
    "Bonuses"                 NUMERIC(10,2) NOT NULL DEFAULT 0,
    "Viaticos"                NUMERIC(10,2) NOT NULL DEFAULT 0,
    "VacationPay"             NUMERIC(10,2) NOT NULL DEFAULT 0,
    "VacationSurcharge"       NUMERIC(10,2) NOT NULL DEFAULT 0,
    "Aguinaldo"               NUMERIC(10,2) NOT NULL DEFAULT 0,
    "OtherEarnings"           NUMERIC(10,2) NOT NULL DEFAULT 0,
    "TotalGross"              NUMERIC(10,2) NOT NULL DEFAULT 0,
    "AfpEmployeeRate"         NUMERIC(5,4)  NOT NULL DEFAULT 0.0725,
    "AfpEmployeeAmount"       NUMERIC(10,2) NOT NULL DEFAULT 0,
    "IsssEmployeeRate"        NUMERIC(5,4)  NOT NULL DEFAULT 0.03,
    "IsssEmployeeAmount"      NUMERIC(10,2) NOT NULL DEFAULT 0,
    "IsrTaxableIncome"        NUMERIC(10,2) NOT NULL DEFAULT 0,
    "IsrAmount"               NUMERIC(10,2) NOT NULL DEFAULT 0,
    "LoanDeduction"           NUMERIC(10,2) NOT NULL DEFAULT 0,
    "OtherDeductions"         NUMERIC(10,2) NOT NULL DEFAULT 0,
    "TotalDeductions"         NUMERIC(10,2) NOT NULL DEFAULT 0,
    "AfpEmployerRate"         NUMERIC(5,4)  NOT NULL DEFAULT 0.0775,
    "AfpEmployerAmount"       NUMERIC(10,2) NOT NULL DEFAULT 0,
    "IsssEmployerRate"        NUMERIC(5,4)  NOT NULL DEFAULT 0.075,
    "IsssEmployerAmount"      NUMERIC(10,2) NOT NULL DEFAULT 0,
    "InsaforpRate"            NUMERIC(5,4)  NOT NULL DEFAULT 0.01,
    "InsaforpAmount"          NUMERIC(10,2) NOT NULL DEFAULT 0,
    "TotalEmployerCost"       NUMERIC(10,2) NOT NULL DEFAULT 0,
    "NetPay"                  NUMERIC(10,2) NOT NULL DEFAULT 0,
    "PaymentChannel"          VARCHAR(30),
    "BankAccountId"           UUID REFERENCES hr."EmployeeBankAccounts"("Id"),
    "PaymentReference"        VARCHAR(100),
    "PaidAt"                  TIMESTAMPTZ,
    "DaysAbsent"              NUMERIC(5,1)  NOT NULL DEFAULT 0,
    "DaysVacation"            NUMERIC(5,1)  NOT NULL DEFAULT 0,
    "DaysVacationPrevious"    NUMERIC(5,1)  NOT NULL DEFAULT 0,
    "DaysSick"                NUMERIC(5,1)  NOT NULL DEFAULT 0,
    "DaysPermission"          NUMERIC(5,1)  NOT NULL DEFAULT 0,
    "HoursPerDay"             INTEGER       NOT NULL DEFAULT 8,
    "IsProbation"             BOOLEAN       NOT NULL DEFAULT FALSE,
    "TerminationId" UUID UNIQUE,
    "Notes"                   TEXT,
    "CreatedAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "UpdatedAt"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE ("PayrollRunId", "EmployeeId")
);

CREATE INDEX IF NOT EXISTS "IdxPayrollDetailsRun"
    ON hr."PayrollDetails"("PayrollRunId");
CREATE INDEX IF NOT EXISTS "IdxPayrollDetailsEmployee"
    ON hr."PayrollDetails"("EmployeeId");
CREATE INDEX IF NOT EXISTS "IdxPayrollDetailsPeriod"
    ON hr."PayrollDetails"("PeriodId");

DROP TRIGGER IF EXISTS "TrgPayrollDetailTimestamp" ON hr."PayrollDetails";
CREATE TRIGGER "TrgPayrollDetailTimestamp"
BEFORE UPDATE ON hr."PayrollDetails"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TABLE IF NOT EXISTS hr."PayrollEarningLines" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PayrollDetailId" UUID NOT NULL REFERENCES hr."PayrollDetails"("Id") ON DELETE CASCADE,
    "Type"            VARCHAR(30)   NOT NULL,
    "Description"     VARCHAR(200),
    "Amount"          NUMERIC(10,2) NOT NULL,
    "IsTaxable"       BOOLEAN       NOT NULL DEFAULT TRUE,
    "SortOrder"       INTEGER       NOT NULL DEFAULT 0,
    CONSTRAINT "PayrollEarningTypeValid" CHECK (
        "Type" IN ('SALARIO_BASE','HORAS_EXTRA_DIURNAS','HORAS_EXTRA_NOCTURNAS','HORAS_EXTRA_FERIADAS','BONO','VACACIONES_PAGO','AGUINALDO','INDEMNIZACION','VIATICOS','OTRO')
    )
);

CREATE INDEX IF NOT EXISTS "IdxPayrollEarningLinesDetail"
    ON hr."PayrollEarningLines"("PayrollDetailId");

CREATE TABLE IF NOT EXISTS hr."PayrollDeductionLines" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PayrollDetailId" UUID NOT NULL REFERENCES hr."PayrollDetails"("Id") ON DELETE CASCADE,
    "Type"            VARCHAR(30)   NOT NULL,
    "Description"     VARCHAR(200),
    "Amount"          NUMERIC(10,2) NOT NULL,
    "SortOrder"       INTEGER       NOT NULL DEFAULT 0,
    CONSTRAINT "PayrollDeductionTypeValid" CHECK (
        "Type" IN ('AFP_EMPLEADO','ISSS_EMPLEADO','RENTA_ISR','PRESTAMO_EMPRESA','DESCUENTO_DISCIPLINARIO','OTRO')
    )
);

CREATE INDEX IF NOT EXISTS "IdxPayrollDeductionLinesDetail"
    ON hr."PayrollDeductionLines"("PayrollDetailId");

CREATE TABLE IF NOT EXISTS hr."IsrBrackets" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Year"        INTEGER      NOT NULL,
    "PeriodType"  VARCHAR(20)  NOT NULL,
    "BracketFrom" NUMERIC(10,2) NOT NULL,
    "BracketTo"   NUMERIC(10,2),
    "FixedAmount" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "Rate"        NUMERIC(6,4)  NOT NULL DEFAULT 0,
    "ExcessOver"  NUMERIC(10,2) NOT NULL DEFAULT 0,
    "Notes"       VARCHAR(200),
    CONSTRAINT "IsrBracketPeriodTypeValid" CHECK ("PeriodType" IN ('MENSUAL','QUINCENAL','SEMANAL')),
    UNIQUE ("Year", "PeriodType", "BracketFrom")
);

CREATE TABLE IF NOT EXISTS hr."Holidays" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Name"        VARCHAR(100) NOT NULL,
    "Date"        DATE         NOT NULL,
    "Year"        INTEGER      NOT NULL,
    "IsMandatory" BOOLEAN      NOT NULL DEFAULT TRUE,
    "IsActive"    BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE ("Date", "Year")
);

CREATE INDEX IF NOT EXISTS "IdxHolidaysYear"
    ON hr."Holidays"("Year");

CREATE TABLE IF NOT EXISTS hr."AguinaldoRuns" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Year"        INTEGER       NOT NULL UNIQUE,
    "PaymentDate" DATE          NOT NULL,
    "Status"      VARCHAR(20)   NOT NULL DEFAULT 'EN_REVISION',
    "TotalAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
    "CreatedBy"   UUID REFERENCES system."WebUsers"("Id"),
    "ApprovedBy"  UUID REFERENCES system."WebUsers"("Id"),
    "ApprovedAt"  TIMESTAMPTZ,
    "Notes"       TEXT,
    "CreatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "AguinaldoRunStatusValid" CHECK ("Status" IN ('EN_REVISION','APROBADA','PAGADA','ANULADA'))
);

CREATE TABLE IF NOT EXISTS hr."AguinaldoDetails" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "AguinaldoRunId" UUID NOT NULL REFERENCES hr."AguinaldoRuns"("Id") ON DELETE CASCADE,
    "EmployeeId"     UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "YearsOfService" NUMERIC(5,2)  NOT NULL,
    "DaysEntitled"   NUMERIC(5,2)  NOT NULL,
    "DailySalary"    NUMERIC(10,4) NOT NULL,
    "GrossAmount"    NUMERIC(10,2) NOT NULL,
    "IsrRetained"    NUMERIC(10,2) NOT NULL DEFAULT 0,
    "NetAmount"      NUMERIC(10,2) NOT NULL,
    "Notes"          TEXT,
    "CreatedAt"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE ("AguinaldoRunId", "EmployeeId")
);

CREATE TABLE IF NOT EXISTS hr."EmployeeTerminations" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId" UUID       NOT NULL UNIQUE REFERENCES hr."Employees"("Id"),
    "TerminationDate"       DATE          NOT NULL,
    "Reason"                VARCHAR(40)   NOT NULL,
    "YearsOfService"        NUMERIC(6,3),
    "IndemnizacionDays"     NUMERIC(6,2),
    "IndemnizacionAmount"   NUMERIC(12,2),
    "VacationDaysPending"   NUMERIC(5,1),
    "VacationPayAmount"     NUMERIC(10,2),
    "AguinaldoProportional" NUMERIC(10,2),
    "PendingSalary"         NUMERIC(10,2),
    "TotalSettlement"       NUMERIC(12,2),
    "SettlementNotes"       TEXT,
    "DocumentUrl"           VARCHAR(500),
    "VoidedAt"              TIMESTAMPTZ,
    "VoidReason"            VARCHAR(500),
    "CreatedBy"             UUID REFERENCES system."WebUsers"("Id"),
    "ApprovedBy"            UUID REFERENCES system."WebUsers"("Id"),
    "PaidAt"                TIMESTAMPTZ,
    "CreatedAt"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "EmployeeTerminationReasonValid" CHECK (
        "Reason" IN ('RENUNCIA_VOLUNTARIA','DESPIDO_JUSTIFICADO','DESPIDO_INJUSTIFICADO','MUTUO_ACUERDO','VENCIMIENTO_CONTRATO','FALLECIMIENTO','JUBILACION')
    )
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FKPayrollDetailsTermination'
    ) THEN
        ALTER TABLE hr."PayrollDetails"
            ADD CONSTRAINT "FKPayrollDetailsTermination"
            FOREIGN KEY ("TerminationId") REFERENCES hr."EmployeeTerminations"("Id");
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr."LeaveTypes" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Name"                   VARCHAR(100) NOT NULL UNIQUE,
    "Category"               VARCHAR(40)  NOT NULL,
    "MaxDaysPerYear"         NUMERIC(5,1),
    "RequiresDocument"       BOOLEAN      NOT NULL DEFAULT FALSE,
    "IsPaid"                 BOOLEAN      NOT NULL DEFAULT TRUE,
    "AffectsVacationAccrual" BOOLEAN      NOT NULL DEFAULT FALSE,
    "LegalBasis"             VARCHAR(200),
    "IsActive"               BOOLEAN      NOT NULL DEFAULT TRUE,
    "CreatedAt"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "LeaveCategoryValid" CHECK (
        "Category" IN ('VACACIONES','PERMISO_CON_GOCE','PERMISO_SIN_GOCE','BAJA_MEDICA','INCAPACIDAD_LABORAL','MATERNIDAD','PATERNIDAD','SUSPENSION_DISCIPLINARIA')
    )
);

CREATE TABLE IF NOT EXISTS hr."LeaveRequests" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId"         UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "LeaveTypeId"        UUID NOT NULL REFERENCES hr."LeaveTypes"("Id"),
    "StartDate"          DATE         NOT NULL,
    "EndDate"            DATE         NOT NULL,
    "DaysRequested"      NUMERIC(5,1) NOT NULL,
    "HalfDay"            BOOLEAN      NOT NULL DEFAULT FALSE,
    "HalfDayPeriod"      VARCHAR(10),
    "Reason"             TEXT,
    "DocumentUrl"        VARCHAR(500),
    "Status"             VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE',
    "VacationPayAmount"  NUMERIC(10,2),
    "VacationSurcharge"  NUMERIC(10,2),
    "RequestedAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "ReviewedBy"         UUID REFERENCES system."WebUsers"("Id"),
    "ReviewedAt"         TIMESTAMPTZ,
    "ReviewNotes"        TEXT,
    "ApprovedBy"         UUID REFERENCES system."WebUsers"("Id"),
    "ApprovedAt"         TIMESTAMPTZ,
    "ProcessedInPayroll" BOOLEAN      NOT NULL DEFAULT FALSE,
    "PayrollDetailId"    UUID REFERENCES hr."PayrollDetails"("Id"),
    "CreatedAt"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "UpdatedAt"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "LeaveRequestStatusValid" CHECK ("Status" IN ('PENDIENTE','APROBADA','RECHAZADA','EN_GOCE'))
);

CREATE INDEX IF NOT EXISTS "IdxLeaveRequestsEmployee"
    ON hr."LeaveRequests"("EmployeeId");
CREATE INDEX IF NOT EXISTS "IdxLeaveRequestsStatus"
    ON hr."LeaveRequests"("Status");
CREATE INDEX IF NOT EXISTS "IdxLeaveRequestsDates"
    ON hr."LeaveRequests"("StartDate", "EndDate");

DROP TRIGGER IF EXISTS "TrgLeaveRequestTimestamp" ON hr."LeaveRequests";
CREATE TRIGGER "TrgLeaveRequestTimestamp"
BEFORE UPDATE ON hr."LeaveRequests"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TABLE IF NOT EXISTS hr."VacationBalances" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EmployeeId"       UUID NOT NULL REFERENCES hr."Employees"("Id"),
    "Year"             INTEGER      NOT NULL,
    "DaysEarned"       NUMERIC(5,1) NOT NULL DEFAULT 15,
    "DaysTaken"        NUMERIC(5,1) NOT NULL DEFAULT 0,
    "LastVacationDate" DATE,
    "NextVacationDue"  DATE,
    "UpdatedAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE ("EmployeeId", "Year")
);

CREATE TABLE IF NOT EXISTS hr."IsrDeclarations" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Year"           INTEGER       NOT NULL,
    "Month"          SMALLINT      NOT NULL,
    "PeriodId"       UUID REFERENCES hr."PayrollPeriods"("Id"),
    "TotalTaxable"   NUMERIC(12,2),
    "TotalIsr"       NUMERIC(12,2),
    "SubmissionDate" DATE,
    "MhReference"    VARCHAR(50),
    "Status"         VARCHAR(30)   NOT NULL DEFAULT 'PENDIENTE',
    "FileUrl"        VARCHAR(500),
    "CreatedBy"      UUID REFERENCES system."WebUsers"("Id"),
    "CreatedAt"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE ("Year", "Month")
);

-- -----------------------------------------------------------------------------
-- Seeds: banks, required documents, ISR brackets, holidays and leave types.
-- -----------------------------------------------------------------------------
INSERT INTO hr."Banks" ("Name", "Code", "Swift", "IsActive") VALUES
    ('Banco Industrial', 'BI', 'INDLSVSS', TRUE),
    ('Banco Promerica', 'PR', 'PRCUSVSS', TRUE),
    ('Banco Hipotecario de El Salvador', 'BH', 'BHSASVSS', TRUE),
    ('Banco Davivienda', 'DA', 'BANCSVS1', TRUE),
    ('Banco de América Central (BAC)', 'BAC', 'BAMCSVSS', TRUE),
    ('Banco Cuscatlán', 'BC', 'CUSCSVS1', TRUE),
    ('Banco Agrícola', 'BA', 'CAGRSVSS', TRUE),
    ('Banco Atlántida', 'ATL', 'ATLASVS1', TRUE),
    ('Efectivo / No aplica', 'EFE', NULL, TRUE),
    ('Banco Azul de El Salvador', 'AZU', 'AZULSVSS', TRUE),
    ('Banco Citibank El Salvador', 'CITI', 'CITISVSS', TRUE),
    ('Banco Procredit', 'PRO', 'PRCRSVS1', TRUE),
    ('Banco Cooperativo de Ahorro y Crédito (COOPESUR)', 'COOP', NULL, TRUE),
    ('Caja de Crédito de los Profesionales (CCP)', 'CCP', NULL, TRUE),
    ('Fedecrédito', 'FEDE', 'FDCRSVS1', TRUE),
    ('Banco de Desarrollo de El Salvador (BANDESAL)', 'BAND', 'BNDSSVSS', TRUE)
ON CONFLICT ("Code") DO UPDATE SET
    "Name" = EXCLUDED."Name",
    "Swift" = EXCLUDED."Swift",
    "IsActive" = TRUE;

INSERT INTO hr."RequiredDocumentTypes" ("Name", "Description", "IsMandatory", "HasExpiry") VALUES
    ('DUI', 'Documento Único de Identidad', TRUE, FALSE),
    ('NIT', 'Número de Identificación Tributaria', TRUE, FALSE),
    ('ISSS', 'Afiliación al seguro social', TRUE, FALSE),
    ('AFP', 'Afiliación a fondo de pensiones', TRUE, FALSE),
    ('Antecedentes Penales', 'Certificación PNC', TRUE, TRUE),
    ('Certificado de Salud', 'ISSS/MINSAL', TRUE, TRUE),
    ('Manipulación de Alimentos', 'Registro sanitario', TRUE, TRUE),
    ('Licencia de Conducir', 'Licencia salvadoreña', FALSE, TRUE)
ON CONFLICT ("Name") DO UPDATE SET
    "Description" = EXCLUDED."Description",
    "IsMandatory" = EXCLUDED."IsMandatory",
    "HasExpiry" = EXCLUDED."HasExpiry";

INSERT INTO hr."IsrBrackets" ("Year", "PeriodType", "BracketFrom", "BracketTo", "FixedAmount", "Rate", "ExcessOver", "Notes") VALUES
    (2026, 'MENSUAL', 0.01, 550.00, 0, 0, 0, 'Sin retención'),
    (2026, 'MENSUAL', 550.01, 895.24, 19.00, 0.1, 550.00, '10% s/exceso de $550.00'),
    (2026, 'MENSUAL', 895.25, 2038.10, 60.00, 0.2, 895.24, '20% s/exceso de $895.24'),
    (2026, 'MENSUAL', 2038.11, NULL, 288.57, 0.3, 2038.10, '30% s/exceso de $2,038.10'),
    (2026, 'QUINCENAL', 0.01, 275.00, 0, 0, 0, 'Sin retención'),
    (2026, 'QUINCENAL', 275.01, 447.62, 8.83, 0.1, 275.00, '10% s/exceso de $275.00'),
    (2026, 'QUINCENAL', 447.63, 1019.05, 30.00, 0.2, 447.62, '20% s/exceso de $447.62'),
    (2026, 'QUINCENAL', 1019.06, NULL, 144.28, 0.3, 1019.05, '30% s/exceso de $1,019.05'),
    (2026, 'SEMANAL', 0.01, 137.50, 0, 0, 0, 'Sin retención'),
    (2026, 'SEMANAL', 137.51, 223.81, 4.42, 0.1, 137.50, '10% s/exceso de $137.50'),
    (2026, 'SEMANAL', 223.82, 509.52, 15.00, 0.2, 223.81, '20% s/exceso de $223.81'),
    (2026, 'SEMANAL', 509.53, NULL, 72.14, 0.3, 509.52, '30% s/exceso de $509.52')
ON CONFLICT ("Year", "PeriodType", "BracketFrom") DO UPDATE SET
    "BracketTo" = EXCLUDED."BracketTo",
    "FixedAmount" = EXCLUDED."FixedAmount",
    "Rate" = EXCLUDED."Rate",
    "ExcessOver" = EXCLUDED."ExcessOver",
    "Notes" = EXCLUDED."Notes";

INSERT INTO hr."Holidays" ("Name", "Date", "Year", "IsMandatory", "IsActive") VALUES
    ('Año Nuevo', DATE '2026-01-01', 2026, TRUE, TRUE),
    ('Día del Trabajo', DATE '2026-05-01', 2026, TRUE, TRUE),
    ('Día de la Cruz', DATE '2026-05-03', 2026, FALSE, TRUE),
    ('Independencia', DATE '2026-09-15', 2026, TRUE, TRUE),
    ('Día de Morazán', DATE '2026-10-03', 2026, FALSE, TRUE),
    ('Navidad', DATE '2026-12-25', 2026, TRUE, TRUE),
    ('Fin de Año (descanso parcial, desde mediodía)', DATE '2026-12-31', 2026, FALSE, TRUE)
ON CONFLICT ("Date", "Year") DO UPDATE SET
    "Name" = EXCLUDED."Name",
    "IsMandatory" = EXCLUDED."IsMandatory",
    "IsActive" = TRUE;

INSERT INTO hr."LeaveTypes" ("Name", "Category", "MaxDaysPerYear", "RequiresDocument", "IsPaid", "LegalBasis") VALUES
    ('Vacaciones anuales', 'VACACIONES', 15, FALSE, TRUE, 'Art. 177-189 Código de Trabajo'),
    ('Permiso personal', 'PERMISO_CON_GOCE', 3, FALSE, TRUE, 'Política interna'),
    ('Permiso sin goce', 'PERMISO_SIN_GOCE', 15, FALSE, FALSE, 'Art. 37 Código de Trabajo'),
    ('Incapacidad ISSS', 'BAJA_MEDICA', NULL, TRUE, TRUE, 'Art. 42 Ley del Seguro Social'),
    ('Maternidad', 'MATERNIDAD', 112, TRUE, TRUE, 'Art. 309 Código de Trabajo'),
    ('Paternidad', 'PATERNIDAD', 3, FALSE, TRUE, 'Art. 309-A Código de Trabajo'),
    ('Suspensión disciplinaria', 'SUSPENSION_DISCIPLINARIA', NULL, FALSE, FALSE, 'Art. 51 Código de Trabajo')
ON CONFLICT ("Name") DO UPDATE SET
    "Category" = EXCLUDED."Category",
    "MaxDaysPerYear" = EXCLUDED."MaxDaysPerYear",
    "RequiresDocument" = EXCLUDED."RequiresDocument",
    "IsPaid" = EXCLUDED."IsPaid",
    "LegalBasis" = EXCLUDED."LegalBasis",
    "IsActive" = TRUE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flexo_user') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA hr TO flexo_user';
        EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA hr TO flexo_user';
    END IF;
END $$;
