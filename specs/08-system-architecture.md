# Arquitectura del Sistema

## Introducción

Este documento define la arquitectura técnica oficial de Automatize It Platform.

La plataforma ha sido diseñada bajo principios de arquitectura moderna, modular y escalable, permitiendo soportar múltiples organizaciones (Multi-Tenant), millones de registros y futuras integraciones sin modificar el núcleo del sistema.

---

# Objetivos de Arquitectura

La arquitectura deberá cumplir los siguientes objetivos:

- Modularidad
- Escalabilidad horizontal
- Bajo acoplamiento
- Alta cohesión
- Alta disponibilidad
- Seguridad
- Observabilidad
- Facilidad de mantenimiento
- Facilidad para incorporar nuevos módulos

---

# Arquitectura General

```
                    Internet
                        │
                        ▼
               Cloudflare / Nginx
                        │
                        ▼
                 Next.js Frontend
                        │
                  HTTPS / REST API
                        │
                        ▼
                  NestJS Backend
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
   PostgreSQL         Redis           BullMQ
        │               │                │
        └───────────────┼────────────────┘
                        │
                        ▼
                 Event Bus (NestJS)
                        │
        ┌───────────────┼──────────────────────────────┐
        │               │              │               │
        ▼               ▼              ▼               ▼
   CRM Core      Automation     WhatsApp       Dashboard
                  Engine          Module         Analytics
```

---

# Arquitectura por Capas

## Presentación

Responsable de la interfaz de usuario.

Tecnología:

- Next.js
- React
- TypeScript
- TailwindCSS
- shadcn/ui

---

## API

Responsable de toda la lógica de negocio.

Tecnología:

- NestJS
- TypeScript

Responsabilidades:

- Autenticación
- Validaciones
- Reglas de negocio
- Eventos
- Integraciones

---

## Persistencia

Responsable del almacenamiento.

Tecnología:

- PostgreSQL
- Prisma ORM

---

## Infraestructura

Responsable de procesos internos.

Incluye:

- Redis
- BullMQ
- Scheduler
- Storage
- Logs

---

# Monorepo

El proyecto utilizará Turborepo.

```
apps/
│
├── web
├── api
├── admin
└── worker

packages/
│
├── ui
├── database
├── config
├── auth
├── logger
├── events
├── utils
└── types
```

---

# Backend

Framework:

NestJS

Arquitectura:

```
Controller

↓

Service

↓

Repository

↓

Database
```

Cada módulo será completamente independiente.

Ejemplo:

```
customers/

campaigns/

automations/

imports/

dashboard/

reports/

users/
```

---

# Frontend

Framework:

Next.js

Arquitectura:

```
App Router

↓

Layouts

↓

Pages

↓

Components

↓

Hooks

↓

API Client
```

---

# Base de Datos

Motor:

PostgreSQL

ORM:

Prisma

Migraciones:

Prisma Migrate

Seed:

Prisma Seed

---

# Cache

Redis será utilizado para:

- Caché
- Sesiones
- Rate Limiting
- Colas

---

# Colas

BullMQ administrará:

- Automatizaciones
- WhatsApp
- Correos
- Reportes
- Importaciones pesadas

---

# Scheduler

Responsable de ejecutar procesos programados.

Ejemplos:

- Revisar automatizaciones.
- Ejecutar campañas.
- Limpiar registros temporales.
- Generar estadísticas.

---

# Sistema de Eventos

Toda comunicación entre módulos utilizará EventEmitter de NestJS.

En futuras versiones podrá migrarse a RabbitMQ o Kafka sin modificar la lógica de negocio.

---

# Seguridad

Autenticación:

JWT

Autorización:

RBAC (Role Based Access Control)

Roles:

Administrador

Gerente

Asesor

Operador

---

# Multi-Tenant

Toda consulta deberá filtrarse por:

organization_id

Ningún usuario podrá acceder a información de otra organización.

---

# Almacenamiento

Archivos soportados:

- Excel
- CSV
- PDF
- Imágenes

Proveedor inicial:

Sistema de archivos local

Proveedor futuro:

S3 Compatible (MinIO)

---

# Integraciones

Primera versión:

WhatsApp

Excel

CSV

ERP mediante importación

Futuras versiones:

REST API

Webhooks

ERP Connectors

Correo

SMS

Telegram

---

# Observabilidad

Se implementará:

Logs

Métricas

Auditoría

Health Checks

---

# Manejo de Errores

Todas las excepciones deberán:

- Registrarse
- Clasificarse
- Mostrar mensajes amigables
- Conservar trazabilidad

---

# CI/CD

Repositorio:

GitHub

Pipeline:

GitHub Actions

Procesos:

- Tests
- Build
- Docker
- Deploy

---

# Contenedores

Toda la plataforma será compatible con Docker.

Servicios:

- Frontend
- Backend
- PostgreSQL
- Redis

---

# VPS Inicial

Configuración recomendada:

- 4 vCPU
- 8 GB RAM
- 160 GB SSD
- Ubuntu 24.04 LTS

Capacidad estimada:

- 20 organizaciones
- 50.000 clientes
- 500.000 mensajes
- 1 millón de automatizaciones

---

# Escalabilidad

La plataforma deberá escalar por servicios.

Ejemplo:

Frontend

↓

API

↓

Workers

↓

Redis

↓

PostgreSQL

Cada componente podrá crecer de forma independiente.

---

# Tecnologías Oficiales

Frontend

- Next.js
- React
- TypeScript
- TailwindCSS
- shadcn/ui
- TanStack Table
- React Hook Form
- Zod

Backend

- NestJS
- Prisma
- BullMQ
- Redis
- JWT
- EventEmitter2

Base de Datos

- PostgreSQL

Infraestructura

- Docker
- Nginx
- GitHub Actions
- MinIO (futuro)

---

# Principios Arquitectónicos

1. El dominio tiene prioridad sobre la tecnología.
2. Los módulos deben ser independientes.
3. Toda funcionalidad debe ser desacoplada.
4. Los eventos son el mecanismo principal de comunicación.
5. Ningún módulo accederá directamente a la lógica interna de otro.
6. Todo cambio importante deberá quedar auditado.
7. La plataforma debe ser preparada para SaaS desde su primera versión.