# Revisión de código de API compartida

## Resumen

El código compartido presenta una base clara: usa TypeScript estricto, esquemas Zod, consultas Prisma parametrizadas y helpers pequeños con documentación en español. Los riesgos principales estaban en aceptar estructuras de seguridad parcialmente válidas, ejecutar referencias del seed fuera de una transacción y ocultar el flujo del seed detrás de una cadena de promesas y una función SQL de más de 100 líneas.

Se aplicaron los refactors seguros de severidad Importante y se agregaron pruebas para los rechazos nuevos de JWT y CSRF. `npm run build` y `npm run lint` terminaron correctamente; `npm test` no pudo cargar Vitest por `spawn EPERM` del sandbox de Windows.

## Hallazgos

No se identificaron hallazgos Críticos.

### [Importante] El JWT se aceptaba mediante un cast sin validar sus claims

- Ubicación: `src/shared/jwt.ts:34-49`, `verifyAccessToken`.
- Problema: `jwt.verify` se convertía directamente a `AccessTokenPayload`. Un token firmado que no contuviera `userId`, `role` o una versión entera podía atravesar esta frontera con una forma incompatible con el contrato que consumen los middlewares.
- Propuesta: validar explícitamente las claims mínimas después de verificar firma y algoritmo; lanzar un error 401 cuando la forma no sea válida.
- Estado: aplicado. Se agregó `isAccessTokenPayload` y una prueba para un token firmado sin `tv`.

### [Importante] El validador CSRF aceptaba tokens con segmentos adicionales

- Ubicación: `src/shared/cookies.ts:49-63`, `isValidCsrfToken`.
- Problema: `split(".")` tomaba solo los dos primeros segmentos. Un valor con firma válida seguido de otro segmento podía pasar las comprobaciones de nonce y firma si cookie y header coincidían.
- Propuesta: exigir exactamente dos segmentos antes de calcular la firma.
- Estado: aplicado. Se agregó una regresión que rechaza `token.extra`.

### [Importante] El seed de referencias podía dejar persistencia parcial

- Ubicación: `prisma/seed.ts:141-196`, `seedReferenceData`.
- Problema: las unidades se insertaban en una sentencia y el resto de referencias en otra. Si la segunda fallaba, el seed quedaba parcialmente aplicado.
- Propuesta: ejecutar ambas sentencias mediante una transacción Prisma y usar el cliente transaccional en cada operación.
- Estado: aplicado. La operación ahora usa `prisma.$transaction`.

### [Importante] El flujo ejecutable del seed era difícil de seguir y no cubría errores síncronos con su limpieza

- Ubicación: `prisma/seed.ts:586-605`, bloque de ejecución del seed.
- Problema: la cadena de `.then()` repetía la decisión de modo demo y las validaciones de entorno ocurrían antes de entrar al `catch`; un error síncrono podía evitar la desconexión de Prisma. Además, el flujo principal mezclaba coordinación y promesas anidadas.
- Propuesta: centralizar el flujo en `runSeed`, calcular una vez `shouldSeedDemo`, usar `async/await` y desconectar en `finally`.
- Estado: aplicado. Los errores se registran, se establece `process.exitCode` y la desconexión queda en `finally`.

### [Importante] La función de datos demo ocultaba cientos de líneas de SQL dentro del flujo

- Ubicación: `prisma/seed.ts:260-562`, SQL de `seedDemoData`.
- Problema: el método mezclaba la preparación de pgcrypto, el SQL idempotente de catálogo/RRHH y la decisión de crear el contador demo. Esto dificulta que un desarrollador junior identifique el orden de ejecución y el punto donde termina cada responsabilidad.
- Propuesta: extraer el bloque SQL estático a `DEMO_DATA_SQL` y dejar `seedDemoData` como coordinador de pasos.
- Estado: aplicado. No se cambiaron tablas, consultas ni datos del seed.

### [Importante] El fallback HTML del correo inserta el texto sin escapar

- Ubicación: `src/lib/mail.ts:39-45`, `sendMail`.
- Problema: cuando no se proporciona `html`, se construye `<pre>${input.text}</pre>`. Texto con etiquetas HTML se enviaría como marcado en el cliente de correo, lo que puede alterar la presentación o activar contenido no deseado.
- Propuesta: escapar al menos `&`, `<`, `>`, `"` y `'` antes de interpolar el texto, o construir el mensaje HTML mediante una plantilla segura.
- Estado: diferido. Es un cambio de salida visible del correo y requiere confirmar la política de plantillas; no se alteró comportamiento intencional durante esta revisión.

### [Importante] `businessCalendarRange` delega rangos inválidos a PostgreSQL

- Ubicación: `src/shared/business-time.ts:140-156`, `businessCalendarRange`.
- Problema: el helper recibe `year` y `month` tipados como `number`, pero no comprueba enteros ni el rango 1-12 antes de construir `make_timestamp`. El contrato interno depende de que todos los llamadores hayan validado esos valores.
- Propuesta: validar al inicio año entero válido y, cuando exista, mes entero entre 1 y 12; fallar con un error claro antes de consultar la base de datos.
- Estado: diferido. Cambiaría el tipo y el error observable de entradas inválidas; conviene acordarlo junto con el contrato de los servicios consumidores.

### [Menor] La tasa de IVA y algunos valores de infraestructura podrían centralizarse mejor

- Ubicación: `src/shared/tax.ts:9-10`, `src/shared/business-time.ts:146-153` y `src/lib/mail.ts:28-32`.
- Problema: la tasa está correctamente nombrada, pero los intervalos SQL (`"1 year"`, `"1 month"`), el puerto SMTP 587 y el puerto seguro 465 siguen siendo literales con significado operativo.
- Propuesta: extraer únicamente los valores que tengan una política compartida a constantes descriptivas, sin crear una nueva capa o catálogo.

### [Menor] Los logs operativos usan `console` porque no existe un logger dedicado en el alcance

- Ubicación: `src/shared/transaction-retry.ts:84-90`, `src/lib/mail.ts:20-25` y mensajes operativos de `prisma/seed.ts`.
- Problema: los eventos son estructurados o identificados por prefijo, pero no existe un adaptador/logger oficial en `src/shared`, `src/lib` o `src/config` que pueda sustituirlos sin introducir una dependencia o cambiar la infraestructura.
- Propuesta: definir o adoptar el logger oficial del proyecto en una tarea separada y migrar estos eventos conservando sus campos; no es necesario para el refactor seguro actual.

## Lo que está bien

- Las entradas compartidas usan esquemas Zod estrictos y límites explícitos para paginación y decimales.
- Las consultas SQL dinámicas usan `Prisma.sql` y parámetros, sin concatenar valores de entrada.
- Las transacciones de negocio tienen reintentos acotados, timeout, espera máxima y solo repiten errores transitorios conocidos.
- Las cookies separan sesión administrativa y de tienda por nombres, rutas y prefijos criptográficos.
- Los errores de aplicación tienen una jerarquía común con código y estado HTTP.
- Los archivos revisados cuentan con JSDoc/TSDoc en español para los contratos públicos y las reglas no obvias.

## Siguientes pasos

- Acordar y aplicar una política segura para el HTML de los correos, con pruebas de caracteres escapados.
- Definir el contrato de validación de `businessCalendarRange` y cubrir año/mes inválidos antes de consultar PostgreSQL.
- Incorporar el logger oficial, si el proyecto lo adopta, y migrar los eventos operativos sin registrar secretos ni tokens.
- Ejecutar `npm test` fuera de este sandbox o ajustar la política del entorno para permitir el proceso auxiliar que Vite necesita.

## ✅ Cumplimiento de Estándares

### Principios de Calidad Aplicados

- [x] Validación fail-secure de claims JWT y formato CSRF.
- [x] Transacción Prisma para la siembra de referencias.
- [x] Manejo centralizado del error del entrypoint del seed y desconexión en `finally`.
- [x] Reintentos limitados y valores operativos con constantes descriptivas.
- [x] Pruebas de regresión para los rechazos de JWT y CSRF.

### Documentación Agregada/Actualizada

- [x] JSDoc en las funciones nuevas o reorganizadas del seed.
- [x] Comentarios inline en español únicamente para explicar decisiones no obvias.
- [x] Informe de revisión con ubicación, problema, propuesta y estado de aplicación.

## Estado de aplicación

- [Importante] JWT sin validación de claims: **APLICÓ**, porque validar la forma del token conserva los tokens válidos y rechaza entradas incompatibles.
- [Importante] CSRF con segmentos adicionales: **APLICÓ**, porque exigir el formato emitido elimina una aceptación ambigua sin cambiar tokens válidos.
- [Importante] Seed de referencias sin atomicidad: **APLICÓ**, porque la transacción evita persistencia parcial y mantiene el resultado exitoso.
- [Importante] Flujo del seed con promesas encadenadas: **APLICÓ**, porque `async/await` conserva el orden y garantiza la desconexión ante errores.
- [Importante] SQL demo dentro de una función extensa: **APLICÓ**, porque extraer el SQL estático no cambia sus consultas ni sus datos.
- [Importante] HTML de correo sin escapar: **DIFIRIÓ**, porque requiere decidir y probar un cambio de salida de correo.
- [Importante] Rango calendario sin validación local: **DIFIRIÓ**, porque requiere acordar el contrato de error para entradas inválidas.
- [Importante] Redondeo decimal para entradas numéricas: **APLICÓ**, porque se restauró la aplicación de `round: true` a números ya convertidos y se conserva el contrato esperado por el esquema de consulta pública.
