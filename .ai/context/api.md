# API Context

## Contrato API

La API debe mantenerse alineada con OpenAPI.

La especificación vive bajo:

`specs/api`

## Estructura conocida

Actualmente existen:

- `specs/api/openapi.yaml`
- `specs/api/paths`
- `specs/api/components`
- `specs/api/info`
- `specs/api/blueprints`
- `specs/api/API_GUIDELINES.md`

## Estado actual

Existen schemas relacionados con Organization, incluyendo:

- Organization.yaml
- Organization/CreateOrganizationRequest.yaml
- Organization/Organization.yaml
- Organization/OrganizationDetails.yaml
- Organization/OrganizationListResponse.yaml
- Organization/OrganizationResponse.yaml
- Organization/OrganizationSummary.yaml
- Organization/UpdateOrganizationRequest.yaml

Sin embargo:

`specs/api/paths/organizations.yaml`

no existe actualmente.

Por lo tanto, el contrato de endpoints de Organization NO debe inventarse todavía.

## Regla OpenAPI

No crear archivos de paths vacíos solamente para completar estructura.

Un path debe representar un endpoint real y definido.

## Contrato de endpoint

Antes de implementar un endpoint deben estar definidos, según corresponda:

- método HTTP;
- path;
- parámetros;
- request body;
- respuesta exitosa;
- errores;
- autenticación;
- autorización;
- paginación;
- filtros;
- ordenamiento;
- reglas de negocio;
- tenant isolation.

## Validación

La entrada HTTP debe validarse antes de llegar a la lógica de dominio.

## Errores

Los errores deben utilizar el mecanismo centralizado definido en `core`.

No devolver formatos inconsistentes entre módulos.

## Swagger

Swagger/OpenAPI debe reflejar la implementación real.

La documentación no debe convertirse en una descripción ficticia de endpoints que todavía no existen.

## Organization

Organization será el primer módulo patrón.

Antes de implementarlo debemos cerrar:

1. endpoints;
2. DTOs;
3. respuestas;
4. errores;
5. permisos;
6. tenant semantics;
7. reglas de actualización;
8. eliminación lógica;
9. pruebas.

## Regla fundamental

Spec primero.

Si código y spec entran en contradicción:

1. detener;
2. identificar contradicción;
3. decidir;
4. actualizar contrato;
5. implementar.
