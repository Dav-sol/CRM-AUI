# Diseño de Base de Datos

## Introducción

Este documento define el modelo de datos oficial de Automatize It Platform.

La base de datos ha sido diseñada bajo una arquitectura Multi-Tenant, permitiendo que múltiples empresas utilicen la plataforma de forma segura y aislada.

Todas las entidades del negocio pertenecen a una Organización.

---

# Principios

El modelo de datos deberá cumplir los siguientes principios:

- Escalable
- Modular
- Multiempresa (Multi-Tenant)
- Alta integridad
- Historial permanente
- No duplicidad
- Auditoría completa
- Preparado para crecimiento

---

# Arquitectura Multi-Tenant

Toda la información pertenece a una Organización.

```
Organization
      │
      ├── Usuarios
      ├── Clientes
      ├── Compras
      ├── Productos
      ├── Campañas
      ├── Automatizaciones
      ├── Conversaciones
      ├── Mensajes
      ├── Importaciones
      └── Auditoría
```

---

# Convenciones

Todas las tablas deberán utilizar:

id

uuid

created_at

updated_at

deleted_at (Soft Delete)

organization_id

---

# Entidades

## Organization

Representa una empresa registrada dentro de Automatize It Platform.

Campos:

- id
- uuid
- nombre
- nit
- email
- telefono
- ciudad
- estado
- created_at
- updated_at

---

## User

Representa un usuario autenticado.

Campos

- id
- organization_id
- nombre
- email
- password_hash
- rol
- estado
- ultimo_login

---

## Customer

Representa un cliente importado desde el ERP.

Campos

- id
- organization_id
- codcli
- nombre
- telefono
- email
- direccion
- ciudad
- estado

Restricción:

(codcli + organization_id) debe ser único.

---

## Product

Representa un producto vendido.

Campos

- id
- organization_id
- codigo
- nombre
- categoria
- estado

---

## Purchase

Representa una compra realizada.

Campos

- id
- organization_id
- customer_id
- product_id
- numero_factura
- fecha_compra
- cantidad
- valor
- estado

---

## CommercialCycle

Representa el ciclo comercial iniciado por una compra.

Campos

- id
- purchase_id
- estado
- fecha_inicio
- fecha_fin

---

## Campaign

Representa una estrategia comercial.

Campos

- id
- organization_id
- nombre
- descripcion
- tipo
- plantilla
- estado

---

## Automation

Representa una automatización programada.

Campos

- id
- organization_id
- campaign_id
- purchase_id
- fecha_programada
- fecha_ejecucion
- estado

---

## Conversation

Representa una conversación con un cliente.

Campos

- id
- organization_id
- customer_id
- canal
- estado
- asesor_id

---

## Message

Representa un mensaje.

Campos

- id
- conversation_id
- tipo
- contenido
- direccion
- estado
- fecha_envio

---

## Import

Representa una importación.

Campos

- id
- organization_id
- usuario_id
- tipo
- archivo
- estado
- registros
- errores

---

## Audit

Representa el historial del sistema.

Campos

- id
- organization_id
- usuario_id
- modulo
- accion
- descripcion
- fecha

---

# Relaciones

Organization

↓

Users

↓

Customers

↓

Purchases

↓

CommercialCycle

↓

Automations

↓

Campaigns

↓

Messages

↓

Conversations

---

# Restricciones

Un Customer pertenece a una sola Organization.

Una Purchase pertenece a un solo Customer.

Una Purchase inicia un solo CommercialCycle.

Un CommercialCycle puede contener múltiples Automatizaciones.

Una Conversation pertenece a un solo Customer.

Un Message pertenece a una sola Conversation.

Una Importación nunca elimina registros.

La Auditoría nunca podrá modificarse.

---

# Soft Delete

Todas las entidades utilizarán Soft Delete.

Los registros nunca serán eliminados físicamente.

---

# Índices

Crear índices para:

organization_id

codcli

telefono

fecha_compra

numero_factura

estado

created_at

---

# Integridad

No podrán existir:

Clientes duplicados.

Compras duplicadas.

Automatizaciones duplicadas.

Mensajes duplicados.

---

# ORM

El proyecto utilizará Prisma ORM.

Toda la estructura deberá diseñarse siguiendo las mejores prácticas de Prisma.

---

# Motor de Base de Datos

PostgreSQL

Versión mínima:

17

---

# Escalabilidad

El modelo deberá soportar:

Miles de organizaciones.

Millones de clientes.

Millones de compras.

Millones de mensajes.

Millones de automatizaciones.

Sin necesidad de rediseñar la estructura.

---

# Futuras Extensiones

La arquitectura permitirá incorporar nuevos módulos sin modificar el modelo principal.

Ejemplos:

CRM

IA

Email Marketing

SMS

Encuestas

Marketplace

API Pública

ERP Connectors

Bots Inteligentes

Data Warehouse