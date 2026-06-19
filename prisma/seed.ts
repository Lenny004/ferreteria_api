import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
    INSERT INTO public."MeasurementTypes" (code, name, "UnitLabel", decimals) VALUES
      ('METRO', 'Metros lineales', 'metros', 2),
      ('PIEZA', 'Piezas / unidades', 'piezas', 0),
      ('KIT', 'Kits pre-armados', 'kits', 0),
      ('PESO', 'Kilogramos a granel', 'kg', 3)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      "UnitLabel" = EXCLUDED."UnitLabel",
      decimals = EXCLUDED.decimals;

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
      ('FLV', 'Flexoindustrial VLD', 'Very Light Duty - trabajo muy liviano'),
      ('FLL', 'Flexoindustrial LD', 'Light Duty - trabajo liviano'),
      ('FLM', 'Flexoindustrial MD', 'Medium Duty - trabajo medio'),
      ('FLH', 'Flexoindustrial HD', 'Heavy Duty - trabajo pesado')
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      "IsActive" = TRUE;

    INSERT INTO hr."Departments" (name) VALUES
      ('Produccion'), ('Ventas'), ('Bodega'), ('Administracion')
    ON CONFLICT (name) DO UPDATE SET "IsActive" = TRUE;

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

    INSERT INTO system."Settings" ("Key", "Value", "Description") VALUES
      ('IvaPercentage', '13', 'IVA vigente en El Salvador (%)'),
      ('Currency', 'USD', 'Moneda operativa'),
      ('SessionTimeoutMinutes', '30', 'Minutos de inactividad antes de cerrar sesion'),
      ('BusinessName', 'FlexoCable El Salvador', 'Nombre para impresion en tickets')
    ON CONFLICT ("Key") DO UPDATE SET
      "Value" = EXCLUDED."Value",
      "Description" = EXCLUDED."Description",
      "UpdatedAt" = NOW();
    END $$;
  `);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
