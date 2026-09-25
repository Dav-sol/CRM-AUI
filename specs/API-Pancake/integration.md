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

| Token                 | Variable                    | Dónde                                         | Uso                                                                       |
| --------------------- | --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| **Page access token** | `PANCAKE_API_TOKEN`         | Pancake → Settings → Tools                    | `pages.fm` (conversations/messages/users/POST) como `?page_access_token=` |
| **Botcake API token** | `PANCAKE_BOTCAKE_API_TOKEN` | Botcake → Configuración → Integraciones → API | `botcake.io/message_templates` como header `Authorization: Bearer`        |

El page token es un JWT con `{"id":"waba_…"}`. El token de Botcake es OTRO JWT de la misma
página pero **no** sirve en `pages.fm`, y el page token **no** sirve en `botcake.io`.
Ninguno se loguea ni se commitea.

## Envíos (validado en vivo — hallazgo clave)

- **WhatsApp NO acepta `InboxMessage` de texto libre** a través de este endpoint: siempre
  devuelve `Server internal error`, incluso dentro de la ventana de 24h (`can_inbox:true`).
- **`sendTemplate` es el único camino para WhatsApp** (fuera de ventana y en general):
  `WhatsappTemplateMessage` (`action: reply_inbox`, `template_id`, `template_params`,
  `sender_id`). Validado el schema con un template real `APPROVED`.
- **Requisito de cuenta (bloquea TODOS los POST /messages):** se requiere BM
  verificado + método de pago válido. Al 2026-09-10 el BM está **Verificado**;
  MMLITE sigue con "Pending valid payment method" → los envíos de plantilla
  siguen bloqueados sin pago → Pancake devuelve 500. No es un problema de código.
- `message_templates` (Botcake) responde `{ success, data: [{ id, name, status, category,
language, waba_id, components }] }` con Bearer.

## Configuración

Ver `apps/api/.env.example`. Variables (todas opcionales):

| Variable                          | Descripción                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PANCAKE_API_TOKEN`               | Page access token (`pages.fm`).                                                                                       |
| `PANCAKE_BOTCAKE_API_TOKEN`       | Token de Botcake (Bearer para `message_templates`).                                                                   |
| `PANCAKE_PAGE_ID`                 | `waba_1146111635255630`.                                                                                              |
| `PANCAKE_ORGANIZATION_ID`         | Org que enruta a Pancake (Baterías del Caribe).                                                                       |
| `PANCAKE_SENDER_ID`               | `user_id` del emisor (GET /users). Ej. `9c8c5d9d-8616-434f-a4d4-e2568aa530bb`.                                        |
| `PANCAKE_API_BASE_URL`            | Default `https://pages.fm/api/public_api`.                                                                            |
| `PANCAKE_TEMPLATES_API_URL`       | Default `https://botcake.io/api/public_api/v1`.                                                                       |
| `PANCAKE_TIMEOUT_MS`              | Default `15000`.                                                                                                      |
| `PANCAKE_MIN_INTERVAL_MS`         | Default `250` (rate limit ~5 req/seg por página).                                                                     |
| `PANCAKE_RETRY_ON_AMBIGUOUS`      | Default `false`: fallos ambiguos (timeout/red) son **terminales** (no auto-retry, evita duplicados sin idempotencia). |
| `PANCAKE_RESOLVE_CONVERSATION_ID` | Default `false`: resolver el id real vía GET (matiz `CO.`) antes de enviar.                                           |

## Estados de envío y reintentos

- `WhatsAppProvider.sendMessage` (drop-in) usa `InboxMessage` → **solo dentro de la ventana
  de 24h**; para WhatsApp fuera de ventana usar `sendTemplateMessage`.
- El scheduler reintenta `SCHEDULED/ERROR` con `retryCount < 3`. **H5:** si el fallo es
  Pancake **no-retryable** (`retryable=false`: timeout/red con `retryOnAmbiguous=false`,
  auth, 404, `success=false`), el automation pasa a `ERROR` con `retryCount` agotado →
  terminal (el scheduler no lo re-pickea). 429/5xx → retryable (incrementa).

## Uso previsto

- **Lectura**: `getConversations`, `getConversationMessages`, `getMessageTemplates` (Bearer).
- **Envío**: TODOS los envíos de la org Pancake (automatizaciones, envío manual y
  respuestas de asesor) pasan por `sendTemplate()` con la ÚNICA plantilla global
  `PANCAKE_TEMPLATE_ID` (global v1, decidido 2026-09-10): WhatsApp rechaza el
  texto libre vía InboxMessage, así que el texto por campaña se descarta a favor
  de la plantilla. Los `BODY_PARAMS` del llamador se **alinean con las variables
  que declara la plantilla** (leídas de Botcake y cacheadas 10 min; si no se pueden
  leer, se envían sin cambios): Meta rechaza un conteo distinto (error 132000), y la
  plantilla aprobada declara `customer_name` + `product_name` (no `organization_name`).
  Sin `PANCAKE_TEMPLATE_ID` el envío falla **terminal** (H5, no reintenta).

## Estado de la cuenta (validado 2026-09-10, actualizado 2026-09-25)

- BM **Verificado** (antes "No revisado"), WABA Activo, Teléfono Activo.
- MMLITE: ~~"Pending valid payment method"~~ **resuelto en Meta** (captura del
  dashboard de Pancake, 2026-09-25): BM `1325840808019493` **Verificado**, WABA
  `1551419516419540` **Activo**, MMLITE **Implementado**, límite **2.000
  msgsg/24h**, cuenta **Aprobada** y método de pago **VISA \*2370 (caduca
  11/2028)** en Meta Business. El envío de 2026-09-25 tampoco llegó a Meta (cortó
  en el wallet), así que el error `132000`/parámetros sigue sin poder observarse.
- **Dos capas de pago distintas** (no confundir): Meta factura la conversación de
  plantilla (aquí aparece VISA y todo verde) y **Pancake cobra por adelantado en su
  Wallet prepago**, que es donde corta el envío. Recargar el método de pago de Meta
  **no** pone saldo en el wallet de Pancake.
- **Discrepancia de divisa a resolver** (captura 2026-09-25): en el panel de Pancake
  el bloque *Método de pago* dice **"Otro / No configurado"** con insignia **COP** y
  el tooltip advierte: *"La moneda debe ser USD. Cámbiala en la configuración de tu
  cuenta de WhatsApp Business en Meta Business Manager."* Confirmar divisa/cobro
  antes de recargar el wallet.
- **Nuevo requisito Pancake (docs.pancake.biz, `Create a Wallet on Pancake`):** para
  usar la API de WhatsApp se exige un **Wallet prepago** que paga los fees de
  plantilla. No hay endpoint público para consultarlo (GET probado en `pages.fm` y
  `botcake.io` → ruta inexistente): el saldo **solo se ve en el dashboard de Pancake**.
  **Confirmado sin saldo el 2026-09-25** → `Wallet not enough money`
  (`message_code=waba_1999667`) bloquea todos los envíos.
- Plantilla en español **ya existe** (2026-09-25): `google_reseas` · id
  `1767216054194651` · `es_CO` · `APPROVED` · `MARKETING` · declara **2 variables**
  (`customer_name`, `product_name`). La otra plantilla es `google_rewards` (`en_US`).
- Conexión de LECTURA probada de nuevo (2026-09-25): `GET /v2/.../conversations`
  HTTP 200 con conversaciones activas el mismo día; `message_templates` OK.
- Routing **dormido**: `PANCAKE_TEMPLATE_ID` y `PANCAKE_ORGANIZATION_ID` siguen
  comentados en `apps/api/.env` → `shouldUsePancake()` es `false` y el CRM **no** envía
  por Pancake (usa el proveedor por defecto / simulación sandbox).

### Diagnóstico en vivo del POST (2026-09-25) — CAUSA RAÍZ CONFIRMADA

POST `/v1/pages/{page}/conversations/{id}/messages` con credenciales reales:

| #   | Prueba                                                  | Resultado                                                                                                                                                              |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `template_id` inexistente                               | `{"message":"Template not found","success":false}` → la plantilla se valida **antes** que la conversación                                                              |
| 2   | Plantilla `google_reseas` + número **sin conversación** | `{"id":"waba_1146111635255630_","message":"Wallet not enough money","success":false,"wallet_id":"b9cd07ce-e95c-4833-8e71-1d6f482d9be1","message_code":"waba_1999667"}` |
| 3   | Repetición del POST (mismo payload, 2026-09-25)          | **Mismo resultado**: `Wallet not enough money` / `waba_1999667` → el wallet siguió sin saldo tras revisar el panel de Meta; no cambia el diagnóstico |

**Conclusión: el bloqueo es el Wallet prepago de Pancake sin saldo.**

- El rechazo ocurre **antes** de llegar a Meta → afecta a **todos** los envíos de
  plantilla y **no** es un problema de código del CRM.
- El `conversation_id` compuesto `[pageID]_[phone]` **sí** pasa la validación (la
  llamada llegó hasta la comprobación de saldo) → queda **descartada** la hipótesis
  de que los números sin conversación previa fallen.
- **Sin verificar todavía** (el wallet corta antes de Meta): el desajuste de
  parámetros (el CRM manda 3, la plantilla declara 2) y la respuesta real de Meta.
  Repetir la prueba tras recargar el wallet.
- La respuesta trae `message_code` (no `error_code`); ambos se conservan ahora en
  `PancakeApiError` (`messageCode` / `errorCode`).

## Errores de la API y su manejo en el CRM

Pancake devuelve los fallos de aplicación como **HTTP 200 + `success:false`** con
`message` y `error_code` (validado en vivo). Antes esto se descartaba y todo quedaba
como `Pancake API returned success=false`:

- `PancakeApiError` ahora conserva `message` y `errorCode` (token redactado).
- `PancakeError` se clasifica como `provider_error` (antes caía como `internal_error`)
  y el motivo se registra con `logger.error` en automatización, envío manual y reply.

## Activación (checklist)

1. ~~MMLITE con método de pago válido (Meta Business Settings)~~ — **hecho**
   (VISA \*2370, MMLITE "Implementado", cuenta Aprobada; ver captura 2026-09-25).
   **Pendiente**: la insignia COP del panel de Pancake exige USD → confirmar la
   divisa de la cuenta WhatsApp Business en Meta Business Manager.
2. **Crear/recargar el Wallet prepago de Pancake** (obligatorio para la API de
   WhatsApp; se consulta solo en el dashboard, no tiene endpoint público) y
   revisar que el *Método de pago* del panel de Pancake deje de decir
   "Otro / No configurado".
3. `.env`: setear `PANCAKE_TEMPLATE_ID=1767216054194651` y descomentar
   `PANCAKE_ORGANIZATION_ID` (org de Baterías del Caribe).
4. POST diagnóstico a un número acordado (verifica plantilla + wallet + número nuevo).
5. Rotar los dos tokens y actualizar `.env`.

Nota de código: Pancake tiene precedencia sobre el sandbox
(`whatsapp.service.ts`: si `usePancake` → envío real aunque la org esté en la lista
sandbox). Al activar el routing de una org sandbox, sus envíos dejan de ser simulados,
así que el paso 3 se hace solo cuando 1 y 2 estén listos.

## Prerequisitos de activación (Baterías del Caribe)

1. ~~Verificar el Business Manager~~ (Verificado, 2026-09-10).
2. ~~Configurar **método de pago válido** (MMLITE)~~ — VISA \*2370 + MMLITE
   "Implementado" el 2026-09-25 (captura). Queda confirmar la divisa (USD) que
   exige el panel de Pancake.
3. ~~Crear las **plantillas propias en español**~~ — `google_reseas` (`es_CO`)
   APPROVED desde antes de 2026-09-25; declara 2 variables.
4. **Wallet prepago de Pancake** con saldo — **único bloqueo que queda**
   (comprobado dos veces el 2026-09-25: `waba_1999667`).
5. Recién entonces el POST de plantilla debería devolver `success:true`.

## Archivos

**Nuevos**: `whatsapp/pancake/{pancake.client,pancake.types,pancake.adapter,
pancake-whatsapp.provider,pancake.module}.ts` (+ `.spec.ts` de cada uno) ·
`specs/API-Pancake/integration.md`.
**Modificados**: `core/config/configuration.ts` · `core/config/env.validation.ts` ·
`.env.example` · `whatsapp/whatsapp.module.ts` · `whatsapp/whatsapp.service.ts` (+ spec).
