/**
 * Seed de datos demo para el ERP Ferretería (PostgreSQL + Prisma).
 *
 * Pobla catálogos maestros y RRHH mínimos para desarrollo local:
 * - MeasurementType / Family (esquema public)
 * - Department / Position / Employee (esquema hr)
 * - Setting + WebUser admin (esquema system)
 *
 * WebUser demo: admin / admin123 (solo desarrollo).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Inserta o actualiza catálogos, empleados demo y settings del sistema.
 * Requiere la extensión pgcrypto para `crypt` / `gen_salt` en PinHash.
 */
async function seedDemoData(): Promise<void> {
  // pgcrypto habilita bcrypt (bf) para hashear PIN de Employee.
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
    -- MeasurementType: unidad de medida del Product (metros, piezas, kits, kg).
    INSERT INTO public."MeasurementTypes" (code, name, "UnitLabel", decimals) VALUES
      ('METRO', 'Metros lineales', 'metros', 2),
      ('PIEZA', 'Piezas / unidades', 'piezas', 0),
      ('KIT', 'Kits pre-armados', 'kits', 0),
      ('PESO', 'Kilogramos a granel', 'kg', 3)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      "UnitLabel" = EXCLUDED."UnitLabel",
      decimals = EXCLUDED.decimals;

    -- Family: categorías de Product del catálogo ferretero / confección.
    INSERT INTO public."Families" (code, name, description) VALUES
      ('01', 'Cables de Acero', 'Cables galvanizados e inoxidables 7x7, 7x19'),
      ('02', 'Boquillas', 'Boquillas acelerador, cambios, embrague, freno'),
      ('03', 'Piezas en Caucho', 'Guardapolvos, bujes, empaques, soportes'),
      ('04', 'Flejes y Pines', 'Flejes de retencion, pines de control'),
      ('05', 'Horquillas', 'Horquillas metalicas para cables'),
      ('06', 'Pasacables', 'Pasacables plasticos, deslizadores'),
      ('07', 'Platinas', 'Platinas graduacion, soportes, conectores'),
      ('08', 'Resortes', 'Resortes compresion para frenos y cambios'),
      ('09', 'Terminales', 'Terminales martillo, ojo, tornillo, colombina'),
      ('10', 'Tuercas', 'Tuercas ajuste, velocimetro, plasticas'),
      ('11', 'Tubos y Anillos', 'Tubos metalicos, bujes, anillos retencion'),
      ('12', 'Manijas', 'Manijas acelerador, freno de mano, apertura'),
      ('13', 'Troqueles y Kits', 'Troqueles grafadores, kits pre-armados'),
      ('HER', 'Herramientas', 'Herramientas manuales y electricas'),
      ('CON', 'Construccion', 'Cemento, bloques, arena, agregados'),
      ('PIN', 'Pinturas', 'Pinturas, solventes y brochas'),
      ('TOR', 'Tornilleria', 'Tornillos, clavos, tuercas y anclajes')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      "IsActive" = TRUE;

    -- Department: estructura organizacional (hr).
    INSERT INTO hr."Departments" (name) VALUES
      ('Produccion'), ('Ventas'), ('Bodega'), ('Administracion')
    ON CONFLICT (name) DO UPDATE SET "IsActive" = TRUE;

    -- Position: cargos ligados a Department.
    INSERT INTO hr."Positions" ("DepartmentId", name)
    SELECT id, 'Tecnico de Confeccion' FROM hr."Departments" WHERE name = 'Produccion'
    ON CONFLICT ("DepartmentId", name) DO UPDATE SET "IsActive" = TRUE;

    INSERT INTO hr."Positions" ("DepartmentId", name)
    SELECT id, 'Vendedor' FROM hr."Departments" WHERE name = 'Ventas'
    ON CONFLICT ("DepartmentId", name) DO UPDATE SET "IsActive" = TRUE;

    INSERT INTO hr."Positions" ("DepartmentId", name)
    SELECT id, 'Bodeguero' FROM hr."Departments" WHERE name = 'Bodega'
    ON CONFLICT ("DepartmentId", name) DO UPDATE SET "IsActive" = TRUE;

    INSERT INTO hr."Positions" ("DepartmentId", name)
    SELECT id, 'Administrador' FROM hr."Departments" WHERE name = 'Administracion'
    ON CONFLICT ("DepartmentId", name) DO UPDATE SET "IsActive" = TRUE;

    -- Employee demo: Administrador (CanCashier). PIN demo "1234" → PinHash bcrypt.
    INSERT INTO hr."Employees" (
      "FirstName", "LastName", "Dui", "PositionId", "DepartmentId", "HireDate", "BaseSalary",
      "ContractType", "SalaryType", "PinHash", "CanSell", "CanCashier"
    )
    SELECT
      'Administrador', 'Sistema', '00000001-0', p.id, d.id, CURRENT_DATE, 800.00,
      'PLAZO_FIJO', 'MENSUAL', crypt('1234', gen_salt('bf', 12)), FALSE, TRUE
    FROM hr."Positions" p
    JOIN hr."Departments" d ON d.name = 'Administracion'
    WHERE p.name = 'Administrador'
      AND p."DepartmentId" = d.id
    ON CONFLICT ("Dui") DO UPDATE SET
      "PinHash" = EXCLUDED."PinHash",
      "CanCashier" = TRUE,
      "IsActive" = TRUE;

    -- Employee demo: Técnico de confección (CanSell). PIN demo "5678".
    INSERT INTO hr."Employees" (
      "FirstName", "LastName", "Dui", "PositionId", "DepartmentId", "HireDate", "BaseSalary",
      "ContractType", "SalaryType", "PinHash", "CanSell", "CanCashier"
    )
    SELECT
      'Tecnico', 'Confeccion', '00000002-0', p.id, d.id, CURRENT_DATE, 500.00,
      'PLAZO_FIJO', 'QUINCENAL', crypt('5678', gen_salt('bf', 12)), TRUE, FALSE
    FROM hr."Positions" p
    JOIN hr."Departments" d ON d.name = 'Produccion'
    WHERE p.name = 'Tecnico de Confeccion'
      AND p."DepartmentId" = d.id
    ON CONFLICT ("Dui") DO UPDATE SET
      "PinHash" = EXCLUDED."PinHash",
      "CanSell" = TRUE,
      "IsActive" = TRUE;

    -- Employee demo: Cajero (CanCashier). PIN demo "0000".
    INSERT INTO hr."Employees" (
      "FirstName", "LastName", "Dui", "PositionId", "DepartmentId", "HireDate", "BaseSalary",
      "ContractType", "SalaryType", "PinHash", "CanSell", "CanCashier"
    )
    SELECT
      'Caja', 'Demo', '00000003-0', p.id, d.id, CURRENT_DATE, 450.00,
      'TIEMPO_PARCIAL', 'QUINCENAL', crypt('0000', gen_salt('bf', 12)), FALSE, TRUE
    FROM hr."Positions" p
    JOIN hr."Departments" d ON d.name = 'Ventas'
    WHERE p.name = 'Vendedor'
      AND p."DepartmentId" = d.id
    ON CONFLICT ("Dui") DO UPDATE SET
      "PinHash" = EXCLUDED."PinHash",
      "CanCashier" = TRUE,
      "IsActive" = TRUE;

    -- Setting: parámetros operativos leídos por caja WPF y futura API admin.
    INSERT INTO system."Settings" ("Key", "Value", "Description") VALUES
      ('IvaPercentage', '13', 'IVA vigente en El Salvador (%)'),
      ('Currency', 'USD', 'Moneda operativa'),
      ('SessionTimeoutMinutes', '30', 'Minutos de inactividad antes de cerrar sesion'),
      ('BusinessName', 'Ferreteria', 'Nombre para impresion en tickets')
    ON CONFLICT ("Key") DO UPDATE SET
      "Value" = EXCLUDED."Value",
      "Description" = EXCLUDED."Description",
      "UpdatedAt" = NOW();

    -- WebUser admin demo (password: admin123) — solo desarrollo.
    INSERT INTO system."WebUsers" ("Username", "Email", "PasswordHash", "Role", "IsActive")
    VALUES (
      'admin',
      'admin@ferreteria.local',
      crypt('admin123', gen_salt('bf', 12)),
      'ADMIN',
      TRUE
    )
    ON CONFLICT ("Username") DO UPDATE SET
      "PasswordHash" = EXCLUDED."PasswordHash",
      "Email" = EXCLUDED."Email",
      "Role" = 'ADMIN',
      "IsActive" = TRUE,
      "UpdatedAt" = NOW();
    END $$;
  `);
}

seedDemoData()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
