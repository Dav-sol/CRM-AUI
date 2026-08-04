# Entity Blueprint

Esta guía define la estructura estándar que debe seguir cualquier entidad del sistema.

---

# Estructura

Entity/

├── Entity.yaml
├── EntitySummary.yaml
├── EntityDetails.yaml
├── CreateEntityRequest.yaml
├── UpdateEntityRequest.yaml
├── EntityResponse.yaml
└── EntityListResponse.yaml

---

# Responsabilidad de cada archivo

## Entity.yaml

Modelo base.

Debe contener únicamente la definición del recurso.

No contiene respuestas HTTP.

No contiene metadata.

No contiene paginación.

---

## EntitySummary.yaml

Versión ligera.

Se utiliza en:

- tablas
- selects
- autocomplete
- relaciones

Debe contener únicamente los campos necesarios para identificar el recurso.

---

## EntityDetails.yaml

Versión completa.

Incluye toda la información necesaria para visualizar el recurso.

Puede incluir relaciones.

---

## CreateEntityRequest.yaml

Define el body del POST.

No incluye:

id

createdAt

updatedAt

deletedAt

---

## UpdateEntityRequest.yaml

Define el body del PATCH.

Todos los campos son opcionales excepto cuando una regla de negocio indique lo contrario.

Nunca incluye:

id

createdAt

updatedAt

---

## EntityResponse.yaml

Respuesta de:

GET /resource/{id}

Formato:

{
  "data": {}
}

---

## EntityListResponse.yaml

Respuesta de:

GET /resource

Formato:

{
  "data": [],
  "meta": {}
}