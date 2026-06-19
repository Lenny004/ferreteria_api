# FlexoCable-backend

API REST administrativa de **FlexoCable SV**. Centraliza reglas de negocio que la caja WPF no implementa: RRHH, planilla, inventario administrativo, compras, libros de IVA, reportes, importación/exportación Excel y dashboard BI.

> **Documento maestro:** [`../FlexoCable/docs/FLEXOCABLE_PLAN_FINALIZACION_APP.md`](../FlexoCable/docs/FLEXOCABLE_PLAN_FINALIZACION_APP.md) (v3.0)  
> **Frontend asociado:** [`../FlexoCable-adminweb/README.md`](../FlexoCable-adminweb/README.md)  
> **Caja WPF:** [`../FlexoCable/README.md`](../FlexoCable/README.md)

---

## Índice

- [Rol en el ecosistema](#rol-en-el-ecosistema)
- [Stack tecnológico](#stack-tecnológico)
- [Estado actual del repositorio](#estado-actual-del-repositorio)
- [Base de datos](#base-de-datos)
- [Esquemas PostgreSQL](#esquemas-postgresql)
- [Módulos API planificados](#módulos-api-planificados)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Instalación y desarrollo local](#instalación-y-desarrollo-local)
- [Scripts npm](#scripts-npm)
- [Roadmap por fases](#roadmap-por-fases)
- [Decisiones de arquitectura](#decisiones-de-arquitectura)

---

## Rol en el ecosistema

```
┌─────────────────────┐         HTTP /api/v1          ┌──────────────────────┐
│  FlexoCable-adminweb │  ──────────────────────────►  │  FlexoCable-backend  │
│  (Next.js 15)        │         JWT + JSON            │  (Express 5 + Prisma) │
└─────────────────────┘                               └──────────┬───────────┘
                                                                   │
┌─────────────────────┐                                            │
│  FlexoCable WPF     │  ─── EF Core (operación caja) ─────────────┤
│  (Punto de venta)   │                                            ▼
└─────────────────────┘                               ┌──────────────────────┐
                                                      │  PostgreSQL / Supabase │
                                                      │  Esquema único UUID    │
                                                      └──────────────────────┘
```

| Responsabilidad | ¿Quién la implementa? |
|---|---|
| Ventas, DTE, impresión, PIN de caja | WPF (`FlexoCableSV.PuntoVenta`) |
| Login administrativo (`system.WebUsers`) | **Este repositorio** |
| CRUD empleados, expediente, PIN hash | **Este repositorio** |
| Planilla quincenal/mensual/semanal | **Este repositorio** (referencia: `beraka-core-api`) |
| Inventario admin (entradas, ajustes, Kardex) | **Este repositorio** |
| Compras, proveedores, costo promedio ponderado | **Este repositorio** |
| Libros de IVA | **Este repositorio** |
| Dashboard BI (KPIs) | **Este repositorio** |
| Importación/exportación Excel | **Este repositorio** |

La caja **no** consume esta API en el MVP inicial; escribe directamente en PostgreSQL con EF Core. WPF y backend comparten la **misma base de datos** y deben respetar las mismas reglas transaccionales.

---

## Stack tecnológico

| Tecnología | Versión objetivo | Propósito |
|---|---|---|
| Node.js | 22+ | Runtime |
| Express | 5 | API REST versionada `/api/v1/` |
| Prisma | 6 | ORM, migraciones y seeds |
| PostgreSQL | 14+ (17 en Docker local) | Base de datos |
| Zod | Última | Validación de entradas HTTP |
| JWT + bcrypt | — | Autenticación admin |
| ExcelJS + PDFKit | — | Exportes planilla (portados de Beraka) |
| TypeScript | 5.x | Lenguaje |

---

## Estado actual del repositorio

| Componente | Estado | Notas |
|---|---|---|
| `prisma/schema.prisma` v3.0 | ✅ Implementado | Fuente de verdad del esquema BD |
| `prisma/seed.ts` | ✅ Implementado | Tipos de medida, familias, empleados demo, Consumidor Final |
| `docker-compose.yml` | ✅ Implementado | PostgreSQL local puerto **55432** |
| `database/init.sql` | ✅ Implementado | Extensiones, esquemas y permisos iniciales |
| `src/` Express API | 🔲 Pendiente | Scaffold planificado en Fase 8 |
| Módulos `auth`, `employees`, `payroll-runs`, etc. | 🔲 Pendiente | Ver [Módulos API planificados](#módulos-api-planificados) |
| Tests | 🔲 Pendiente | Fase 10+ |

**Regla operativa:** desde v3.0, `prisma/schema.prisma` es la fuente principal del schema. No ejecutar `Squema.sql` legacy y Prisma sobre la misma BD sin coordinación.

---

## Base de datos

### Fuente de verdad

| Archivo | Función |
|---|---|
| `prisma/schema.prisma` | Definición completa de tablas, relaciones y constraints |
| `prisma/seed.ts` | Datos iniciales idempotentes (desarrollo) |
| `database/init.sql` | Solo bootstrap del contenedor Docker (extensiones + esquemas) |

### Identificadores

- Todas las tablas de negocio usan **UUID** con `gen_random_uuid()`.
- Convención SQL: esquemas separados, tablas **PascalCase** entre comillas (`hr."Employees"`).
- Prisma mapea con `@@map`, `@@schema` y `@db.Uuid`.

### Desarrollo local rápido

```bash
# 1. Levantar PostgreSQL
docker compose up -d

# 2. Configurar variables
cp .env.example .env

# 3. Crear tablas desde Prisma
npm install
npm run db:push

# 4. Cargar seeds
npm run db:seed
```

`DATABASE_URL` por defecto:

```
postgresql://flexo_user:flexo_dev_password@localhost:55432/flexocable
```

### Producción

- Objetivo: **Supabase PostgreSQL** con el mismo esquema.
- Aplicar migraciones con `npm run db:migrate:deploy` cuando el historial de migraciones esté congelado.
- En desarrollo activo se puede usar `npm run db:push` para iterar el schema.

---

## Esquemas PostgreSQL

| Esquema | Contenido principal | Consumido por |
|---|---|---|
| `public` | Catálogo: `Products`, `Families`, `Customers`, `InventoryMovements`, `StockAlerts` | WPF (lectura/venta) + admin (CRUD) |
| `sales` | `Orders`, `OrderDetails`, `Payments`, `CashSessions` | WPF (escritura) + admin (reportes) |
| `dte` | `DteConfig`, `DteIssued`, `DteContingency` | WPF (emisión) + admin (consulta) |
| `purchasing` | `Suppliers`, `PurchaseOrders`, `PurchaseOrderDetails` | Solo admin |
| `fiscal` | `IvaReports` (libros de IVA) | Solo admin |
| `hr` | Empleados, planilla Periodo+Corrida, bancos, documentos, aguinaldo, vacaciones | Admin (CRUD) + WPF (solo PIN/permisos) |
| `system` | `Settings`, `WebUsers`, `Printers`, `AuditLog` | Según módulo |

### Modelos Prisma por esquema (v3.0)

<details>
<summary><strong>public</strong> — catálogo e inventario</summary>

- `MeasurementType`, `Family`, `Subfamily`, `Customer`, `Product`, `StockAlert`, `InventoryMovement`
</details>

<details>
<summary><strong>purchasing</strong> — compras (Fase 9b)</summary>

- `Supplier`, `PurchaseOrder`, `PurchaseOrderDetail`
- Flujo OC: `BORRADOR` → `CONFIRMADA` → `RECIBIDA` → `CANCELADA`
- Al recibir: actualiza stock y **costo promedio ponderado** en `Product.costPrice`
</details>

<details>
<summary><strong>sales</strong> — ventas y caja</summary>

- `CashSession`, `Order`, `OrderDetail`, `Payment`
- Estados de orden: `PENDIENTE`, `COMPLETADA`, `CANCELADA`
- Tipos: `VENTA_CAJA`, `ORDEN_CONFECCION`
</details>

<details>
<summary><strong>dte</strong> — facturación electrónica</summary>

- `DteConfig`, `DteIssued`, `DteContingency`
- `MhStatus`: `PENDIENTE`, `PROCESADO`, `RECHAZADO`, `CONTINGENCIA`
</details>

<details>
<summary><strong>fiscal</strong> — cumplimiento (Fase 10d)</summary>

- `IvaReport` — libros de ventas CF/CCF y compras
</details>

<details>
<summary><strong>hr</strong> — RRHH y planilla (modelo Beraka)</summary>

- Organización: `Department`, `Position`, `Employee`
- Expediente: `Bank`, `EmployeeBankAccount`, `RequiredDocumentType`, `EmployeeDocument`, `SalaryHistory`, `HealthConditionRecord`
- Planilla: `PayrollPeriod`, `PayrollRun`, `PayrollDetail`, `PayrollEarningLine`, `PayrollDeductionLine`, `IsrBracket`, `Holiday`
- Beneficios: `AguinaldoRun`, `AguinaldoDetail`, `LeaveType`, `LeaveRequest`, `VacationBalance`, `EmployeeTermination`, `IsrDeclaration`
</details>

<details>
<summary><strong>system</strong> — configuración y seguridad</summary>

- `Setting`, `Printer`, `WebUser`, `AuditLog`
- Seed clave `DefaultCustomerId` → registro sistema "Consumidor Final"
</details>

---

## Módulos API planificados

Estructura objetivo bajo `src/modules/` (Fase 8 en adelante):

| Módulo | Ruta base | Fase | Descripción |
|---|---|---|---|
| `auth` | `/api/v1/auth` | 8 | Login JWT admin (`WebUsers`) |
| `employees` | `/api/v1/employees` | 8 | CRUD empleados, asignación PIN, ficha PDF |
| `employee-bank-accounts` | `/api/v1/employees/:id/banks` | 8 | Cuentas bancarias por empleado |
| `employee-documents` | `/api/v1/employees/:id/documents` | 8 | Expediente documental |
| `banks` | `/api/v1/banks` | 8 | Catálogo editable de bancos SV |
| `required-document-types` | `/api/v1/document-types` | 8 | Tipos de documento requerido |
| `products` | `/api/v1/products` | 8–9 | CRUD catálogo |
| `customers` | `/api/v1/customers` | 8 | Maestro fiscal de clientes |
| `inventory` | `/api/v1/inventory` | 9 | Entradas, ajustes, movimientos, alertas |
| `suppliers` | `/api/v1/suppliers` | 9b | Maestro de proveedores |
| `purchase-orders` | `/api/v1/purchase-orders` | 9b | Órdenes de compra y recepción |
| `imports` | `/api/v1/import` | 9 | Excel catálogo y entradas |
| `payroll-periods` | `/api/v1/payroll/periods` | 10 | Periodos de planilla |
| `payroll-runs` | `/api/v1/payroll/runs` | 10 | Corridas, cálculo legal, Excel/PDF |
| `aguinaldo` | `/api/v1/payroll/aguinaldo` | 10b | Corrida anual |
| `leave-requests` | `/api/v1/leaves` | 10b | Vacaciones y permisos |
| `employee-terminations` | `/api/v1/terminations` | 10c | Liquidaciones |
| `fiscal/iva-reports` | `/api/v1/fiscal/iva-reports` | 10d | Libros de IVA |
| `dashboard` | `/api/v1/dashboard` | 11 | KPIs ventas, inventario, compras, RRHH |
| `reports` | `/api/v1/reports` | 10 | Exportaciones generales |
| `dte` | `/api/v1/dte` | 10 | Consulta DTE (sin exponer certificados) |

### Validaciones obligatorias del API

- Toda entrada HTTP validada con **Zod** antes de tocar Prisma.
- JWT obligatorio excepto `POST /api/v1/auth/login`.
- Roles en middleware: `ADMIN`, `ACCOUNTANT`, `OWNER`.
- PIN de empleado se hashea aquí; **nunca** se devuelve al frontend.
- Operaciones de inventario y compras dentro de **transacciones Prisma**.
- Respuestas de error consistentes: `code`, `message`, `details`, `requestId`.
- No exponer `DteConfig.CertificateKey` ni secretos al cliente.

### Referencia funcional planilla

Portar lógica probada de `beraka-core-api`:

| Artefacto Beraka | Uso en FlexoCable |
|---|---|
| `payroll.calculator.ts` | AFP, ISSS, ISR, horas extra |
| `payroll.builder.ts` | Líneas planilla vs honorarios |
| `payroll-runs.service.ts` | Generar, aprobar, pagar corridas |
| `payroll-exports.service.ts` | Excel multi-hoja + PDF comprobantes |

---

## Estructura del proyecto

```
FlexoCable-backend/
├── package.json
├── tsconfig.json                 # (pendiente Fase 8)
├── docker-compose.yml            # PostgreSQL local :55432
├── .env.example
├── prisma/
│   ├── schema.prisma             # ✅ Fuente de verdad v3.0
│   ├── seed.ts                   # ✅ Seeds idempotentes
│   └── migrations/               # (pendiente al congelar schema)
├── database/
│   ├── init.sql                  # Bootstrap Docker
│   └── README.md                 # Notas de migración legacy
└── src/                          # 🔲 Pendiente Fase 8
    ├── server.ts
    ├── app.ts
    ├── config/
    ├── modules/
    │   ├── auth/
    │   ├── employees/
    │   ├── payroll-runs/
    │   ├── inventory/
    │   ├── purchasing/
    │   ├── fiscal/
    │   └── dashboard/
    ├── middleware/
    ├── lib/
    └── schemas/
```

---

## Instalación y desarrollo local

### Requisitos

| Requisito | Versión |
|---|---|
| Node.js | 22+ |
| npm | 10+ |
| Docker Desktop | Para PostgreSQL local |

### Pasos

```bash
# Clonar y entrar al repo
cd FlexoCable-backend

# Base de datos
docker compose up -d
cp .env.example .env
npm install
npm run db:push
npm run db:seed

# Cuando exista la API (Fase 8)
npm run dev
```

### Empleados demo (solo desarrollo)

| DUI | PIN | Rol |
|-----|-----|-----|
| 00000001-0 | 1234 | Admin / caja |
| 00000002-0 | 5678 | Técnico confección |
| 00000003-0 | 0000 | Caja demo |

Cambiar PINs antes de producción. La caja WPF valida contra `hr."Employees"."PinHash"`.

### Herramientas útiles

```bash
npm run db:studio      # Explorador visual Prisma
npm run db:validate    # Validar schema.prisma
npm run docker:reset   # Reiniciar BD local (borra datos)
```

---

## Scripts npm

| Script | Descripción |
|---|---|
| `db:generate` | Genera cliente Prisma |
| `db:push` | Sincroniza schema → BD (desarrollo) |
| `db:push:force` | Reset completo + push (⚠️ borra datos) |
| `db:migrate:dev` | Crea migración versionada |
| `db:migrate:deploy` | Aplica migraciones en staging/prod |
| `db:migrate:reset` | Reset + migrate + seed |
| `db:seed` | Ejecuta `prisma/seed.ts` |
| `db:studio` | Abre Prisma Studio |
| `db:format` | Formatea `schema.prisma` |
| `db:validate` | Valida schema |
| `docker:up` | `docker compose up -d` |
| `docker:down` | Detiene contenedor |
| `docker:reset` | Elimina volumen y recrea BD |

---

## Roadmap por fases

Alineado a `FLEXOCABLE_PLAN_FINALIZACION_APP.md`:

| Fase | Alcance backend | Estado |
|---|---|---|
| **0** | Schema Prisma v3.0, seeds, Docker | ✅ En progreso |
| **0b** | Esquema `hr` Periodo+Corrida, bancos, ISR, documentos | ✅ Schema listo |
| **8** | Scaffold Express, auth JWT, CRUD empleados/clientes/catálogo | 🔲 Pendiente |
| **9** | Inventario administrativo, ajustes, alertas | 🔲 Pendiente |
| **9b** | Proveedores, OC, Kardex valorado, costo promedio | 🔲 Pendiente |
| **10** | Planilla quincenal, Excel/PDF, aguinaldo, vacaciones, liquidaciones | 🔲 Pendiente |
| **10d** | Libros de IVA desde DTEs y compras | 🔲 Pendiente |
| **11** | Endpoints dashboard BI (`/sales`, `/inventory`, `/purchases`, `/hr`) | 🔲 Pendiente |

---

## Decisiones de arquitectura

| Tema | Decisión |
|---|---|
| Fuente de verdad BD | `prisma/schema.prisma` v3.0 |
| IDs | UUID (`gen_random_uuid()`) en todo el dominio |
| CxC (cuentas por cobrar) | **Descartada para MVP** — ventas al contado |
| Multisucursal | **Pospuesta** — `CashRegisterCode` es punto de extensión futuro |
| WPF vs API | MVP: WPF directo a PostgreSQL; admin vía API Node |
| Excel | Import/export **solo** en backend (ExcelJS) |
| Planilla | Quincenal principal + mensual/semanal; honorarios 10% ISR |
| Referencia RRHH | `beraka-core-api` — no reimplementar motor legal desde cero |

---

## Licencia

Copyright (c) 2026 FlexoCable El Salvador, S.A. de C.V. — Todos los derechos reservados.
