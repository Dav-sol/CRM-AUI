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
  el bloque _Método de pago_ dice **"Otro / No configurado"** con insignia **COP** y
  el tooltip advierte: _"La moneda debe ser USD. Cámbiala en la configuración de tu
  cuenta de WhatsApp Business en Meta Business Manager."_ Confirmar divisa/cobro
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
| 3   | Repetición del POST (mismo payload, 2026-09-25)         | **Mismo resultado**: `Wallet not enough money` / `waba_1999667` → el wallet siguió sin saldo tras revisar el panel de Meta; no cambia el diagnóstico                   |

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

### Verificación end-to-end del CRM (2026-09-25) — el flujo corre hasta el bloqueo

Prueba real con la API compilada en marcha (`node dist/main`), con
`PANCAKE_ORGANIZATION_ID` apuntando a una organización temporal creada solo para
la prueba (datos y proceso eliminados al terminar):

| Paso | Comprobación                                                      | Resultado                                                                                                                                           |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `POST /api/v1/auth/login`                                         | 200 + JWT (usuario con rol `ADMINISTRADOR`; sin rol → `resolveClaims` devuelve 401, comportamiento verificado por el camino)                        |
| 2    | `POST /api/v1/messages` (cliente con el número `ALTIRIA_TEST_TO`) | **HTTP 502 `PROVIDER_ERROR`** — clasificación nueva, ya no 500                                                                                      |
| 3    | Log de la API                                                     | `ERROR [WhatsappService] manual send failed customer=…` + `Pancake API returned success=false: Wallet not enough money (message_code=waba_1999667)` |
| 4    | Auditoría (`audits`)                                              | `message.send` / outcome `failure` / `metadata.reason = provider_error`                                                                             |
| 5    | Fila en `messages`                                                | `status = FAILED`                                                                                                                                   |

**Qué demuestra:** el CRM arma la llamada (plantilla aprobada, parámetros
alineados a los `BODY_PARAMS` declarados, `conversation_id` compuesto), invoca la
API real de Pancake, clasifica el fallo como `provider_error` (502, no 500),
registra la causa textual en el log y en la auditoría, y marca el mensaje como
`FAILED`. El único motivo del rechazo sigue siendo **el wallet sin saldo**, no el
código.

Observación: `messages.failure_reason` queda `NULL` en los envíos WhatsApp porque
la columna la crea la migración SMS (WIP) y la ruta WhatsApp aún no la escribe;
la causa se expone vía log + auditoría + evento `MessageFailed`.

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
   revisar que el _Método de pago_ del panel de Pancake deje de decir
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

---

## PAN-02 · Viabilidad del sondeo incremental (25-10-2026)

Fuente: `specs/API-Pancake/document.md` (OpenAPI 3.0.0, 28 rutas) + primitivas ya
expuestas en `apps/api/src/modules/whatsapp/pancake/pancake.adapter.ts`.

### Qué dice la propia documentación sobre el modelo de lectura

La sección **«Uso previsto»** de este fichero ya fija el modelo: **lectura por
sondeo** con `getConversations` y `getConversationMessages`. No existe ninguna
otra vía de lectura (PAN-03). Luego la pregunta no es *si* se sondea, sino
*si el sondeo puede ser incremental de forma fiable*.

### Primitivas disponibles `[VERIFICADO]`

| Ruta | Primitiva | Documentado en |
| --- | --- | --- |
| `GET /v2/pages/{page_id}/conversations` | `last_conversation_id` (cursor), `since`/`until` (segundos), `order_by: inserted_at \| updated_at`, filtros `type`/`tags`/`unread_first` | `document.md:270-346` |
| `GET /v1/.../conversations/{id}/messages` | `current_count` — «índice desde el que recuperar. Devuelve los 30 mensajes previos» | `document.md:597,609-614` |
| `GET /v1/pages/{page_id}/page_customers` | `since`/`until`/`page_number`/`page_size`/`order_by` | `document.md:1644,1669-1704` |
| Campos de agua de `Conversation` | `inserted_at`, `updated_at` (ambos `date-time`) | `document.md:2977-2984` |
| Límite de tasa | **5 llamadas/segundo por `page_id`** | `document.md:100`; ya aplicado vía `PANCAKE_MIN_INTERVAL_MS=250` |

El adapter ya expone todo esto (`pancake.adapter.ts:55,74,88`), incluida la
corrección `page_number`/`page_size` para `page_customers`.

### Veredicto: **viable a nivel de conversación, NO viable a nivel de mensaje**

#### G1 — la semántica de `since` no está especificada `[PENDIENTE — ambiguo]`

La descripción completa del parámetro es *«Filter from a specific timestamp (in
seconds)»* (`document.md:327`). El documento **no dice**:

- si filtra por `inserted_at` o por `updated_at`;
- si los límites son inclusivos o exclusivos;
- si `since` sin `until` sigue limitando al lote de 60.

Sin eso **no puede construirse una marca de agua exacta** sin elegir una
interpretación. **No se inventa**: es ambigüedad del contrato, no del diseño.

#### G2 — el cursor de conversaciones no es una instantánea estable `[VERIFICADO]`

`last_conversation_id` devuelve «las 60 conversaciones **más recientemente
actualizadas**» y, con el ID de la llamada anterior, «las **siguientes 60 más
antiguas**» (`document.md:278,299`). Dos modos, cada uno con su coste:

| `order_by` | Detecta conversaciones **nuevas** | Detecta conversaciones **actualizadas** | Estabilidad del cursor |
| --- | --- | --- | --- |
| `updated_at` | ✔ | ✔ | **Inestable**: una conversación que se actualiza durante el paginado **cambia de posición** y puede quedar fuera del tramo recorrido |
| `inserted_at` | ✔ | ✘ | Estable (solo se añade al final), pero **una actualización sobre una conversación antigua jamás se ve** |

**Ninguno de los dos modos ofrece at-least-once para «nuevo + actualizado» a la
vez.** La respuesta tampoco trae `total` ni un campo de cursor: hay que tomar el
`id` del último elemento (`document.md:347-358`).

#### G3 — los mensajes no son sincronizables incrementalmente `[VERIFICADO]`

Tres hechos encadenados:

1. `Message` tiene **`inserted_at` pero NO `updated_at`** (`document.md:3902` y
   listado completo del schema en `3848-4076`).
2. El endpoint de mensajes **no acepta `since`**; solo `current_count`
   (`document.md:597,609-614`), que es un **índice posicional** que **se
   desplaza** cuando llegan mensajes nuevos.
3. El estado del mensaje **cambia después de insertarse**: `is_removed`,
   `is_hidden`, `is_parent_hidden`, `seen`, `edit_history`
   (`document.md:3906-3977`) — todos **sin marca temporal de cambio**.

**Consecuencia:** una estrategia `inserted_at > marca_de_agua` **no verá nunca**
un mensaje retirado, oculto o marcado como leído después de su inserción, y la
paginación por índice **puede saltar o repetir** mensajes bajo concurrencia.

### Estado actual en el repositorio `[VERIFICADO]`

- **No existe ningún bucle de sondeo.** `grep @Interval|@Cron` en `src/` → solo
  `whatsapp.scheduler.ts` y `sms-scheduler.ts`, ambos de **automatizaciones**,
  ninguno de lectura de conversaciones entrantes.
- **`resolveConversation` solo consulta la primera página**: `getConversations()`
  **sin cursor ni `since`** (`pancake-whatsapp.provider.ts:234`) → como mucho
  60 conversaciones recientes. Además `catch {}` silencioso (línea 254). La
  protege el flag `pancake.resolveConversationId`, que **es `false` por defecto**
  (`configuration.ts:130`, `provider.ts:80`), así que hoy está **inactiva**.

### Decisiones que se presentan `[PENDIENTE — no se elige ninguna]`

| ID | Pregunta | Alternativas y consecuencias |
| --- | --- | --- |
| **D-05** | Modelo de descubrimiento de conversaciones | **(a)** `order_by=updated_at` + `since` → ve todo pero con saltos posibles (G2). **(b)** `order_by=inserted_at` + `since` → estable y sin saltos, pero **nunca ve actualizaciones**. **(c)** ambos en barridos separados → más llamadas contra un límite de 5/seg por página |
| **D-06** | Estrategia de sincronización de mensajes | **(a)** leer los mensajes de cada conversación descubierta y reconciliar por `id` (cubre creaciones, **no** retiros). **(b)** además re-leer el tramo superior de conversaciones con frecuencia para capturar `is_removed`/`seen` (heurística, no garantía). **(c)** exigir a Pancake la spec de eventos (**PAN-03**) antes de decidir |
| **D-07** | Frecuencia, ventana y *backfill* | **Sin decidir** — dependen de **D-05/D-06** y del límite de 5 llamadas/seg por página. **No se propone un número sin que David lo fije.** |

**No se implementó nada**: ni bucle de sondeo, ni marca de agua, ni *backfill*.

---

## PAN-03 · Especificación oficial de eventos — **NO EXISTE** (25-10-2026)

### Búsqueda realizada `[VERIFICADO]`

| Fuente | `webhook` | `callback` | `event_type` | `push notification` |
| --- | ---: | ---: | ---: | ---: |
| `specs/API-Pancake/document.md` | **0** | 0 | 0 | 0 |
| `specs/API-Pancake/integration.md` | **0** | 0 | 0 | 0 |

Búsqueda de `subscri` en `document.md` → **4 coincidencias, todas**
`subscription plan` (`document.md:4100,4144,4185,4227`): planes de pago de la
página de Facebook, **no** suscripciones a eventos.

Búsqueda de `incoming|real.?time|realtime|escuchar|notificación` en
`integration.md` → **0 coincidencias**. La única mención de lectura es «Uso
previsto: `getConversations`, `getConversationMessages`».

### Qué sí documenta la API (y solo eso)

| Ámbito | Estados documentados | Fuente |
| --- | --- | --- |
| Envío | `success`/`error_code`/`message` vía **HTTP 200 + `success:false`** | `integration.md:179-187` |
| Envío | `retryable` → 429/5xx reintentan; `retryable=false` → terminal | `integration.md:76-84` |
| Mensaje | `seen`, `is_removed`, `is_hidden`, `is_parent_hidden`, `removed_by`, `edit_history` | `document.md:3906-3977` |
| Conversación | `seen`, `snippet`, `message_count`, `updated_at` | `document.md:2964-2984` |

`pancake.inbound.ts` (PAN-01) ya usa exactamente `is_removed` (línea 131) y la
deduplicación por `id` (línea 147), sin inferir ningún estado adicional.

### El bloqueo, con precisión

> **No hay ninguna especificación de eventos de Pancake en el repositorio.**
> Por tanto **no puede definirse un flujo de entrada por webhook** ni declarar
> estados entregados por eventos sin **inventar** el contrato.

- **Se puede** seguir el modelo de sondeo ya adoptado (PAN-02).
- **No se puede** afirmar que Pancake notifique altas, bajas, lecturas o
  retiros; **ningún estado de llegada** está documentado.
- **No se puede** cerrar PAN-03 como contrato. Se queda **ABIERTO** en tanto no
  se obtenga la especificación oficial de eventos de Pancake (documentación del
  proveedor o confirmación escrita de su soporte).

**No se rellenó ese hueco con suposiciones.** `[VERIFICADO]`
