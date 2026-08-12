# Architecture Context

## Arquitectura general

La plataforma utiliza una arquitectura modular.

La API está construida sobre NestJS.

Persistencia:

- PostgreSQL;
- Prisma ORM.

## Separación

### Core

`apps/api/src/core`

Contiene infraestructura transversal.

Actualmente existen componentes relacionados con:

- configuración;
- base de datos;
- filtros;
- interceptores;
- logger;
- pipes;
- Swagger.

### Modules

`apps/api/src/modules`

Cada módulo representa una capacidad funcional del sistema.

El módulo `health` existe como módulo técnico inicial.

Los módulos de negocio deben implementarse de forma independiente y con responsabilidades claras.

## Principios

### Modularidad

Cada capacidad de negocio debe poder evolucionar sin acoplarse innecesariamente a otros módulos.

### Alta cohesión

La lógica relacionada con una capacidad debe permanecer agrupada.

### Bajo acoplamiento

Evitar dependencias directas innecesarias entre módulos.

### Dominio

Las reglas de negocio no deben quedar accidentalmente mezcladas con detalles de transporte HTTP o persistencia.

### Persistencia

Prisma representa el modelo persistente y sus relaciones.

No usar Prisma como sustituto de reglas de negocio.

### Multiempresa

`Organization` representa actualmente el tenant raíz del dominio.

PENDIENTE:

Definir formalmente la estrategia de tenant isolation para:

- consultas;
- creación;
- actualización;
- eliminación lógica;
- relaciones;
- permisos;
- jobs;
- importaciones;
- conversaciones;
- auditoría.

### Organization

El modelo actualmente contiene:

- id;
- uuid;
- name;
- slug;
- nit;
- email;
- phone;
- city;
- status;
- createdAt;
- updatedAt;
- deletedAt.

También mantiene relaciones con múltiples entidades de dominio.

## Seguridad

La arquitectura debe contemplar:

- autenticación;
- autorización;
- validación;
- aislamiento por organización;
- manejo centralizado de errores;
- auditoría.

PENDIENTE:

Definir completamente autorización por rol.

## Migraciones

Los cambios estructurales de base de datos deben quedar representados mediante migraciones versionadas.

No modificar manualmente producción para resolver cambios que deban pertenecer al historial de migraciones.

## Definition of Done arquitectónico

Antes de considerar terminado un módulo:

- estructura modular clara;
- responsabilidades claras;
- DTOs;
- validación;
- autorización;
- tenant isolation;
- pruebas;
- migración cuando corresponda;
- documentación API;
- build;
- revisión de diff.

## Regla

No crear archivos vacíos como placeholders sin una razón documentada.
