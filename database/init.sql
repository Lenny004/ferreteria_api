-- =============================================================================
-- Ferreteria ERP — Inicialización de base de datos (Docker / PostgreSQL local)
-- =============================================================================
-- Se ejecuta UNA vez al crear el contenedor, ANTES de Prisma/EF Core.
-- Responsabilidades:
--   1) Extensiones (pgcrypto = UUID + bcrypt; uuid-ossp = compatibilidad)
--   2) Esquemas de dominio alineados al modelo:
--        public     → Product, Customer, Family, InventoryMovement
--        sales      → Order, OrderDetail, Payment, CashSession
--        dte        → documentos tributarios electrónicos (MH El Salvador)
--        hr         → Employee, Department, Position, planilla
--        system     → Setting, AuditLog, Printer
--        purchasing → Supplier, PurchaseOrder
--        fiscal     → Libros IVA / fiscalidad
--   3) Trigger helper fn_update_timestamp() para columnas UpdatedAt
--   4) Grants al rol de desarrollo ferreteria_user
-- Las TABLAS las crea Prisma (`db push` / migrate) o el script de esquema WPF.
-- =============================================================================

-- pgcrypto: gen_random_uuid(), crypt()/gen_salt() para Employee.PinHash
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Esquemas lógicos (misma partición que schema.prisma y EF Core)
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS dte;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS system;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS fiscal;

-- BEFORE UPDATE: sincroniza UpdatedAt en entidades con auditoría temporal.
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rol de desarrollo: acceso completo a todos los esquemas del ERP.
-- En producción restringir a least-privilege (SELECT/INSERT/UPDATE por esquema).
GRANT ALL PRIVILEGES ON SCHEMA public     TO ferreteria_user;
GRANT ALL PRIVILEGES ON SCHEMA sales      TO ferreteria_user;
GRANT ALL PRIVILEGES ON SCHEMA dte        TO ferreteria_user;
GRANT ALL PRIVILEGES ON SCHEMA hr         TO ferreteria_user;
GRANT ALL PRIVILEGES ON SCHEMA system     TO ferreteria_user;
GRANT ALL PRIVILEGES ON SCHEMA purchasing TO ferreteria_user;
GRANT ALL PRIVILEGES ON SCHEMA fiscal     TO ferreteria_user;

ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA public     GRANT ALL ON TABLES TO ferreteria_user;
ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA sales      GRANT ALL ON TABLES TO ferreteria_user;
ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA dte        GRANT ALL ON TABLES TO ferreteria_user;
ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA hr         GRANT ALL ON TABLES TO ferreteria_user;
ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA system     GRANT ALL ON TABLES TO ferreteria_user;
ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA purchasing GRANT ALL ON TABLES TO ferreteria_user;
ALTER DEFAULT PRIVILEGES FOR ROLE ferreteria_user IN SCHEMA fiscal     GRANT ALL ON TABLES TO ferreteria_user;
