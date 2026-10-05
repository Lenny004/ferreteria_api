# ferreteria_backend

> **Nombre:** Ferretería Backend — API REST administrativa  
> **Descripción:** API Node.js (Express + Prisma) que centraliza RRHH, planilla, inventario administrativo, compras, libros de IVA, reportes, Excel/PDF y dashboard BI para Ferreteria. Consume la misma PostgreSQL que la caja WPF.

API REST administrativa de **Ferreteria**. Centraliza reglas de negocio que la caja WPF no implementa: RRHH, planilla, inventario administrativo, compras, libros de IVA, reportes, importación/exportación Excel y dashboard BI.

> **Documento maestro:** [`../erp_ferreteria/docs/FERRETERIA_PLAN_FINALIZACION_APP.md`](../erp_ferreteria/docs/FERRETERIA_PLAN_FINALIZACION_APP.md) (v3.0)  
> **Frontend asociado:** [`../ferreteria_adminweb/README.md`](../ferreteria_adminweb/README.md)  
> **Caja WPF:** [`../erp_ferreteria/README.md`](../erp_ferreteria/README.md)

---

## Índice

- [Rol en el ecosistema](#rol-en-el-ecosistema)
- [Stack tecnológico](#stack-tecnológico)
- [Estado actual del repositorio](#estado-actual-del-repositorio)
- [Base de datos](#base-de-datos)
- [Esquemas PostgreSQL](#esquemas-postgresql)
- [Módulos API montados](#módulos-api-montados)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Instalación y desarrollo local](#instalación-y-desarrollo-local)
- [Scripts npm](#scripts-npm)
- [Roadmap por fases](#roadmap-por-fases)
- [Decisiones de arquitectura](#decisiones-de-arquitectura)

---

## Rol en el ecosistema

```
┌─────────────────────┐         HTTP /api/v1          ┌──────────────────────┐
│  ferreteria_adminweb │  ──────────────────────────►  │  ferreteria_backend  │
│  (Next.js 15)        │         JWT + JSON            │  (Express 5 + Prisma) │
└─────────────────────┘                               └──────────┬───────────┘
                                                                   │
┌─────────────────────┐                                            │
│  Ferreteria WPF     │  ─── EF Core (operación caja) ─────────────┤
│  (erp_ferreteria)   │                                            ▼
└─────────────────────┘                               ┌──────────────────────┐
                                                      │  PostgreSQL / Supabase │
                                                      │  Esquema único UUID    │
                                                      └──────────────────────┘
```

| Responsabilidad | ¿Quién la implementa? |
|---|---|
| Ventas, DTE, impresión, PIN de caja | WPF (`Ferreteria.PuntoVenta`) |
| Login administrativo (`system.WebUsers`) | **Este repositorio** |
| CRUD empleados, expediente, PIN hash | **Este repositorio** |
| Planilla quincenal/mensual/semanal | **Este repositorio** (referencia: `erp-core-api`) |
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
| Nodemailer | 10 | SMTP transaccional (requiere Node.js >= 20) |
| ExcelJS + PDFKit | — | Exportes planilla (portados de Beraka) |
| TypeScript | 5.x | Lenguaje |

---

## Estado actual del repositorio

| Componente | Estado | Notas |
|---|---|---|
| `prisma/schema.prisma` v3.0 | ✅ Implementado | Fuente de verdad del esquema BD |
| `prisma/migrations/` | ✅ Implementado | Historial versionado de cambios del esquema |
| `prisma/seed.ts` | ✅ Implementado | Tipos de medida, familias, empleados demo, Consumidor Final |
| `docker-compose.yml` | ✅ Implementado | PostgreSQL local puerto **55432** |
| `database/init.sql` | ✅ Implementado | Extensiones, esquemas y permisos iniciales |
| `src/app.ts` | ✅ 30 routers montados | Rutas bajo `/api/v1` y endpoint `/health` |
| `src/modules/` | ✅ Implementado | Módulos administrativos, fiscales, dashboard y tienda pública |
| `tests/*.test.ts` | ✅ 36 archivos | Suite Vitest sin la configuración de base de datos |
| `tests-db/*.test.ts` | ✅ 8 archivos | Suite Vitest con `vitest.db.config.ts` |

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
# 1. Configurar variables
cp .env.example .env
# Reemplace CAMBIAR_PASSWORD_LOCAL en POSTGRES_PASSWORD y DATABASE_URL por una contraseña propia (ej. `openssl rand -hex 24`)

# 2. Levantar PostgreSQL
docker compose up -d

# 3. Aplicar el historial de migraciones
npm install
npm run db:migrate:deploy

# 4. Cargar seeds
npm run db:seed
```

Formato de `DATABASE_URL` (la contraseña nunca se versiona; use la misma de `POSTGRES_PASSWORD`):

```
postgresql://ferreteria_user:CAMBIAR_PASSWORD_LOCAL@localhost:55432/ferreteria
```

La contraseña local que estuvo versionada aquí y en `erp_ferreteria` es pública y debe considerarse expuesta. Si el volumen `ferreteria-postgres-data` ya existe, PostgreSQL conserva la contraseña vieja (las variables `POSTGRES_*` solo aplican al crear el volumen). Cámbiela con:

```bash
docker exec -it ferreteria-postgres psql -U ferreteria_user -d ferreteria
```

Dentro de `psql`, ejecute:

```sql
\password ferreteria_user
```

Así, la nueva contraseña se solicita sin eco y no queda en el historial del shell ni en el log de PostgreSQL.

Después actualice `.env`, los User Secrets del POS y cualquier otra máquina que se conecte.

Por defecto, PostgreSQL escucha solo en `127.0.0.1`. Si cajas POS u otras máquinas de la LAN necesitan conectarse a esta base, defina `POSTGRES_BIND` en `.env` (por ejemplo, con la IP LAN del servidor o `0.0.0.0`; idealmente limite el puerto con el firewall) y recree el contenedor con `docker compose up -d`.

`npm run db:seed` carga siempre las referencias necesarias. Para cargar familias, productos, empleados y usuarios demo hay que definir `SEED_DEMO="true"`; úsalo únicamente en desarrollo local y nunca en producción. En producción debe quedar ausente o ser `false`.

El administrador inicial de producción se crea opcionalmente con `SEED_ADMIN_USER` y `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres y nunca `admin123`); `SEED_ADMIN_EMAIL` es opcional. Si no se definen, no se crea ninguna cuenta administrativa inicial.

### Producción

- Objetivo: **Supabase PostgreSQL** con el mismo esquema.
- Aplicar migraciones con `npm run db:migrate:deploy` cuando el historial de migraciones esté congelado.
- En desarrollo activo se usa `migrate dev` sobre una base personal; `db push` está prohibido en bases compartidas.

---

### Seed y credenciales

El seed de producción carga únicamente referencias idempotentes y nunca modifica ajustes, PINs ni contraseñas existentes. Los datos demo (familias, productos, empleados con PIN y usuarios ficticios) solo se cargan cuando `SEED_DEMO="true"` fuera de producción; las credenciales demo nunca existen en producción.

Para crear opcionalmente un administrador inicial, defina `SEED_ADMIN_USER`, `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres, nunca `admin123`) y, opcionalmente, `SEED_ADMIN_EMAIL`. Si no se definen, el seed muestra `Admin inicial omitido: defina SEED_ADMIN_USER y SEED_ADMIN_PASSWORD` y continúa sin crear cuentas. El seed carga `.env` sin sobrescribir variables ya definidas y respeta `DOTENV_CONFIG_PATH`.

En la tienda, el pago con tarjeta es actualmente una intención pendiente: no se simula un cobro ni se genera `sim_...`. La confirmación del pago la realiza manualmente personal ADMIN u OWNER desde el panel, hasta integrar una pasarela real.

### Escaneo de secretos

CI ejecuta gitleaks mediante `.github/workflows/secretos.yml`. Para ejecutarlo localmente:

```bash
gitleaks dir . --config .gitleaks.toml --redact
gitleaks git . --config .gitleaks.toml --log-opts=--all --redact
```

## Esquemas PostgreSQL

| Esquema | Contenido principal | Consumido por |
|---|---|---|
| `public` | Catálogo: `Products`, `Families`, `Customers`, `InventoryMovements`, `StockAlerts` | WPF (lectura/venta) + admin (CRUD); `quantity`/`TotalCost` son magnitudes y `MovementType` da la dirección |
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
- Al crear una OC, el servicio usa el empleado activo vinculado al usuario autenticado cuando existe. El empleado es opcional para `ADMIN` y `OWNER`; siempre se registra el WebUser creador en `CreatedByWebUserId`.
- Al recibir una OC, se registra `ReceivedByWebUserId`; `ReceivedById` conserva el empleado activo cuando existe. Las respuestas de detalle y listado incluyen `createdByWebUser` y `receivedByWebUser` con `id` y `username`.
- El WebUser receptor de un movimiento `ENTRADA_COMPRA` se obtiene por `InventoryMovements.PurchaseOrderId` → `PurchaseOrders.ReceivedByWebUserId`. No se agrega una columna a `InventoryMovements`, porque es una tabla caliente del POS.
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

## Módulos API montados

Los siguientes 30 montajes se comprueban en `src/app.ts`; los subpaths se definen en los routers correspondientes.

| Módulo/router | Ruta base montada | Alcance comprobado |
|---|---|---|
| `auth` | `/api/v1/auth` | Login, logout, CSRF, sesión, recuperación y cambio de contraseña |
| `public-catalog` | `/api/v1/public/catalog` | Familias, departamentos, subfamilias y productos públicos |
| `public-settings` | `/api/v1/public/settings` | Consulta pública de configuración |
| `shop-auth` | `/api/v1/shop/auth` | Registro, login, sesión y perfil de clientes de tienda |
| `favorites` | `/api/v1/shop/favorites` | Listado, alta y baja de favoritos |
| `cart` | `/api/v1/shop/cart` | Consulta, actualización y limpieza del carrito |
| `shop-orders` | `/api/v1/shop/orders` | Checkout, pedidos del cliente, referencia de transferencia y pago administrativo anidado |
| `shop-orders (admin)` | `/api/v1/shop-orders` | Listado, detalle y actualización administrativa de pedidos |
| `contact` | `/api/v1/contact-messages` | Creación pública y bandeja administrativa de mensajes |
| `settings` | `/api/v1/settings` | Consulta y actualización administrativa de configuración |
| `employees` | `/api/v1/employees` | Empleados y subrecursos de cuentas bancarias y documentos |
| `banks` | `/api/v1/banks` | Catálogo de bancos |
| `document-types` | `/api/v1/document-types` | Tipos de documentos requeridos |
| `catalogs` | `/api/v1/departments` | Catálogo de departamentos |
| `catalogs` | `/api/v1/positions` | Catálogo de cargos |
| `customers` | `/api/v1/customers` | Clientes |
| `products` | `/api/v1/products` | Productos |
| `inventory` | `/api/v1/inventory` y `/api/v1/inventory/counts` | Movimientos, Kardex, alertas, valoración, importación y conteos |
| `purchasing` | `/api/v1/suppliers` | Proveedores |
| `purchasing` | `/api/v1/purchase-orders` | Órdenes de compra, confirmación, recepción y cancelación |
| `payroll-periods` | `/api/v1/payroll-periods` | Períodos de planilla |
| `payroll-runs` | `/api/v1/payroll-runs` | Corridas de planilla y exportaciones |
| `aguinaldo` | `/api/v1/aguinaldo` | Corridas de aguinaldo |
| `vacation-balances` | `/api/v1/vacation-balances` | Saldos de vacaciones |
| `leave-types` | `/api/v1/leave-types` | Tipos de permisos |
| `leave-requests` | `/api/v1/leave-requests` | Solicitudes de permisos y aprobación/rechazo |
| `employee-terminations` | `/api/v1/employee-terminations` | Liquidaciones y estados asociados |
| `fiscal` | `/api/v1/fiscal` | Libros de IVA y consulta DTE |
| `dashboard` | `/api/v1/dashboard` | Resumen de dashboard |
| `holidays` | `/api/v1/holidays` | Feriados |

`shop-payments` no tiene un router independiente: su controlador se monta como `POST /api/v1/shop/orders/:id/pay` dentro de `shop-orders.routes.ts`.

### Rutas de planilla montadas

Las rutas de planilla se montan con estos prefijos exactos en `src/app.ts`:

| Método | Ruta |
|---|---|
| `GET` | `/api/v1/payroll-periods/` |
| `GET` | `/api/v1/payroll-periods/:id` |
| `POST` | `/api/v1/payroll-periods/` |
| `PATCH` | `/api/v1/payroll-periods/:id` |
| `POST` | `/api/v1/payroll-periods/:id/close` |
| `POST` | `/api/v1/payroll-periods/:id/reopen` |
| `GET` | `/api/v1/payroll-runs/` |
| `GET` | `/api/v1/payroll-runs/:id` |
| `GET` | `/api/v1/payroll-runs/:id/export/excel` |
| `GET` | `/api/v1/payroll-runs/:id/export/receipts-pdf` |
| `GET` | `/api/v1/payroll-runs/:id/export/planilla-unica` |
| `POST` | `/api/v1/payroll-runs/` |
| `PATCH` | `/api/v1/payroll-runs/details/:id` |
| `POST` | `/api/v1/payroll-runs/:id/approve` |
| `POST` | `/api/v1/payroll-runs/:id/pay` |
| `POST` | `/api/v1/payroll-runs/:id/void` |
| `DELETE` | `/api/v1/payroll-runs/:id` |

> **IVA (`Settings.IvaPercentage`) de solo lectura:** el checkout de la tienda y el POS calculan el IVA con la constante de código `IVA_RATE_EL_SALVADOR` (13 %, `src/shared/tax.ts`). Por eso `PATCH /api/v1/settings/IvaPercentage` solo acepta `13` y cualquier otro valor responde `400` con un mensaje explícito. Tasa y redondeo **a verificar con contador** antes de producción.

### Validaciones obligatorias del API

- Toda entrada HTTP validada con **Zod** antes de tocar Prisma.
- JWT obligatorio excepto: `POST /auth/login`, forgot/reset, rutas `/public/*`, `POST /contact-messages`, y endpoints públicos de `/shop/auth` (register/login/forgot/reset).
- Roles admin: `ADMIN`, `ACCOUNTANT`, `OWNER`. Rol tienda: `SHOP` (middleware `authenticateShop`).
- PIN de empleado se hashea aquí; **nunca** se devuelve al frontend.
- Operaciones de inventario y compras dentro de **transacciones Prisma**.
- Respuestas de error consistentes: `code`, `message`, `details`, `requestId`.
- No exponer `DteConfig.CertificateKey` ni secretos al cliente.

### Referencia funcional planilla

Portar lógica probada de `erp-core-api` (`C:\Users\lenny\Documents\ERP\erp-core-api`):

| Artefacto erp-core-api | Uso en Ferreteria |
|---|---|
| `payroll.calculator.ts` | AFP, ISSS, ISR, horas extra |
| `payroll.builder.ts` | Líneas planilla vs honorarios |
| `payroll-runs.service.ts` | Generar, aprobar, pagar corridas |
| `payroll-exports.service.ts` | Excel multi-hoja + PDF comprobantes |

UI RRHH/planilla: portar pantallas desde `erp-admin-web` hacia `ferreteria_adminweb`.  
Plan detallado: `../erp_ferreteria/docs/FERRETERIA_PLAN_BACKEND_API_2026.md`.

---

## Estructura del proyecto

```
ferreteria_backend/
├── package.json
├── tsconfig.json
├── docker-compose.yml            # PostgreSQL local :55432
├── .env.example
├── prisma/
│   ├── schema.prisma             # ✅ Fuente de verdad v3.0
│   ├── seed.ts                   # ✅ Seeds idempotentes (+ WebUser admin)
│   └── migrations/               # Historial versionado del esquema
├── database/
│   ├── init.sql                  # Bootstrap Docker
│   └── README.md
├── src/                          # API Express y 30 montajes de router
│   ├── server.ts
│   ├── app.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── employees/
│   │   ├── banks/
│   │   ├── document-types/
│   │   ├── catalogs/
│   │   ├── customers/
│   │   ├── products/
│   │   ├── payroll-periods/      # Períodos de planilla
│   │   ├── payroll-runs/         # Corridas de planilla y exportes
│   │   ├── inventory/            # Fase 9
│   │   ├── purchasing/           # Fase 9b
│   │   ├── fiscal/
│   │   └── dashboard/
│   ├── middleware/
│   ├── lib/
│   └── shared/
├── tests/                        # 36 archivos de pruebas Vitest
└── tests-db/                     # 8 archivos de pruebas con BD
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
cd ferreteria_backend

# Variables y credenciales locales
cp .env.example .env
# Reemplace CAMBIAR_PASSWORD_LOCAL en POSTGRES_PASSWORD y DATABASE_URL por una contraseña propia (ej. `openssl rand -hex 24`)

# Base de datos
docker compose up -d
npm install
npm run db:migrate:deploy
npm run db:seed

# API administrativa (Fase 8+)
npm run dev
```

### Empleados demo (solo desarrollo)

| DUI | PIN | Rol |
|-----|-----|-----|
| 00000001-0 | 1234 | Admin / caja |
| 00000002-0 | 5678 | Técnico confección |
| 00000003-0 | 0000 | Caja demo |

Estas filas solo aparecen con `SEED_DEMO="true"` fuera de producción.

Cambiar PINs antes de producción. La caja WPF valida contra `hr."Employees"."PinHash"`.

### Usuarios web demo (solo desarrollo)

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | ADMIN |
| `contador` | `contador123` | ACCOUNTANT |

Estos usuarios solo aparecen con `SEED_DEMO="true"` fuera de producción; en producción usa `SEED_ADMIN_USER` y `SEED_ADMIN_PASSWORD` para el administrador inicial.

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
| `db:migrate:dev` | Crea migración versionada |
| `db:migrate:deploy` | Aplica migraciones en staging/prod |
| `db:migrate:reset` | Reset + migrate + seed |
| `db:seed` | Ejecuta `prisma/seed.ts` |
| `db:studio` | Abre Prisma Studio |
| `db:format` | Formatea `schema.prisma` |
| `db:validate` | Valida schema |
| `test` | Ejecuta la suite Vitest de `tests/` |
| `test:db` | Ejecuta la suite Vitest de `tests-db/` con `vitest.db.config.ts` |
| `docker:up` | `docker compose up -d` |
| `docker:down` | Detiene contenedor |
| `docker:reset` | Elimina volumen y recrea BD |

ExcelJS usa el override de `uuid` 11.1.1 definido en `package.json` para mantener compatibles los exportes con formato condicional.

---

## Roadmap por fases

Alineado a `FERRETERIA_PLAN_FINALIZACION_APP.md`:

El estado siguiente refleja la presencia comprobable de schema, servicios y rutas en este repositorio; no implica que las reglas legales o funcionales estén validadas para producción.

| Fase | Alcance backend | Estado |
|---|---|---|
| **0** | Schema Prisma v3.0, seeds, Docker | ✅ Implementado |
| **0b** | Esquema `hr` Periodo+Corrida, bancos, ISR, documentos | ✅ Presente en schema y migraciones |
| **8** | Scaffold Express, auth JWT, CRUD empleados/clientes/catálogo | ✅ Rutas montadas |
| **9** | Inventario administrativo, ajustes, alertas | ✅ Rutas montadas |
| **9b** | Proveedores, OC, Kardex valorado, costo promedio | ✅ Rutas y servicios presentes |
| **10** | Planilla, Excel/PDF, aguinaldo, vacaciones, liquidaciones | 🟡 Rutas, cálculo y exportes presentes |
| **10d** | Libros de IVA desde DTEs y compras | ✅ Rutas fiscales presentes |
| **11** | Dashboard BI | 🟡 Está montado `GET /api/v1/dashboard/summary` |

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
| Referencia RRHH | `erp-core-api` — no reimplementar motor legal desde cero |
| Referencia UI RRHH | `erp-admin-web` — portar pantallas a `ferreteria_adminweb` |

---

### Contrato de autenticación del panel

- `POST /api/v1/auth/login`: devuelve `{ accessToken, user, csrfToken }` y emite `fer_access` (`httpOnly`, `Path=/api`, `SameSite` configurable, `Secure` en producción) y `fer_csrf` (legible por JS).
- `POST /api/v1/auth/logout`: invalida el token admin vigente y elimina ambas cookies. Como `tokenVersion` es por usuario, cierra todas sus sesiones activas por diseño; sin token, con uno inválido/caducado o con un JWT firmado pero obsoleto/inactivo también responde `{ loggedOut: true }` y no escribe en BD. Solo una sesión vigente en la cookie `fer_access` exige `X-CSRF-Token` válido (403 `CSRF_INVALID` en otro caso); con `Authorization: Bearer` no se exige CSRF.
- `GET /api/v1/auth/csrf`: rota el token CSRF (requiere sesión) y lo devuelve como `{ csrfToken }`.
- El panel (otro origen) debe usar `credentials: 'include'` y enviar en `X-CSRF-Token` el `csrfToken` recibido en el cuerpo de login/csrf (guardado en memoria), porque `document.cookie` del panel no ve `fer_csrf` (cookie del dominio de la API con `Path=/api`).
- `GET /api/v1/auth/me`: consulta la sesión autenticada.
- Las mutaciones autenticadas por cookie requieren `X-CSRF-Token` igual a `fer_csrf`; Bearer no requiere CSRF.
- Errores: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `CSRF_INVALID` (403), `RATE_LIMITED` (429), `INVALID_JSON` (400), `VALIDATION_ERROR` (400).

### Contrato de autenticación de la tienda

- `POST /api/v1/shop/auth/register` y `POST /api/v1/shop/auth/login`: devuelven `{ accessToken, customer, csrfToken }` y emiten únicamente `fer_shop_access` (`httpOnly`) y `fer_shop_csrf` (legible por JS).
- Las cookies de tienda usan `Path=/api/v1/shop`, `SameSite` configurable, `Secure` en producción o cuando `COOKIE_SECURE=true`, `Domain` configurable y `Max-Age` igual a la expiración del JWT. No se leen ni sobrescriben `fer_access`/`fer_csrf`.
- `POST /api/v1/shop/auth/logout`: invalida el token SHOP vigente y limpia solo cookies de tienda; devuelve `{ loggedOut: true }` incluso sin token, con uno inválido/caducado o con un JWT firmado pero obsoleto/inactivo, sin escribir en BD en estos últimos casos. Como `tokenVersion` es por cliente, cierra todas sus sesiones activas por diseño. Solo `fer_shop_access` con una sesión vigente exige `X-CSRF-Token` válido; con Bearer no.
- `GET /api/v1/shop/auth/csrf`: requiere sesión tienda por Bearer o `fer_shop_access`, rota `fer_shop_csrf` y devuelve `{ csrfToken }`.
- `GET` autenticado por cookie no requiere CSRF. Las mutaciones autenticadas por cookie sí requieren `X-CSRF-Token` igual a `fer_shop_csrf`; Bearer no requiere CSRF. La firma HMAC usa un dominio distinto (`shop-csrf.`) al administrativo.

### Pedidos de tienda

- `PATCH /api/v1/shop-orders/:id` — el personal `ADMIN` u `OWNER` puede enviar `status`, `adminNotes` (máximo 2000 caracteres) y `cancellationNote` (opcional, recortada y de 1 a 300 caracteres).
- `cancellationNote` solo es válida junto con `status = CANCELADA`. Si el pago está `EN_VERIFICACION` y el pedido aún no está cancelado, omitirla responde `409` y no repone inventario.
- Al cancelar con nota, el backend agrega una línea a `AdminNotes`: `Cancelación con pago en verificación: <nota>` para pagos en verificación o `Cancelación: <nota>` en los demás casos. Si ya había notas, las conserva y separa la línea con un salto de línea.
- Cancelar nuevamente un pedido `CANCELADA` es idempotente: no repone inventario ni vuelve a agregar `cancellationNote`. `AdminNotes` es `TEXT`, por lo que las notas existentes no cuentan contra el límite de 300 ni se truncan; el límite de 2000 aplica únicamente al `adminNotes` enviado por el cliente.

### Pagos de pedidos de tienda

- `POST /api/v1/shop/orders/:id/pay` — **confirmar pago** desde una sesión del panel; solo `ADMIN` u `OWNER`. Si la sesión del panel usa cookie, también requiere `X-CSRF-Token` válido.
- Body opcional: `{ "method": "EFECTIVO_RETIRO" | "TRANSFERENCIA" | "TARJETA" | "CONTRA_ENTREGA", "providerRef": "...", "notes": "...", "expectedCustomerReference": "..." | null, "expectedCustomerReferenceAt": "2026-01-01T12:00:00.000Z" | null }`. Para confirmar una referencia que el cliente envió, el panel debe reenviar ambos campos que leyó; si cambiaron, responde `409` y el pedido permanece `EN_VERIFICACION`.
- Respuestas relevantes: `403` si el rol no está autorizado o falla CSRF, `404` si el pedido no existe y `409` si ya está pagado o cancelado.
- La integración con una pasarela real está pendiente; el checkout con tarjeta queda `PENDIENTE` y el personal confirma manualmente el pago.

- `POST /api/v1/shop/orders/:id/transfer-reference` — el dueño del pedido registra o reemplaza `{ "reference": "...", "notes": "..." }` cuando el método es `TRANSFERENCIA`, el pedido no está cancelado y el pago está `PENDIENTE` o `EN_VERIFICACION`.
- La referencia queda en el pago pendiente como `CustomerReference`/`CustomerReferenceAt`, el pedido pasa a `EN_VERIFICACION` y nunca se marca `PAGADO` ni `COMPLETADO` desde la tienda. La confirmación final la hace el personal desde el panel en **Pedidos de tienda**; si no envía `providerRef`, se usa la referencia del cliente.
- `GET /api/v1/shop-orders/:id` — detalle del panel para `ADMIN`, `ACCOUNTANT` u `OWNER`; el listado administrativo también admite `paymentStatus`.
- Al cancelar un pedido con `paymentStatus = EN_VERIFICACION`, el personal debe enviar `cancellationNote`; sin ella la API responde `409` y no repone inventario.

Tras desplegar esta versión, los tokens emitidos antes de incluir el claim `tv` se rechazan. Todos los usuarios deben iniciar sesión nuevamente una vez.

### Errores de Prisma

El manejador global traduce errores conocidos sin exponer SQL, stack ni detalles internos:

- `P2002` → `409 CONFLICT`, con los campos de `meta.target` en el mensaje.
- `P2025` → `404 NOT_FOUND`, registro inexistente.
- `P2003` en `DELETE` → `409 FOREIGN_KEY_CONFLICT`; en otras operaciones → `400 INVALID_REFERENCE`.

El POS WPF no llama a la API: usa EF Core directo. Bearer se conserva para clientes no navegador, `tools/Ferreteria.Smoke` y scripts futuros.

## Conteos físicos de inventario

El módulo toma una foto del stock por familia, subfamilia o lista de productos, permite capturas por lote y aplica las diferencias como ajustes auditables.

| Endpoint | Roles | Uso |
|---|---|---|
| `GET /api/v1/inventory/counts` | ADMIN, ACCOUNTANT, OWNER | Listar conteos |
| `POST /api/v1/inventory/counts` | ADMIN, OWNER | Crear alcance y snapshot inicial |
| `GET /api/v1/inventory/counts/:id` y `/:id/lines` | ADMIN, ACCOUNTANT, OWNER | Consultar resumen y líneas |
| `PATCH /api/v1/inventory/counts/:id/lines` | ADMIN, OWNER | Capturar 1–500 cantidades |
| `POST /api/v1/inventory/counts/:id/apply` | ADMIN, OWNER | Aplicar con `{ "confirm": true }` |
| `POST /api/v1/inventory/counts/:id/cancel` | ADMIN, OWNER | Cancelar un conteo abierto |
| `GET /api/v1/inventory/counts/:id/export` | ADMIN, ACCOUNTANT, OWNER | Descargar XLSX |

Flujo: `ABIERTO` → `APLICADO` o `CANCELADO`. Las líneas pendientes se omiten; la diferencia se calcula contra el stock vigente al capturar, se valida que el stock final no sea negativo y se registra un movimiento `AJUSTE_ENTRADA` o `AJUSTE_SALIDA` sin cambiar el costo promedio. Las mutaciones autenticadas con cookie requieren CSRF.

## Licencia

Copyright (c) 2026 Ferreteria — Todos los derechos reservados.
