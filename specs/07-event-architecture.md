# Arquitectura Basada en Eventos

## Introducción

Automatize It Platform adopta una arquitectura basada en eventos (Event-Driven Architecture).

En este modelo, los módulos no interactúan directamente entre sí.

Cada módulo publica eventos cuando ocurre un hecho importante del negocio y los demás módulos reaccionan según sus responsabilidades.

Este enfoque reduce el acoplamiento entre componentes, mejora la escalabilidad y facilita la incorporación de nuevas funcionalidades sin modificar procesos existentes.

---

# Objetivos

- Reducir el acoplamiento entre módulos.
- Facilitar la escalabilidad.
- Mejorar la mantenibilidad.
- Permitir procesos asíncronos.
- Facilitar auditoría.
- Permitir integraciones futuras.

---

# Flujo General

```
ERP
 │
 ▼
Importador
 │
 ▼
Evento
 │
 ├──────────────┐
 ▼              ▼
Clientes      Compras
 │              │
 │              ▼
 │      PurchaseImported
 │              │
 ├──────────────┐
 ▼              ▼
Dashboard   Ciclo Comercial
                │
                ▼
        AutomationCreated
                │
                ▼
        Scheduler
                │
                ▼
        WhatsApp
                │
                ▼
        MessageSent
                │
                ▼
        Conversation
```

---

# Eventos del Dominio

Los eventos representan hechos que ya ocurrieron.

Todos los nombres deberán escribirse en tiempo pasado.

Ejemplos:

CustomerImported

PurchaseImported

AutomationCreated

AutomationPaused

AutomationExecuted

CampaignCreated

MessageSent

MessageDelivered

MessageRead

MessageReceived

ConversationOpened

ConversationClosed

UserCreated

UserLoggedIn

ImportCompleted

ImportFailed

DashboardUpdated

---

# Eventos por Módulo

## Organización

OrganizationCreated

OrganizationUpdated

OrganizationActivated

OrganizationSuspended

---

## Usuarios

UserCreated

UserUpdated

UserDeleted

UserLoggedIn

PasswordChanged

RoleChanged

---

## Clientes

CustomerImported

CustomerUpdated

CustomerActivated

CustomerDeactivated

PhoneUpdated

---

## Productos

ProductImported

ProductUpdated

---

## Compras

PurchaseImported

PurchaseUpdated

PurchaseCancelled

---

## Ciclos Comerciales

CommercialCycleStarted

CommercialCycleCancelled

CommercialCycleFinished

---

## Automatizaciones

AutomationCreated

AutomationScheduled

AutomationPaused

AutomationResumed

AutomationCancelled

AutomationExecuted

AutomationFailed

---

## Campañas

CampaignCreated

CampaignUpdated

CampaignActivated

CampaignFinished

CampaignCancelled

---

## Conversaciones

ConversationOpened

ConversationAssigned

ConversationTransferred

ConversationClosed

ConversationArchived

---

## Mensajes

MessageQueued

MessageSent

MessageDelivered

MessageRead

MessageReceived

MessageFailed

---

## Importaciones

ImportStarted

ImportValidated

ImportCompleted

ImportFailed

---

## Auditoría

AuditCreated

---

# Consumidores de Eventos

## PurchaseImported

Dispara:

- Crear ciclo comercial.
- Programar automatizaciones.
- Actualizar Dashboard.
- Registrar Auditoría.

---

## AutomationExecuted

Dispara:

- Actualizar Dashboard.
- Registrar Auditoría.
- Esperar respuesta.

---

## MessageReceived

Dispara:

- Abrir conversación.
- Notificar asesor.
- Pausar automatizaciones.
- Actualizar Dashboard.

---

## ConversationClosed

Dispara:

- Evaluar automatizaciones pausadas.
- Reprogramar si aplica.
- Registrar Auditoría.

---

## ImportCompleted

Dispara:

- Actualizar indicadores.
- Registrar resumen.
- Enviar notificación al administrador.

---

# Event Bus

Todos los eventos serán publicados mediante un Event Bus interno.

En futuras versiones podrá migrarse a:

- RabbitMQ
- Kafka
- NATS
- AWS EventBridge

La primera versión utilizará el sistema de eventos nativo de NestJS.

---

# Eventos Sincrónicos

Eventos que deben ejecutarse inmediatamente.

Ejemplos:

Login.

Actualizar contraseña.

Actualizar configuración.

---

# Eventos Asíncronos

Eventos que pueden ejecutarse en segundo plano.

Ejemplos:

Enviar WhatsApp.

Actualizar Dashboard.

Programar automatizaciones.

Generar reportes.

Enviar correos.

Registrar auditoría.

---

# Reglas

Los eventos nunca modifican directamente otros módulos.

Publican información.

Cada módulo decide cómo reaccionar.

---

# Idempotencia

Todo consumidor deberá poder procesar un mismo evento varias veces sin generar inconsistencias.

Esto evita errores ocasionados por reintentos o caídas del sistema.

---

# Trazabilidad

Todo evento deberá registrar:

- UUID
- Fecha
- Hora
- Usuario origen (si aplica)
- Organización
- Módulo origen
- Payload
- Estado

---

# Convención de Nombres

Todos los eventos deberán escribirse:

- En inglés.
- En PascalCase.
- En tiempo pasado.

Ejemplos:

PurchaseImported

CampaignCreated

MessageReceived

ConversationClosed

AutomationExecuted

---

# Beneficios

Esta arquitectura permitirá incorporar nuevos módulos sin modificar los existentes.

Ejemplos futuros:

- Inteligencia Artificial.
- Motor de recomendaciones.
- Email Marketing.
- SMS.
- Encuestas.
- CRM Avanzado.
- Integraciones ERP.
- API Pública.
- Webhooks.