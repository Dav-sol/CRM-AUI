# API Guidelines

> Proyecto: Automatize It
>
> Versión: 1.0
>
> Estado: Draft
>
> Objetivo:
>
> Definir los estándares de diseño, desarrollo y evolución de la API REST de Automatize It.

---

# 1. Filosofía

La API debe ser:

- RESTful
- Consistente
- Versionada
- Predecible
- Fácil de consumir
- Fácil de documentar
- Compatible con OpenAPI 3.1

Todos los módulos deberán seguir exactamente estas reglas.

---

# 2. Base URL

```
/api/v1
```

Ejemplos:

```
GET /api/v1/customers

POST /api/v1/imports

PATCH /api/v1/campaigns/{id}
```

Nunca crear endpoints fuera del prefijo `/api/v1`.

---

# 3. Convención de nombres

Todos los recursos utilizarán nombres en inglés.

Correcto

```
customers

purchases

products

campaigns

imports

automations

organizations

users
```

Incorrecto

```
cliente

venta

producto

campaña
```

---

# 4. Recursos

Siempre utilizar sustantivos.

Correcto

```
GET /customers

POST /customers

PATCH /customers/{id}

DELETE /customers/{id}
```

Incorrecto

```
/getCustomers

/createCustomer

/updateCustomer
```

---

# 5. Métodos HTTP

GET

Consultar información.

POST

Crear recursos.

PATCH

Actualizar parcialmente.

PUT

No se utilizará inicialmente.

DELETE

Soft Delete.

---

# 6. Formato de respuesta

Todas las respuestas exitosas utilizarán el mismo formato.

```json
{
  "data": {},
  "meta": {},
  "links": {}
}
```

Cuando no existan datos adicionales:

```json
{
  "data": {}
}
```

---

# 7. Colecciones

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 320,
    "pages": 16
  }
}
```

---

# 8. Errores

Formato único.

```json
{
  "error": {
    "code": "CUSTOMER_NOT_FOUND",
    "message": "Customer not found"
  }
}
```

Opcionalmente:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "phone",
        "message": "Invalid phone number"
      }
    ]
  }
}
```

---

# 9. Códigos HTTP

200 OK

201 Created

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Validation Error

429 Too Many Requests

500 Internal Server Error

---

# 10. Paginación

Todas las colecciones serán paginadas.

Parámetros:

```
?page=1

?limit=20
```

Respuesta

```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 125,
    "pages": 7
  }
}
```

---

# 11. Ordenamiento

```
?sort=name

?sort=-createdAt
```

El signo "-" indica orden descendente.

---

# 12. Filtros

Ejemplo

```
GET /customers

?search=juan

?status=ACTIVE

?tag=vip

?createdFrom=2026-01-01

?createdTo=2026-12-31
```

Los filtros siempre serán opcionales.

---

# 13. Búsqueda

Utilizar parámetro único.

```
?search=
```

Nunca crear endpoints especiales para búsquedas.

Incorrecto

```
/searchCustomer
```

---

# 14. Soft Delete

Los registros nunca se eliminarán físicamente.

Se utilizarán los campos:

```
deletedAt

deletedBy
```

Los registros eliminados no aparecerán en consultas normales.

---

# 15. Auditoría

Todas las entidades deberán almacenar:

```
createdAt

updatedAt

createdBy

updatedBy
```

Cuando aplique:

```
deletedAt

deletedBy
```

---

# 16. Autenticación

JWT Bearer Token.

Header

```
Authorization: Bearer <token>
```

---

# 17. Autorización

RBAC (Role Based Access Control)

Roles iniciales

Owner

Administrator

Operator

Viewer

Las organizaciones podrán crear nuevos roles en futuras versiones.

---

# 18. Multi-Tenant

Toda consulta deberá ejecutarse dentro del contexto de una organización.

Nunca devolver información de otra organización.

El organizationId será obtenido del JWT, no desde el cliente.

---

# 19. Idempotencia

Las operaciones sensibles (ejemplo: importaciones o creación de campañas) podrán soportar el encabezado:

```
Idempotency-Key
```

Esto evitará duplicados cuando el cliente reintente una solicitud.

---

# 20. Fechas

Formato

ISO 8601

Ejemplo

```
2026-07-22T14:35:18Z
```

---

# 21. Zona horaria

Internamente:

UTC

Presentación:

Zona horaria de la organización.

---

# 22. Importaciones

Las importaciones serán asíncronas.

Flujo:

Archivo

↓

Validación

↓

Creación de ImportJob

↓

Procesamiento

↓

Resultado

Nunca bloquear una petición HTTP mientras se procesa un archivo grande.

---

# 23. Eventos

Toda acción importante generará un evento de dominio.

Ejemplos

CustomerCreated

PurchaseImported

CampaignScheduled

AutomationExecuted

MessageSent

ConversationStarted

PurchaseRegistered

---

# 24. Webhooks

Versión futura.

Se diseñarán siguiendo el mismo estándar.

---

# 25. Versionado

Toda modificación incompatible requerirá una nueva versión.

```
/api/v2
```

Nunca romper contratos existentes.

---

# 26. Documentación

Toda la API deberá documentarse mediante OpenAPI 3.1.

Swagger será generado automáticamente.

---

# 27. Convenciones OpenAPI

Todos los schemas deberán reutilizar componentes.

No duplicar definiciones.

Utilizar:

```
components/schemas

components/responses

components/parameters

components/securitySchemes
```

---

# 28. Principios de diseño

La API debe ser:

Predecible

Consistente

Escalable

Tipada

Fácil de consumir

Documentada automáticamente

Orientada a recursos

Preparada para evolución futura