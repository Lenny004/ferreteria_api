# Migraciones Prisma y compatibilidad con el POS

## Signo de `InventoryMovements.quantity` (normalización manual opcional)

La convención compartida con la caja WPF es que `public."InventoryMovements".quantity` y `"TotalCost"` siempre guardan magnitudes positivas; la dirección la expresa `"MovementType"`. Las entradas son `ENTRADA_COMPRA`, `ENTRADA_DEVOLUCION` y `AJUSTE_ENTRADA`; las salidas son `SALIDA_VENTA` y `AJUSTE_SALIDA`.

En una base real solo podrían existir cantidades o costos negativos en movimientos `AJUSTE_SALIDA` creados por `POST /inventory/movements` o `POST /inventory/import` antes de este cambio. Los checkouts de la tienda con tipo `VENTA` nunca se guardaron porque el CHECK `MovementTypeValid` los rechazaba y la transacción hacía rollback.

Este PR no incluye una migración automática: no se modifican datos reales sin revisión. Los lectores ya aplican `ABS`, por lo que normalizar las filas existentes es opcional y cosmético. Si se decide hacerlo, ejecutar manualmente en una ventana revisada:

```sql
-- (1) Respaldo, ejecutado desde la consola del sistema:
-- pg_dump --format=custom --file=ferreteria_movimientos_antes_signo.dump "$DATABASE_URL"

-- (2) Diagnóstico de solo lectura:
SELECT "MovementType", count(*), sum(quantity) AS sum_quantity, sum("TotalCost") AS sum_total_cost
FROM public."InventoryMovements"
WHERE quantity < 0 OR "TotalCost" < 0
GROUP BY 1;

-- Si el diagnóstico muestra negativos en tipos de ENTRADA, detenerse y revisarlos a mano.
-- No normalizarlos automáticamente.

-- (3) Normalización idempotente de salidas:
BEGIN;
UPDATE public."InventoryMovements"
SET quantity = ABS(quantity),
    "TotalCost" = ABS("TotalCost")
WHERE "MovementType" IN ('SALIDA_VENTA', 'AJUSTE_SALIDA')
  AND (quantity < 0 OR "TotalCost" < 0);

-- Verificación dentro de la transacción:
SELECT "MovementType", count(*), sum(quantity) AS sum_quantity, sum("TotalCost") AS sum_total_cost
FROM public."InventoryMovements"
WHERE "MovementType" IN ('SALIDA_VENTA', 'AJUSTE_SALIDA')
  AND (quantity < 0 OR "TotalCost" < 0)
GROUP BY 1;
COMMIT;
```

No se deben tocar `"StockBefore"`, `"StockAfter"` ni `Products."CurrentStock"`, porque esos saldos ya se calculaban correctamente. Reejecutar el bloque no cambia filas: la segunda ejecución actualiza cero registros.

## Fuente de verdad

- **`prisma/migrations/` es la única fuente de verdad del esquema** a partir de M1. `prisma/schema.prisma` modela todas las tablas (API + POS) y `0_init/migration.sql` contiene además los objetos que Prisma no modela.
- `database/init.sql` solo prepara infraestructura (extensiones, esquemas, función de timestamp y permisos) para el contenedor local.
- `docker-compose.yml` **ya no monta** `erp_ferreteria/Ferreteria.PuntoVenta/Squema.sql`. Antes lo montaba mientras `database/README.md` decía que la fuente era `db push`: esa contradicción queda resuelta a favor de las migraciones.
- `Squema.sql` **no se borra** del repo del POS. Impacto para el equipo del POS: cualquier cambio de esquema nuevo debe hacerse como migración Prisma en `ferreteria_backend` (y reflejarse en el modelo EF Core); `Squema.sql` queda como referencia histórica y debe actualizarse a partir de las migraciones si se sigue usando para instalaciones del POS aisladas.
- **Prohibido:** `prisma db push`, `db push --force-reset`, `migrate reset` y `migrate dev` sobre cualquier base compartida o de producción. Los scripts `db:push*` se eliminaron de `package.json` por eso.

## Qué contiene `0_init`

1. **Parte 1**, generada offline con el motor oficial:
   `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
2. **Parte 2**, copiada de `database/init.sql` y `Squema.sql` (lo que Prisma no modela):
   - 19 CHECK (`MovementTypeValid`, `OrderStatusValid`, `PaymentMethodValid`, `PaymentAmountPositive`, `CashSessionStatusValid`, `MhStatusValid`, `RoleValid`, `StockNotNegative`, `VolumeDiscount*`, etc.);
   - índices parciales `IdxCashSessionOpen` (`status = 'ABIERTA'`), `IdxPrinterDefault`, `IdxStockAlertsUnresolved`;
   - funciones `fn_update_timestamp`, `fn_stock_alert`; 18 triggers (`TrgStockAlert` + timestamps, incluido `TrgPrinterTimestamp`);
   - vistas `VProductsStock`, `VProductRotation`, `VActiveAlerts`, `sales."VKpisToday"`.

Reconciliación del schema con la BD del POS (introspección de una BD creada con `init.sql` + `Squema.sql`): se añadieron `SaleUnits`, `ProductSaleUnits`, `VolumeDiscounts`, las columnas de descuento/unidad de `Orders`/`OrderDetails`, los nombres reales de FK e índices (`map:`), las acciones referenciales reales (`NoAction` salvo los `CASCADE` declarados), `StockAlerts.id` y los tipos/defaults de `hr.Employees`. Los valores de `MovementType` son los del CHECK y del WPF: `ENTRADA_COMPRA`, `ENTRADA_DEVOLUCION`, `SALIDA_VENTA`, `AJUSTE_ENTRADA`, `AJUSTE_SALIDA`. Ver también `docs/RELACIONES_BD.md`.

## Cómo se validó (Postgres 17 desechable en Docker, nunca una BD real)

- **BD vacía:** `migrate deploy` → `db seed` → `migrate diff --from-schema-datasource … --to-schema-datamodel … --exit-code` = *No difference detected*.
- **BD existente** (`init.sql` + `Squema.sql` con sus datos de catálogo): diff de solo lectura → solo sentencias aditivas (29 `CREATE TABLE`, 56 `CREATE INDEX`, 30 FK de tablas nuevas y `ADD COLUMN` en `Families`, `Products`, `Subfamilies`; **0** `DROP`/`RENAME`/`ALTER COLUMN`) → se aplicó ese script en una transacción → `migrate resolve --applied 0_init` → `migrate deploy` = *No pending migrations* → diff = *No difference detected*. Conteo de filas por tabla idéntico antes y después.
- **Catálogo comparado** entre ambas BD (CHECK, índices con su definición, triggers, vistas, funciones y FK con sus acciones): 0 diferencias.

## Procedimiento para la BD real (sin pérdida de datos)

> Hazlo en una ventana de mantenimiento, con el POS cerrado. Ningún paso borra datos; el rollback es restaurar el respaldo.

1. **Respaldo:**
   `pg_dump --format=custom --file=ferreteria_antes_baseline.dump "$DATABASE_URL"`
   Comprueba el respaldo: `pg_restore --list ferreteria_antes_baseline.dump | head`.
2. **Diff de solo lectura** (no modifica nada):
   `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > aditivo.sql`
3. **Revisar `aditivo.sql`.** Debe contener solo `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN` (nullable o con default) y `ADD CONSTRAINT … FOREIGN KEY` de tablas nuevas. **Si aparece cualquier `DROP`, `RENAME` o `ALTER COLUMN`, detente**: significa que la BD real difiere de lo esperado (p. ej. se usó `db push` en el pasado). Corrige el schema, no la BD, y vuelve al paso 2.
   Revisa también que existan los objetos de la Parte 2 (CHECK, índices parciales, triggers, vistas): si faltan, aplica solo esos bloques de `0_init/migration.sql`.
4. **Aplicar el script aditivo** en una transacción: `psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f aditivo.sql` (si salió vacío, omite este paso).
5. **Marcar el baseline como aplicado** (no ejecuta SQL): `npx prisma migrate resolve --applied 0_init`
6. **Comprobar:** `npx prisma migrate deploy` debe decir *No pending migrations to apply* y `npm run db:migrate:diff-check` debe decir *No difference detected*. `npx prisma migrate status` → *Database schema is up to date!*
7. **Rollback** (si algo falla antes del paso 5): `pg_restore --clean --if-exists --dbname "$DATABASE_URL" ferreteria_antes_baseline.dump`. Después del paso 5 solo se habrá añadido la tabla `_prisma_migrations` y los objetos aditivos.

## Flujo de trabajo futuro

- Local: `npm run docker:up` → `npm run db:migrate:deploy` → `npm run db:seed`. Para cambios de esquema: `npx prisma migrate dev --name <cambio>` **solo** en tu BD local desechable, y revisa el SQL generado.
- CI: servicio `postgres:17` + `migrate deploy` + `db:migrate:diff-check` (drift).
- Producción: backup → `npx prisma migrate deploy`. Nunca `db push`.
- Objetos no modelados (CHECK, triggers, vistas): se añaden a mano en el `migration.sql` de la migración correspondiente.

## `2_pos_devoluciones` (devoluciones POS)

Migración **aditiva**: crea `sales."Returns"`, `sales."ReturnDetails"` y `sales."CashMovements"` (FK `ON DELETE/UPDATE NO ACTION`, CHECKs, índices y el trigger `"TrgReturnTimestamp"`) y agrega el índice único parcial `"IdxCashSessionOpenByRegister"` sobre `sales."CashSessions"("CashRegisterCode") WHERE "status" = 'ABIERTA'` (una sola sesión abierta por caja). No modifica ni elimina tablas, columnas ni constraints existentes.

Estructura del `migration.sql`:

- **Parte 0**: bloque `DO` que aborta con un mensaje claro si ya hay cajas con más de una sesión `ABIERTA`. Como es la primera sentencia, si falla no se crea ningún objeto.
- **Parte 1**: generada con `npx prisma migrate diff --from-url <BD en 1_inventory_counts> --to-schema-datamodel prisma/schema.prisma --script` (tablas, PK, índices completos y FK).
- **Parte 2**: lo que Prisma no modela: CHECKs, índices parciales (`UqReturnsCreditNote`, `UqReturnDetailsMovement`, `UqCashMovementsReturnRefund`, `IdxCashSessionOpenByRegister`) y el trigger.

### Pre-chequeo obligatorio antes de `migrate deploy` en una base real

```sql
SELECT "CashRegisterCode", COUNT(*)
FROM sales."CashSessions"
WHERE "status" = 'ABIERTA'
GROUP BY 1
HAVING COUNT(*) > 1;
```

Debe devolver **0 filas**. Si devuelve filas, cerrar o cancelar las sesiones duplicadas con revisión manual (con el cajero y el dueño) antes de desplegar. Si se despliega igual, la Parte 0 aborta la migración (`P3018`, mensaje "existen cajas con más de una sesión ABIERTA") sin crear objetos; tras corregir los datos: `npx prisma migrate resolve --rolled-back 2_pos_devoluciones` y de nuevo `npx prisma migrate deploy`.

### Rollback manual (orden inverso)

```sql
DROP INDEX IF EXISTS sales."IdxCashSessionOpenByRegister";
DROP TABLE IF EXISTS sales."CashMovements";
DROP TABLE IF EXISTS sales."ReturnDetails";
DROP TABLE IF EXISTS sales."Returns";
```

Después: `npx prisma migrate resolve --rolled-back 2_pos_devoluciones`. Solo con respaldo previo y si las tablas no tienen datos que conservar.

### Decisiones del dueño aplicadas

1. La orden original **conserva `status = 'COMPLETADA'`** incluso en una devolución total (no existe estado `DEVUELTA`; `OrderStatusValid` no cambia).
2. La columna de estado es `"status"` en minúsculas, como el resto de `sales`.
3. El egreso de caja por reembolso es `"MovementType" = 'DEVOLUCION_EFECTIVO'` (no `EGRESO_DEVOLUCION`).
4. El reingreso a inventario usa el **costo original de la venta** (`ReturnDetails."UnitCost"` = `OrderDetails."UnitCost"` de la línea vendida). **Provisional: a verificar con contador.**
5. **Sin vales ni crédito en tienda**: `ChkReturnsRefundMethod` solo admite `EFECTIVO`, `TARJETA`, `TRANSFERENCIA` y `NINGUNO`. Si en el futuro se habilitan, habrá que reemplazar el CHECK (cambio no aditivo).

### Notas

- `"IdxCashSessionOpen"` (empleado + caja) queda redundante con el nuevo índice por caja, pero se mantiene: eliminarlo no sería aditivo.
- La regla "cantidad devuelta acumulada ≤ cantidad vendida por línea" la valida el servicio del POS dentro de su transacción; un CHECK de fila no puede garantizarla.
- Un solo egreso de caja por devolución: `UqCashMovementsReturnRefund` (único parcial por `ReturnId` cuando el tipo es `DEVOLUCION_EFECTIVO`).
- **POS (`Squema.sql`)**: `docs/pos/2_pos_devoluciones_squema.sql` es la versión idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE TRIGGER`) que Ferretería Caja debe copiar a `Ferreteria.PuntoVenta/Squema.sql`. Produce exactamente el mismo catálogo (columnas, tipos, defaults, constraints, índices y trigger) que esta migración; ver `tests-db/`.
- Pruebas de constraints contra Postgres real: `npm run test:db` (requiere `DATABASE_URL` explícita a `localhost`/`127.0.0.1`; en CI corre contra el servicio Postgres ya migrado).
- Próximo paso: implementar y mantener las ventas netas del panel/API según [docs/VENTAS_NETAS.md](VENTAS_NETAS.md).

## `3_pos_vkpistoday_zona_horaria` (día de negocio de `VKpisToday`)

Migración **aditiva**: solo `CREATE OR REPLACE VIEW sales."VKpisToday"`. Conserva las columnas (`TotalOrders` bigint, `TotalAmount` numeric, `AvgTicket` numeric), su orden y sus tipos, y cambia únicamente el corte del día: de `o."CreatedAt"::date = CURRENT_DATE` (zona de la sesión, UTC en el servidor) a `(o."CreatedAt" AT TIME ZONE 'America/El_Salvador')::date = (now() AT TIME ZONE 'America/El_Salvador')::date`. No toca tablas ni datos. Detalle en [ZONA_HORARIA.md](ZONA_HORARIA.md).

- La zona es literal (una vista no recibe parámetros) y coincide con el valor por defecto de `BUSINESS_TZ`; cambiar la zona del negocio requiere otra migración.
- **POS (`Squema.sql`)**: `docs/pos/3_pos_vkpistoday_zona_horaria_squema.sql` contiene la misma sentencia para reemplazar la definición de la sección VISTAS.

### Rollback manual

```sql
CREATE OR REPLACE VIEW sales."VKpisToday" AS
SELECT COUNT(*) AS "TotalOrders", COALESCE(SUM(o."total"), 0) AS "TotalAmount",
       COALESCE(AVG(o."total"), 0) AS "AvgTicket"
FROM sales."Orders" o
WHERE o."CreatedAt"::date = CURRENT_DATE AND o."status" = 'COMPLETADA';
```

Después: `npx prisma migrate resolve --rolled-back 3_pos_vkpistoday_zona_horaria`.

## Pendientes conocidos

- El seed de Prisma inserta ahora el catálogo de `SaleUnits` y la presentación base `UNIDAD` de los productos de forma idempotente, alineado con `Squema.sql`.
- `package.json#prisma` está deprecado para Prisma 7; migrar a `prisma.config.ts` cuando se actualice.
