## Resumen

Se revisaron los 32 archivos `src/modules/**/*.service.ts`, con prioridad en autenticación, carrito, pedidos/pagos de tienda, inventario, compras, nómina y aguinaldo. El código tiene una base sólida de transacciones, bloqueo de stock, uso de `Decimal` y errores de dominio, pero aún hay riesgos de concurrencia en flujos sensibles y algunas funciones demasiado grandes para mantenimiento junior.

Se aplicaron refactors seguros de atomicidad, consultas repetidas y valores mágicos, sin modificar rutas, controladores, respuestas HTTP ni el esquema de base de datos.

## Hallazgos

### Crítico H-C1: el token de recuperación puede consumirse dos veces bajo concurrencia

- Ubicación: `src/modules/auth/auth.service.ts:200-218` y `src/modules/shop-auth/shop-auth.service.ts:247-266`, `resetPassword`.
- Problema: el servicio lee y valida el token antes de abrir la transacción. Dos solicitudes concurrentes pueden leer `usedAt = null` y después ambas actualizar la contraseña antes de marcar el mismo token como usado. La transacción actual garantiza que usuario y token se escriban juntos, pero no convierte el consumo en una operación compare-and-set.
- Propuesta: validar y consumir dentro de una transacción interactiva, con bloqueo de la fila o un `updateMany` condicionado por `id`, `audience`, `usedAt: null` y `expiresAt > ahora`; si `count !== 1`, rechazar el segundo intento. Agregar una prueba concurrente para ambos públicos.

### Crítico H-C2: el carrito comprueba stock fuera de una operación serializada

- Ubicación: `src/modules/cart/cart.service.ts:48-74`, `upsert`.
- Problema: la lectura de producto y la comprobación de stock ocurren antes del `upsert` y sin bloqueo. Dos solicitudes pueden observar el mismo stock y aceptar cantidades que, combinadas, superan el inventario disponible. El checkout vuelve a validar, pero el carrito queda en un estado que no representa una reserva confiable.
- Propuesta: usar una transacción con bloqueo del producto, releer stock dentro de ella y actualizar el carrito con la decisión tomada bajo ese bloqueo. Cubrir dos solicitudes concurrentes y conservar el mismo error HTTP cuando no haya stock.

### Importante H-I1: consultas repetidas de productos durante checkout

- Ubicación: `src/modules/shop-orders/shop-orders.service.ts:147-165`, `checkout`.
- Problema: se consultaba el mismo producto una vez por cada línea del carrito, aunque el flujo ya conoce el conjunto de identificadores y debe bloquearlos juntos. Esto aumentaba la latencia y hacía más difícil razonar sobre el snapshot usado para calcular stock y totales.
- Propuesta: consultar todos los productos con un único `findMany`, indexarlos por ID y validar faltantes antes de calcular las líneas.

### Importante H-I2: consultas repetidas al recibir una orden de compra

- Ubicación: `src/modules/purchasing/purchase-orders.service.ts:462-522`, `receive`.
- Problema: después de bloquear los productos, se hacía un `findUnique` por cada detalle. Además del patrón N+1, una OC con el mismo producto en varias líneas obligaba a depender de lecturas repetidas para mantener el saldo acumulado.
- Propuesta: cargar una vez el conjunto de productos bloqueados, mantener un mapa local y actualizar su snapshot después de cada línea para conservar el cálculo de costo promedio y stock acumulado.

### Importante H-I3: listado de aguinaldos con N+1 agregaciones

- Ubicación: `src/modules/aguinaldo/aguinaldo.service.ts:59-79, 131-141`, `listAguinaldoRuns`.
- Problema: se ejecutaba un `aggregate` separado para cada corrida listada. Con paginación de 200 filas podía producir 201 consultas para una pantalla.
- Propuesta: agrupar los detalles por `aguinaldoRunId` en una única consulta y asociar los totales mediante un `Map`.

### Importante H-I4: aprobación de vacaciones no era atómica con el saldo

- Ubicación: `src/modules/leave-requests/leave-requests.service.ts:188-230`, `approveLeaveRequest`.
- Problema: primero se aprobaba la solicitud y después se incrementaba `daysTaken`. Si fallaba la segunda operación, quedaba una ausencia aprobada sin descontar del saldo.
- Propuesta: ejecutar la actualización de solicitud y el `upsert` del saldo en una sola transacción Prisma, usando una constante para los días anuales por defecto.

### Importante H-I5: borrado de corrida de nómina en dos operaciones independientes

- Ubicación: `src/modules/payroll-runs/payroll-runs.service.ts:623-639`, `deletePayrollRun`.
- Problema: borrar detalles y luego la cabecera podía dejar un estado parcial si la segunda operación fallaba.
- Propuesta: agrupar ambos borrados en una transacción Prisma.

### Importante H-I6: carreras en las máquinas de estado de procesos de RR. HH.

- Ubicación: `src/modules/aguinaldo/aguinaldo.service.ts:267-283`, `changeAguinaldoStatus`; `src/modules/payroll-runs/payroll-runs.service.ts:573-605`, `changePayrollRunStatus`; y `src/modules/employee-terminations/employee-terminations.service.ts:249-331`.
- Problema: varios flujos leen el estado y luego actualizan sin bloquear la fila ni condicionar la transición en la escritura. Dos solicitudes simultáneas pueden validar el mismo estado y registrar transiciones duplicadas o sobrescribir auditoría.
- Propuesta: usar una transacción interactiva con bloqueo de la corrida/liquidación y validar la transición dentro de la transacción; para operaciones simples, usar un `updateMany` condicionado al estado esperado y comprobar el conteo afectado. Agregar pruebas de doble aprobación/pago/anulación.

### Importante H-I7: generación duplicada de corridas bajo solicitudes simultáneas

- Ubicación: `src/modules/payroll-runs/payroll-runs.service.ts:201-224, 269-279`, `generatePayrollRun`; `src/modules/aguinaldo/aguinaldo.service.ts:178-195`, `generateAguinaldo`.
- Problema: la comprobación de existencia ocurre antes de la transacción que crea la corrida. Dos solicitudes concurrentes pueden pasar ambas comprobaciones y crear trabajo duplicado si la base no impone una unicidad que cubra exactamente el estado requerido.
- Propuesta: serializar por período/año dentro de una transacción y convertir la colisión de unicidad en un error de dominio estable. Verificar primero las restricciones existentes antes de decidir si hace falta una migración; esta revisión no modifica el esquema.

### Importante H-I8: `ensureYearlyBalances` tiene una ventana entre lectura y creación

- Ubicación: `src/modules/vacation-balances/vacation-balances.service.ts:94-119`.
- Problema: lee saldos existentes y luego hace `createMany`. Dos ejecuciones simultáneas pueden competir por la misma fila única; además, el conteo calculado localmente puede no coincidir con las filas realmente insertadas.
- Propuesta: hacer la creación idempotente con la opción de duplicados de Prisma o una transacción/bloqueo, y devolver el conteo efectivo insertado.

### Importante H-I9: funciones de negocio demasiado extensas

- Ubicación: `src/modules/shop-orders/shop-orders.service.ts:147-276` y `374-463`; `src/modules/purchasing/purchase-orders.service.ts:430-522`; `src/modules/inventory/inventory-counts.service.ts:320-425`; `src/modules/payroll-runs/payroll-runs.service.ts:194-411, 419-553`; `src/modules/fiscal/fiscal.service.ts:363-489`; `src/modules/payroll-runs/payroll-exports.service.ts:106-376`.
- Problema: mezclan validación, consultas Prisma, cálculo de importes, persistencia y construcción de documentos en bloques de más de 100 líneas. Un desarrollador junior debe mantener demasiados invariantes a la vez, especialmente en inventario y nómina.
- Propuesta: extraer funciones privadas descriptivas por responsabilidad —por ejemplo, validar estado, preparar detalles, calcular totales y persistir movimientos— sin crear DAO, interfaces ni capas nuevas. Antes de cada extracción conviene añadir pruebas de caracterización para preservar importes y salidas de documentos.

### Menor H-M1: valores de negocio repetidos entre servicios

- Ubicación: paginación en `customers`, `products`, `inventory`, `purchasing`, `shop-orders`, `aguinaldo` y otros servicios; días/años en `aguinaldo` y `employee-terminations`; columnas numéricas en `payroll-exports`.
- Problema: límites, días por año, TTL y posiciones de exportación aparecen como literales dispersos. Esto dificulta distinguir una regla de negocio de un detalle de formato.
- Propuesta: mantener constantes locales con nombres de unidad o propósito. Ya se aplicó en TTL de recuperación, días/año de aguinaldo y estados administrativos de pedidos; el resto puede hacerse por módulo cuando se toque el flujo correspondiente.

### Menor H-M2: tipos de retorno inferidos en varios servicios

- Ubicación: métodos de los servicios CRUD y de tienda, por ejemplo `customers.service.ts`, `products.service.ts`, `cart.service.ts` y `shop-payments.service.ts`.
- Problema: TypeScript infiere el retorno desde Prisma, por lo que cambios en `include` o `select` pueden propagar formas distintas sin que el contrato del servicio sea visible en la firma.
- Propuesta: declarar DTOs o tipos de retorno explícitos solo donde el método cruce módulos o sea parte de un flujo crítico. No crear abstracciones nuevas solo para satisfacer esta sugerencia.

### Menor H-M3: repetición de convertidores `Decimal` y mapeadores

- Ubicación: `toNum`/`round2` repetidos en aguinaldo, dashboard, fiscal, liquidaciones, permisos, vacaciones y nómina.
- Problema: una corrección de redondeo o conversión tendría que repetirse en varios archivos y puede divergir.
- Propuesta: consolidar únicamente cuando exista un módulo compartido ya aprobado para ello; no se creó una capa nueva en esta revisión porque está fuera del alcance seguro solicitado.

## Lo que está bien

- Los flujos de stock de checkout, recepción de compras y conteos usan transacciones y bloqueos explícitos, con orden determinista en los puntos críticos.
- Los importes se calculan con `Prisma.Decimal` y redondeo explícito, evitando depender de operaciones binarias de `number` para los totales principales.
- Las máquinas de estado de nómina y aguinaldo están declaradas de forma visible, en lugar de permitir transiciones implícitas.
- Los pagos pendientes se seleccionan de forma determinista y se rechazan duplicados antes de confirmar un pedido.
- No se encontraron `console.log`, `debugger`, `catch` vacío ni imports muertos en los servicios revisados. El `catch` de `inventory.importMovements` conserva deliberadamente el error por línea para que el lote continúe y devuelva un resultado explícito.
- Los servicios usan errores de dominio (`BadRequestError`, `ConflictError`, `NotFoundError`, etc.) y mantienen documentación JSDoc en español para los flujos de mayor riesgo.
- Las consultas de listados usan paginación acotada y `Promise.all` cuando las consultas son independientes.

## Siguientes pasos

1. Resolver H-C1 y H-C2 con pruebas de concurrencia reproducibles antes de exponer los flujos de recuperación y carrito a mayor carga.
2. Hacer atómicas las transiciones de H-I6 y la generación de H-I7; verificar restricciones únicas existentes antes de considerar cambios de esquema.
3. Corregir H-I8 para que la inicialización de saldos sea idempotente también en ejecuciones concurrentes.
4. Extraer gradualmente las funciones de H-I9 empezando por nómina e inventario, acompañando cada extracción con pruebas de caracterización.
5. Mantener una prueba unitaria de cada refactor aplicado y volver a ejecutar el conjunto completo cuando el sandbox permita iniciar Vitest.

## Estado de aplicación

### Hallazgos críticos

- H-C1 — **DIFIRIÓ**: requiere una estrategia de consumo compare-and-set o bloqueo de fila y pruebas concurrentes; la transacción de emisión de tokens sí quedó atómica, pero no se cambió aún el consumo para evitar alterar el flujo sin cobertura específica.
- H-C2 — **DIFIRIÓ**: requiere serializar la comprobación de stock del carrito y probar carreras entre solicitudes; no se modificó el contrato ni se introdujo una reserva implícita.

### Hallazgos importantes

- H-I1 — **APLICÓ**: checkout carga productos una vez con `findMany` y conserva un mapa local; se actualizaron los mocks de servicio existentes.
- H-I2 — **APLICÓ**: recepción de compras carga productos una vez y actualiza el snapshot local después de cada línea; se conservaron stock y costo promedio acumulados. Se corrigió la fixture de `tests/stock-alert-threshold.test.ts` para preparar el producto mediante `findMany`, que es la consulta vigente; el comportamiento de alertas no cambió.
- H-I3 — **APLICÓ**: el listado de aguinaldo usa un `groupBy` único para los totales de las filas paginadas.
- H-I4 — **APLICÓ**: aprobación y actualización del saldo ahora comparten una transacción; se agregó `tests/leave-requests-service.test.ts`.
- H-I5 — **APLICÓ**: borrado de detalles y cabecera de nómina ahora comparte una transacción.
- H-I6 — **DIFIRIÓ**: necesita bloqueo/actualización condicionada y pruebas de carreras en varios módulos de RR. HH.; es un cambio de concurrencia, no solo de legibilidad.
- H-I7 — **DIFIRIÓ**: depende de las restricciones únicas reales y de una estrategia de serialización por período/año; el alcance prohíbe modificar esquema o migraciones.
- H-I8 — **DIFIRIÓ**: debe devolver el número efectivo de filas y tratar explícitamente la concurrencia; requiere cobertura adicional.
- H-I9 — **DIFIRIÓ**: las extracciones son seguras solo con pruebas de caracterización de cálculos financieros y documentos; no se introdujeron cambios estructurales amplios en esta pasada.

Las transacciones de emisión de recuperación en `auth` y `shop-auth`, los TTL con nombre, `DAYS_PER_YEAR`, `MILLISECONDS_PER_DAY` y `ADMIN_ORDER_STATUSES` se aplicaron como refactors complementarios de atomicidad/legibilidad.
