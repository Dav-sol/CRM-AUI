# Integración Automatize It ↔ Pancake (WhatsApp)

## Objetivo

Automatize It actúa como capa de automatización/lifecycle. Pancake sigue siendo
el **inbox operativo** y el intermediario hacia WhatsApp Business:

```
WhatsApp Business → Pancake (inbox asesores + Public API) → Automatize It
                                                               ↓
                                                      Automatizaciones
                                                               ↓
                                                    Pancake Public API
                                                               ↓
                                                          WhatsApp
```

## Cómo encaja en la arquitectura

- El módulo WhatsApp expone la abstracción `WhatsAppProvider { sendMessage(to, text) }`
  (token `WHATSAPP_PROVIDER`), implementada por `MetaWhatsAppProvider`. El dominio de
  automatizaciones nunca toca el proveedor; solo `WhatsappService` lo usa.
- La integración Pancake vive en `apps/api/src/modules/whatsapp/pancake/`:
  - `PancakeClient` — HTTP, errores, rate limit, timeout.
  - `PancakePublicApi` — `getConversations`, `getConversationMessages`,
    `getMessageTemplates`, `sendTemplate`, `sendInboxMessage`.
  - `PancakeWhatsAppProvider` — implementa `WhatsAppProvider.sendMessage` (drop-in,
    org-scoped y dormido) + `sendTemplateMessage`.
- **Org-scoped**: solo `PANCAKE_ORGANIZATION_ID` (Baterías del Caribe) enruta a Pancake
  y solo si `PANCAKE_API_TOKEN` + `PANCAKE_PAGE_ID` están definidos. Sin esas variables,
  queda dormido (proveedor por defecto).

## Tokens (validado en vivo — hay DOS dominios)

| Token | Variable | Dónde | Uso |
|---|---|---|---|
| **Page access token** | `PANCAKE_API_TOKEN` | Pancake → Settings → Tools | `pages.fm` (conversations/messages/users/POST) como `?page_access_token=` |
| **Botcake API token** | `PANCAKE_BOTCAKE_API_TOKEN` | Botcake → Configuración → Integraciones → API | `botcake.io/message_templates` como header `Authorization: Bearer` |

El page token es un JWT con `{"id":"waba_…"}`. El token de Botcake es OTRO JWT de la misma
página pero **no** sirve en `pages.fm`, y el page token **no** sirve en `botcake.io`.
Ninguno se loguea ni se commitea.

## Envíos (validado en vivo — hallazgo clave)

- **WhatsApp NO acepta `InboxMessage` de texto libre** a través de este endpoint: siempre
  devuelve `Server internal error`, incluso dentro de la ventana de 24h (`can_inbox:true`).
- **`sendTemplate` es el único camino para WhatsApp** (fuera de ventana y en general):
  `WhatsappTemplateMessage` (`action: reply_inbox`, `template_id`, `template_params`,
  `sender_id`). Validado el schema con un template real `APPROVED`.
- **Requisito de cuenta (bloquea TODOS los POST /messages):** el Business Manager está
  "No revisado" y MMLITE tiene "Pending valid payment method". WhatsApp bloquea envíos de
  plantillas sin verificación de negocio + método de pago válido → Pancake devuelve 500.
  **No es un problema de código.** Hay que verificar el BM y agregar método de pago en Meta.
- `message_templates` (Botcake) responde `{ success, data: [{ id, name, status, category,
  language, waba_id, components }] }` con Bearer.

## Configuración

Ver `apps/api/.env.example`. Variables (todas opcionales):

| Variable | Descripción |
|---|---|
| `PANCAKE_API_TOKEN` | Page access token (`pages.fm`). |
| `PANCAKE_BOTCAKE_API_TOKEN` | Token de Botcake (Bearer para `message_templates`). |
| `PANCAKE_PAGE_ID` | `waba_1146111635255630`. |
| `PANCAKE_ORGANIZATION_ID` | Org que enruta a Pancake (Baterías del Caribe). |
| `PANCAKE_SENDER_ID` | `user_id` del emisor (GET /users). Ej. `9c8c5d9d-8616-434f-a4d4-e2568aa530bb`. |
| `PANCAKE_API_BASE_URL` | Default `https://pages.fm/api/public_api`. |
| `PANCAKE_TEMPLATES_API_URL` | Default `https://botcake.io/api/public_api/v1`. |
| `PANCAKE_TIMEOUT_MS` | Default `15000`. |
| `PANCAKE_MIN_INTERVAL_MS` | Default `250` (rate limit ~5 req/seg por página). |
| `PANCAKE_RETRY_ON_AMBIGUOUS` | Default `false`: fallos ambiguos (timeout/red) son **terminales** (no auto-retry, evita duplicados sin idempotencia). |
| `PANCAKE_RESOLVE_CONVERSATION_ID` | Default `false`: resolver el id real vía GET (matiz `CO.`) antes de enviar. |

## Estados de envío y reintentos

- `WhatsAppProvider.sendMessage` (drop-in) usa `InboxMessage` → **solo dentro de la ventana
  de 24h**; para WhatsApp fuera de ventana usar `sendTemplateMessage`.
- El scheduler reintenta `SCHEDULED/ERROR` con `retryCount < 3`. **H5:** si el fallo es
  Pancake **no-retryable** (`retryable=false`: timeout/red con `retryOnAmbiguous=false`,
  auth, 404, `success=false`), el automation pasa a `ERROR` con `retryCount` agotado →
  terminal (el scheduler no lo re-pickea). 429/5xx → retryable (incrementa).

## Uso previsto

- **Lectura**: `getConversations`, `getConversationMessages`, `getMessageTemplates` (Bearer).
- **Envío**: `sendTemplateMessage` (plantillas aprobadas) para automatizaciones; el drop-in
  `sendMessage` queda para respuestas dentro de ventana.

## Prerequisitos de activación (Baterías del Caribe)

1. Verificar el **Business Manager** de WhatsApp (negocio).
2. Configurar **método de pago válido** (MMLITE).
3. Crear las **plantillas propias** en español (hoy la lista solo tiene `google_rewards`).
4. Recién entonces el POST de plantilla debería devolver `success:true`.

## Archivos

**Nuevos**: `whatsapp/pancake/{pancake.client,pancake.types,pancake.adapter,
pancake-whatsapp.provider,pancake.module}.ts` (+ `.spec.ts` de cada uno) ·
`specs/API-Pancake/integration.md`.
**Modificados**: `core/config/configuration.ts` · `core/config/env.validation.ts` ·
`.env.example` · `whatsapp/whatsapp.module.ts` · `whatsapp/whatsapp.service.ts` (+ spec).