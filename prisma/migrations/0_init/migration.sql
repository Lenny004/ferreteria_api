-- Baseline 0_init del esquema de la ferretería (Prisma + objetos del POS).
-- Parte 1: generada con `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
-- Parte 2: objetos que Prisma no modela (CHECKs, índices parciales, funciones, triggers y vistas),
--          copiados de database/init.sql y erp_ferreteria/Ferreteria.PuntoVenta/Squema.sql.
-- En una BD existente NO se ejecuta: se marca con `prisma migrate resolve --applied 0_init` (ver docs/MIGRACIONES.md).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "dte";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fiscal";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "hr";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "purchasing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sales";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "system";

-- CreateTable
CREATE TABLE "MeasurementTypes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "UnitLabel" VARCHAR(20) NOT NULL,
    "decimals" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "MeasurementTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Families" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "slug" VARCHAR(80),
    "IconKey" VARCHAR(40),
    "ImageUrl" VARCHAR(500),
    "SortOrder" INTEGER NOT NULL DEFAULT 0,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subfamilies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "FamilyId" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "slug" VARCHAR(80),
    "SortOrder" INTEGER NOT NULL DEFAULT 0,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subfamilies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "CustomerType" VARCHAR(5) NOT NULL DEFAULT 'CF',
    "name" VARCHAR(200) NOT NULL,
    "Dui" VARCHAR(15),
    "Nit" VARCHAR(20),
    "Nrc" VARCHAR(20),
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "address" VARCHAR(300),
    "municipality" VARCHAR(100),
    "department" VARCHAR(50),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "barcode" VARCHAR(50),
    "description" VARCHAR(200) NOT NULL,
    "ShortDescription" VARCHAR(500),
    "Brand" VARCHAR(100),
    "ImageUrl" VARCHAR(500),
    "FamilyId" UUID NOT NULL,
    "SubfamilyId" UUID,
    "MeasurementTypeId" UUID NOT NULL,
    "SupplierId" UUID,
    "SalePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "CostPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "CurrentStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "MinStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "MaxStock" DECIMAL(12,3),
    "ReorderPoint" DECIMAL(12,3),
    "IsWebVisible" BOOLEAN NOT NULL DEFAULT true,
    "RotationClass" VARCHAR(10),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleUnits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "Abbreviation" VARCHAR(10) NOT NULL,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleUnits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSaleUnits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ProductId" UUID NOT NULL,
    "SaleUnitId" UUID NOT NULL,
    "UnitsPerPackage" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "SalePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "barcode" VARCHAR(50),
    "IsDefault" BOOLEAN NOT NULL DEFAULT false,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSaleUnits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeDiscounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ProductId" UUID,
    "FamilyId" UUID,
    "MinQuantity" DECIMAL(12,3) NOT NULL,
    "DiscountPercent" DECIMAL(5,2),
    "FixedUnitPrice" DECIMAL(12,2),
    "StartDate" DATE,
    "EndDate" DATE,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolumeDiscounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAlerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ProductId" UUID NOT NULL,
    "CurrentStock" DECIMAL(12,3) NOT NULL,
    "MinStock" DECIMAL(12,3) NOT NULL,
    "IsResolved" BOOLEAN NOT NULL DEFAULT false,
    "ResolvedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAlerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchasing"."Suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "TradeName" VARCHAR(200),
    "Nit" VARCHAR(20),
    "Nrc" VARCHAR(20),
    "ContactName" VARCHAR(150),
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "address" VARCHAR(300),
    "municipality" VARCHAR(100),
    "department" VARCHAR(50),
    "country" VARCHAR(5) NOT NULL DEFAULT 'SV',
    "CreditDays" INTEGER NOT NULL DEFAULT 0,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchasing"."PurchaseOrders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "SupplierId" UUID NOT NULL,
    "EmployeeId" UUID NOT NULL,
    "SupplierDocNumber" VARCHAR(50),
    "SupplierDocType" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "ExpectedDate" DATE,
    "ReceivedAt" TIMESTAMPTZ,
    "ReceivedById" UUID,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchasing"."PurchaseOrderDetails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PurchaseOrderId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "UnitCost" DECIMAL(12,4) NOT NULL,
    "TaxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.13,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(300),

    CONSTRAINT "PurchaseOrderDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."CashSessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "CashRegisterCode" VARCHAR(50) NOT NULL DEFAULT 'CAJA-01',
    "OpenedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ClosedAt" TIMESTAMPTZ,
    "OpeningAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ClosingDeclaredAmount" DECIMAL(12,2),
    "ClosingExpectedAmount" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashSessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."Orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "CashSessionId" UUID,
    "CustomerId" UUID,
    "OrderType" VARCHAR(20) NOT NULL DEFAULT 'VENTA_CAJA',
    "ClientRequestId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "DiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."OrderDetails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "OrderId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "SaleUnitId" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "UnitsPerPackage" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "UnitPrice" DECIMAL(12,2) NOT NULL,
    "UnitCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "DiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(300),

    CONSTRAINT "OrderDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."Payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "OrderId" UUID NOT NULL,
    "CashSessionId" UUID,
    "method" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(100),
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ProductId" UUID NOT NULL,
    "MovementType" VARCHAR(30) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "UnitCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "TotalCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "StockBefore" DECIMAL(12,3) NOT NULL,
    "StockAfter" DECIMAL(12,3) NOT NULL,
    "OrderId" UUID,
    "PurchaseOrderId" UUID,
    "EmployeeId" UUID,
    "reason" VARCHAR(300),
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte"."DteConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmisorNit" VARCHAR(20) NOT NULL,
    "EmisorNrc" VARCHAR(20) NOT NULL,
    "EmisorName" VARCHAR(250) NOT NULL,
    "EmisorTradeName" VARCHAR(250),
    "ActividadEconomica" VARCHAR(10) NOT NULL,
    "AddressLine" VARCHAR(300) NOT NULL,
    "Municipality" VARCHAR(100) NOT NULL,
    "Department" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "ambiente" VARCHAR(5) NOT NULL DEFAULT '00',
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte"."DteIssued" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "OrderId" UUID,
    "DteType" VARCHAR(5) NOT NULL,
    "GenerationCode" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ControlNumber" VARCHAR(40) NOT NULL,
    "MhStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "MhResponse" TEXT,
    "MhSello" TEXT,
    "RelatedDteId" UUID,
    "ambiente" VARCHAR(5) NOT NULL DEFAULT '00',
    "JsonPayload" TEXT,
    "PdfUrl" VARCHAR(500),
    "TotalExenta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalGravada" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalIva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalPagar" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reprints" INTEGER NOT NULL DEFAULT 0,
    "IssuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ProcessedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DteIssued_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dte"."DteContingency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "DteId" UUID NOT NULL,
    "AttemptCount" INTEGER NOT NULL DEFAULT 0,
    "LastError" TEXT,
    "NextRetryAt" TIMESTAMPTZ,
    "ResolvedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DteContingency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal"."IvaReports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "ReportType" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    "TotalExenta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "TotalGravada" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "TotalIva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "GeneratedBy" UUID,
    "GeneratedAt" TIMESTAMPTZ,
    "FileUrl" VARCHAR(500),
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvaReports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."Departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "ParentId" UUID,
    "description" VARCHAR(300),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."Positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "DepartmentId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."Banks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(10),
    "swift" VARCHAR(20),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."RequiredDocumentTypes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "IsMandatory" BOOLEAN NOT NULL DEFAULT true,
    "AppliesToContractType" VARCHAR(20),
    "HasExpiry" BOOLEAN NOT NULL DEFAULT false,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequiredDocumentTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."Employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "FirstName" VARCHAR(100) NOT NULL,
    "LastName" VARCHAR(100) NOT NULL,
    "Dui" VARCHAR(15),
    "Nit" VARCHAR(20),
    "Nup" VARCHAR(20),
    "IsssNumber" VARCHAR(20),
    "PositionId" UUID,
    "DepartmentId" UUID,
    "DirectSupervisorId" UUID,
    "HireDate" DATE NOT NULL,
    "BaseSalary" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ContractType" VARCHAR(20) NOT NULL DEFAULT 'PLAZO_FIJO',
    "SalaryType" VARCHAR(20) NOT NULL DEFAULT 'MENSUAL',
    "ContractEndDate" DATE,
    "TerminationDate" DATE,
    "DefaultBonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "DefaultViaticos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "BirthDate" DATE,
    "Gender" VARCHAR(20),
    "Nationality" VARCHAR(20) DEFAULT 'SALVADOREÑA',
    "PassportNumber" VARCHAR(30),
    "MaritalStatus" VARCHAR(20),
    "AcademicLevel" VARCHAR(50),
    "DepartmentSv" VARCHAR(30),
    "DependentsDescription" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "address" TEXT,
    "AfpInstitution" VARCHAR(20),
    "AfpEnrollmentDate" DATE,
    "IsssEnrolled" BOOLEAN NOT NULL DEFAULT true,
    "IsssEnrollmentDate" DATE,
    "PaymentChannel" VARCHAR(30) DEFAULT 'DEPOSITO_BANCARIO',
    "OnProbation" BOOLEAN NOT NULL DEFAULT false,
    "ProbationEndDate" DATE,
    "ProbationCompletedAt" TIMESTAMPTZ,
    "TerminationReason" VARCHAR(40),
    "TerminationNotes" TEXT,
    "PinHash" TEXT,
    "PinUpdatedAt" TIMESTAMPTZ,
    "CanSell" BOOLEAN NOT NULL DEFAULT false,
    "CanCashier" BOOLEAN NOT NULL DEFAULT false,
    "AttendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."EmployeeBankAccounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "BankId" UUID NOT NULL,
    "AccountType" VARCHAR(30) NOT NULL DEFAULT 'CUENTA_DE_AHORRO',
    "AccountNumber" VARCHAR(40) NOT NULL,
    "IsPrimary" BOOLEAN NOT NULL DEFAULT true,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeBankAccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."SalaryHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "CurrentSalary" DECIMAL(10,2),
    "RequestedSalary" DECIMAL(10,2) NOT NULL,
    "reason" VARCHAR(200),
    "EffectiveDate" DATE NOT NULL,
    "ApprovedBy" UUID,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."EmployeeDocuments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "DocTypeId" UUID NOT NULL,
    "FileUrl" VARCHAR(500),
    "FileName" VARCHAR(200),
    "Status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "IssueDate" DATE,
    "ExpiryDate" DATE,
    "notes" TEXT,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "UploadedBy" UUID,
    "UploadedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "VerifiedBy" UUID,
    "VerifiedAt" TIMESTAMPTZ,

    CONSTRAINT "EmployeeDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."HealthConditionRecords" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "ConditionType" VARCHAR(30) NOT NULL,
    "InitialStartDate" DATE,
    "IncapacityEndDate" DATE,
    "notes" TEXT,
    "RequiresAccommodation" BOOLEAN NOT NULL DEFAULT false,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedBy" UUID,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthConditionRecords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."IsrBrackets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "PeriodType" VARCHAR(20) NOT NULL,
    "BracketFrom" DECIMAL(10,2) NOT NULL,
    "BracketTo" DECIMAL(10,2),
    "FixedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "Rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "ExcessOver" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(200),

    CONSTRAINT "IsrBrackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."Holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "date" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "IsMandatory" BOOLEAN NOT NULL DEFAULT true,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."PayrollPeriods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "PeriodType" VARCHAR(20) NOT NULL,
    "StartDate" DATE NOT NULL,
    "EndDate" DATE NOT NULL,
    "PaymentDate" DATE NOT NULL,
    "IsClosed" BOOLEAN NOT NULL DEFAULT false,
    "ClosedAt" TIMESTAMPTZ,
    "ClosedBy" UUID,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."PayrollRuns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PeriodId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EN_REVISION',
    "TotalGross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalAfpEmp" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalAfpPat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalIsssEmp" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalIsssPat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalIsr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "TotalPatronal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "CreatedBy" UUID,
    "ApprovedBy" UUID,
    "ApprovedAt" TIMESTAMPTZ,
    "PaidBy" UUID,
    "PaidAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRuns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."PayrollDetails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PayrollRunId" UUID NOT NULL,
    "EmployeeId" UUID NOT NULL,
    "PeriodId" UUID NOT NULL,
    "PositionName" VARCHAR(100),
    "BaseSalary" DECIMAL(10,2) NOT NULL,
    "SalaryType" VARCHAR(20) NOT NULL,
    "ContractType" VARCHAR(20),
    "AfpInstitution" VARCHAR(20),
    "nup" VARCHAR(20),
    "IsssNumber" VARCHAR(20),
    "DaysWorked" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "HoursWorked" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "OrdinarySalary" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "OvertimeHoursDiurnal" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "OvertimeHoursNocturnal" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "OvertimeHoursHoliday" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "OvertimeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "Bonuses" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "Viaticos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "VacationPay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "VacationSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "Aguinaldo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "OtherEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "TotalGross" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "AfpEmployeeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0725,
    "AfpEmployeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "IsssEmployeeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "IsssEmployeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "IsrTaxableIncome" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "IsrAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "LoanDeduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "OtherDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "TotalDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "AfpEmployerRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0775,
    "AfpEmployerAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "IsssEmployerRate" DECIMAL(5,4) NOT NULL DEFAULT 0.075,
    "IsssEmployerAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "InsaforpRate" DECIMAL(5,4) NOT NULL DEFAULT 0.01,
    "InsaforpAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "TotalEmployerCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "NetPay" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "PaymentChannel" VARCHAR(30),
    "BankAccountId" UUID,
    "PaymentReference" VARCHAR(100),
    "PaidAt" TIMESTAMPTZ,
    "DaysAbsent" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "DaysVacation" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "DaysSick" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "DaysPermission" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "HoursPerDay" INTEGER NOT NULL DEFAULT 8,
    "IsProbation" BOOLEAN NOT NULL DEFAULT false,
    "TerminationId" UUID,
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."PayrollEarningLines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PayrollDetailId" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "description" VARCHAR(200),
    "amount" DECIMAL(10,2) NOT NULL,
    "IsTaxable" BOOLEAN NOT NULL DEFAULT true,
    "SortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollEarningLines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."PayrollDeductionLines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PayrollDetailId" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "description" VARCHAR(200),
    "amount" DECIMAL(10,2) NOT NULL,
    "SortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollDeductionLines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."AguinaldoRuns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "PaymentDate" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EN_REVISION',
    "TotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "CreatedBy" UUID,
    "ApprovedBy" UUID,
    "ApprovedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AguinaldoRuns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."AguinaldoDetails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "AguinaldoRunId" UUID NOT NULL,
    "EmployeeId" UUID NOT NULL,
    "YearsOfService" DECIMAL(5,2) NOT NULL,
    "DaysEntitled" DECIMAL(5,2) NOT NULL,
    "DailySalary" DECIMAL(10,4) NOT NULL,
    "GrossAmount" DECIMAL(10,2) NOT NULL,
    "IsrRetained" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "NetAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AguinaldoDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."EmployeeTerminations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "TerminationDate" DATE NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "YearsOfService" DECIMAL(6,3),
    "IndemnizacionDays" DECIMAL(6,2),
    "IndemnizacionAmount" DECIMAL(12,2),
    "VacationDaysPending" DECIMAL(5,1),
    "VacationPayAmount" DECIMAL(10,2),
    "AguinaldoProportional" DECIMAL(10,2),
    "PendingSalary" DECIMAL(10,2),
    "TotalSettlement" DECIMAL(12,2),
    "SettlementNotes" TEXT,
    "DocumentUrl" VARCHAR(500),
    "VoidedAt" TIMESTAMPTZ,
    "VoidReason" VARCHAR(500),
    "CreatedBy" UUID,
    "ApprovedBy" UUID,
    "PaidAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTerminations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."LeaveTypes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "MaxDaysPerYear" DECIMAL(5,1),
    "RequiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "IsPaid" BOOLEAN NOT NULL DEFAULT true,
    "AffectsVacationAccrual" BOOLEAN NOT NULL DEFAULT false,
    "LegalBasis" VARCHAR(200),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."LeaveRequests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "LeaveTypeId" UUID NOT NULL,
    "StartDate" DATE NOT NULL,
    "EndDate" DATE NOT NULL,
    "DaysRequested" DECIMAL(5,1) NOT NULL,
    "HalfDay" BOOLEAN NOT NULL DEFAULT false,
    "HalfDayPeriod" VARCHAR(10),
    "reason" TEXT,
    "DocumentUrl" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "VacationPayAmount" DECIMAL(10,2),
    "VacationSurcharge" DECIMAL(10,2),
    "RequestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ReviewedBy" UUID,
    "ReviewedAt" TIMESTAMPTZ,
    "ReviewNotes" TEXT,
    "ApprovedBy" UUID,
    "ApprovedAt" TIMESTAMPTZ,
    "ProcessedInPayroll" BOOLEAN NOT NULL DEFAULT false,
    "PayrollDetailId" UUID,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."VacationBalances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "EmployeeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "DaysEarned" DECIMAL(5,1) NOT NULL DEFAULT 15,
    "DaysTaken" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "LastVacationDate" DATE,
    "NextVacationDue" DATE,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacationBalances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr"."IsrDeclarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "PeriodId" UUID,
    "TotalTaxable" DECIMAL(12,2),
    "TotalIsr" DECIMAL(12,2),
    "SubmissionDate" DATE,
    "MhReference" VARCHAR(50),
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    "FileUrl" VARCHAR(500),
    "CreatedBy" UUID,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IsrDeclarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."Settings" (
    "Key" VARCHAR(100) NOT NULL,
    "Value" TEXT NOT NULL,
    "Description" VARCHAR(300),
    "IsPublic" BOOLEAN NOT NULL DEFAULT false,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("Key")
);

-- CreateTable
CREATE TABLE "system"."Printers" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Name" VARCHAR(200) NOT NULL,
    "ConnectionType" VARCHAR(10) NOT NULL DEFAULT 'USB',
    "IpAddress" VARCHAR(15),
    "NetworkPort" INTEGER,
    "PaperWidth" SMALLINT NOT NULL DEFAULT 80,
    "IsDefault" BOOLEAN NOT NULL DEFAULT false,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Printers_pkey" PRIMARY KEY ("Id")
);

-- CreateTable
CREATE TABLE "system"."WebUsers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Username" VARCHAR(50) NOT NULL,
    "Email" VARCHAR(100) NOT NULL,
    "PasswordHash" TEXT NOT NULL,
    "Role" VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
    "EmployeeId" UUID,
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "LastLoginAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebUsers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ShopCustomers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Email" VARCHAR(150) NOT NULL,
    "PasswordHash" TEXT NOT NULL,
    "FullName" VARCHAR(200) NOT NULL,
    "Phone" VARCHAR(30),
    "IsActive" BOOLEAN NOT NULL DEFAULT true,
    "OnboardingCompletedAt" TIMESTAMPTZ,
    "LastLoginAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCustomers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ShopCartItems" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ShopCustomerId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "Quantity" DECIMAL(12,3) NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCartItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ShopOrders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ShopCustomerId" UUID NOT NULL,
    "Status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "Subtotal" DECIMAL(12,2) NOT NULL,
    "TaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "Total" DECIMAL(12,2) NOT NULL,
    "DeliveryType" VARCHAR(20) NOT NULL DEFAULT 'RETIRO_TIENDA',
    "ShippingAddress" VARCHAR(500),
    "PaymentStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "PaymentMethod" VARCHAR(30),
    "CustomerNotes" TEXT,
    "AdminNotes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopOrders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ShopPayments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ShopOrderId" UUID NOT NULL,
    "Method" VARCHAR(30) NOT NULL,
    "Amount" DECIMAL(12,2) NOT NULL,
    "Status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "ProviderRef" VARCHAR(100),
    "Notes" VARCHAR(300),
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopPayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ShopOrderLines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ShopOrderId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "Quantity" DECIMAL(12,3) NOT NULL,
    "UnitPrice" DECIMAL(12,2) NOT NULL,
    "Subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ShopOrderLines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ProductFavorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ShopCustomerId" UUID NOT NULL,
    "ProductId" UUID NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFavorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."ContactMessages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Name" VARCHAR(150) NOT NULL,
    "Email" VARCHAR(150) NOT NULL,
    "Phone" VARCHAR(30),
    "Subject" VARCHAR(200) NOT NULL,
    "Message" TEXT NOT NULL,
    "Status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "AdminNotes" TEXT,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."PasswordResetTokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "Audience" VARCHAR(20) NOT NULL,
    "UserId" UUID NOT NULL,
    "TokenHash" VARCHAR(128) NOT NULL,
    "ExpiresAt" TIMESTAMPTZ NOT NULL,
    "UsedAt" TIMESTAMPTZ,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system"."AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "TableName" VARCHAR(100) NOT NULL,
    "RecordId" VARCHAR(50) NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "OldData" JSONB,
    "NewData" JSONB,
    "UserId" UUID,
    "IpAddress" VARCHAR(45),
    "UserAgent" VARCHAR(300),
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeasurementTypes_code_key" ON "MeasurementTypes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Families_code_key" ON "Families"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Families_slug_key" ON "Families"("slug");

-- CreateIndex
CREATE INDEX "IdxFamiliesSortOrder" ON "Families"("SortOrder");

-- CreateIndex
CREATE INDEX "IdxSubfamiliesFamily" ON "Subfamilies"("FamilyId");

-- CreateIndex
CREATE INDEX "IdxSubfamiliesSort" ON "Subfamilies"("FamilyId", "SortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Subfamilies_FamilyId_code_key" ON "Subfamilies"("FamilyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_Dui_key" ON "Customers"("Dui");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_Nit_key" ON "Customers"("Nit");

-- CreateIndex
CREATE UNIQUE INDEX "Customers_Nrc_key" ON "Customers"("Nrc");

-- CreateIndex
CREATE INDEX "IdxCustomersNit" ON "Customers"("Nit");

-- CreateIndex
CREATE INDEX "IdxCustomersNrc" ON "Customers"("Nrc");

-- CreateIndex
CREATE UNIQUE INDEX "Products_code_key" ON "Products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Products_barcode_key" ON "Products"("barcode");

-- CreateIndex
CREATE INDEX "IdxProductsFamily" ON "Products"("FamilyId");

-- CreateIndex
CREATE INDEX "IdxProductsSubfamily" ON "Products"("SubfamilyId");

-- CreateIndex
CREATE INDEX "IdxProductsWebVisible" ON "Products"("IsWebVisible");

-- CreateIndex
CREATE INDEX "IdxProductsActive" ON "Products"("IsActive");

-- CreateIndex
CREATE INDEX "IdxProductsSupplier" ON "Products"("SupplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleUnits_code_key" ON "SaleUnits"("code");

-- CreateIndex
CREATE INDEX "IdxProductSaleUnitsProduct" ON "ProductSaleUnits"("ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSaleUnits_ProductId_SaleUnitId_key" ON "ProductSaleUnits"("ProductId", "SaleUnitId");

-- CreateIndex
CREATE INDEX "IdxVolumeDiscountsProduct" ON "VolumeDiscounts"("ProductId");

-- CreateIndex
CREATE INDEX "IdxVolumeDiscountsFamily" ON "VolumeDiscounts"("FamilyId");

-- CreateIndex
CREATE INDEX "IdxStockAlertsProduct" ON "StockAlerts"("ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Suppliers_Nit_key" ON "purchasing"."Suppliers"("Nit");

-- CreateIndex
CREATE UNIQUE INDEX "Suppliers_Nrc_key" ON "purchasing"."Suppliers"("Nrc");

-- CreateIndex
CREATE INDEX "IdxSuppliersNit" ON "purchasing"."Suppliers"("Nit");

-- CreateIndex
CREATE INDEX "IdxPurchaseOrdersSupplier" ON "purchasing"."PurchaseOrders"("SupplierId");

-- CreateIndex
CREATE INDEX "IdxPurchaseOrdersStatus" ON "purchasing"."PurchaseOrders"("status");

-- CreateIndex
CREATE INDEX "IdxPODetailsOrder" ON "purchasing"."PurchaseOrderDetails"("PurchaseOrderId");

-- CreateIndex
CREATE INDEX "IdxPODetailsProduct" ON "purchasing"."PurchaseOrderDetails"("ProductId");

-- CreateIndex
CREATE INDEX "IdxCashSessionEmployeeRegister" ON "sales"."CashSessions"("EmployeeId", "CashRegisterCode");

-- CreateIndex
CREATE INDEX "IdxCashSessionStatus" ON "sales"."CashSessions"("status");

-- CreateIndex
CREATE INDEX "IdxCashSessionOpened" ON "sales"."CashSessions"("OpenedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdxOrdersClientRequest" ON "sales"."Orders"("ClientRequestId");

-- CreateIndex
CREATE INDEX "IdxOrdersEmployee" ON "sales"."Orders"("EmployeeId");

-- CreateIndex
CREATE INDEX "IdxOrdersCashSession" ON "sales"."Orders"("CashSessionId");

-- CreateIndex
CREATE INDEX "IdxOrdersStatus" ON "sales"."Orders"("status");

-- CreateIndex
CREATE INDEX "IdxOrdersCreatedAt" ON "sales"."Orders"("CreatedAt");

-- CreateIndex
CREATE INDEX "IdxOrderDetailsOrder" ON "sales"."OrderDetails"("OrderId");

-- CreateIndex
CREATE INDEX "IdxOrderDetailsProduct" ON "sales"."OrderDetails"("ProductId");

-- CreateIndex
CREATE INDEX "IdxPaymentsOrder" ON "sales"."Payments"("OrderId");

-- CreateIndex
CREATE INDEX "IdxPaymentsSession" ON "sales"."Payments"("CashSessionId");

-- CreateIndex
CREATE INDEX "IdxInvMovProductDate" ON "InventoryMovements"("ProductId", "CreatedAt");

-- CreateIndex
CREATE INDEX "IdxInvMovType" ON "InventoryMovements"("MovementType");

-- CreateIndex
CREATE INDEX "IdxInvMovOrder" ON "InventoryMovements"("OrderId");

-- CreateIndex
CREATE INDEX "IdxInvMovPO" ON "InventoryMovements"("PurchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DteIssued_GenerationCode_key" ON "dte"."DteIssued"("GenerationCode");

-- CreateIndex
CREATE UNIQUE INDEX "DteIssued_ControlNumber_key" ON "dte"."DteIssued"("ControlNumber");

-- CreateIndex
CREATE INDEX "IdxDteIssuedOrder" ON "dte"."DteIssued"("OrderId");

-- CreateIndex
CREATE INDEX "IdxDteIssuedStatus" ON "dte"."DteIssued"("MhStatus");

-- CreateIndex
CREATE INDEX "IdxDteIssuedType" ON "dte"."DteIssued"("DteType");

-- CreateIndex
CREATE INDEX "IdxDteIssuedAt" ON "dte"."DteIssued"("IssuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DteContingency_DteId_key" ON "dte"."DteContingency"("DteId");

-- CreateIndex
CREATE INDEX "IdxContingencyRetry" ON "dte"."DteContingency"("NextRetryAt");

-- CreateIndex
CREATE INDEX "IdxIvaReportPeriod" ON "fiscal"."IvaReports"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "IvaReports_year_month_ReportType_key" ON "fiscal"."IvaReports"("year", "month", "ReportType");

-- CreateIndex
CREATE UNIQUE INDEX "Departments_name_key" ON "hr"."Departments"("name");

-- CreateIndex
CREATE INDEX "IdxDepartmentsParent" ON "hr"."Departments"("ParentId");

-- CreateIndex
CREATE UNIQUE INDEX "Positions_DepartmentId_name_key" ON "hr"."Positions"("DepartmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Banks_code_key" ON "hr"."Banks"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RequiredDocumentTypes_name_key" ON "hr"."RequiredDocumentTypes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_Dui_key" ON "hr"."Employees"("Dui");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_Nit_key" ON "hr"."Employees"("Nit");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_Nup_key" ON "hr"."Employees"("Nup");

-- CreateIndex
CREATE UNIQUE INDEX "Employees_IsssNumber_key" ON "hr"."Employees"("IsssNumber");

-- CreateIndex
CREATE INDEX "IdxEmployeesDepartment" ON "hr"."Employees"("DepartmentId");

-- CreateIndex
CREATE INDEX "IdxEmployeesSupervisor" ON "hr"."Employees"("DirectSupervisorId");

-- CreateIndex
CREATE INDEX "IdxEmployeesContractType" ON "hr"."Employees"("ContractType");

-- CreateIndex
CREATE INDEX "IdxEmployeeBankAccountsEmployee" ON "hr"."EmployeeBankAccounts"("EmployeeId");

-- CreateIndex
CREATE INDEX "IdxSalaryHistoryEmployee" ON "hr"."SalaryHistory"("EmployeeId");

-- CreateIndex
CREATE INDEX "IdxEmployeeDocumentsEmployee" ON "hr"."EmployeeDocuments"("EmployeeId");

-- CreateIndex
CREATE INDEX "IdxEmployeeDocumentsStatus" ON "hr"."EmployeeDocuments"("Status");

-- CreateIndex
CREATE INDEX "IdxHealthConditionsEmployee" ON "hr"."HealthConditionRecords"("EmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "IsrBrackets_year_PeriodType_BracketFrom_key" ON "hr"."IsrBrackets"("year", "PeriodType", "BracketFrom");

-- CreateIndex
CREATE INDEX "IdxHolidaysYear" ON "hr"."Holidays"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Holidays_date_year_key" ON "hr"."Holidays"("date", "year");

-- CreateIndex
CREATE INDEX "IdxPayrollPeriodsType" ON "hr"."PayrollPeriods"("PeriodType");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriods_StartDate_EndDate_key" ON "hr"."PayrollPeriods"("StartDate", "EndDate");

-- CreateIndex
CREATE INDEX "IdxPayrollRunsPeriod" ON "hr"."PayrollRuns"("PeriodId");

-- CreateIndex
CREATE INDEX "IdxPayrollRunsStatus" ON "hr"."PayrollRuns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDetails_TerminationId_key" ON "hr"."PayrollDetails"("TerminationId");

-- CreateIndex
CREATE INDEX "IdxPayrollDetailsRun" ON "hr"."PayrollDetails"("PayrollRunId");

-- CreateIndex
CREATE INDEX "IdxPayrollDetailsEmployee" ON "hr"."PayrollDetails"("EmployeeId");

-- CreateIndex
CREATE INDEX "IdxPayrollDetailsPeriod" ON "hr"."PayrollDetails"("PeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDetails_PayrollRunId_EmployeeId_key" ON "hr"."PayrollDetails"("PayrollRunId", "EmployeeId");

-- CreateIndex
CREATE INDEX "IdxPayrollEarningLinesDetail" ON "hr"."PayrollEarningLines"("PayrollDetailId");

-- CreateIndex
CREATE INDEX "IdxPayrollDeductionLinesDetail" ON "hr"."PayrollDeductionLines"("PayrollDetailId");

-- CreateIndex
CREATE UNIQUE INDEX "AguinaldoRuns_year_key" ON "hr"."AguinaldoRuns"("year");

-- CreateIndex
CREATE UNIQUE INDEX "AguinaldoDetails_AguinaldoRunId_EmployeeId_key" ON "hr"."AguinaldoDetails"("AguinaldoRunId", "EmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTerminations_EmployeeId_key" ON "hr"."EmployeeTerminations"("EmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveTypes_name_key" ON "hr"."LeaveTypes"("name");

-- CreateIndex
CREATE INDEX "IdxLeaveRequestsEmployee" ON "hr"."LeaveRequests"("EmployeeId");

-- CreateIndex
CREATE INDEX "IdxLeaveRequestsStatus" ON "hr"."LeaveRequests"("status");

-- CreateIndex
CREATE INDEX "IdxLeaveRequestsDates" ON "hr"."LeaveRequests"("StartDate", "EndDate");

-- CreateIndex
CREATE UNIQUE INDEX "VacationBalances_EmployeeId_year_key" ON "hr"."VacationBalances"("EmployeeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "IsrDeclarations_year_month_key" ON "hr"."IsrDeclarations"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "WebUsers_Username_key" ON "system"."WebUsers"("Username");

-- CreateIndex
CREATE UNIQUE INDEX "WebUsers_Email_key" ON "system"."WebUsers"("Email");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomers_Email_key" ON "system"."ShopCustomers"("Email");

-- CreateIndex
CREATE INDEX "IdxShopCartCustomer" ON "system"."ShopCartItems"("ShopCustomerId");

-- CreateIndex
CREATE INDEX "IdxShopCartProduct" ON "system"."ShopCartItems"("ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCartItems_ShopCustomerId_ProductId_key" ON "system"."ShopCartItems"("ShopCustomerId", "ProductId");

-- CreateIndex
CREATE INDEX "IdxShopOrdersCustomer" ON "system"."ShopOrders"("ShopCustomerId");

-- CreateIndex
CREATE INDEX "IdxShopOrdersStatus" ON "system"."ShopOrders"("Status");

-- CreateIndex
CREATE INDEX "IdxShopOrdersPaymentStatus" ON "system"."ShopOrders"("PaymentStatus");

-- CreateIndex
CREATE INDEX "IdxShopOrdersCreatedAt" ON "system"."ShopOrders"("CreatedAt");

-- CreateIndex
CREATE INDEX "IdxShopPaymentsOrder" ON "system"."ShopPayments"("ShopOrderId");

-- CreateIndex
CREATE INDEX "IdxShopOrderLinesOrder" ON "system"."ShopOrderLines"("ShopOrderId");

-- CreateIndex
CREATE INDEX "IdxShopOrderLinesProduct" ON "system"."ShopOrderLines"("ProductId");

-- CreateIndex
CREATE INDEX "IdxProductFavoritesCustomer" ON "system"."ProductFavorites"("ShopCustomerId");

-- CreateIndex
CREATE INDEX "IdxProductFavoritesProduct" ON "system"."ProductFavorites"("ProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFavorites_ShopCustomerId_ProductId_key" ON "system"."ProductFavorites"("ShopCustomerId", "ProductId");

-- CreateIndex
CREATE INDEX "IdxContactMessagesStatus" ON "system"."ContactMessages"("Status");

-- CreateIndex
CREATE INDEX "IdxContactMessagesCreatedAt" ON "system"."ContactMessages"("CreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetTokens_TokenHash_key" ON "system"."PasswordResetTokens"("TokenHash");

-- CreateIndex
CREATE INDEX "IdxPasswordResetAudienceUser" ON "system"."PasswordResetTokens"("Audience", "UserId");

-- CreateIndex
CREATE INDEX "IdxAuditLogRecord" ON "system"."AuditLog"("TableName", "RecordId");

-- CreateIndex
CREATE INDEX "IdxAuditLogUser" ON "system"."AuditLog"("UserId");

-- CreateIndex
CREATE INDEX "IdxAuditLogCreatedAt" ON "system"."AuditLog"("CreatedAt");

-- AddForeignKey
ALTER TABLE "Subfamilies" ADD CONSTRAINT "Subfamilies_FamilyId_fkey" FOREIGN KEY ("FamilyId") REFERENCES "Families"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_FamilyId_fkey" FOREIGN KEY ("FamilyId") REFERENCES "Families"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_SubfamilyId_fkey" FOREIGN KEY ("SubfamilyId") REFERENCES "Subfamilies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_MeasurementTypeId_fkey" FOREIGN KEY ("MeasurementTypeId") REFERENCES "MeasurementTypes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_SupplierId_fkey" FOREIGN KEY ("SupplierId") REFERENCES "purchasing"."Suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductSaleUnits" ADD CONSTRAINT "ProductSaleUnits_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductSaleUnits" ADD CONSTRAINT "ProductSaleUnits_SaleUnitId_fkey" FOREIGN KEY ("SaleUnitId") REFERENCES "SaleUnits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VolumeDiscounts" ADD CONSTRAINT "VolumeDiscounts_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "VolumeDiscounts" ADD CONSTRAINT "VolumeDiscounts_FamilyId_fkey" FOREIGN KEY ("FamilyId") REFERENCES "Families"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "StockAlerts" ADD CONSTRAINT "StockAlerts_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchasing"."PurchaseOrders" ADD CONSTRAINT "FKPurchaseOrdersEmployee" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchasing"."PurchaseOrders" ADD CONSTRAINT "PurchaseOrders_SupplierId_fkey" FOREIGN KEY ("SupplierId") REFERENCES "purchasing"."Suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchasing"."PurchaseOrderDetails" ADD CONSTRAINT "PurchaseOrderDetails_PurchaseOrderId_fkey" FOREIGN KEY ("PurchaseOrderId") REFERENCES "purchasing"."PurchaseOrders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchasing"."PurchaseOrderDetails" ADD CONSTRAINT "PurchaseOrderDetails_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."CashSessions" ADD CONSTRAINT "FKCashSessionsEmployee" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Orders" ADD CONSTRAINT "FKOrdersEmployee" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Orders" ADD CONSTRAINT "Orders_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES "sales"."CashSessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Orders" ADD CONSTRAINT "Orders_CustomerId_fkey" FOREIGN KEY ("CustomerId") REFERENCES "Customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."OrderDetails" ADD CONSTRAINT "OrderDetails_OrderId_fkey" FOREIGN KEY ("OrderId") REFERENCES "sales"."Orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."OrderDetails" ADD CONSTRAINT "OrderDetails_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."OrderDetails" ADD CONSTRAINT "OrderDetails_SaleUnitId_fkey" FOREIGN KEY ("SaleUnitId") REFERENCES "SaleUnits"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Payments" ADD CONSTRAINT "Payments_OrderId_fkey" FOREIGN KEY ("OrderId") REFERENCES "sales"."Orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales"."Payments" ADD CONSTRAINT "Payments_CashSessionId_fkey" FOREIGN KEY ("CashSessionId") REFERENCES "sales"."CashSessions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovements" ADD CONSTRAINT "FKInventoryMovementsEmployee" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovements" ADD CONSTRAINT "FKInventoryMovementsOrder" FOREIGN KEY ("OrderId") REFERENCES "sales"."Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovements" ADD CONSTRAINT "InventoryMovements_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventoryMovements" ADD CONSTRAINT "FKInventoryMovementsPurchaseOrder" FOREIGN KEY ("PurchaseOrderId") REFERENCES "purchasing"."PurchaseOrders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dte"."DteIssued" ADD CONSTRAINT "DteIssued_OrderId_fkey" FOREIGN KEY ("OrderId") REFERENCES "sales"."Orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dte"."DteIssued" ADD CONSTRAINT "DteIssued_RelatedDteId_fkey" FOREIGN KEY ("RelatedDteId") REFERENCES "dte"."DteIssued"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dte"."DteContingency" ADD CONSTRAINT "DteContingency_DteId_fkey" FOREIGN KEY ("DteId") REFERENCES "dte"."DteIssued"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr"."Departments" ADD CONSTRAINT "Departments_ParentId_fkey" FOREIGN KEY ("ParentId") REFERENCES "hr"."Departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr"."Positions" ADD CONSTRAINT "Positions_DepartmentId_fkey" FOREIGN KEY ("DepartmentId") REFERENCES "hr"."Departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr"."Employees" ADD CONSTRAINT "Employees_PositionId_fkey" FOREIGN KEY ("PositionId") REFERENCES "hr"."Positions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr"."Employees" ADD CONSTRAINT "Employees_DepartmentId_fkey" FOREIGN KEY ("DepartmentId") REFERENCES "hr"."Departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr"."Employees" ADD CONSTRAINT "Employees_DirectSupervisorId_fkey" FOREIGN KEY ("DirectSupervisorId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr"."EmployeeBankAccounts" ADD CONSTRAINT "EmployeeBankAccounts_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."EmployeeBankAccounts" ADD CONSTRAINT "EmployeeBankAccounts_BankId_fkey" FOREIGN KEY ("BankId") REFERENCES "hr"."Banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."SalaryHistory" ADD CONSTRAINT "SalaryHistory_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."EmployeeDocuments" ADD CONSTRAINT "EmployeeDocuments_DocTypeId_fkey" FOREIGN KEY ("DocTypeId") REFERENCES "hr"."RequiredDocumentTypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."EmployeeDocuments" ADD CONSTRAINT "EmployeeDocuments_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."HealthConditionRecords" ADD CONSTRAINT "HealthConditionRecords_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollRuns" ADD CONSTRAINT "PayrollRuns_PeriodId_fkey" FOREIGN KEY ("PeriodId") REFERENCES "hr"."PayrollPeriods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollDetails" ADD CONSTRAINT "PayrollDetails_PayrollRunId_fkey" FOREIGN KEY ("PayrollRunId") REFERENCES "hr"."PayrollRuns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollDetails" ADD CONSTRAINT "PayrollDetails_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollDetails" ADD CONSTRAINT "PayrollDetails_PeriodId_fkey" FOREIGN KEY ("PeriodId") REFERENCES "hr"."PayrollPeriods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollDetails" ADD CONSTRAINT "PayrollDetails_BankAccountId_fkey" FOREIGN KEY ("BankAccountId") REFERENCES "hr"."EmployeeBankAccounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollDetails" ADD CONSTRAINT "PayrollDetails_TerminationId_fkey" FOREIGN KEY ("TerminationId") REFERENCES "hr"."EmployeeTerminations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollEarningLines" ADD CONSTRAINT "PayrollEarningLines_PayrollDetailId_fkey" FOREIGN KEY ("PayrollDetailId") REFERENCES "hr"."PayrollDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."PayrollDeductionLines" ADD CONSTRAINT "PayrollDeductionLines_PayrollDetailId_fkey" FOREIGN KEY ("PayrollDetailId") REFERENCES "hr"."PayrollDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."AguinaldoDetails" ADD CONSTRAINT "AguinaldoDetails_AguinaldoRunId_fkey" FOREIGN KEY ("AguinaldoRunId") REFERENCES "hr"."AguinaldoRuns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."AguinaldoDetails" ADD CONSTRAINT "AguinaldoDetails_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."EmployeeTerminations" ADD CONSTRAINT "EmployeeTerminations_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."LeaveRequests" ADD CONSTRAINT "LeaveRequests_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."LeaveRequests" ADD CONSTRAINT "LeaveRequests_LeaveTypeId_fkey" FOREIGN KEY ("LeaveTypeId") REFERENCES "hr"."LeaveTypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."LeaveRequests" ADD CONSTRAINT "LeaveRequests_PayrollDetailId_fkey" FOREIGN KEY ("PayrollDetailId") REFERENCES "hr"."PayrollDetails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."VacationBalances" ADD CONSTRAINT "VacationBalances_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr"."IsrDeclarations" ADD CONSTRAINT "IsrDeclarations_PeriodId_fkey" FOREIGN KEY ("PeriodId") REFERENCES "hr"."PayrollPeriods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."WebUsers" ADD CONSTRAINT "WebUsers_EmployeeId_fkey" FOREIGN KEY ("EmployeeId") REFERENCES "hr"."Employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system"."ShopCartItems" ADD CONSTRAINT "ShopCartItems_ShopCustomerId_fkey" FOREIGN KEY ("ShopCustomerId") REFERENCES "system"."ShopCustomers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ShopCartItems" ADD CONSTRAINT "ShopCartItems_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ShopOrders" ADD CONSTRAINT "ShopOrders_ShopCustomerId_fkey" FOREIGN KEY ("ShopCustomerId") REFERENCES "system"."ShopCustomers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ShopPayments" ADD CONSTRAINT "ShopPayments_ShopOrderId_fkey" FOREIGN KEY ("ShopOrderId") REFERENCES "system"."ShopOrders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ShopOrderLines" ADD CONSTRAINT "ShopOrderLines_ShopOrderId_fkey" FOREIGN KEY ("ShopOrderId") REFERENCES "system"."ShopOrders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ShopOrderLines" ADD CONSTRAINT "ShopOrderLines_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ProductFavorites" ADD CONSTRAINT "ProductFavorites_ShopCustomerId_fkey" FOREIGN KEY ("ShopCustomerId") REFERENCES "system"."ShopCustomers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system"."ProductFavorites" ADD CONSTRAINT "ProductFavorites_ProductId_fkey" FOREIGN KEY ("ProductId") REFERENCES "Products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===================== Parte 2: objetos del POS no modelados por Prisma =====================

-- Objetos PostgreSQL que Prisma no modela. Fuente: database/init.sql y
-- erp_ferreteria/Ferreteria.PuntoVenta/Squema.sql. Anexar al baseline generado.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS dte;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS system;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS fiscal;

CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_stock_alert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."CurrentStock" <= NEW."MinStock"
       AND NEW."CurrentStock" != OLD."CurrentStock"
       AND NOT EXISTS (
           SELECT 1 FROM public."StockAlerts"
           WHERE "ProductId" = NEW."id" AND "IsResolved" = FALSE
       ) THEN
        INSERT INTO public."StockAlerts" ("ProductId", "CurrentStock", "MinStock")
        VALUES (NEW."id", NEW."CurrentStock", NEW."MinStock");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS "IdxStockAlertsUnresolved"
    ON public."StockAlerts"("ProductId") WHERE "IsResolved" = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS "IdxCashSessionOpen"
    ON sales."CashSessions"("EmployeeId", "CashRegisterCode")
    WHERE "status" = 'ABIERTA';
CREATE UNIQUE INDEX IF NOT EXISTS "IdxPrinterDefault"
    ON system."Printers"("IsDefault") WHERE "IsDefault" = TRUE;

ALTER TABLE public."Customers" ADD CONSTRAINT "CustomerTypeValid"
    CHECK ("CustomerType" IN ('CF','CCF'));
ALTER TABLE public."Products" ADD CONSTRAINT "StockNotNegative"
    CHECK ("CurrentStock" >= 0);
ALTER TABLE public."Products" ADD CONSTRAINT "RotationClassValid"
    CHECK ("RotationClass" IS NULL OR "RotationClass" IN ('ALTA','MEDIA','BAJA','NULA'));
ALTER TABLE public."ProductSaleUnits" ADD CONSTRAINT "UnitsPerPackagePositive"
    CHECK ("UnitsPerPackage" > 0);
ALTER TABLE public."VolumeDiscounts" ADD CONSTRAINT "VolumeDiscountTarget"
    CHECK ("ProductId" IS NOT NULL OR "FamilyId" IS NOT NULL);
ALTER TABLE public."VolumeDiscounts" ADD CONSTRAINT "VolumeDiscountMinQty"
    CHECK ("MinQuantity" > 0);
ALTER TABLE public."VolumeDiscounts" ADD CONSTRAINT "VolumeDiscountValue"
    CHECK ("DiscountPercent" IS NOT NULL OR "FixedUnitPrice" IS NOT NULL);
ALTER TABLE public."InventoryMovements" ADD CONSTRAINT "MovementTypeValid"
    CHECK ("MovementType" IN ('ENTRADA_COMPRA','ENTRADA_DEVOLUCION','SALIDA_VENTA','AJUSTE_ENTRADA','AJUSTE_SALIDA'));
ALTER TABLE purchasing."PurchaseOrders" ADD CONSTRAINT "PurchaseStatusValid"
    CHECK ("status" IN ('BORRADOR','CONFIRMADA','RECIBIDA','CANCELADA'));
ALTER TABLE purchasing."PurchaseOrderDetails" ADD CONSTRAINT "PODetailQtyPositive"
    CHECK ("quantity" > 0);
ALTER TABLE sales."CashSessions" ADD CONSTRAINT "CashSessionStatusValid"
    CHECK ("status" IN ('ABIERTA','CERRADA','CANCELADA'));
ALTER TABLE sales."Orders" ADD CONSTRAINT "OrderStatusValid"
    CHECK ("status" IN ('PENDIENTE','COMPLETADA','CANCELADA'));
ALTER TABLE sales."OrderDetails" ADD CONSTRAINT "OrderDetailQtyPositive"
    CHECK ("quantity" > 0);
ALTER TABLE sales."Payments" ADD CONSTRAINT "PaymentMethodValid"
    CHECK ("method" IN ('EFECTIVO','TARJETA','TRANSFERENCIA','OTRO'));
ALTER TABLE sales."Payments" ADD CONSTRAINT "PaymentAmountPositive"
    CHECK ("amount" > 0);
ALTER TABLE dte."DteIssued" ADD CONSTRAINT "MhStatusValid"
    CHECK ("MhStatus" IN ('PENDIENTE','PROCESADO','RECHAZADO','CONTINGENCIA'));
ALTER TABLE hr."Employees" ADD CONSTRAINT "ContractValid"
    CHECK ("ContractType" IN ('TIEMPO_PARCIAL','PLAZO_FIJO','HONORARIOS','PASANTE'));
ALTER TABLE hr."Employees" ADD CONSTRAINT "SalaryTypeValid"
    CHECK ("SalaryType" IN ('MENSUAL','QUINCENAL','SEMANAL'));
ALTER TABLE system."WebUsers" ADD CONSTRAINT "RoleValid"
    CHECK ("Role" IN ('ADMIN','ACCOUNTANT','OWNER'));

CREATE TRIGGER "TrgStockAlert"
AFTER UPDATE OF "CurrentStock" ON public."Products"
FOR EACH ROW EXECUTE FUNCTION public.fn_stock_alert();

CREATE TRIGGER "TrgFamilyTimestamp" BEFORE UPDATE ON public."Families"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgSubfamilyTimestamp" BEFORE UPDATE ON public."Subfamilies"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgSaleUnitTimestamp" BEFORE UPDATE ON public."SaleUnits"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgCustomerTimestamp" BEFORE UPDATE ON public."Customers"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgSupplierTimestamp" BEFORE UPDATE ON purchasing."Suppliers"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgProductTimestamp" BEFORE UPDATE ON public."Products"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgProductSaleUnitTimestamp" BEFORE UPDATE ON public."ProductSaleUnits"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgVolumeDiscountTimestamp" BEFORE UPDATE ON public."VolumeDiscounts"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgPurchaseOrderTimestamp" BEFORE UPDATE ON purchasing."PurchaseOrders"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgCashSessionTimestamp" BEFORE UPDATE ON sales."CashSessions"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgOrderTimestamp" BEFORE UPDATE ON sales."Orders"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgDteConfigTimestamp" BEFORE UPDATE ON dte."DteConfig"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgDepartmentTimestamp" BEFORE UPDATE ON hr."Departments"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgPositionTimestamp" BEFORE UPDATE ON hr."Positions"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgEmployeeTimestamp" BEFORE UPDATE ON hr."Employees"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgWebUserTimestamp" BEFORE UPDATE ON system."WebUsers"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();
CREATE TRIGGER "TrgPrinterTimestamp" BEFORE UPDATE ON system."Printers"
FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE OR REPLACE VIEW public."VProductsStock" AS
SELECT p."id", p."code", p."description", f."name" AS family,
       sf."name" AS subfamily, mt."UnitLabel" AS unit, mt."decimals",
       p."CurrentStock", p."MinStock", p."SalePrice", p."RotationClass",
       CASE WHEN p."CurrentStock" = 0 THEN 'AGOTADO'
            WHEN p."CurrentStock" <= p."MinStock" THEN 'BAJO_MINIMO'
            ELSE 'OK' END AS "StockStatus"
FROM public."Products" p
JOIN public."Families" f ON p."FamilyId" = f."id"
LEFT JOIN public."Subfamilies" sf ON p."SubfamilyId" = sf."id"
JOIN public."MeasurementTypes" mt ON p."MeasurementTypeId" = mt."id"
WHERE p."IsActive" = TRUE;

CREATE OR REPLACE VIEW public."VProductRotation" AS
SELECT p."id", p."code", p."description", p."CurrentStock",
       COALESCE(SUM(CASE WHEN m."MovementType" = 'SALIDA_VENTA'
                         AND m."CreatedAt" >= NOW() - INTERVAL '30 days'
                    THEN m."quantity" ELSE 0 END), 0) AS "SoldLast30Days",
       CASE WHEN COALESCE(SUM(CASE WHEN m."MovementType" = 'SALIDA_VENTA'
                                   AND m."CreatedAt" >= NOW() - INTERVAL '30 days'
                              THEN m."quantity" ELSE 0 END), 0) = 0 THEN 'NULA'
            WHEN COALESCE(SUM(CASE WHEN m."MovementType" = 'SALIDA_VENTA'
                                   AND m."CreatedAt" >= NOW() - INTERVAL '30 days'
                              THEN m."quantity" ELSE 0 END), 0) >= 50 THEN 'ALTA'
            WHEN COALESCE(SUM(CASE WHEN m."MovementType" = 'SALIDA_VENTA'
                                   AND m."CreatedAt" >= NOW() - INTERVAL '30 days'
                              THEN m."quantity" ELSE 0 END), 0) >= 10 THEN 'MEDIA'
            ELSE 'BAJA' END AS "RotationClassComputed"
FROM public."Products" p
LEFT JOIN public."InventoryMovements" m ON m."ProductId" = p."id"
WHERE p."IsActive" = TRUE
GROUP BY p."id", p."code", p."description", p."CurrentStock";

CREATE OR REPLACE VIEW public."VActiveAlerts" AS
SELECT al."id", al."CreatedAt", p."code", p."description", al."CurrentStock", al."MinStock",
       CASE WHEN al."CurrentStock" = 0 THEN 'AGOTADO' ELSE 'BAJO_MINIMO' END AS "AlertType"
FROM public."StockAlerts" al
JOIN public."Products" p ON al."ProductId" = p."id"
WHERE al."IsResolved" = FALSE
ORDER BY al."CreatedAt" DESC;

CREATE OR REPLACE VIEW sales."VKpisToday" AS
SELECT COUNT(*) AS "TotalOrders", COALESCE(SUM(o."total"), 0) AS "TotalAmount",
       COALESCE(AVG(o."total"), 0) AS "AvgTicket"
FROM sales."Orders" o
WHERE o."CreatedAt"::date = CURRENT_DATE AND o."status" = 'COMPLETADA';
