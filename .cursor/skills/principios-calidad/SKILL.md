---
name: principios-calidad
description: "Estándar de calidad con 100 criterios de arquitectura, validación, seguridad, transacciones, recuperación, verificación y telemetría. Aplica al diseñar, escribir, revisar o auditar cualquier código del proyecto."
license: MIT
---

# Estándar de Calidad para el Proyecto

## Aplicación en este stack

Este estándar aplica a todo el código del proyecto:

- **Backend API:** Node.js 22 + Express 5 + Prisma 6 + TypeScript/JavaScript
- **Base de datos:** PostgreSQL vía Prisma ORM
- **Validación:** Zod
- **Seguridad:** Helmet, bcryptjs, JWT, rate-limiting

### Adaptación al stack TypeScript/Node.js

- **SOLID y patrones:** Aplicar usando clases TypeScript, interfaces y dependency injection cuando corresponda.
- **Validación:** Usar esquemas Zod para toda entrada (Zero Trust).
- **Transacciones:** Usar Prisma transactions (`$transaction`, `$queryRaw`, interactive transactions) para garantizar ACID.
- **Seguridad:** Aplicar helmet, CORS configurado, rate-limiting, hash de contraseñas con bcryptjs, JWT con expiración y rotación.
- **Telemetría:** Implementar logging estructurado (JSON), Correlation IDs en headers, métricas de tiempo de respuesta.
- **Excepciones:** Usar try/catch con manejo centralizado de errores en middleware Express.
- **Testing:** Verificar precondiciones/postcondiciones, integridad transaccional, y comportamiento determinista.

### Guía de lectura

Los 100 criterios están organizados en 7 familias:

1. **Arquitectura y Diseño** (1-15): SOLID, Clean Architecture, Hexagonal, inmutabilidad.
2. **Entrada y Validación** (16-30): Zero Trust, validación de tipos/formato/rango, sanitización.
3. **Seguridad y Zero Trust** (31-45): Autenticación, autorización RBAC, protección CSRF/XSS/SQL Injection, cifrado, secretos.
4. **Procesamiento y Estado** (46-60): Determinismo, ACID, idempotencia, concurrencia, excepciones, rollback.
5. **Decisión y Recuperación** (61-75): Decisiones deterministas, fail secure, circuit breaker, timeout, compensación.
6. **Verificación y Rendimiento** (76-90): Integridad, consistencia, precondiciones/postcondiciones, escalabilidad, trazabilidad.
7. **Telemetría y Observabilidad** (91-100): Logs estructurados, Correlation ID, auditoría, métricas, health checks, mejora continua.

Cada criterio incluye:
- **Título:** Nombre técnico del principio.
- **Alcance:** Fase del microproceso donde aplica (Objetivo, Entrada, Validación, Procesamiento, Decisión, Recuperación, Verificación, Telemetría).
- **Elementos de Calidad:** Variables/propiedades/métricas a verificar.
- **Restricciones:** Condiciones obligatorias y prohibiciones.
- **Fuentes:** Bibliografía técnica verificable.

---

# ESTÁNDAR DE CALIDAD PARA MICROPROCESOS DE SOFTWARE

**Versión:** 1.0

**Objetivo**

Definir un conjunto de principios de calidad aplicables a todos los microprocesos del proyecto, garantizando consistencia arquitectónica, seguridad, mantenibilidad, verificabilidad, rendimiento y observabilidad durante todo el ciclo de vida del software.

---

# NOMENCLATURA Y ESTRUCTURA DE LA NORMATIVA

Cada criterio sigue una estructura única e independiente para facilitar su integración en cualquier proceso del sistema.

## A. Título

Nombre técnico del criterio.

## B. Alcance

Microfase donde aplica.

- Objetivo
- Entrada
- Validación
- Procesamiento
- Decisión
- Recuperación
- Verificación
- Telemetría

## C. Elementos de Calidad

Variables, propiedades o métricas que deben verificarse.

## D. Restricciones

Condiciones obligatorias y prohibiciones del criterio.

## E. Fuentes

Bibliografía técnica verificable.

---

# LÓGICA DE ALGORITMIA

A. Objetivo

B. Entrada (Zero Trust)

C. Validación

D. Procesamiento

E. Decisión

F. Recuperación

G. Verificación

H. Telemetría

---

# FAMILIA 1
# ARQUITECTURA Y DISEÑO

## 1

### A. Título

Single Responsibility Principle (SRP)

### B. Alcance

Objetivo

### C. Elementos de Calidad

- Cohesión funcional.
- Responsabilidad única.
- Entrada única.
- Salida determinista.

### D. Restricciones

Se prohíbe que un microproceso implemente más de una responsabilidad funcional.

### E. Fuentes

Robert C. Martin.
Clean Architecture.
Prentice Hall.
2017.

---

## 2

### A. Título

Open/Closed Principle (OCP)

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Extensibilidad.
- Bajo acoplamiento.
- Interfaces estables.

### D. Restricciones

Las modificaciones no deben alterar el comportamiento previamente validado.

### E. Fuentes

Robert C. Martin.
Agile Software Development, Principles, Patterns and Practices.
2002.

---

## 3

### A. Título

Liskov Substitution Principle (LSP)

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Sustitución segura.
- Contratos compatibles.
- Herencia consistente.

### D. Restricciones

Toda implementación derivada debe preservar el comportamiento esperado.

### E. Fuentes

Barbara Liskov.
Data Abstraction and Hierarchy.
OOPSLA.
1987.

---

## 4

### A. Título

Interface Segregation Principle (ISP)

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Interfaces pequeñas.
- Bajo acoplamiento.
- Cohesión.

### D. Restricciones

Se prohíben interfaces con métodos innecesarios para un consumidor.

### E. Fuentes

Robert C. Martin.
Agile Software Development.
2002.

---

## 5

### A. Título

Dependency Inversion Principle (DIP)

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Inversión de dependencias.
- Abstracciones.
- Desacoplamiento.

### D. Restricciones

Las dependencias concretas no deberán ser utilizadas directamente por el dominio.

### E. Fuentes

Robert C. Martin.
Clean Architecture.
2017.

---

## 6

### A. Título

Alta Cohesión

### B. Alcance

Objetivo

### C. Elementos de Calidad

- Función única.
- Consistencia.
- Claridad funcional.

### D. Restricciones

No combinar múltiples objetivos en un mismo microproceso.

### E. Fuentes

Larry Constantine.
Structured Design.
1979.

---

## 7

### A. Título

Bajo Acoplamiento

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Independencia.
- Modularidad.
- Reutilización.

### D. Restricciones

Los módulos no deberán depender del estado interno de otros módulos.

### E. Fuentes

Glenford Myers.
Composite/Structured Design.
1978.

---

## 8

### A. Título

Separación de Responsabilidades (Separation of Concerns)

### B. Alcance

Objetivo

### C. Elementos de Calidad

- Modularidad.
- Independencia funcional.
- Organización lógica.

### D. Restricciones

Las responsabilidades de validación, negocio y persistencia deben permanecer aisladas.

### E. Fuentes

Edsger W. Dijkstra.
On the role of scientific thought.
1974.

---

## 9

### A. Título

Arquitectura por Capas

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Presentación.
- Dominio.
- Persistencia.
- Infraestructura.

### D. Restricciones

Se prohíbe el acceso directo entre capas no adyacentes.

### E. Fuentes

Martin Fowler.
Patterns of Enterprise Application Architecture.
2002.

---

## 10

### A. Título

Clean Architecture

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Independencia tecnológica.
- Independencia del framework.
- Independencia de la base de datos.

### D. Restricciones

Las reglas de negocio nunca dependerán de tecnologías externas.

### E. Fuentes

Robert C. Martin.
Clean Architecture.
2017.

## 11

### A. Título

Arquitectura Hexagonal (Ports and Adapters)

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Puertos de entrada definidos.
- Puertos de salida definidos.
- Adaptadores independientes.
- Dominio desacoplado.

### D. Restricciones

La lógica de negocio no podrá depender directamente de bases de datos, interfaces gráficas o frameworks.

### E. Fuentes

Alistair Cockburn.
Hexagonal Architecture.
2005.

---

## 12

### A. Título

Inmutabilidad de Datos

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Objetos inmutables.
- Estado consistente.
- Ausencia de efectos colaterales.

### D. Restricciones

Los datos críticos no deberán modificarse una vez validados.

### E. Fuentes

Joshua Bloch.
Effective Java.
Third Edition.
2018.

---

## 13

### A. Título

Inversión del Flujo de Control

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Control desacoplado.
- Dependencias abstractas.
- Modularidad.

### D. Restricciones

El flujo de ejecución no deberá depender de implementaciones concretas.

### E. Fuentes

Erich Gamma et al.
Design Patterns.
1994.

---

## 14

### A. Título

Diseño por Contrato (Design by Contract)

### B. Alcance

Validación

### C. Elementos de Calidad

- Precondiciones.
- Postcondiciones.
- Invariantes.
- Contratos verificables.

### D. Restricciones

No ejecutar procesamiento cuando las precondiciones no se cumplen.

### E. Fuentes

Bertrand Meyer.
Object-Oriented Software Construction.
1988.

---

## 15

### A. Título

Determinismo Arquitectónico

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Misma entrada.
- Misma salida.
- Estado controlado.
- Ejecución repetible.

### D. Restricciones

Se prohíbe depender de variables globales, aleatoriedad o estados compartidos.

### E. Fuentes

Leslie Lamport.
Time, Clocks, and the Ordering of Events in a Distributed System.
1978.

---

# FAMILIA 2

# ENTRADA Y VALIDACIÓN

---

## 16

### A. Título

Modelo Zero Trust

### B. Alcance

Entrada

### C. Elementos de Calidad

- Usuario.
- Parámetros.
- Encabezados.
- Cookies.
- Tokens.

### D. Restricciones

Toda entrada será considerada no confiable hasta completar su validación.

### E. Fuentes

NIST SP 800-207.
Zero Trust Architecture.
2020.

---

## 17

### A. Título

Validación de Tipo de Datos

### B. Alcance

Validación

### C. Elementos de Calidad

- Tipo primitivo.
- Tipo compuesto.
- Conversión segura.

### D. Restricciones

No realizar conversiones implícitas inseguras.

### E. Fuentes

ISO/IEC 25010.
Systems and Software Quality Models.
2011.

---

## 18

### A. Título

Validación de Longitud

### B. Alcance

Validación

### C. Elementos de Calidad

- Longitud mínima.
- Longitud máxima.
- Tamaño permitido.

### D. Restricciones

Rechazar entradas fuera del rango establecido.

### E. Fuentes

OWASP ASVS 5.0.

---

## 19

### A. Título

Normalización Unicode

### B. Alcance

Validación

### C. Elementos de Calidad

- UTF-8.
- NFC.
- NFD.

### D. Restricciones

No procesar cadenas con codificaciones ambiguas.

### E. Fuentes

Unicode Standard.
Version 16.

---

## 20

### A. Título

Canonicalización

### B. Alcance

Validación

### C. Elementos de Calidad

- Formato único.
- Comparación consistente.
- Eliminación de ambigüedad.

### D. Restricciones

Toda comparación deberá realizarse sobre datos canonicalizados.

### E. Fuentes

OWASP Developer Guide.

---

## 21

### A. Título

Validación mediante Lista Blanca (Whitelist)

### B. Alcance

Validación

### C. Elementos de Calidad

- Valores permitidos.
- Expresiones válidas.
- Rangos definidos.

### D. Restricciones

No aceptar entradas fuera de la lista permitida.

### E. Fuentes

OWASP Input Validation Cheat Sheet.

---

## 22

### A. Título

Sanitización de Entrada

### B. Alcance

Validación

### C. Elementos de Calidad

- Eliminación de caracteres peligrosos.
- Escape seguro.
- Normalización.

### D. Restricciones

Nunca almacenar datos sin sanitizar cuando corresponda.

### E. Fuentes

OWASP Cheat Sheet Series.

---

## 23

### A. Título

Validación de Valores Nulos

### B. Alcance

Validación

### C. Elementos de Calidad

- Null.
- Undefined.
- Vacíos.

### D. Restricciones

Se prohíbe procesar datos obligatorios nulos.

### E. Fuentes

ISO/IEC 25012.
Data Quality Model.

---

## 24

### A. Título

Integridad de Parámetros

### B. Alcance

Entrada

### C. Elementos de Calidad

- Parámetros completos.
- Orden consistente.
- Correspondencia.

### D. Restricciones

No admitir parámetros faltantes en operaciones críticas.

### E. Fuentes

RFC 9110.
HTTP Semantics.

---

## 25

### A. Título

Validación de Formato

### B. Alcance

Validación

### C. Elementos de Calidad

- Correo electrónico.
- UUID.
- Fecha.
- Teléfono.
- Identificadores.

### D. Restricciones

No procesar formatos inválidos.

### E. Fuentes

OWASP ASVS.

---

## 26

### A. Título

Validación de Rango

### B. Alcance

Validación

### C. Elementos de Calidad

- Valor mínimo.
- Valor máximo.
- Intervalo permitido.

### D. Restricciones

Rechazar valores fuera del dominio definido.

### E. Fuentes

ISO/IEC 25010.

---

## 27

### A. Título

Consistencia de Entrada

### B. Alcance

Validación

### C. Elementos de Calidad

- Correspondencia lógica.
- Coherencia.
- Integridad.

### D. Restricciones

No continuar cuando existan inconsistencias entre parámetros.

### E. Fuentes

ISO/IEC 25012.

---

## 28

### A. Título

Identificación Única de Solicitud

### B. Alcance

Entrada

### C. Elementos de Calidad

- Request ID.
- Correlation ID.
- Trazabilidad.

### D. Restricciones

Toda solicitud deberá poseer un identificador único.

### E. Fuentes

OpenTelemetry Specification.

---

## 29

### A. Título

Control de Idempotencia

### B. Alcance

Validación

### C. Elementos de Calidad

- Llave idempotente.
- Repetición segura.
- Consistencia.

### D. Restricciones

Una misma operación no deberá producir efectos duplicados.

### E. Fuentes

RFC 9110.
HTTP Semantics.

---

## 30

### A. Título

Prevalidación de Reglas de Negocio

### B. Alcance

Validación

### C. Elementos de Calidad

- Reglas mínimas.
- Consistencia funcional.
- Dependencias satisfechas.

### D. Restricciones

El procesamiento no iniciará hasta validar todas las reglas obligatorias.

### E. Fuentes

Bertrand Meyer.
Object-Oriented Software Construction.
1988.

# FAMILIA 3

# SEGURIDAD Y ZERO TRUST

---

## 31

### A. Título

Autenticación Robusta

### B. Alcance

Validación

### C. Elementos de Calidad

- Identidad verificable.
- Credenciales válidas.
- Mecanismo de autenticación.
- Estado autenticado.

### D. Restricciones

Se prohíbe autenticar usuarios utilizando credenciales en texto plano o mecanismos inseguros.

### E. Fuentes

NIST SP 800-63B.
Digital Identity Guidelines.
2023.

---

## 32

### A. Título

Autorización por Mínimo Privilegio

### B. Alcance

Decisión

### C. Elementos de Calidad

- Roles.
- Permisos.
- Recursos.
- Acciones autorizadas.

### D. Restricciones

Ningún usuario podrá ejecutar operaciones fuera de los permisos asignados.

### E. Fuentes

NIST SP 800-53 Rev.5.

---

## 33

### A. Título

Control de Acceso Basado en Roles (RBAC)

### B. Alcance

Decisión

### C. Elementos de Calidad

- Rol.
- Permiso.
- Recurso.
- Jerarquía.

### D. Restricciones

Las autorizaciones deberán obtenerse únicamente mediante el modelo RBAC definido.

### E. Fuentes

ANSI INCITS 359-2012.
Role Based Access Control.

---

## 34

### A. Título

Hash Seguro de Credenciales

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Algoritmo resistente.
- Salt único.
- Coste configurable.

### D. Restricciones

Nunca almacenar contraseñas en texto plano ni con algoritmos obsoletos.

### E. Fuentes

OWASP Password Storage Cheat Sheet.

---

## 35

### A. Título

Protección contra Fuerza Bruta

### B. Alcance

Validación

### C. Elementos de Calidad

- Intentos.
- Bloqueo temporal.
- Retrasos progresivos.
- Registro de eventos.

### D. Restricciones

No permitir intentos ilimitados de autenticación.

### E. Fuentes

OWASP Authentication Cheat Sheet.

---

## 36

### A. Título

Protección CSRF

### B. Alcance

Validación

### C. Elementos de Calidad

- Token CSRF.
- Origen.
- Integridad.
- Expiración.

### D. Restricciones

Toda operación con cambio de estado deberá validar un token CSRF.

### E. Fuentes

OWASP Cross-Site Request Forgery Prevention Cheat Sheet.

---

## 37

### A. Título

Prevención de SQL Injection

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Consultas parametrizadas.
- Variables enlazadas.
- ORM seguro.

### D. Restricciones

Se prohíbe construir consultas SQL mediante concatenación de cadenas.

### E. Fuentes

OWASP SQL Injection Prevention Cheat Sheet.

---

## 38

### A. Título

Prevención de Cross Site Scripting (XSS)

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Escape de salida.
- Codificación.
- Sanitización.
- Contexto HTML.

### D. Restricciones

Nunca renderizar contenido proporcionado por el usuario sin codificación adecuada.

### E. Fuentes

OWASP Cross Site Scripting Prevention Cheat Sheet.

---

## 39

### A. Título

Protección de Sesiones

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Session ID.
- Expiración.
- Rotación.
- Invalidación.

### D. Restricciones

Las sesiones deberán regenerarse después de una autenticación exitosa.

### E. Fuentes

OWASP Session Management Cheat Sheet.

---

## 40

### A. Título

Gestión Segura de Cookies

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- HttpOnly.
- Secure.
- SameSite.
- Expiración.

### D. Restricciones

Las cookies de autenticación deberán utilizar atributos de seguridad.

### E. Fuentes

OWASP Session Management Cheat Sheet.

---

## 41

### A. Título

Cifrado de Información Sensible

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- AES.
- Claves.
- Integridad.
- Confidencialidad.

### D. Restricciones

La información sensible no deberá almacenarse sin cifrado cuando aplique.

### E. Fuentes

NIST FIPS 197.
Advanced Encryption Standard.

---

## 42

### A. Título

Protección de Secretos

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Variables de entorno.
- Gestor de secretos.
- Rotación.
- Acceso restringido.

### D. Restricciones

Se prohíbe almacenar secretos dentro del código fuente.

### E. Fuentes

OWASP Secrets Management Cheat Sheet.

---

## 43

### A. Título

Rate Limiting

### B. Alcance

Validación

### C. Elementos de Calidad

- Solicitudes por minuto.
- Ventana temporal.
- Umbral.
- Penalización.

### D. Restricciones

Toda API expuesta deberá limitar la frecuencia de solicitudes.

### E. Fuentes

OWASP API Security Top 10.

---

## 44

### A. Título

Registro Seguro de Eventos

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Usuario.
- Fecha.
- Acción.
- Resultado.
- Correlation ID.

### D. Restricciones

Los registros nunca deberán contener contraseñas, tokens ni información confidencial.

### E. Fuentes

OWASP Logging Cheat Sheet.

---

## 45

### A. Título

Principio de Defensa en Profundidad

### B. Alcance

Arquitectura

### C. Elementos de Calidad

- Capas de seguridad.
- Controles independientes.
- Redundancia.
- Aislamiento.

### D. Restricciones

No depender de un único mecanismo de protección.

### E. Fuentes

NIST SP 800-53 Rev.5.


# FAMILIA 4

# PROCESAMIENTO Y GESTIÓN DEL ESTADO

---

## 46

### A. Título

Procesamiento Determinista

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Misma entrada.
- Misma salida.
- Estado controlado.
- Ejecución repetible.

### D. Restricciones

Se prohíbe que factores externos alteren el resultado de un mismo procesamiento.

### E. Fuentes

Leslie Lamport.
Time, Clocks, and the Ordering of Events in a Distributed System.
1978.

---

## 47

### A. Título

Atomicidad de Operaciones

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Atomicidad.
- Confirmación (Commit).
- Reversión (Rollback).
- Integridad de datos.

### Indicadores

- 100% de las transacciones finalizan con COMMIT o ROLLBACK.
- 0 operaciones parcialmente persistidas.

### D. Restricciones

No se permitirá dejar operaciones parcialmente ejecutadas.

### E. Fuentes

Jim Gray.
Transaction Processing: Concepts and Techniques.
1992.

---

## 48

### A. Título

Consistencia Transaccional

### B. Alcance

Verificación

### C. Elementos de Calidad

- Integridad referencial.
- Restricciones.
- Estado válido.
- Consistencia lógica.

### D. Restricciones

Toda transacción deberá finalizar dejando la información consistente.

### E. Fuentes

Jim Gray.
Transaction Processing.
1992.

---

## 49

### A. Título

Aislamiento de Transacciones

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Lecturas consistentes.
- Bloqueos.
- Concurrencia.
- Serialización.

### D. Restricciones

Las transacciones concurrentes no deberán interferir entre sí.

### E. Fuentes

ISO/IEC 9075.
SQL Standard.

---

## 50

### A. Título

Durabilidad

### B. Alcance

Verificación

### C. Elementos de Calidad

- Persistencia.
- Confirmación.
- Recuperación.
- Registro.

### D. Restricciones

Una transacción confirmada no podrá perderse ante fallos posteriores.

### E. Fuentes

Jim Gray.
Transaction Processing.
1992.

---

## 51

### A. Título

Idempotencia Operacional

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Repetición segura.
- Resultado único.
- Control de duplicados.

### D. Restricciones

Ejecutar la misma operación múltiples veces no deberá modificar el resultado esperado.

### E. Fuentes

RFC 9110.
HTTP Semantics.

---

## 52

### A. Título

Control de Concurrencia

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Exclusión mutua.
- Sincronización.
- Bloqueos.
- Versionado.

### D. Restricciones

Se prohíbe el acceso concurrente que comprometa la integridad de los datos.

### E. Fuentes

Maurice Herlihy.
The Art of Multiprocessor Programming.
2020.

---

## 53

### A. Título

Gestión del Estado

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Estado inicial.
- Estado actual.
- Estado final.
- Transiciones válidas.

### D. Restricciones

Toda transición deberá encontrarse definida previamente.

### E. Fuentes

Martin Fowler.
Patterns of Enterprise Application Architecture.
2002.

---

## 54

### A. Título

Eliminación de Efectos Colaterales

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Independencia.
- Predictibilidad.
- Aislamiento.

### D. Restricciones

Un microproceso no podrá modificar estados ajenos a su responsabilidad.

### E. Fuentes

Robert C. Martin.
Clean Architecture.
2017.

---

## 55

### A. Título

Optimización Algorítmica

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Complejidad temporal.
- Complejidad espacial.
- Escalabilidad.

### D. Restricciones

Se evitarán algoritmos cuya complejidad sea innecesariamente elevada.

### E. Fuentes

Donald Knuth.
The Art of Computer Programming.

---

## 56

### A. Título

Uso Eficiente de Memoria

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Liberación.
- Reutilización.
- Consumo controlado.

### D. Restricciones

No mantener referencias innecesarias ni consumir memoria de forma indefinida.

### E. Fuentes

Brian Kernighan.
The Practice of Programming.
1999.

---

## 57

### A. Título

Procesamiento por Capas

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Presentación.
- Dominio.
- Persistencia.
- Infraestructura.

### D. Restricciones

Cada capa deberá procesar únicamente la responsabilidad asignada.

### E. Fuentes

Martin Fowler.
Patterns of Enterprise Application Architecture.
2002.

---

## 58

### A. Título

Control de Excepciones

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Captura.
- Clasificación.
- Recuperación.
- Registro.

### D. Restricciones

Se prohíbe ocultar excepciones críticas o ignorarlas silenciosamente.

### E. Fuentes

Joshua Bloch.
Effective Java.
2018.

---

## 59

### A. Título

Rollback Controlado

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Reversión.
- Estado consistente.
- Integridad.
- Confirmación.

### D. Restricciones

Ante un fallo crítico deberá restaurarse el último estado válido.

### E. Fuentes

Jim Gray.
Transaction Processing.
1992.

---

## 60

### A. Título

Procesamiento Independiente del Entorno

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Portabilidad.
- Configuración externa.
- Adaptabilidad.

### D. Restricciones

La lógica de negocio no dependerá de configuraciones específicas del entorno.

### E. Fuentes

ISO/IEC/IEEE 12207.
Software Life Cycle Processes.


# FAMILIA 5

# DECISIÓN Y RECUPERACIÓN

---

## 61

### A. Título

Decisión Determinista

### B. Alcance

Decisión

### C. Elementos de Calidad

- Condiciones explícitas.
- Resultado único.
- Flujo consistente.
- Reglas definidas.

### D. Restricciones

Una misma condición siempre deberá producir la misma decisión.

### E. Fuentes

Leslie Lamport.
Time, Clocks, and the Ordering of Events in a Distributed System.
1978.

---

## 62

### A. Título

Evaluación Explícita de Condiciones

### B. Alcance

Decisión

### C. Elementos de Calidad

- Condiciones booleanas.
- Comparaciones.
- Operadores lógicos.

### D. Restricciones

Se prohíben decisiones implícitas o ambiguas.

### E. Fuentes

Steve McConnell.
Code Complete.
2nd Edition.
2004.

---

## 63

### A. Título

Priorización de Reglas de Negocio

### B. Alcance

Decisión

### C. Elementos de Calidad

- Orden de evaluación.
- Prioridades.
- Dependencias.

### D. Restricciones

Las reglas críticas deberán evaluarse antes que las secundarias.

### E. Fuentes

Martin Fowler.
Analysis Patterns.
1996.

---

## 64

### A. Título

Fallo Seguro (Fail Secure)

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Estado protegido.
- Denegación segura.
- Integridad.

### D. Restricciones

Ante cualquier fallo el sistema deberá permanecer en un estado seguro.

### E. Fuentes

NIST SP 800-160.

---

## 65

### A. Título

Recuperación Controlada

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Restauración.
- Consistencia.
- Continuidad.

### D. Restricciones

Toda recuperación deberá preservar la integridad del sistema.

### E. Fuentes

ISO/IEC 27031.

---

## 66

### A. Título

Manejo Centralizado de Excepciones

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Clasificación.
- Registro.
- Respuesta uniforme.

### D. Restricciones

Se prohíbe manejar errores críticos de manera inconsistente entre módulos.

### E. Fuentes

Joshua Bloch.
Effective Java.
2018.

---

## 67

### A. Título

Mensajes de Error Controlados

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Claridad.
- Código de error.
- No divulgación.

### D. Restricciones

Nunca revelar información sensible mediante mensajes de error.

### E. Fuentes

OWASP Error Handling Cheat Sheet.

---

## 68

### A. Título

Registro de Incidentes

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Fecha.
- Usuario.
- Evento.
- Severidad.

### D. Restricciones

Todo incidente deberá registrarse antes de finalizar la recuperación.

### E. Fuentes

OWASP Logging Cheat Sheet.

---

## 69

### A. Título

Tiempo Máximo de Recuperación

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Tiempo.
- Disponibilidad.
- Continuidad.

### D. Restricciones

El tiempo de recuperación deberá cumplir los objetivos definidos por el sistema.

### E. Fuentes

ISO 22301.
Business Continuity Management.

---

## 70

### A. Título

Reintento Controlado

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Número máximo.
- Intervalo.
- Resultado.

### D. Restricciones

Los reintentos deberán ser limitados y registrados.

### E. Fuentes

Google.
Site Reliability Engineering.
2016.

---

## 71

### A. Título

Circuit Breaker

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Apertura.
- Cierre.
- Estado intermedio.
- Protección.

### D. Restricciones

No continuar enviando solicitudes a servicios en estado de fallo.

### E. Fuentes

Michael Nygard.
Release It!.
2018.

---

## 72

### A. Título

Timeout Controlado

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Tiempo límite.
- Cancelación.
- Liberación de recursos.

### D. Restricciones

Ningún proceso deberá esperar indefinidamente una respuesta.

### E. Fuentes

Google.
Site Reliability Engineering.
2016.

---

## 73

### A. Título

Degradación Elegante (Graceful Degradation)

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Funcionalidad mínima.
- Continuidad.
- Estabilidad.

### D. Restricciones

Cuando un componente falle, el resto del sistema deberá continuar operando cuando sea posible.

### E. Fuentes

Martin Fowler.
Patterns of Enterprise Application Architecture.
2002.

---

## 74

### A. Título

Compensación Transaccional

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Operación inversa.
- Consistencia.
- Integridad.

### D. Restricciones

Las operaciones distribuidas deberán disponer de un mecanismo de compensación.

### E. Fuentes

Chris Richardson.
Microservices Patterns.
2018.

---

## 75

### A. Título

Verificación Posterior a la Recuperación

### B. Alcance

Verificación

### C. Elementos de Calidad

- Estado válido.
- Integridad.
- Consistencia.
- Disponibilidad.

### D. Restricciones

No reanudar el procesamiento sin verificar la recuperación.

### E. Fuentes

ISO/IEC/IEEE 12207.
Software Life Cycle Processes.


---

# FAMILIA 6

# VERIFICACIÓN, CALIDAD Y RENDIMIENTO

---

## 76

### A. Título

Verificación de Integridad

### B. Alcance

Verificación

### C. Elementos de Calidad

- Integridad de datos.
- Integridad del proceso.
- Consistencia.
- Estado final válido.

### D. Restricciones

Todo microproceso deberá verificar la integridad de los datos antes de finalizar.

### E. Fuentes

ISO/IEC 25012.
Data Quality Model.
2008.

---

## 77

### A. Título

Consistencia del Estado Final

### B. Alcance

Verificación

### C. Elementos de Calidad

- Estado esperado.
- Persistencia.
- Coherencia.

### D. Restricciones

El proceso no podrá finalizar dejando estados inconsistentes.

### E. Fuentes

Jim Gray.
Transaction Processing.
1992.

---

## 78

### A. Título

Verificación de Precondiciones y Postcondiciones

### B. Alcance

Verificación

### C. Elementos de Calidad

- Precondiciones.
- Postcondiciones.
- Invariantes.

### D. Restricciones

Las postcondiciones deberán validarse antes de declarar exitoso un proceso.

### E. Fuentes

Bertrand Meyer.
Object-Oriented Software Construction.
1988.

---

## 79

### A. Título

Completitud del Proceso

### B. Alcance

Verificación

### C. Elementos de Calidad

- Todas las fases ejecutadas.
- Resultado completo.
- Flujo cerrado.

### D. Restricciones

No finalizar procesos parcialmente ejecutados.

### E. Fuentes

ISO/IEC/IEEE 12207.

---

## 80

### A. Título

Tiempo de Respuesta Controlado

### B. Alcance

Verificación

### C. Elementos de Calidad

- Tiempo promedio.
- Tiempo máximo.
- Latencia.

### D. Restricciones

El tiempo de ejecución deberá mantenerse dentro de los límites establecidos por el sistema.

### E. Fuentes

ISO/IEC 25010.

---

## 81

### A. Título

Eficiencia Computacional

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Uso de CPU.
- Uso de memoria.
- Operaciones ejecutadas.

### D. Restricciones

No implementar algoritmos innecesariamente costosos.

### E. Fuentes

Donald Knuth.
The Art of Computer Programming.

---

## 82

### A. Título

Escalabilidad

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Crecimiento horizontal.
- Crecimiento vertical.
- Rendimiento estable.

### D. Restricciones

El incremento de carga no deberá degradar desproporcionadamente el rendimiento.

### E. Fuentes

Martin L. Abbott.
The Art of Scalability.
2009.

---

## 83

### A. Título

Disponibilidad

### B. Alcance

Verificación

### C. Elementos de Calidad

- Tiempo activo.
- Continuidad.
- Servicio disponible.

### D. Restricciones

Los procesos críticos deberán maximizar la disponibilidad del servicio.

### E. Fuentes

ISO 22301.

---

## 84

### A. Título

Tolerancia a Fallos

### B. Alcance

Recuperación

### C. Elementos de Calidad

- Continuidad.
- Recuperación.
- Aislamiento.

### D. Restricciones

Un fallo individual no deberá comprometer la totalidad del sistema.

### E. Fuentes

Google.
Site Reliability Engineering.
2016.

---

## 85

### A. Título

Complejidad Algorítmica Controlada

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Complejidad temporal.
- Complejidad espacial.
- Escalabilidad.

### D. Restricciones

Se deberá justificar cualquier algoritmo con complejidad superior a O(n log n) cuando exista una alternativa más eficiente.

### E. Fuentes

Thomas H. Cormen.
Introduction to Algorithms.
4th Edition.
2022.

---

## 86

### A. Título

Reutilización

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Componentes reutilizables.
- Modularidad.
- Bajo acoplamiento.

### D. Restricciones

Se evitará duplicar lógica existente.

### E. Fuentes

Gamma et al.
Design Patterns.
1994.

---

## 87

### A. Título

Mantenibilidad

### B. Alcance

Procesamiento

### C. Elementos de Calidad

- Claridad.
- Modularidad.
- Legibilidad.
- Documentación.

### D. Restricciones

Las modificaciones futuras no deberán comprometer el funcionamiento existente.

### E. Fuentes

ISO/IEC 25010.

---

## 88

### A. Título

Verificabilidad

### B. Alcance

Verificación

### C. Elementos de Calidad

- Evidencia.
- Pruebas.
- Resultados medibles.

### D. Restricciones

Todo resultado deberá poder verificarse mediante evidencia objetiva.

### E. Fuentes

IEEE 730.
Software Quality Assurance Processes.

---

## 89

### A. Título

Trazabilidad de Resultados

### B. Alcance

Verificación

### C. Elementos de Calidad

- Origen.
- Proceso.
- Resultado.
- Evidencia.

### D. Restricciones

Todo resultado deberá ser trazable hasta su origen.

### E. Fuentes

ISO/IEC/IEEE 15288.

---

## 90

### A. Título

Validación Final del Microproceso

### B. Alcance

Verificación

### C. Elementos de Calidad

- Objetivo cumplido.
- Integridad.
- Consistencia.
- Evidencia.

### D. Restricciones

Ningún microproceso finalizará sin validar el cumplimiento de su objetivo.

### E. Fuentes

ISO/IEC/IEEE 12207.


---

# FAMILIA 7

# TELEMETRÍA, OBSERVABILIDAD Y AUDITORÍA

---

## 91

### A. Título

Telemetría Estructurada

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Eventos.
- Métricas.
- Estado.
- Tiempo.
- Contexto.

### D. Restricciones

Toda información registrada deberá seguir un formato estructurado y consistente.

### E. Fuentes

OpenTelemetry Specification.
Cloud Native Computing Foundation (CNCF).

---

## 92

### A. Título

Correlation ID

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Identificador único.
- Solicitud.
- Respuesta.
- Seguimiento.

### D. Restricciones

Cada operación deberá conservar el mismo Correlation ID durante todo el flujo del proceso.

### E. Fuentes

OpenTelemetry Specification.

---

## 93

### A. Título

Registro Cronológico de Eventos

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Timestamp.
- Orden.
- Secuencia.
- Precisión.

### D. Restricciones

Todos los eventos deberán registrarse cronológicamente utilizando una fuente de tiempo consistente.

### E. Fuentes

RFC 3339.
Date and Time on the Internet.

---

## 94

### A. Título

Auditoría de Operaciones

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Usuario.
- Acción.
- Resultado.
- Fecha.
- Recurso.

### D. Restricciones

Toda operación crítica deberá generar un registro de auditoría.

### E. Fuentes

OWASP Logging Cheat Sheet.

---

## 95

### A. Título

Métricas Operacionales

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Tiempo de respuesta.
- Errores.
- Solicitudes.
- Disponibilidad.

### D. Restricciones

Las métricas deberán obtenerse automáticamente y sin alterar el procesamiento.

### E. Fuentes

Google.
Site Reliability Engineering.
2016.

---

## 96

### A. Título

Monitoreo Continuo

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Disponibilidad.
- Latencia.
- Recursos.
- Incidentes.

### D. Restricciones

Los procesos críticos deberán permanecer monitorizados durante su ejecución.

### E. Fuentes

Google.
Site Reliability Engineering.
2016.

---

## 97

### A. Título

Health Checks

### B. Alcance

Verificación

### C. Elementos de Calidad

- Estado.
- Dependencias.
- Servicios.
- Disponibilidad.

### D. Restricciones

Todo servicio deberá exponer mecanismos verificables para comprobar su estado.

### E. Fuentes

Microsoft Azure Architecture Center.
Health Endpoint Monitoring Pattern.

---

## 98

### A. Título

Alertamiento Automatizado

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Umbral.
- Severidad.
- Destinatario.
- Notificación.

### D. Restricciones

Las alertas deberán generarse únicamente cuando se superen umbrales previamente definidos.

### E. Fuentes

Google.
Site Reliability Engineering.
2016.

---

## 99

### A. Título

Trazabilidad End-to-End

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Inicio.
- Procesamiento.
- Persistencia.
- Finalización.

### D. Restricciones

Toda operación deberá poder reconstruirse completamente a partir de la información registrada.

### E. Fuentes

OpenTelemetry Specification.

---

## 100

### A. Título

Mejora Continua Basada en Evidencia

### B. Alcance

Telemetría

### C. Elementos de Calidad

- Métricas.
- Incidentes.
- Tendencias.
- Indicadores.
- Retroalimentación.

### D. Restricciones

Las decisiones de mejora deberán fundamentarse en evidencia objetiva obtenida mediante métricas y auditorías.

### E. Fuentes

ISO 9001:2015.
Quality Management Systems.
