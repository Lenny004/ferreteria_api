# Guía para Agentes de IA

Este documento proporciona información clave para agentes de IA (Cursor, GitHub Copilot, etc.) que trabajen en este repositorio.

## 📋 Estándares del Proyecto

Todo agente que modifique código en este repositorio debe seguir dos estándares obligatorios:

### 1. Estándar de Calidad — 100 Criterios

**Ubicación:** [`.cursor/skills/principios-calidad/SKILL.md`](.cursor/skills/principios-calidad/SKILL.md)

Estándar con 100 criterios organizados en 7 familias:

1. **Arquitectura y Diseño** (1-15): SOLID, Clean Architecture, Hexagonal, inmutabilidad.
2. **Entrada y Validación** (16-30): Zero Trust, validación de tipos/formato/rango, sanitización con Zod.
3. **Seguridad y Zero Trust** (31-45): Autenticación JWT, autorización RBAC, hash bcryptjs, rate-limiting, protección CSRF/XSS/SQL Injection.
4. **Procesamiento y Estado** (46-60): Determinismo, transacciones ACID con Prisma, idempotencia, concurrencia, excepciones.
5. **Decisión y Recuperación** (61-75): Decisiones deterministas, fail secure, circuit breaker, timeout, compensación.
6. **Verificación y Rendimiento** (76-90): Integridad, precondiciones/postcondiciones, escalabilidad, trazabilidad.
7. **Telemetría y Observabilidad** (91-100): Logs estructurados, Correlation ID, auditoría, métricas, health checks.

**Cuándo aplicar:** Al diseñar, escribir, revisar o auditar cualquier código del proyecto.

### 2. Estándar de Documentación de Código

**Ubicación:** [`.cursor/skills/documentacion-codigo/SKILL.md`](.cursor/skills/documentacion-codigo/SKILL.md)

Reglas de documentación JSDoc/TSDoc para TypeScript/JavaScript:

- **JSDoc/TSDoc** para funciones, clases, interfaces, tipos.
- **Comentarios inline** solo para explicar el **por qué**, no el **qué**.
- **Idioma:** español.
- **No modificar lógica**, solo agregar/actualizar documentación.
- **Consistencia** con el resto del proyecto.

**Cuándo aplicar:** Al escribir, revisar o completar documentación de código existente.

## 🔍 Regla Siempre Activa

**Ubicación:** [`.cursor/rules/reglas-proyecto.mdc`](.cursor/rules/reglas-proyecto.mdc)

Esta regla (`alwaysApply: true`) obliga a:

1. Aplicar el Estándar de Calidad en todo cambio.
2. Documentar según el Estándar de Documentación.
3. Reportar cumplimiento en cada PR con una sección `## ✅ Cumplimiento de Estándares`.

## 🏗️ Arquitectura del Proyecto

- **Backend:** Node.js 22 + Express 5 + TypeScript 5.8
- **ORM:** Prisma 6 + PostgreSQL
- **Validación:** Zod
- **Autenticación:** JWT (jsonwebtoken), bcryptjs
- **Seguridad:** Helmet, CORS, express-rate-limit
- **Generación de documentos:** PDFKit, ExcelJS

### Estructura de Capas

```
src/
├── routes/         # Definición de rutas Express
├── controllers/    # Controladores HTTP (reciben req/res)
├── services/       # Lógica de negocio
├── repositories/   # Acceso a datos (Prisma)
├── middlewares/    # Middlewares Express (auth, validation, error handling)
├── validators/     # Esquemas Zod
├── types/          # Tipos e interfaces TypeScript
├── utils/          # Utilidades reutilizables
└── server.ts       # Punto de entrada de la aplicación
```

## 📝 Ejemplo de Cumplimiento en PR

Al crear o actualizar un PR, incluir en la descripción:

```markdown
## ✅ Cumplimiento de Estándares

### Principios de Calidad Aplicados
- [x] Validación de entrada con Zod (Zero Trust, criterios 16-30)
- [x] Transacción Prisma para garantizar atomicidad (criterio 47)
- [x] Manejo centralizado de excepciones (criterio 66)
- [x] Logging estructurado con Correlation ID (criterios 91-92)

### Documentación Agregada/Actualizada
- [x] JSDoc en todos los servicios modificados
- [x] Comentarios inline explicando reglas de negocio no obvias
- [x] Interfaces documentadas con contexto de uso
```

## 🚫 Excepciones

Los cambios en archivos generados automáticamente (Prisma Client, `node_modules/`, `dist/`, `build/`, etc.) no requieren documentación ni reporte de cumplimiento.

## 📚 Referencias Adicionales

- [PRINCIPIOS.md (original)](.cursor/skills/principios-calidad/SKILL.md) — Estándar completo de 100 criterios
- [DOCUMENTACION.md (original)](.cursor/skills/documentacion-codigo/SKILL.md) — Estándar completo de documentación
- [Regla del proyecto](.cursor/rules/reglas-proyecto.mdc) — Regla siempre activa

---

**Nota para agentes:** Antes de realizar cambios significativos, lee ambas skills para familiarizarte con los estándares del proyecto.
