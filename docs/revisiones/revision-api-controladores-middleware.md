# Revisión de código de controladores y middleware de la API

## Resumen

Se revisaron exclusivamente los archivos de `src/middleware/**` y `src/modules/**/*.controller.ts` / `src/modules/**/*.routes.ts`. El código mantiene una estructura clara de validación, autorización y delegación de errores; el riesgo principal encontrado fue la falta de límites específicos en dos operaciones sensibles de autenticación de tienda.

Se aplicó el refactor seguro de los limitadores faltantes. No se modificó ningún `*.service.ts`, contrato público de API ni esquema de base de datos.

## Hallazgos

### Crítico — No se identificaron hallazgos críticos

- Ubicación: alcance completo revisado.
- Problema: no se encontró un fallo crítico que requiriera modificar contratos, persistencia o lógica de negocio.
- Propuesta: mantener la cobertura de pruebas de seguridad al agregar nuevas rutas sensibles.

### Importante — Operaciones sensibles de contraseña SHOP sin limitador específico

- Ubicación: `src/modules/shop-auth/shop-auth.routes.ts:20-28`.
- Problema: `POST /reset-password` y `POST /change-password` llegaban al controlador sin `resetPasswordRateLimiter` ni `changePasswordRateLimiter`. El limitador global existe, pero permite una ventana mucho más amplia para operaciones de credenciales.
- Propuesta: encadenar los limitadores ya definidos en `src/middleware/rate-limit.ts`, conservando las rutas, respuestas y códigos HTTP. **Aplicado**.

### Importante — Registro de errores no estructurado en el manejador global

- Ubicación: `src/middleware/error-handler.ts:52`.
- Problema: `console.error("[error-handler]", err)` registra el objeto de error completo sin un logger oficial ni un formato estructurado. Puede dificultar la correlación de incidentes y exponer detalles internos en los destinos de logs.
- Propuesta: usar el logger oficial del proyecto con evento, severidad y correlation ID, filtrando datos sensibles antes de registrar el error. **Diferido** porque no existe un logger oficial identificable en las dependencias o archivos revisados; introducir uno requeriría ampliar el alcance y cambiar la infraestructura de observabilidad.

### Menor — Capturas anidadas en operaciones de períodos de planilla

- Ubicación: `src/modules/payroll-periods/payroll-periods.controller.ts:81-108`.
- Problema: `createPayrollPeriod` y `updatePayrollPeriod` combinan un `try/catch` externo para validación con otro interno para Prisma. El helper `handlePrismaUniqueError` además produce un efecto secundario al llamar `next`, lo que obliga a leer dos niveles de control para seguir el flujo.
- Propuesta: mantener la validación al inicio y centralizar el mapeo del conflicto dentro de un único `catch`, evitando helpers que llamen `next` como efecto lateral. Se difiere para no alterar accidentalmente la clasificación actual de errores.

### Menor — Tipos de retorno implícitos en varios controladores

- Ubicación: por ejemplo `src/modules/auth/auth.controller.ts:29`, `src/modules/contact/contact.controller.ts:32` y `src/modules/shop-auth/shop-auth.controller.ts:50`.
- Problema: algunos controladores async declaran `Promise<void>` y otros dejan que TypeScript lo infiera. La mezcla dificulta detectar cambios de contrato y rompe la consistencia para desarrolladores junior.
- Propuesta: declarar `: Promise<void>` de forma uniforme en los handlers async, sin cambiar su comportamiento. Se difiere por ser una mejora de consistencia y no un riesgo funcional inmediato.

### Menor — Formato irregular en expresiones ya correctas

- Ubicación: `src/modules/banks/banks.controller.ts:51`, `src/modules/contact/contact.controller.ts:53-63`, `src/modules/customers/customers.controller.ts:55-76`, `src/modules/employees/employees.controller.ts:68-90` y `src/modules/fiscal/fiscal.controller.ts:60-95`.
- Problema: algunas llamadas y declaraciones están indentadas de forma distinta al resto de los controladores. El linter pasa, pero la lectura vertical se vuelve menos predecible.
- Propuesta: aplicar el formato existente del repositorio en una pasada mecánica, sin cambiar expresiones ni respuestas.

### Menor — Valores de métodos HTTP repetidos en autenticación

- Ubicación: `src/middleware/authenticate.ts:80` y `src/middleware/authenticate-shop.ts:67`.
- Problema: la lista `GET`, `HEAD`, `OPTIONS` está duplicada como literal. Si cambia la política de métodos seguros, dos middlewares pueden quedar desalineados.
- Propuesta: extraer una constante con nombre en el ámbito de cada middleware o centralizarla cuando exista un módulo común apropiado. Se difiere para no ampliar el alcance con una abstracción nueva.

## Lo que está bien

- Los controladores validan parámetros, query y body con Zod antes de invocar servicios.
- Los errores de los controladores se propagan mediante `next(err)` y el middleware global normaliza Zod, Prisma y `AppError`.
- Los middlewares de autenticación verifican token, rol, estado activo, versión de token y CSRF para sesiones basadas en cookies.
- Las rutas administrativas aplican autenticación y autorización por rol de forma explícita.
- Se usan salidas tempranas en rechazos de autenticación y autorización, lo que mantiene el flujo principal legible.
- El cambio aplicado reutiliza limitadores existentes, agrega una prueba de regresión y no introduce capas, interfaces ni abstracciones nuevas.

## Siguientes pasos

1. Incorporar o identificar el logger oficial para reemplazar el registro crudo de errores y añadir correlation ID al evento.
2. Simplificar los `try/catch` anidados de períodos de planilla con pruebas específicas de conflicto único.
3. Uniformar los tipos de retorno y el formato de los handlers en una revisión mecánica posterior.
4. Centralizar la lista de métodos seguros solo cuando exista un módulo común dentro del alcance arquitectónico del proyecto.

## Verificación

- `npm run build`: pasó.
- `npm run lint`: pasó.
- `npm test`: no pudo iniciar Vitest por `spawn EPERM` al cargar `vitest.config.ts` mediante Vite en el sandbox de Windows.
- La prueba dirigida de `tests/shop-auth.test.ts` presentó el mismo bloqueo `spawn EPERM`.

## Estado de aplicación

| Severidad | Hallazgo | Estado | Motivo |
|---|---|---|---|
| Crítico | No se identificaron hallazgos críticos | APLICADO | No había cambios críticos pendientes. |
| Importante | Limitadores faltantes en recuperación/cambio de contraseña SHOP | APLICADO | Refactor seguro que reutiliza middleware existente; se agregó prueba de regresión. |
| Importante | Registro de errores con `console.error` | DIFERIDO | No hay logger oficial disponible dentro del alcance; añadir infraestructura cambiaría el alcance. |
