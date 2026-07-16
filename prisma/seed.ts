/**
 * Seed de datos demo para el ERP Ferretería (PostgreSQL + Prisma).
 *
 * Pobla catálogos maestros y RRHH mínimos para desarrollo local:
 * - MeasurementType / Family / Subfamily / Product (esquema public)
 * - Department / Position / Employee (esquema hr)
 * - IsrBracket 2026 mensual/quincenal (esquema hr, motor de planilla)
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

    -- Family: departamentos ferreteros para catálogo web y POS.
    INSERT INTO public."Families" (code, name, description, slug, "IconKey", "ImageUrl", "SortOrder") VALUES
      ('HM',  'Herramientas manuales',   'Martillos, destornilladores, llaves y corte manual',           'herramientas-manuales',   'Hammer',    'https://picsum.photos/seed/fam-HM/800/400',  1),
      ('HE',  'Herramientas eléctricas', 'Taladros, sierras, lijadoras y amoladoras',                    'herramientas-electricas', 'Zap',       'https://picsum.photos/seed/fam-HE/800/400',  2),
      ('EL',  'Electricidad',            'Cables, interruptores, breakers y accesorios eléctricos',      'electricidad',            'Lightbulb', 'https://picsum.photos/seed/fam-EL/800/400',  3),
      ('FO',  'Fontanería / Plomería',   'Tubería PVC, llaves, válvulas y desagües',                      'fontaneria',              'Droplets',  'https://picsum.photos/seed/fam-FO/800/400',  4),
      ('PN',  'Pinturas',                'Pinturas, brochas, rodillos y solventes',                        'pinturas',                'Paintbrush','https://picsum.photos/seed/fam-PN/800/400',  5),
      ('CE',  'Construcción',            'Cemento, varillas, bloques y agregados',                       'construccion',            'HardHat',   'https://picsum.photos/seed/fam-CE/800/400',  6),
      ('TOR', 'Tornillería',             'Tornillos, clavos, tuercas y anclajes',                        'tornilleria',             'Wrench',    'https://picsum.photos/seed/fam-TOR/800/400', 7),
      ('IL',  'Iluminación',             'Bombillos LED, lámparas y reflectores',                        'iluminacion',             'Lightbulb', 'https://picsum.photos/seed/fam-IL/800/400',  8),
      ('SEG', 'Seguridad',               'EPP, candados y extintores',                                   'seguridad',               'Shield',    'https://picsum.photos/seed/fam-SEG/800/400', 9),
      ('ADH', 'Adhesivos',               'Siliconas, pegamentos y cintas',                               'adhesivos',               'Package',   'https://picsum.photos/seed/fam-ADH/800/400', 10),
      ('GEN', 'Ferretería general',      'Fijación, organización y consumibles varios',                  'ferreteria-general',      'Package',   'https://picsum.photos/seed/fam-GEN/800/400', 11)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      slug = EXCLUDED.slug,
      "IconKey" = EXCLUDED."IconKey",
      "ImageUrl" = EXCLUDED."ImageUrl",
      "SortOrder" = EXCLUDED."SortOrder",
      "IsActive" = TRUE,
      "UpdatedAt" = NOW();

    -- Desactivar familias legacy de confección de cables y códigos obsoletos.
    UPDATE public."Families"
    SET "IsActive" = FALSE, "UpdatedAt" = NOW()
    WHERE code IN (
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13',
      'HER', 'CON', 'PIN'
    );

    -- Subfamilies: categorías de segundo nivel por departamento.
    INSERT INTO public."Subfamilies" ("FamilyId", code, name, description, slug, "SortOrder")
    SELECT f.id, v.code, v.name, v.description, v.slug, v.sort_order
    FROM public."Families" f
    CROSS JOIN (VALUES
      -- HM Herramientas manuales
      ('HM',  'MART', 'Martillos',              'Martillos de uña, bola y maza',                    'martillos',              1),
      ('HM',  'DEST', 'Destornilladores',       'Planos, estrella y Phillips',                      'destornilladores',       2),
      ('HM',  'LLAV', 'Llaves y alicates',      'Llaves combinadas, ajustables y pinzas',           'llaves-alicates',        3),
      ('HM',  'CORT', 'Corte manual',           'Serruchos, cuchillas y cutters',                   'corte-manual',           4),
      -- HE Herramientas eléctricas
      ('HE',  'TAL',  'Taladros',               'Taladros percutor e inalámbricos',                 'taladros',               1),
      ('HE',  'SIER', 'Sierras eléctricas',     'Circulares, caladoras y sable',                    'sierras-electricas',     2),
      ('HE',  'LIJ',  'Lijadoras',              'Orbitales, de banda y delta',                      'lijadoras',              3),
      ('HE',  'AMOL', 'Amoladoras',             'Angular y rectas',                                 'amoladoras',             4),
      -- EL Electricidad
      ('EL',  'CABL', 'Cables y conductores',   'THHN, NM y cordones',                              'cables-conductores',     1),
      ('EL',  'INT',  'Interruptores y tomas',  'Apagadores, enchufes y placas',                    'interruptores-tomas',    2),
      ('EL',  'PROT', 'Protección eléctrica',   'Breakers, fusibles y protecciones',                'proteccion-electrica',   3),
      ('EL',  'ACCE', 'Accesorios eléctricos',  'Cajas, conectores y canalización',                 'accesorios-electricos',  4),
      -- FO Fontanería
      ('FO',  'TUB',  'Tubos y conexiones',     'PVC presión, CPVC y accesorios',                   'tubos-conexiones',       1),
      ('FO',  'LLVF', 'Llaves y válvulas',      'Angular, esfera y compresión',                     'llaves-valvulas',        2),
      ('FO',  'ACCF', 'Accesorios fontanería',  'Codos, tees, reducciones y pegamento',             'accesorios-fontaneria',  3),
      ('FO',  'DESA', 'Desagües',               'Sifones, rejillas y bajantes',                     'desagues',               4),
      -- PN Pinturas
      ('PN',  'INTP', 'Pinturas interior',      'Látex, esmalte y selladores interior',             'pinturas-interior',      1),
      ('PN',  'EXTP', 'Pinturas exterior',      'Recubrimientos para fachada y muros',              'pinturas-exterior',      2),
      ('PN',  'BRO',  'Brochas y rodillos',     'Aplicación y acabado',                             'brochas-rodillos',       3),
      ('PN',  'SOLV', 'Solventes y diluyentes', 'Thinner, aguarrás y removedores',                  'solventes-diluyentes',   4),
      -- CE Construcción
      ('CE',  'CEM',  'Cemento y mortero',      'Cemento gris, pegamento y mezclas',                'cemento-mortero',        1),
      ('CE',  'BLOQ', 'Bloques y ladrillos',    'Bloque, ladrillo y adoquín',                       'bloques-ladrillos',      2),
      ('CE',  'VAR',  'Varillas y alambre',     'Acero corrugado y alambre recocido',               'varillas-alambre',       3),
      -- TOR Tornillería
      ('TOR', 'TORN', 'Tornillos',              'Madera, drywall y autorroscantes',                 'tornillos',              1),
      ('TOR', 'CLAV', 'Clavos',                 'Común, concreto y acabado',                        'clavos',                 2),
      ('TOR', 'TUER', 'Tuercas y arandelas',    'Hexagonales, planas y presión',                    'tuercas-arandelas',      3),
      ('TOR', 'ANCL', 'Anclajes',               'Expansivos, químicos y taquetes',                  'anclajes',               4),
      -- IL Iluminación
      ('IL',  'BOMB', 'Bombillos',              'LED, incandescente y ahorradores',                 'bombillos',              1),
      ('IL',  'LAMP', 'Lámparas',               'De techo, pared y escritorio',                     'lamparas',               2),
      ('IL',  'REFL', 'Reflectores',            'LED exterior e industrial',                        'reflectores',            3),
      -- SEG Seguridad
      ('SEG', 'EPP',  'Equipo protección',      'Cascos, guantes y lentes',                         'equipo-proteccion',      1),
      ('SEG', 'CAND', 'Candados',               'Laminados, de combinación y alta seguridad',       'candados',               2),
      ('SEG', 'EXT',  'Extintores',             'Polvo químico seco y CO₂',                         'extintores',             3),
      -- ADH Adhesivos
      ('ADH', 'SIL',  'Siliconas',              'Transparente, blanca y alta temperatura',          'siliconas',              1),
      ('ADH', 'PEG',  'Pegamentos',             'Contacto, vinílico y epóxico',                     'pegamentos',             2),
      ('ADH', 'CINT', 'Cintas',                 'Masking, doble faz y aislar',                      'cintas',                 3),
      -- GEN Ferretería general
      ('GEN', 'FIJ',  'Fijación general',       'Cinchos, grapas y abrazaderas',                    'fijacion-general',       1),
      ('GEN', 'ORG',  'Organización taller',    'Cajas, organizadores y estantes',                  'organizacion-taller',    2),
      ('GEN', 'CONS', 'Consumibles',            'Lijas, discos y brocas sueltas',                   'consumibles',            3)
    ) AS v(family_code, code, name, description, slug, sort_order)
    WHERE f.code = v.family_code
    ON CONFLICT ("FamilyId", code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      slug = EXCLUDED.slug,
      "SortOrder" = EXCLUDED."SortOrder",
      "IsActive" = TRUE,
      "UpdatedAt" = NOW();

    -- Products: catálogo demo ferretero (~30 ítems visibles en web).
    INSERT INTO public."Products" (
      code, description, "ShortDescription", "Brand", "ImageUrl",
      "FamilyId", "SubfamilyId", "MeasurementTypeId",
      "SalePrice", "CostPrice", "CurrentStock", "MinStock", "IsWebVisible"
    )
    SELECT
      p.code, p.description, p.short_desc, p.brand, p.image_url,
      f.id, sf.id, mt.id,
      p.sale_price, p.cost_price, p.stock, p.min_stock, TRUE
    FROM (VALUES
      ('HM-MART-001',  'Martillo de uña 16 oz mango fibra de vidrio',           'Martillo 16 oz para carpintería y uso general',        'Stanley',     'https://picsum.photos/seed/HM-MART-001/400/400',  'HM',  'MART', 'PIEZA', 18.50,  11.20,  45,  10),
      ('HM-DEST-001',  'Destornillador plano 6 pulgadas punta magnética',       'Destornillador plano 6" punta imantada',             'Truper',      'https://picsum.photos/seed/HM-DEST-001/400/400',  'HM',  'DEST', 'PIEZA',  4.25,   2.10, 120,  25),
      ('HM-LLAV-001',  'Juego llaves combinadas 12 piezas métricas',            'Set 12 llaves combinadas 8-19 mm',                     'Urrea',       'https://picsum.photos/seed/HM-LLAV-001/400/400',  'HM',  'LLAV', 'PIEZA', 32.00,  19.50,  28,   8),
      ('HM-CORT-001',  'Serrucho cortador 22 pulgadas diente triple',           'Serrucho 22" para madera y tableros',                  'Irwin',       'https://picsum.photos/seed/HM-CORT-001/400/400',  'HM',  'CORT', 'PIEZA', 14.75,   8.90,  35,  10),
      ('HE-TAL-001',   'Taladro percutor 1/2 pulgada 650W',                      'Taladro percutor 650W con mandril 13 mm',              'Black+Decker','https://picsum.photos/seed/HE-TAL-001/400/400',   'HE',  'TAL',  'PIEZA', 89.99,  58.00,  18,   5),
      ('HE-SIER-001',  'Sierra circular 7-1/4 pulgadas 1400W',                    'Sierra circular 1400W hoja 7-1/4"',                    'Bosch',       'https://picsum.photos/seed/HE-SIER-001/400/400',  'HE',  'SIER', 'PIEZA',125.00,  82.50,  12,   4),
      ('HE-LIJ-001',   'Lijadora orbital 240W base 1/4 hoja',                     'Lijadora orbital compacta 240W',                       'Skil',        'https://picsum.photos/seed/HE-LIJ-001/400/400',   'HE',  'LIJ',  'PIEZA', 54.50,  34.00,  15,   5),
      ('HE-AMOL-001',  'Amoladora angular 4-1/2 pulgadas 750W',                   'Amoladora 4-1/2" 750W uso general',                    'Makita',      'https://picsum.photos/seed/HE-AMOL-001/400/400',  'HE',  'AMOL', 'PIEZA', 68.00,  44.00,  14,   4),
      ('EL-CABL-001',  'Cable THHN 12 AWG negro calibre 12',                    'Cable THHN #12 negro por metro',                       'Condumex',    'https://picsum.photos/seed/EL-CABL-001/400/400',  'EL',  'CABL', 'METRO',  1.15,   0.72, 500, 100),
      ('EL-INT-001',   'Interruptor sencillo 15A 127V blanco',                    'Apagador sencillo 15A color blanco',                   'Leviton',     'https://picsum.photos/seed/EL-INT-001/400/400',   'EL',  'INT',  'PIEZA',  2.85,   1.45, 200,  50),
      ('EL-PROT-001',  'Breaker monofásico enchufable 20A',                       'Interruptor termomagnético 20A 1 polo',                'Square D',    'https://picsum.photos/seed/EL-PROT-001/400/400',  'EL',  'PROT', 'PIEZA',  8.50,   5.20,  60,  15),
      ('EL-ACCE-001',  'Caja octagonal metálica 4 pulgadas profunda',             'Caja octagonal 4" profunda con tapa',                  'Arlington',   'https://picsum.photos/seed/EL-ACCE-001/400/400',  'EL',  'ACCE', 'PIEZA',  3.75,   2.10,  80,  20),
      ('FO-TUB-001',   'Tubo PVC presión 1/2 pulgada clase 10',                   'Tubería PVC 1/2" presión por metro',                   'Pavco',       'https://picsum.photos/seed/FO-TUB-001/400/400',   'FO',  'TUB',  'METRO',  1.85,   1.10, 350,  80),
      ('FO-LLVF-001',  'Llave angular cromada 1/2 pulgada',                         'Llave angular lavamanos 1/2" cromada',                 'Foset',       'https://picsum.photos/seed/FO-LLVF-001/400/400',  'FO',  'LLVF', 'PIEZA', 12.50,   7.80,  40,  10),
      ('FO-DESA-001',  'Sifón PVC flexible lavamanos blanco',                     'Sifón flexible PVC para lavamanos',                    'Coflex',      'https://picsum.photos/seed/FO-DESA-001/400/400',  'FO',  'DESA', 'PIEZA',  6.90,   3.95,  55,  15),
      ('PN-INTP-001',  'Pintura látex blanco mate galón interior',                  'Látex blanco mate 1 gal uso interior',                 'Sherwin',     'https://picsum.photos/seed/PN-INTP-001/400/400',  'PN',  'INTP', 'PIEZA', 28.50,  17.00,  42,  12),
      ('PN-BRO-001',   'Brocha profesional 4 pulgadas cerda mixta',               'Brocha 4" cerda mixta acabado liso',                   'Pretul',      'https://picsum.photos/seed/PN-BRO-001/400/400',   'PN',  'BRO',  'PIEZA',  5.25,   2.80,  90,  20),
      ('PN-SOLV-001',  'Thinner multiusos galón',                                   'Thinner galón para limpieza y dilución',               'Comex',       'https://picsum.photos/seed/PN-SOLV-001/400/400',  'PN',  'SOLV', 'PIEZA',  9.75,   5.50,  38,  10),
      ('CE-CEM-001',   'Cemento gris Portland 50 kg',                               'Cemento gris tipo I bolsa 50 kg',                      'Holcim',      'https://picsum.photos/seed/CE-CEM-001/400/400',   'CE',  'CEM',  'PIEZA',  8.95,   6.20, 200,  50),
      ('CE-VAR-001',   'Varilla corrugada grado 40 número 3',                       'Varilla #3 corrugada por metro lineal',                'DeAcero',     'https://picsum.photos/seed/CE-VAR-001/400/400',   'CE',  'VAR',  'METRO',  4.20,   2.85, 180,  40),
      ('TOR-TORN-001', 'Tornillo madera 2 pulgadas caja 100 unidades',              'Tornillo madera #8 x 2" caja 100 pzas',                'Fischer',     'https://picsum.photos/seed/TOR-TORN-001/400/400', 'TOR', 'TORN', 'PIEZA',  6.50,   3.80, 150,  30),
      ('TOR-CLAV-001', 'Clavo común 3 pulgadas libra',                              'Clavo común 3" vendido por libra',                     'Nacional',    'https://picsum.photos/seed/TOR-CLAV-001/400/400', 'TOR', 'CLAV', 'PIEZA',  1.25,   0.75, 300,  60),
      ('TOR-ANCL-001', 'Ancla expansiva 1/4 x 1-1/4 pulgada',                     'Taquete expansivo 1/4" x 1-1/4"',                     'Hilti',       'https://picsum.photos/seed/TOR-ANCL-001/400/400', 'TOR', 'ANCL', 'PIEZA',  0.45,   0.22, 800, 150),
      ('IL-BOMB-001',  'Bombillo LED 9W luz cálida base E27',                       'LED 9W 2700K E27 equivalente 60W',                     'Philips',     'https://picsum.photos/seed/IL-BOMB-001/400/400',  'IL',  'BOMB', 'PIEZA',  3.50,   1.95, 250,  50),
      ('IL-REFL-001',  'Reflector LED 50W luz fría IP65',                           'Reflector LED 50W 6500K uso exterior',                 'Osram',       'https://picsum.photos/seed/IL-REFL-001/400/400',  'IL',  'REFL', 'PIEZA', 22.00,  14.50,  30,   8),
      ('SEG-EPP-001',  'Casco seguridad amarillo ajuste ratchet',                   'Casco tipo I clase E color amarillo',                  '3M',          'https://picsum.photos/seed/SEG-EPP-001/400/400',  'SEG', 'EPP',  'PIEZA',  9.99,   6.10,  65,  15),
      ('SEG-CAND-001', 'Candado laminado 40 mm arco corto',                         'Candado laminado 40 mm grado básico',                  'Master Lock', 'https://picsum.photos/seed/SEG-CAND-001/400/400', 'SEG', 'CAND', 'PIEZA',  7.25,   4.40,  48,  12),
      ('ADH-SIL-001',  'Silicona transparente cartucho 280 ml',                     'Silicona multiusos transparente 280 ml',               'DAP',         'https://picsum.photos/seed/ADH-SIL-001/400/400',  'ADH', 'SIL',  'PIEZA',  4.80,   2.65,  72,  18),
      ('ADH-PEG-001',  'Pegamento de contacto 1/4 galón',                           'Pegamento contacto 946 ml alto tack',                  'Resistol',    'https://picsum.photos/seed/ADH-PEG-001/400/400',  'ADH', 'PEG',  'PIEZA', 11.50,   7.00,  36,  10),
      ('GEN-FIJ-001',  'Cincho plástico 200 mm paquete 100',                        'Cincho nylon 200 mm negro x100',                       'Hellermann',  'https://picsum.photos/seed/GEN-FIJ-001/400/400',  'GEN', 'FIJ',  'PIEZA',  3.20,   1.75, 200,  40),
      ('GEN-ORG-001',  'Caja herramientas plástica 18 pulgadas',                    'Caja portátil 18" con bandeja interna',                'Stanley',     'https://picsum.photos/seed/GEN-ORG-001/400/400',  'GEN', 'ORG',  'PIEZA', 24.00,  15.50,  22,   6)
    ) AS p(code, description, short_desc, brand, image_url, family_code, subfamily_code, mt_code, sale_price, cost_price, stock, min_stock)
    JOIN public."Families" f ON f.code = p.family_code
    JOIN public."Subfamilies" sf ON sf."FamilyId" = f.id AND sf.code = p.subfamily_code
    JOIN public."MeasurementTypes" mt ON mt.code = p.mt_code
    ON CONFLICT (code) DO UPDATE SET
      description = EXCLUDED.description,
      "ShortDescription" = EXCLUDED."ShortDescription",
      "Brand" = EXCLUDED."Brand",
      "ImageUrl" = EXCLUDED."ImageUrl",
      "FamilyId" = EXCLUDED."FamilyId",
      "SubfamilyId" = EXCLUDED."SubfamilyId",
      "MeasurementTypeId" = EXCLUDED."MeasurementTypeId",
      "SalePrice" = EXCLUDED."SalePrice",
      "CostPrice" = EXCLUDED."CostPrice",
      "CurrentStock" = EXCLUDED."CurrentStock",
      "MinStock" = EXCLUDED."MinStock",
      "IsWebVisible" = TRUE,
      "IsActive" = TRUE,
      "UpdatedAt" = NOW();

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

    -- LeaveType: catálogo básico de ausencias para vacaciones/permisos/bajas médicas (Fase 10b).
    INSERT INTO hr."LeaveTypes" (name, category, "MaxDaysPerYear", "RequiresDocument", "IsPaid", "AffectsVacationAccrual", "LegalBasis") VALUES
      ('Vacaciones', 'VACACIONES', 15, FALSE, TRUE, FALSE, 'Código de Trabajo Art. 177'),
      ('Permiso con goce de sueldo', 'PERMISO_CON_GOCE', NULL, FALSE, TRUE, FALSE, NULL),
      ('Permiso sin goce de sueldo', 'PERMISO_SIN_GOCE', NULL, FALSE, FALSE, FALSE, NULL),
      ('Baja médica', 'BAJA_MEDICA', NULL, TRUE, TRUE, FALSE, 'Ley del ISSS')
    ON CONFLICT (name) DO UPDATE SET
      category = EXCLUDED.category,
      "MaxDaysPerYear" = EXCLUDED."MaxDaysPerYear",
      "RequiresDocument" = EXCLUDED."RequiresDocument",
      "IsPaid" = EXCLUDED."IsPaid",
      "AffectsVacationAccrual" = EXCLUDED."AffectsVacationAccrual",
      "LegalBasis" = EXCLUDED."LegalBasis",
      "IsActive" = TRUE;

    -- Setting: parámetros operativos leídos por caja WPF y APIs admin/públicas.
    INSERT INTO system."Settings" ("Key", "Value", "Description", "IsPublic") VALUES
      ('IvaPercentage', '13', 'IVA vigente en El Salvador (%)', FALSE),
      ('Currency', 'USD', 'Moneda operativa', TRUE),
      ('SessionTimeoutMinutes', '30', 'Minutos de inactividad antes de cerrar sesion', FALSE),
      ('BusinessName', 'Ferreteria', 'Nombre comercial público', TRUE),
      ('ContactEmail', 'contacto@ferreteria.local', 'Correo de contacto público', TRUE),
      ('TermsOfService', E'# Términos de uso\n\nAl usar la tienda en línea de Ferreteria usted acepta estos términos. Los precios y existencias pueden variar. Las compras en mostrador se rigen por las políticas de la sucursal.', 'Términos de servicio de la tienda pública', TRUE),
      ('PrivacyPolicy', E'# Política de privacidad\n\nTratamos sus datos (nombre, correo, teléfono) únicamente para atender pedidos, consultas y soporte. No vendemos información personal a terceros.', 'Política de privacidad de la tienda pública', TRUE)
    ON CONFLICT ("Key") DO UPDATE SET
      "Value" = EXCLUDED."Value",
      "Description" = EXCLUDED."Description",
      "IsPublic" = EXCLUDED."IsPublic",
      "UpdatedAt" = NOW();

    -- IsrBracket: tabla de retención de renta vigente (Decreto Legislativo 293, 30-abr-2025;
    -- amplía la base exenta a $550 mensuales / $275 quincenales). Se siembra para 2026 porque
    -- no hay reforma posterior conocida; ajustar aquí si Hacienda publica nueva tabla.
    INSERT INTO hr."IsrBrackets" (year, "PeriodType", "BracketFrom", "BracketTo", "FixedAmount", "Rate", "ExcessOver", notes) VALUES
      -- Mensual
      (2026, 'MENSUAL', 0.01, 550.00, 0, 0, 0, 'Tramo I — exento'),
      (2026, 'MENSUAL', 550.01, 895.24, 17.67, 0.10, 550.00, 'Tramo II — 10%'),
      (2026, 'MENSUAL', 895.25, 2038.10, 60.00, 0.20, 895.24, 'Tramo III — 20%'),
      (2026, 'MENSUAL', 2038.11, NULL, 288.57, 0.30, 2038.10, 'Tramo IV — 30%'),
      -- Quincenal
      (2026, 'QUINCENAL', 0.01, 275.00, 0, 0, 0, 'Tramo I — exento'),
      (2026, 'QUINCENAL', 275.01, 447.62, 8.83, 0.10, 275.00, 'Tramo II — 10%'),
      (2026, 'QUINCENAL', 447.63, 1019.05, 30.00, 0.20, 447.62, 'Tramo III — 20%'),
      (2026, 'QUINCENAL', 1019.06, NULL, 144.28, 0.30, 1019.05, 'Tramo IV — 30%')
    ON CONFLICT (year, "PeriodType", "BracketFrom") DO UPDATE SET
      "BracketTo" = EXCLUDED."BracketTo",
      "FixedAmount" = EXCLUDED."FixedAmount",
      "Rate" = EXCLUDED."Rate",
      "ExcessOver" = EXCLUDED."ExcessOver",
      notes = EXCLUDED.notes;

    -- WebUser admin demo (password: admin123) — solo desarrollo.
    -- Vincula EmployeeId al Administrador para órdenes de compra / auditoría.
    INSERT INTO system."WebUsers" ("Username", "Email", "PasswordHash", "Role", "EmployeeId", "IsActive")
    SELECT
      'admin',
      'admin@ferreteria.local',
      crypt('admin123', gen_salt('bf', 12)),
      'ADMIN',
      e.id,
      TRUE
    FROM hr."Employees" e
    WHERE e."Dui" = '00000001-0'
    ON CONFLICT ("Username") DO UPDATE SET
      "PasswordHash" = EXCLUDED."PasswordHash",
      "Email" = EXCLUDED."Email",
      "Role" = 'ADMIN',
      "EmployeeId" = EXCLUDED."EmployeeId",
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
