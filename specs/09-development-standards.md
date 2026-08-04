# Estándares de Desarrollo

## Introducción

Este documento define los estándares de desarrollo oficiales de Automatize It Platform.

Todo el código del proyecto deberá seguir estas convenciones para garantizar consistencia, mantenibilidad y escalabilidad.

---

# Filosofía

Nuestro objetivo no es únicamente desarrollar software.

Nuestro objetivo es construir una plataforma mantenible durante los próximos diez años.

Cada línea de código deberá ser:

- Legible
- Reutilizable
- Escalable
- Testeable
- Documentada

---

# Principios

Seguiremos los principios:

- SOLID
- DRY
- KISS
- YAGNI
- Clean Architecture
- Domain Driven Design
- Event Driven Architecture

---

# Lenguaje

Todo el código deberá escribirse en inglés.

Ejemplos:

Customer

Purchase

Automation

Campaign

Conversation

Message

Import

Dashboard

Organization

Nunca:

Cliente

Compra

Automatizacion

---

# Idioma de la Plataforma

Código:

Inglés

Base de datos:

Inglés

API:

Inglés

Variables:

Inglés

Interfaces:

Inglés

Documentación:

Español

Manual del usuario:

Español

UI:

Español (configurable para futuro soporte multiidioma)

---

# Convenciones de Nombres

## Variables

camelCase

```ts
customerName
purchaseDate
phoneNumber
```

---

## Clases

PascalCase

```ts
CustomerService
ImportCustomersJob
AutomationEngine
```

---

## Interfaces

PascalCase

```ts
CustomerRepository
CampaignService
ImportResult
```

---

## Archivos

kebab-case

```
customer.service.ts

purchase.repository.ts

automation.engine.ts
```

---

## Carpetas

kebab-case

```
customer/

campaign/

automation/

dashboard/
```

---

# Arquitectura Modular

Cada módulo deberá contener:

```
customers/

controller/

service/

repository/

dto/

entities/

events/

jobs/

validators/

tests/

index.ts
```

---

# DTO

Todos los datos de entrada utilizarán DTO.

Ejemplo

```
CreateCustomerDto

UpdateCustomerDto

ImportCustomerDto
```

---

# Validaciones

Todas las validaciones utilizarán:

Zod

y

class-validator

Nunca validar manualmente.

---

# Base de Datos

Nunca acceder directamente a PostgreSQL.

Todo acceso será mediante Prisma.

---

# Prisma

Toda consulta deberá:

- Ser tipada.
- Utilizar transacciones cuando sea necesario.
- Evitar consultas N+1.
- Utilizar índices existentes.

---

# Eventos

Los módulos nunca llamarán directamente a otros módulos.

Siempre publicarán eventos.

Ejemplo

```
PurchaseImported

↓

AutomationCreated

↓

MessageQueued
```

---

# Manejo de Errores

Nunca devolver errores internos.

Siempre utilizar excepciones controladas.

Ejemplo:

```
BadRequestException

UnauthorizedException

NotFoundException

ConflictException
```

---

# Logging

Todo error importante deberá registrarse.

Toda importación deberá registrarse.

Toda automatización deberá registrarse.

Nunca utilizar:

```
console.log()
```

En producción.

---

# Testing

Cada módulo deberá incluir:

Unit Tests

Integration Tests

Objetivo:

Cobertura superior al 80%.

---

# Commits

Seguiremos Conventional Commits.

Ejemplos:

```
feat(customer): add customer import

fix(import): validate duplicated purchases

refactor(automation): improve scheduler

docs(database): update relations

test(customer): add import tests
```

---

# Branches

main

Producción

develop

Desarrollo

feature/*

Nuevas funcionalidades

fix/*

Correcciones

hotfix/*

Errores críticos

---

# Pull Requests

Todo Pull Request deberá incluir:

Descripción.

Capturas (si aplica).

Checklist.

Pruebas realizadas.

---

# Versionado

Seguiremos Semantic Versioning.

```
1.0.0
```

Mayor

Menor

Patch

---

# Documentación

Todo componente público deberá utilizar:

TSDoc

Ejemplo

```ts
/**
 * Creates a new automation for a purchase.
 */
```

---

# API

Toda respuesta seguirá la misma estructura.

```json
{
  "success": true,
  "data": {},
  "message": "",
  "errors": []
}
```

---

# Seguridad

Nunca almacenar:

Contraseñas en texto plano.

Tokens.

Credenciales.

Claves API.

Toda información sensible utilizará variables de entorno.

---

# Variables de Entorno

Nunca utilizar valores hardcodeados.

Todo deberá provenir de:

.env

---

# Dependencias

Antes de instalar una librería deberá verificarse:

- Comunidad activa.
- Mantenimiento.
- Licencia.
- Compatibilidad.
- Rendimiento.

No agregar dependencias innecesarias.

---

# Rendimiento

Toda consulta deberá considerar:

Paginación.

Lazy Loading.

Índices.

Cache.

---

# Calidad del Código

Utilizar:

ESLint

Prettier

Husky

Lint Staged

---

# Accesibilidad

Toda interfaz deberá cumplir:

WCAG 2.1 AA

---

# Responsive

La plataforma deberá funcionar correctamente en:

Desktop

Tablet

Mobile

---

# Diseño

Sistema oficial:

TailwindCSS

Componentes:

shadcn/ui

Iconografía:

Lucide

---

# Estado Global

Utilizar:

TanStack Query

Context API

Evitar estados globales innecesarios.

---

# Formularios

React Hook Form

+

Zod

---

# Tablas

TanStack Table

---

# Fechas

date-fns

Nunca utilizar Date nativo para lógica compleja.

---

# Principios de UI

- Consistencia visual.
- Feedback inmediato.
- Carga progresiva.
- Skeletons.
- Confirmaciones antes de acciones destructivas.
- Modo oscuro preparado.

---

# Checklist antes de hacer Merge

- Compila correctamente.
- Sin errores de ESLint.
- Sin errores de TypeScript.
- Tests aprobados.
- Documentación actualizada.
- Sin secretos en el repositorio.
- Pull Request aprobado.

---

# Filosofía Final

Automatize It Platform no se construirá buscando velocidad.

Se construirá buscando calidad.

Cada decisión técnica deberá responder a una sola pregunta:

> ¿Esta decisión permitirá que la plataforma siga siendo mantenible dentro de cinco años?

Si la respuesta es no, la implementación deberá replantearse.