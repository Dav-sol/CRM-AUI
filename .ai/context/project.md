# Project Context

## Proyecto

Automatize It Platform.

Plataforma modular para automatizar procesos comerciales y de postventa.

La primera implementación está orientada a Baterías del Caribe, pero la arquitectura debe permitir evolucionar hacia otras empresas.

## Estado verificado

- API construida con NestJS.
- Prisma utilizado como ORM.
- PostgreSQL como base de datos objetivo.
- La aplicación API arranca correctamente.
- Existe endpoint `/health`.
- El endpoint health fue verificado y devuelve `status: ok`.
- `nest build` fue ejecutado sin errores visibles.
- Existe infraestructura transversal bajo `apps/api/src/core`.
- Existe módulo `health` bajo `apps/api/src/modules`.
- Existen entidades de dominio en Prisma.
- Existe una migración para las entidades de dominio.
- Los módulos de negocio todavía no están implementados bajo `apps/api/src/modules`.

## Estructura funcional prevista

- Dashboard
- Clientes
- Compras
- Importador
- Automatizaciones
- Campañas
- Conversaciones
- Reportes
- Usuarios
- Configuración
- Auditoría

## Roadmap

### v1

- Clientes
- Compras
- Importador
- Automatizaciones
- WhatsApp
- Dashboard

### v2

- IA
- Integraciones ERP
- API pública
- Email
- SMS

### v3

- Marketplace
- Plugins
- Multiempresa avanzada
- Multiidioma

## Regla de desarrollo

No implementar módulos de negocio nuevos por intuición.

Secuencia:

Contrato -> inspección -> contradicciones -> decisión -> implementación -> pruebas -> revisión -> documentación.

## Estado

Este archivo describe hechos confirmados. Las decisiones todavía no cerradas deben permanecer marcadas como `PENDIENTE`.
