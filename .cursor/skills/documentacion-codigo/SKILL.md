---
name: documentacion-codigo
description: "Estándar de documentación de código para este proyecto (Node.js 22 + Express 5 + Prisma 6 + TypeScript). Aplica al escribir, revisar o completar documentación de código existente. No modifica lógica, solo agrega/actualiza comentarios JSDoc/TSDoc y comentarios inline."
license: MIT
---

# Documentación de Código del Proyecto

## Contexto del proyecto

- **Backend:** Node.js 22, Express 5, TypeScript 5.8, Prisma 6 (PostgreSQL)
- **Validación:** Zod
- **Autenticación:** JWT (jsonwebtoken), bcryptjs
- **Seguridad:** Helmet, CORS, express-rate-limit
- **Generación de documentos:** PDFKit, ExcelJS
- **Arquitectura:** API REST con capas separadas (routes, controllers, services, repositories/Prisma)

## Objetivo

Agregar/completar documentación siguiendo el estándar **oficial** JSDoc/TSDoc para TypeScript/JavaScript, sin alterar la lógica, firmas de función ni comportamiento existente.

## Reglas generales (aplican a todo el proyecto)

1. **No modificar lógica de negocio**, nombres de variables, firmas de métodos ni imports.
2. Si un bloque ya tiene documentación correcta, **verificarla y solo actualizar lo incompleto o desactualizado** — no borrar lo válido.
3. **No agregar comentarios redundantes** ("suma dos números" sobre una función `sum(a, b)`). Solo documentar lo que no es evidente por el nombre o la firma.
4. **Idioma de los comentarios:** español.
5. **Mantener el mismo estilo** de documentación en todos los archivos de un mismo tipo (consistencia de formato, orden de etiquetas, puntuación).
6. Al terminar cada archivo, **indicar en una línea qué se documentó** (no reescribir el archivo completo en la respuesta si no es necesario).

---

## Estándar TypeScript/JavaScript — JSDoc oficial (jsdoc.app) + TSDoc

### Encabezado de archivo (opcional)

Solo si el archivo agrupa lógica no evidente por su nombre, agregar un comentario al inicio explicando su propósito general.

```typescript
/**
 * Controladores de autenticación: login, logout, refresh token, registro de usuarios.
 */
```

### Funciones y métodos

Bloque JSDoc con:

- **Descripción concisa** de qué hace (una línea si es posible).
- `@param {tipo} nombre` — descripción breve de cada parámetro.
  - En TypeScript, si el tipo ya está en la firma, **no es necesario repetirlo entre llaves** en JSDoc. Puedes omitir `{tipo}` y solo escribir `@param nombre — descripción`.
- `@returns {tipo}` — qué devuelve y en qué casos.
  - Igual que `@param`, si TypeScript ya infiere el tipo, puedes omitir `{tipo}` y solo escribir `@returns descripción`.
- `@throws {ErrorClass}` — cuándo se lanza una excepción.
- Si el método participa en una transacción Prisma, idempotencia, o flujo crítico, **mencionarlo en una línea dentro de la descripción**.

**Ejemplo:**

```typescript
/**
 * Crea un nuevo usuario en la base de datos.
 * Se ejecuta dentro de una transacción Prisma para garantizar integridad con la asignación de roles.
 * 
 * @param userData - Datos validados del usuario (email, password, nombre, etc.)
 * @returns Usuario creado con su rol asignado
 * @throws {ConflictError} Si el email ya existe en la base de datos
 */
async function createUser(userData: CreateUserDTO): Promise<User> {
  // ...
}
```

### Hooks personalizados (si aplica en el futuro)

- Bloque JSDoc con descripción, `@param`, `@returns`, y `@throws` si corresponde.
- Documentar el propósito del hook, no solo su firma.

### Componentes React (si el proyecto incluye frontend React/Next.js)

- Bloque JSDoc arriba del componente describiendo su propósito y responsabilidad visual/funcional.
- Documentar props relevantes (las que no sean obvias por su nombre), no repetir la interfaz de tipos completa.

**Ejemplo:**

```typescript
/**
 * Modal de confirmación de eliminación.
 * Muestra un mensaje personalizado y ejecuta la acción al confirmar.
 * 
 * @param isOpen - Controla la visibilidad del modal
 * @param onConfirm - Callback ejecutado al confirmar la acción
 * @param message - Mensaje personalizado a mostrar (opcional)
 */
export function ConfirmDeleteModal({ isOpen, onConfirm, message }: ConfirmDeleteModalProps) {
  // ...
}
```

### Tipos e interfaces

Comentario breve arriba de cada `interface`/`type` no trivial explicando en qué contexto se usa.

**Ejemplo:**

```typescript
/**
 * DTO de entrada para crear un producto en el catálogo.
 * Validado con Zod antes de llegar al servicio.
 */
export interface CreateProductDTO {
  nombre: string;
  codigo: string;
  precio: number;
  categoriaId: number;
}
```

### Clases

- Descripción de una a dos líneas de su responsabilidad.
- Si implementa un patrón específico (Service, Repository, Singleton, etc.), mencionarlo.

**Ejemplo:**

```typescript
/**
 * Servicio de autenticación.
 * Implementa la lógica de negocio para login, logout, refresh token y registro.
 * Patrón: Service Layer.
 */
export class AuthService {
  // ...
}
```

### Propiedades de clase

Solo documentar si el nombre no es autoexplicativo.

```typescript
/**
 * Token JWT codificado en base64.
 */
private encodedToken: string;
```

---

## Comentarios inline (dentro del cuerpo del código)

- **Solo donde el código no se explica por sí mismo**: reglas de negocio no obvias, decisiones no evidentes, workarounds, restricciones de terceros.
- **Máximo una línea** por bloque de control (`if`, `for`, `while`, `switch`, `try/catch`).
- **Explicar el por qué, no el qué** (el código ya dice qué hace).

### Variables

Comentar solo si:
- El nombre no es descriptivo.
- El valor tiene un formato/unidad no evidente (montos en centavos, timestamps en UTC, códigos de estado numéricos).

**Ejemplo:**

```typescript
// Monto en centavos (no en unidades completas)
const totalAmount = 150000;

// Timestamp en UTC para consistencia con la API de pagos
const createdAt = new Date().toISOString();
```

### Bloques de control

Solo comentar si la lógica no es obvia.

**Ejemplo:**

```typescript
// Validar stock disponible antes de permitir la venta (regla de negocio crítica)
if (product.stock < quantity) {
  throw new InsufficientStockError();
}

// Aplicar descuento por volumen solo si supera el umbral configurado
if (quantity >= BULK_DISCOUNT_THRESHOLD) {
  price = applyBulkDiscount(price, quantity);
}
```

### No comentar líneas triviales

**Incorrecto:**

```typescript
i++; // incrementar contador
return result; // retornar resultado
```

**Correcto:**

```typescript
i++;
return result;
```

---

## Restricciones específicas del proyecto

1. **No introducir anotaciones de tipos JSDoc nuevas** si el proyecto usa TypeScript (los tipos ya están en el código).
2. **Mantener consistencia** con el resto del código base (si otros archivos usan un formato específico, seguirlo).
3. **No documentar archivos generados** por Prisma (`prisma/generated/`, `.prisma/client/`).
4. **No modificar migraciones de Prisma** ni archivos de configuración de terceros.

---

## Formato de entrega esperado por archivo

1. **Ruta del archivo.**
2. **Resumen de una línea** de qué se agregó o corrigió.
3. **Diff o código final** con la documentación aplicada (solo los bloques modificados, salvo que se pida el archivo completo).

---

## Ejemplos de aplicación

### Ejemplo 1: Controlador Express

**Antes:**

```typescript
export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body;
  const token = await authService.login(email, password);
  res.json({ token });
}
```

**Después:**

```typescript
/**
 * Controlador de inicio de sesión.
 * Valida credenciales y genera un token JWT.
 * 
 * @throws {UnauthorizedError} Si las credenciales son inválidas
 * @throws {ValidationError} Si el email o password están vacíos
 */
export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body;
  const token = await authService.login(email, password);
  res.json({ token });
}
```

### Ejemplo 2: Servicio con Prisma

**Antes:**

```typescript
export class ProductService {
  async createProduct(data: CreateProductDTO) {
    return await prisma.product.create({ data });
  }
}
```

**Después:**

```typescript
/**
 * Servicio de productos del catálogo.
 * Implementa la lógica de negocio para CRUD de productos.
 */
export class ProductService {
  /**
   * Crea un nuevo producto en el catálogo.
   * Se ejecuta dentro de una transacción implícita de Prisma.
   * 
   * @param data - Datos validados del producto (nombre, código, precio, categoría)
   * @returns Producto creado con su ID generado
   * @throws {ConflictError} Si el código de producto ya existe
   */
  async createProduct(data: CreateProductDTO): Promise<Product> {
    return await prisma.product.create({ data });
  }
}
```

### Ejemplo 3: Middleware

**Antes:**

```typescript
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw new UnauthorizedError();
  req.user = verifyToken(token);
  next();
}
```

**Después:**

```typescript
/**
 * Middleware de autenticación JWT.
 * Valida el token en el header Authorization y adjunta el usuario decodificado a `req.user`.
 * 
 * @throws {UnauthorizedError} Si el token no está presente, es inválido o ha expirado
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  
  // Rechazar solicitudes sin token (Zero Trust)
  if (!token) throw new UnauthorizedError('Token no proporcionado');
  
  req.user = verifyToken(token);
  next();
}
```

---

## Resumen

- **JSDoc/TSDoc** para funciones, clases, interfaces, tipos.
- **Comentarios inline** solo para explicar el **por qué**, no el **qué**.
- **Idioma:** español.
- **No modificar lógica**, solo agregar/actualizar documentación.
- **Consistencia** con el resto del proyecto.
