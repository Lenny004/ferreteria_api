-- =============================================================================
-- FlexoCable SV — Database initialization
-- Ejecutado una sola vez al crear el contenedor PostgreSQL.
-- Crea extensiones, esquemas y función de timestamp compartida.
-- Las TABLAS las crea Prisma con `prisma db push` o `prisma migrate dev`.
-- =============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Esquemas del sistema
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS dte;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS system;
CREATE SCHEMA IF NOT EXISTS purchasing;
CREATE SCHEMA IF NOT EXISTS fiscal;

-- Función compartida para actualizar UpdatedAt automáticamente.
-- Usada por triggers de WPF EF Core y por Prisma triggers si se agregan.
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Permisos para el usuario de desarrollo
GRANT ALL PRIVILEGES ON SCHEMA public     TO flexo_user;
GRANT ALL PRIVILEGES ON SCHEMA sales      TO flexo_user;
GRANT ALL PRIVILEGES ON SCHEMA dte        TO flexo_user;
GRANT ALL PRIVILEGES ON SCHEMA hr         TO flexo_user;
GRANT ALL PRIVILEGES ON SCHEMA system     TO flexo_user;
GRANT ALL PRIVILEGES ON SCHEMA purchasing TO flexo_user;
GRANT ALL PRIVILEGES ON SCHEMA fiscal     TO flexo_user;

ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA public     GRANT ALL ON TABLES    TO flexo_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA sales      GRANT ALL ON TABLES    TO flexo_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA dte        GRANT ALL ON TABLES    TO flexo_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA hr         GRANT ALL ON TABLES    TO flexo_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA system     GRANT ALL ON TABLES    TO flexo_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA purchasing GRANT ALL ON TABLES    TO flexo_user;
ALTER DEFAULT PRIVILEGES FOR ROLE flexo_user IN SCHEMA fiscal     GRANT ALL ON TABLES    TO flexo_user;
