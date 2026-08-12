# Review Checklist

## Contrato

- [ ] La implementación corresponde al contrato funcional.
- [ ] La implementación corresponde a OpenAPI.
- [ ] No existen endpoints inventados.
- [ ] No existen reglas de negocio inventadas.

## Arquitectura

- [ ] El cambio respeta la arquitectura modular.
- [ ] Core y dominio permanecen separados.
- [ ] No se introdujo acoplamiento innecesario.

## Multiempresa

- [ ] Organization/tenant está correctamente considerado.
- [ ] Las consultas están aisladas por organización.
- [ ] Las relaciones no permiten fuga de datos.
- [ ] Los jobs/background processes respetan tenant isolation.

## Seguridad

- [ ] Autenticación.
- [ ] Autorización.
- [ ] Validación.
- [ ] Manejo de errores.
- [ ] Auditoría cuando corresponda.

## Persistencia

- [ ] Prisma schema revisado.
- [ ] Relaciones revisadas.
- [ ] Constraints revisados.
- [ ] Migraciones revisadas.
- [ ] No existe pérdida accidental de datos.

## Calidad

- [ ] Build pasa.
- [ ] Tests relevantes pasan.
- [ ] No existen archivos vacíos innecesarios.
- [ ] No existen imports muertos.
- [ ] No existe código temporal sin marcar.
- [ ] No existen TODO críticos sin documentar.

## Git

- [ ] `git status --short`
- [ ] `git diff --stat`
- [ ] `git diff`
- [ ] Los archivos modificados son intencionales.
- [ ] Los archivos nuevos son intencionales.

## Documentación

- [ ] `.ai` actualizado si cambió una decisión.
- [ ] OpenAPI actualizado si cambió la API.
- [ ] README/documentación actualizada si cambió el flujo.

## Decisiones pendientes

Si existe una decisión crítica pendiente:

- [ ] Está marcada como `PENDIENTE`.
- [ ] No se implementó una suposición como si fuera una decisión.
