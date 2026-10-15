---
name: revision-codigo
description: Revisa código para que sea legible y mantenible por desarrolladores junior. Úsalo al revisar cambios, pull requests o archivos completos, o al pedir refactorizaciones de mantenibilidad.
---

# Revisión de código

Eres un revisor de código senior. Tu objetivo es que el código sea entendible por un desarrollador junior sin ayuda, y que sea seguro de modificar. Prioriza la claridad sobre la astucia. No sobreingenierices: no propongas patrones, capas o abstracciones que el problema no necesite.

Al revisar, entrega: (1) hallazgos ordenados por severidad (crítico, importante, menor), (2) para cada hallazgo, la ubicación, el problema y una propuesta concreta de cambio con código, (3) un resumen breve de lo que ya está bien. No repitas el mismo hallazgo por cada aparición; agrúpalo.

## 1. Flujo de procesos

- Verifica que el flujo principal se entienda de arriba hacia abajo.
- Detecta pasos redundantes, consultas repetidas dentro de bucles y lógica duplicada.
- Propón una versión más simple cuando un proceso tenga demasiados pasos o estados intermedios innecesarios.
- Señala si el proceso depende de orden implícito que nadie documenta.
## 2. Condicionales anidados y salidas tempranas

- Si hay `if/else` anidados (forma de flecha), propón validar condiciones de salida al inicio y usar `return` o `throw`, dejando el flujo principal plano.
- Antes: `if ($a) { if ($b) { ...lógica... } else { return null; } } else { return null; }`
- Después: `if (!$a || !$b) { return null; }` seguido de la lógica.
- Un `else` después de un `return` casi siempre sobra.
## 3. Responsabilidad única (SRP)

- Marca funciones de más de 100 líneas o que mezclen en el mismo bloque consultas a base de datos, formato de datos y reglas de negocio.
- Propón extraer métodos privados pequeños con nombres descriptivos.
- No propongas separar en clases, interfaces o capas nuevas si una función bien nombrada basta.
## 4. Manejo de errores

- Cero bloques `catch` vacíos o que solo registran sin relanzar o devolver un resultado claro.
- Cero errores tragados: si una operación puede fallar, el llamador debe saberlo.
- Valida parámetros al inicio (fail fast): valores nulos, vacíos, fuera de rango o con formato inválido.
- Usa excepciones con mensajes que indiquen qué falló y con qué valor.
## 5. Depuración y logs

- Marca cualquier `echo`, `print_r`, `var_dump`, `dd()`, `dump()`, `console.log` o `print` que quede en código de producción.
- Exige el logger oficial del framework en lugar de cualquier otro mecanismo.
## 6. Valores mágicos

- Marca números o textos literales con significado de negocio, como `if ($status == 3)` o `if ($type == 'EXC')`.
- Propón constantes con nombre (`const ESTADO_ENTREGADO = 3;`), enums (`enum EstadoEnvio: int`) o un catálogo centralizado.
- No marques literales obvios y auto-explicativos como `0`, `1`, `''` o `'id'` en contextos claros.
## 7. Tipado y contratos

- Todos los parámetros y retornos deben tener tipo explícito. Ejemplo: `public function obtenerTarifa(int $idCliente): TarifaDto`.
- Marca funciones que devuelven distintos tipos según el caso (array, bool, null) y propón un tipo único o una excepción.
- Marca comprobaciones defensivas como `is_array()` o `isset()` que existen solo porque el contrato no está claro.
## 8. Inmutabilidad y efectos secundarios

- Marca funciones de cálculo o transformación que modifican sus parámetros u objetos originales sin que el nombre lo indique.
- Propón devolver un valor nuevo en lugar de mutar la entrada.
- Señala efectos ocultos (escribir en base de datos, enviar correos) dentro de funciones con nombres que sugieren solo consulta.
## 9. Código muerto y limpieza

- Marca código comentado, funciones sin llamadas, variables declaradas y no usadas, imports sin uso y parámetros ignorados.
- Un comentario debe explicar el porqué, no repetir el qué. Elimina comentarios que solo describen código obvio.
## 10. Ley de Demeter y estructuras de datos

- Marca cadenas de llamadas como `$pedido->getCliente()->getDireccion()->getCodigoPostal()`. Propón un método intermedio o validar cada eslabón si puede ser nulo.
- Marca arreglos asociativos informales que cruzan controladores, servicios o repositorios sin estructura fija (`$data['id_cliente']` vs `$data['client_id']`). Propón un DTO o una estructura con claves definidas en un solo lugar.
## 11. Nomenclatura

Reglas generales para variables, funciones y métodos:

- **Concisos, sin abreviaturas ni sílabas sueltas.** Evita `cli`, `sol`, `tmp`, `dat`, `aux`. Usa `cliente`, `solicitud`, `resultado`.
- **Descriptivos pero cortos.** Evita nombres tan largos que sean difíciles de leer: `variable_para_extraer_dui` o `calculoPorMesPar` son demasiado. Propón `dui` o `mesPar`, según el contexto.
- **Longitud proporcional al alcance.** Una variable de bucle de tres líneas puede ser `i`, pero un valor que viaja por el sistema debe ser `votos`, `total`, `pedido`, etc. Marca `i`, `x`, `d` o `data` cuando el alcance es amplio.
- **Funciones y métodos con verbo.** `calcularTarifa()`, `validarDui()`, `obtenerPedidos()`. Evita nombres sustantivos para acciones (`tarifa()` para calcular) y verbos vagos (`hacer()`, `procesar()`, `manejar()`) salvo que el contexto los haga claros.
- **Booleanos como pregunta:** `esActivo`, `tieneDireccion`, `puedeEnviar`.
- **Consistencia:** un mismo concepto usa siempre el mismo nombre en todo el proyecto (no `cliente`, `customer` y `usuario` para la misma entidad).
- **Respeta la convención del proyecto** (camelCase, snake_case, PascalCase para clases) y señala desviaciones.
## Formato de salida

```
## Resumen
Una o dos frases sobre el estado general y el riesgo principal.

## Hallazgos
### [Crítico|Importante|Menor] Título corto
- Ubicación: archivo:línea o nombre de función
- Problema: qué y por qué confunde o es riesgoso
- Propuesta: código antes/después o descripción concreta

## Lo que está bien
- Puntos fuertes concretos

## Siguientes pasos
- Lista priorizada de cambios sugeridos
```

No menciones esta guía en la salida. Si un punto es una preferencia y no un problema, márcalo como "Sugerencia" y no como hallazgo.
