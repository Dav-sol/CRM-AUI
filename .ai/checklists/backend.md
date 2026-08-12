# Backend Checklist

## Arquitectura

- [ ] El módulo tiene responsabilidad clara.
- [ ] No existe lógica de negocio innecesariamente en controllers.
- [ ] No existen dependencias circulares innecesarias.
- [ ] Se respeta la separación entre core y modules.

## API

- [ ] Existe contrato OpenAPI.
- [ ] HTTP methods y paths están definidos.
- [ ] DTOs están definidos.
- [ ] Request validation está implementada.
- [ ] Respuestas están normalizadas.
- [ ] Errores están normalizados.
- [ ] Swagger refleja la implementación real.

## Seguridad

- [ ] Autenticación aplicada.
- [ ] Autorización aplicada.
- [ ] Roles definidos.aciones revisadas.
- [ ] Constraints revisados.
- [ ] Índices revisados cuando sean necesarios.
- [ ] Migración creada cuando corresponda.
- [ ] No se altera producción manualmente para cambios versionables.

## Dominio

- [ ] Reglas de negocio explícitas.
- [ ] Casos inválidos controlados.
- [ ] Idempotencia considerada cuando corresponda.
- [ ] Soft delete considerado cuando corresponda.
- [ ] Auditoría considerada cuando corresponda.

## Tests

- [ ] Casos exitosos.
- [ ] Casos de validación.
- [ ] Casos de autorización.
- [ ] Casos de tenant isolation.
- [ ] Casos de error.
- [ ] Tests de integración cuando sean necesarios.

## Verificación final

- [ ] `nest build`
- [ ] Tests relevantes
- [ ] `git diff`
- [ ] `git status`
- [ ] Documentación actualizada
