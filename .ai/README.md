# AI Project Context — Automatize It Platform

Este directorio contiene el contexto operativo del proyecto.

No es documentación decorativa. Su propósito es servir como referencia antes de modificar arquitectura, API, backend o frontend.

## Orden de consulta

Antes de implementar un cambio:

1. Revisar `context/project.md`.
2. Revisar `context/business.md`.
3. Revisar `context/architecture.md`.
4. Revisar `context/api.md` cuando el cambio afecte la API.
5. Revisar el checklist correspondiente.
6. Inspeccionar el código existente.
7. Identificar contradicciones.
8. Decidir antes de implementar.
9. Implementar.
10. Ejecutar build/tests.
11. Revisar `git diff` y `git status`.
12. Actualizar documentación si cambió una decisión.

## Regla fundamental

No convertir una suposición en una regla de negocio.

Si una decisión no está definida, marcarla como `PENDIENTE` y resolverla antes de implementar la parte afectada.

## Fuente de verdad

La implementación debe mantenerse alineada con:

- documentación funcional del proyecto;
- contrato API/OpenAPI;
- modelo de datos Prisma;
- arquitectura definida;
- decisiones explícitas del proyecto.

Cuando existan contradicciones, detener el bloque afectado y resolverlas.

## Definition of Done

Un módulo no se considera terminado solamente porque compila.

Debe tener contrato, implementación, validación, seguridad, pruebas, documentación API cuando corresponda y revisión final del diff.
