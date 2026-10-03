# Lifecycle de postventa — Especificación funcional

> Versión: 2.0 (cerrada y coherente)
> Fuente de verdad del comportamiento: documento funcional de Baterías del Caribe
> (28 secciones) más las decisiones cerradas en sesión.
> Estado: **especificación funcional, no implementada**.
> Base técnica verificada: `main` @ `e1c09e4`, BD local inspeccionada 2026-10-03.

Este documento consolida lo ya decidido y marca `PENDING_DECISION` únicamente
lo que sigue abierto. No introduce reglas de negocio nuevas.

El lifecycle **no es una máquina de estados lineal**: las etapas se calculan a
partir de fechas y lo que se persiste es el progreso más las decisiones del
cliente. Esa distinción es deliberada (§7).

---

## 1. Unidad del lifecycle

**El lifecycle representa una batería instalada, no una factura.**

Una venta registrada sin instalación **no pertenece al lifecycle**. La fecha
base de todos los cálculos es la fecha de instalación. Si ERP corrige esa
fecha, se utiliza la última válida.

**Regla de materialización.** `Purchase.quantity` **no** implica
automáticamente un único lifecycle. Una compra con varias baterías requiere un
lifecycle independiente por cada batería instalada _cuando exista evidencia o
registro individual de sus instalaciones_. **No se inventan instalaciones a
partir de `quantity`.** Si no hay datos que permitan asociar una batería
concreta a una línea de la factura, no se crea un lifecycle para ella.

Esto es una **regla de materialización futura**: no requiere backfill. Las 35
compras actuales tienen `quantity = 1`, por lo que no existe afectación de
datos conocida.

**Estado actual:** `CommercialCycle` está ligado a `Purchase`
(`commercial_cycles.purchaseId` UNIQUE). No existe entidad de batería ni de
instalación. El sistema representa hoy una batería por línea de compra, lo que
es equivalente en los datos existentes y no lo sería en el caso de una factura
con varias baterías.

---

## 2. Capas

Las reglas viven en seis capas y **una regla transversal vive una sola vez**.

```
1. Domain       Fórmulas de fecha y decisión. Sin I/O.
2. State        El ciclo y su progreso. Persiste.
3. Scheduling   Los hitos ya calculados, con fecha.
4. Eligibility  Gates de envío. Transversales. Evaluados en cada tick.
5. Execution    Envío, reintentos, idempotencia.
6. Provider     Transporte (Pancake / Meta).
```

| Regla                                            | Capa          | Por qué                                                 |
| ------------------------------------------------ | ------------- | ------------------------------------------------------- |
| Fechas de cada hito                              | 1 Domain      | Cambia con cada etapa nueva                             |
| `installationDate`, consentimientos, pausa       | 2 State       | Es progreso del ciclo                                   |
| `commercialAllowed` (3/60 d)                     | 3 Scheduling  | Regla de **generación**: cuántas automatizaciones crear |
| Frecuencia 15 d, ventanas, pausa, no-contact     | 4 Eligibility | Depende del **instante de envío**                       |
| Reintentos, idempotencia por `providerMessageId` | 5 Execution   | —                                                       |

`commercialAllowed` **no se reemplaza ni se fusiona** con el gate de envío.
Viven en capas distintas y responden a preguntas distintas:

- `commercialAllowed`: _"¿creo esta automatización?"_ — cuenta `SCHEDULED`
  futuros + `EXECUTED` de los últimos 60 días, solo para `purpose = COMMERCIAL`.
  Regla de generación.
- **G3**: _"¿puede salir este mensaje ahora?"_ — cuenta mensajes `AUTOMATIC`
  **enviados** (`sentAt`), para cualquier propósito y canal. Regla de envío.

La serie de revisiones de mantenimiento es `TRANSACTIONAL`, por lo que **G3 es
su única protección de frecuencia**.

---

## 3. A. Lifecycle definitivo

| Etapa                         | Trigger                                                                                       | Acción                                                                          | No enviar si                                              | Respuesta esperada                                                                                          | Salida                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Entrada**                   | Instalación válida registrada                                                                 | Crear lifecycle con `installationDate`. Programar el resto                      | Sin `installationDate`; sin WhatsApp; opt-out; pausa      | —                                                                                                           | → Seguimiento                             |
| **Seguimiento / Reseña**      | `instalación + 2..5 días`                                                                     | Solicitar reseña Google **y** ofrecer explícitamente el opt-in de mantenimiento | Reclamación/problema abierto; reseña ya solicitada; pausa | Opción explícita de reseñar; opción explícita de aceptar o rechazar recordatorios; cualquier otra respuesta | Consentimiento registrado; siguiente hito |
| **Mantenimiento 1er intento** | `instalación + 60 días` **y** consentimiento vigente                                          | 1er recordatorio de revisión                                                    | Sin `Consent` vigente; pausa; frecuencia                  | Responde (agenda / info / problema)                                                                         | → 2º intento                              |
| **Mantenimiento 2º intento**  | **1er intento + 7 días**, si no existe interacción válida                                     | 2º recordatorio de revisión                                                     | Sin `Consent` vigente; pausa; frecuencia                  | Sin interacción válida                                                                                      | **Parada de recordatorios**               |
| **Garantía activa**           | `installationDate < hoy < warrantyEnd`                                                        | Ninguna comunicación automática                                                 | —                                                         | —                                                                                                           | → Pre-vencimiento                         |
| **Pre-vencimiento**           | `warrantyEnd − 30 días`                                                                       | Ofrecer diagnóstico + cotización                                                | Pausa; frecuencia; reclamación                            | Responde                                                                                                    | → 2º contacto (condicional)               |
| **2º pre-vencimiento**        | `PENDING_DECISION` (PD-1)                                                                     | —                                                                               | —                                                         | —                                                                                                           | —                                         |
| **Vencimiento**               | `warrantyEnd`                                                                                 | Ninguna comunicación                                                            | —                                                         | —                                                                                                           | → +60                                     |
| **Recuperación +60**          | `warrantyEnd + 60`                                                                            | Reactivar con descuento por entrega de batería vieja                            | Pausa; frecuencia; reclamación; opt-out                   | Responde / ignora                                                                                           | → +90                                     |
| **+90**                       | `warrantyEnd + 90`                                                                            | Test digital de vida útil. **Se envía aunque ignoró +60**                       | Pausa; frecuencia; reclamación; opt-out                   | Responde / ignora                                                                                           | → Campaña post-vencimiento                |
| **Campaña post-vencimiento**  | Tras +90                                                                                      | Mantener oportunidad de recompra                                                | Pausa; reclamación; opt-out                               | —                                                                                                           | `PENDING_DECISION` (PD-8)                 |
| **Nueva compra**              | Compra + instalación                                                                          | Ver §7                                                                          | —                                                         | —                                                                                                           | Fin anterior / ciclo nuevo / ambos vivos  |
| **Nota de §3**                | Cada hito define una **acción**, no un texto. El contenido de cada uno está pendiente de PD-9 |
| **Terminal**                  | Reemplazo, devolución, cierre, opt-out                                                        | Fin del lifecycle                                                               | —                                                         | —                                                                                                           | —                                         |

### 3.1 Reglas de la tabla

**Reseña: 2–5 días, no 48 h exactas.** Rango porque el ERP se carga
periódicamente.

**Reseña: máximo una solicitud efectiva por cliente/ciclo.** No se repite si no
hubo respuesta ni si el mensaje no se deliveró.

**Sin respuesta ≠ consentimiento.** La ausencia de `Consent` equivale a no
consentido. El silencio no se registra como rechazo ni como aceptación.

**Rechazar mantenimiento no termina el lifecycle.** El cliente sigue
recibiendo pre-vencimiento, +60, +90 y recompra. Solo se corta la serie de
recordatorios de revisión.

**Vencimiento ≠ batería agotada.** El documento lo dice explícitamente y por eso
el +60 y el +90 no hablan de "reemplazo urgente" sino de "descuento por
entrega" y "diagnóstico / vida útil".

**"Sin revisión registrada" es un hecho del sistema, no una atribución al
cliente.** El CRM no tiene forma de saber si el cliente hizo la revisión: no
existe entidad de ticket ni de orden de servicio. El 2º intento se dispara
porque no hay interacción registrada, no porque el sistema sepa que el cliente
no lo hizo.

---

## 4. B. Reglas transversales

Todas en **capa 4 (Eligibility)**. Ninguna se duplica en otra capa.

| Gate   | Regla                           | Condición de bloqueo                                                  | Fuente                         |
| ------ | ------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| **G1** | Lifecycle pausado               | `lifecyclePausedAt IS NOT NULL`                                       | `commercial_cycle`             |
| **G2** | No-contact                      | `noContactAt IS NOT NULL`                                             | `customer` _(ya implementado)_ |
| **G3** | Frecuencia automática           | último `AUTOMATIC` con `sentAt <= now − 15 d` → **bloquear**          | `messages` por `sentAt`        |
| **G4** | Silencio tras manual            | último `MANUAL` con `sentAt > now − 7 d` → **bloquear**               | `messages` por `sentAt`        |
| **G5** | Ventana horaria                 | día de la semana + hora local en la ventana del día                   | `weekly_hours`                 |
| **G6** | Festivo                         | fecha en `holidays` → bloquear                                        | `holidays`                     |
| **G7** | Consentimiento de mantenimiento | si la etapa es de mantenimiento y no hay `Consent` vigente → bloquear | `consents`                     |
| **G8** | Instalación                     | `installationDate IS NULL` → bloquear                                 | `commercial_cycle`             |

### 4.1 G3 — borde exacto

```
último AUTOMATIC enviado <= 15 días  →  BLOQUEAR
último AUTOMATIC enviado >  15 días  →  PERMITIR
```

Se cuenta por **`sentAt`**, no por `createdAt`: un mensaje en cola no es un
envío. El día 16 es el primero elegible.

### 4.2 G4 — silencio por mensaje manual

```
último MANUAL enviado > 7 días  →  PERMITIR
último MANUAL enviado <= 7 días →  BLOQUEAR
```

`MANUAL` **no consume** el límite de G3 porque no es un envío automático, pero
**sí activa** G4. `MessageType` ya separa `AUTOMATIC` de `MANUAL`.

### 4.3 G7 no es transversal

A diferencia de G1–G6, G7 **solo aplica a las etapas de mantenimiento**.
Implementarlo como filtro global haría que un cliente sin consentimiento de
mantenimiento perdiera también los avisos de garantía, lo que contradice la
regla "rechazar mantenimiento no termina el lifecycle".

La diferenciación se describe en §4.6.

### 4.4 G5/G6 — ventanas y regla especial

| Día               | Ventana                |
| ----------------- | ---------------------- |
| Lunes–viernes     | 08:00–19:30            |
| Sábado            | 08:30–18:00            |
| Domingo / festivo | sin envíos programados |

**Excepción explícita y delimitada (normativa):**

> Un evento calculado para **domingo a las 02:00** se desplaza al **lunes a las
> 12:15**.

12:15 está dentro de la ventana normal del lunes. **El valor 12:15 es una
excepción deliberada, no el resultado de un redondeo a la siguiente ventana
válida** (que habría dado 08:00).

Esta excepción **no define** el comportamiento de otros eventos fuera de
ventana, como:

- un evento en sábado después de las 18:00;
- un evento en un festivo entre semana;
- un evento en domingo a una hora distinta de 02:00.

Esos casos pertenecen a la lógica general de scheduling y **no deben inferirse
ni generalizarse desde esta excepción**. Su comportamiento permanece sujeto a
la lógica general de ventanas de §4.4.

Si el cliente inicia conversación en domingo o festivo, se permiten
**respuestas automáticas instantáneas** asociadas a esa conversación. Esa
respuesta **no es un envío programado**, no consume la ventana del lifecycle y
no queda sujeta a la regla de los 15 días.

### 4.5 `SKIPPED` — nunca hay mensajes retroactivos

**Problema.** Una automatización puede quedar `SCHEDULED` durante una pausa. Al
reanudar, su `scheduled_date` puede estar en el pasado, y como sigue
`SCHEDULED` con fecha vencida, se enviaría **retroactivamente**.

**Regla:**

> Nunca se envía una automatización cuyo hito haya quedado vencido durante una
> pausa.

**Al reanudar un lifecycle**, toda automatización del ciclo que esté
`SCHEDULED` y con hito vencido pasa a `SKIPPED`:

```sql
-- Nombres reales de Prisma; adaptar si cambia el modelo
UPDATE automations
   SET status = 'SKIPPED'
 WHERE commercial_cycle_id = :cycleId
   AND status = 'SCHEDULED'
   AND scheduled_date <= NOW();
```

**Semántica de los dos estados:**

| Estado      | Significado                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `SKIPPED`   | Automatización que quedó obsoleta / no ejecutable por el paso del tiempo durante una pausa. **No era una decisión de negocio.** |
| `CANCELLED` | Cancelación explícita del lifecycle o de la campaña.                                                                            |

`CANCELLED` **no** se reutiliza para resolver el problema de automatizaciones
vencidas. No se genera ningún mensaje sustitutivo para "compensar" el perdido:
una automatización `SKIPPED` simplemente no se envía.

Esta regla aplica a cualquier supresión temporal por G1, G2, G5 o G6, no solo a
reclamaciones.

### 4.6 Consentimiento: interacción explícita, no texto inferido

Los botones (`Dejar reseña 🌟`, `Agendar revisión 📅`, `Llamar 📞`,
`Agendar diagnóstico 🛠️`, `Cotizar reemplazo 💰`, `Ver precios 🔋`,
`Ir al local 📍`) y cualquier opción explícita de consentimiento son
**interacciones funcionales**, no palabras que deban inferirse libremente desde
texto libre.

Por tanto:

- `"sí"`, `"gracias"`, `"ok"`, `"dale"` u otros textos ambiguos **no**
  constituyen consentimiento por defecto.
- No existe consentimiento implícito por ausencia de respuesta.
- Si la solicitud de reseña no se entrega, eso **no** constituye consentimiento
  para mantenimiento.

**Dependencia declarada:** el canal/proveedor actual **no soporta** la
interacción estructurada que la especificación requiere. Hasta que exista esa
capacidad, la resolución del consentimiento no es determinable y queda en
`PENDING_DECISION` (PD-7). No se sustituye por clasificación de texto.

### 4.7 G7 — qué habilita el consentimiento

| Habilitado por `Consent(MAINTENANCE, GRANTED)` | Bloqueado por el mismo gate          |
| ---------------------------------------------- | ------------------------------------ |
| 1er recordatorio de revisión (+60 d)           |                                      |
| 2º recordatorio de revisión (+7 d)             |                                      |
|                                                | Todas las demás etapas del lifecycle |

Rechazar (`REFUSED`) o no responder deja el lifecycle intacto: garantía,
pre-vencimiento, +60, +90 y recompra siguen aplica.

---

## 5. Prioridad entre comunicaciones concurrentes

Cuando **G3** impide enviar más de un mensaje al mismo cliente, gana el de mayor
categoría:

1. **Comunicaciones vinculadas al vencimiento de garantía** — pre-vencimiento,
   +60, +90, y las de la campaña post-vencimiento.
2. **Comunicaciones de mantenimiento preventivo con consentimiento válido.**
3. **Postventa, reseña y demás comunicaciones no críticas.**

**La prioridad solo decide qué comunicación gana cuando G3 impide enviar más de
una.** No modifica la regla de 15 días ni permite saltársela: el resto queda
bloqueado, no se envía más tarde en el mismo ciclo de 15 días.

Aplicación directa: la colisión medida entre la última revisión de mantenimiento
y el pre-vencimiento a −30 días en garantías de 15 meses (§12, I1) se resuelve a
favor del **pre-vencimiento** por ser categoría 1 frente a categoría 2.

---

## 6. C. Reclamaciones

Una reclamación es una **entidad auditable `Complaint`**, no un tag de
conversación. Guarda apertura, resolución, resultado y trazabilidad.

Una reclamación abierta **pausa las automatizaciones** del lifecycle. Su
resolución **determina la transición**.

### 6.1 Los 6 outcomes

| Outcome                      | Transición                                                        |
| ---------------------------- | ----------------------------------------------------------------- |
| `FALSE_ALARM`                | Reanudar desde el siguiente hito pendiente                        |
| `TECHNICAL_ISSUE_RESOLVED`   | Reanudar desde el siguiente hito pendiente                        |
| `BATTERY_REPLACED`           | Lifecycle `FINISHED` + nuevo lifecycle desde la instalación nueva |
| `DEFECTIVE_PRODUCT_RETURNED` | Lifecycle de la batería afectada `FINISHED`                       |
| `DEFECTIVE_PRODUCT_REPLACED` | Lifecycle `FINISHED` + nuevo lifecycle                            |
| `UNRESOLVED_NO_CONTACT`      | Lifecycle **no** termina. Reanuda según sus próximos hitos        |

### 6.2 La distinción que sostiene la tabla

**"Problema resuelto" ≠ "reemplazo".**

```
Reclamación → cerrada sin cambio de batería → lifecycle continúa
Reclamación → reemplazo                      → lifecycle anterior termina
                                               → nueva instalación → lifecycle nuevo
```

Por eso el producto defectuoso está partido en dos outcomes. Con una sola
categoría "producto defectuoso" **no se puede decidir**: no distingue
"devolvieron la batería y se cierra" de "le pusimos otra y sigue el ciclo".

### 6.3 Regla transversal

> Una reclamación pausa; su resolución determina la transición.
> **Nunca se generan mensajes retroactivos por el tiempo que permaneció pausada.**

Al reanudar, las automatizaciones vencidas pasan a `SKIPPED` según §4.5.

### 6.4 Consecuencia aceptada

`UNRESOLVED_NO_CONTACT` reanuda el lifecycle. Un cliente que desapareció a
mitad de una reclamación vuelve a recibir automatizaciones en su siguiente
hito. Es coherente con que el opt-out sea un eje separado (§9).

---

## 7. D. Nueva compra

| Caso                          | Evidencia                        | Lifecycle anterior       | Lifecycle nuevo             |
| ----------------------------- | -------------------------------- | ------------------------ | --------------------------- |
| **A — Reemplazo**             | Demostrada (mismo vehículo)      | **Termina** (`FINISHED`) | Nuevo, desde su instalación |
| **B — Otro vehículo**         | Vehículo identificado y distinto | **Continúa**             | Nuevo, independiente        |
| **C — No se puede demostrar** | Sin identificación de vehículo   | **No se cancela**        | —                           |

El caso C ya está implementado en el código
(`apps/api/src/modules/automations/automations.service.ts:300-303`: _"Cancelling
what is truly obsolete on recompra is a human decision (V2), not a blanket
rule"_).

La identificación del vehículo **no bloquea P0**. El caso C es el
comportamiento por defecto y es seguro.

Un cliente con varios vehículos tiene lifecycles independientes:

```
Cliente
├── Vehículo 1 → Batería → Lifecycle 1
└── Vehículo 2 → Batería → Lifecycle 2
```

Una compra para el vehículo 2 no cancela las automatizaciones del vehículo 1.

---

## 8. Estados: por qué no es un enum

El lifecycle no es una máquina de estados lineal. Las etapas se calculan a
partir de fechas; lo que se persiste es el progreso y las decisiones del
cliente.

| Eje            | Valores                                                                                                  | Dónde                      |
| -------------- | -------------------------------------------------------------------------------------------------------- | -------------------------- |
| Ciclo          | `ACTIVE` \| `FINISHED` \| `CANCELLED`                                                                    | `commercial_cycles.status` |
| Progreso       | `installationDate`, hitos                                                                                | `commercial_cycles`        |
| Consentimiento | entidad `consents`                                                                                       | tabla                      |
| Pausa          | `lifecyclePausedAt` + `pauseReason`                                                                      | `commercial_cycles`        |
| Envío          | `PENDING` \| `SCHEDULED` \| `EXECUTING` \| `EXECUTED` \| `SKIPPED` \| `CANCELLED` \| `ERROR` \| `PAUSED` | `automations.status`       |
| Cliente        | `ACTIVE`/`INACTIVE`/`BLOCKED`/`PENDING` + `noContactAt`                                                  | `customers`                |
| Reclamación    | `resolution_outcome` (6 valores)                                                                         | `complaints`               |

Una enumeración lineal de las etapas sería incorrecta: un cliente puede estar en
pre-vencimiento **y** sin consentimiento de mantenimiento **y** con una
reclamación abierta. Son ejes ortogonales, no posiciones en una fila.

`SKIPPED` no existe todavía en el enum `AutomationStatus`; se añade con
`ALTER TYPE "AutomationStatus" ADD VALUE 'SKIPPED'`. Ninguna consulta actual lo
requiere: `executeDueAutomations` filtra `status IN ('SCHEDULED','ERROR')`, por
lo que una automatización `SKIPPED` nunca se recoge.

---

## 9. Frecuencia: composición de G3 y G4

Ambos son gates de envío y ambos deben pasar.

| Situación                                        | G3      | G4      | Resultado    |
| ------------------------------------------------ | ------- | ------- | ------------ |
| Último `AUTOMATIC` hace 3 días                   | bloquea | pasa    | **no envía** |
| Último `MANUAL` hace 3 días                      | pasa    | bloquea | **no envía** |
| Último `MANUAL` hace 10 días, ningún `AUTOMATIC` | pasa    | pasa    | envía        |
| Último `AUTOMATIC` hace 16 días                  | pasa    | pasa    | envía        |

Con el lifecycle especificado, ninguna pareja de hitos viola los 15 días: las
revisiones van cada 60, y +60 y +90 están a 30 días de distancia. **G3 es
defensa**, no funcionalidad. Existe porque el tráfico real actual sí colisiona
(§11).

---

## 10. Atención humana, opt-out y pausa

Una interacción que requiere atención humana **pausa el lifecycle** hasta que
la atención se cierre. Ejemplos del documento: "tengo un problema con la
batería", "¿por qué se me está descargando?", "quiero hablar con alguien".

| Concepto        | Origen                | Efecto                                                  | Ámbito      |
| --------------- | --------------------- | ------------------------------------------------------- | ----------- |
| Atención humana | Respuesta del cliente | Pausa (`pauseReason = HUMAN_ATTENTION`)                 | Lifecycle   |
| Reclamación     | Caso registrado       | Pausa (`pauseReason = COMPLAINT`) + entidad `Complaint` | Lifecycle   |
| No-contact      | Solicitud del cliente | Opt-out (`noContactAt`)                                 | **Cliente** |

**No-contact y pausa no son el mismo eje.** `noContactAt` es global del
cliente y corta también campañas y cualquier comunicación; la pausa es del
lifecycle y se levanta cuando se cierra el caso. Confundirlos haría que un
cliente que pidió no recibir mensajes volviera a recibirlos al "reanudar" su
lifecycle.

El cliente que escribe después de un opt-out **sí** recibe atención humana.

---

## 11. Estado de la campaña `Lifecycle Batería (sandbox Human Testing)`

**No modificada en esta sesión.**

```
a9dfbe80-478d-4065-a4f0-bb1c58c8c6a9   ACTIVE
113 SCHEDULED   ·   7 EXECUTED (simulados: provider_message_id = "sim-…")
purpose: TRANSACTIONAL en las 4 etapas
follow_up_sequence_id: NULL  →  las 113 son filas estáticas, no generadas
Desglose: 68 revisiones · 16 +60 · 16 +90 · 13 preventivo = 113
5 textos distintos, ninguno coincide con el catálogo de 169 templates
```

### Incumplimientos medidos

| Regla                  | Incumplimiento                                                  | Evidencia                                                         |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| §1 ancla = instalación | Las 113 ancladas a `purchaseDate`                               | 68 a `compra+60k`, 45 a `warranty±d`                              |
| §3 reseña 2–5 d        | **0** en las 113 (4 solo en historial)                          | —                                                                 |
| §4.7 consentimiento    | **68 revisiones sin consentimiento** a 14 clientes              | Luis Pérez: 10 revisiones                                         |
| §3 fin tras 2º intento | Serie hasta `d+600`, sin condición de parada                    | 68 hasta d+600                                                    |
| §3 +90 no es el final  | El lifecycle acaba ahí                                          | —                                                                 |
| §4.1 G3 (1/15 d)       | **5 pares infringen**                                           | Jorge Ramírez **4 días**; 3× Prueba Lifecycle 6; Daniela Ortega 7 |
| §4.1 (agravante)       | Las 113 son `TRANSACTIONAL` → **bypassean `commercialAllowed`** | el filtro solo cubre `COMMERCIAL`                                 |
| §4.4 ventanas          | Gate inactivo (`businessHoursEnabled = false`)                  | —                                                                 |
| §4.5 `SKIPPED`         | No existe; una pausa larga reenvía el mensaje vencido           | —                                                                 |

### Lectura

Esta campaña **no es apta para producción**, ni siquiera detrás del sandbox: su
calendario contradice la especificación. Su valor es el de **referencia
funcional**: los 5 textos son el contenido aprobado y las 4 etapas corresponden
a las etapas del §3.

No renombrar, no duplicar, no reconstruir textos, no crear sustituta.

---

## 12. Inconsistencias y dependencias detectadas

### I1 · Garantías de 15 meses: revisión y pre-vencimiento colisionan

- **Regla A:** revisión de mantenimiento cada 60 días desde la instalación.
- **Regla B:** primer contacto pre-vencimiento a `warrantyEnd − 30`.
- **Conflicto:** en garantía de **15 meses** ambos caen a **4–7 días** de
  separación. G3 no permite enviar ambos.

Aritmética sobre la instalación (no la fecha de venta):

| Garantía | Última revisión | Días antes del vencimiento | Separación con el pre-venc.      |
| -------- | --------------- | -------------------------- | -------------------------------- |
| 12 m     | d+360           | −5                         | −25 (**ok**, revisión posterior) |
| **15 m** | d+420           | **−34**                    | **4 días**                       |
| 18 m     | d+540           | −7                         | −23 (**ok**)                     |
| 24 m     | d+720           | −11                        | −19 (**ok**)                     |

- **Resuelto por §5 (prioridad):** gana el pre-vencimiento (categoría 1) y la
  revisión queda bloqueada. **No requiere decisión adicional.**
- Observación: si la instalación se registra días después de la venta, la
  separación baja a 3–6 días. La colisión persiste.

### I2 · Colisión entre etapas en la campaña actual

- **Regla A (§4.1):** máximo 1 automático cada 15 días.
- **Regla B (campaña):** la serie de revisiones y el pre-vencimiento coinciden.
- **Medido:** 5 clientes con pares a menos de 15 días, el mínimo a **4 días**.
- **Resuelto por §5 (prioridad).** Requiere G3 implementado; hoy no lo está.

### I3 · Los 13 e2e rojos y el baseline de tsc

No es una regla de negocio sino un hecho del repositorio que condiciona la
verificación: hay 13 tests e2e preexistentes en rojo y 19 errores de `tsc` en
ficheros `*.spec.ts`, todos anteriores a este trabajo. Documentados para que
un gate de CI futuro los distinga de regresiones del lifecycle.

---

## 13. Backlog técnico

**Estado a 2026-10-03.** Los P0.1–P0.10 están implementados y verificados
(`840` tests en `apps/api`, `19` errores de `tsc` preexistentes, `121` de
eslint preexistentes). Los P1.1–P1.4 están implementados en el mismo sitio
único de los gates. El resto sigue pendiente.

### P0 — Requerido antes de producción

| #         | Tarea                                                                                                         | Estado                                  | Depende de |
| --------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| **P0.1**  | **Skip stale automations on lifecycle resume** — ver detalle abajo                                            | Hecho (`97985b3`, `f9db6e8`)            | —          |
| P0.2      | Migración aditiva: `SKIPPED` en `AutomationStatus` + columnas de pausa e instalación en `commercial_cycles`   | Hecho (`506b469`)                       | —          |
| P0.3      | G1 (`lifecyclePausedAt`) y G8 (`installationDate`) en el filtro de envío                                      | Hecho (`c28f262`, `c2c6cb3`, `82ea063`) | P0.2       |
| P0.4      | G3 (1 automático / 15 d, por `sentAt`)                                                                        | Hecho (`97985b3`, `c28f262`)            | —          |
| P0.5      | G4 (7 días de silencio tras `MANUAL`)                                                                         | Hecho (`97985b3`, `c28f262`)            | P0.4       |
| P0.6      | G2: permit entrada tras opt-out y bloque de envío manual                                                      | Hecho, verificado con tests             | —          |
| P0.7      | Corregir el bypass de sandbox cuando `usePancake` está activo (riesgo R1)                                     | Hecho (`36d4245`)                       | —          |
| P0.8      | Migración: entidad `Complaint` con los 6 outcomes                                                             | Hecho (`506b469`)                       | —          |
| P0.9      | `openComplaint` desde la atribución de respuesta ya existente (`resolveReplyOrigin` → `automation` → `cycle`) | Hecho (`0cd1ff0`)                       | P0.8       |
| P0.10     | `resolveComplaint` con las 6 transiciones de §6.1                                                             | Hecho (`f9db6e8`)                       | P0.9       |
| **P0.11** | **Origen del texto de cada hito** — ver detalle abajo                                                         | **Bloqueado: PD-9**                     | P0.2       |

#### P0.1 · Skip stale automations on lifecycle resume

**Objetivo.** Impedir que una automatización vencida durante una pausa se envíe
al reanudar.

**Criterios.**

1. Detectar automatizaciones `SCHEDULED` cuyo hito ya venció.
2. Marcarlas `SKIPPED`.
3. Impedir envíos retroactivos.
4. Preservar la idempotencia (una automatización `SKIPPED` nunca llega al
   proveedor, así que no puede colisionar con `providerMessageId`).
5. No afectar automatizaciones futuras: solo aquellas con
   `scheduled_date <= now`.
6. Distinguir `SKIPPED` de `CANCELLED`.
7. **Tests de pausa corta y de pausa prolongada**:
   - pausa de 1 día, hito vence mañana → la automatización **sigue**
     `SCHEDULED` y se envía en su momento;
   - pausa larga (el hito vence durante la pausa) → pasa a `SKIPPED` y **no**
     se envía al reanudar;
   - pausa que termina y hay un hito futuro → ese hito **no** se toca;
   - reanudar dos veces no produce efectos adicionales.

**Módulos afectados.** `automations` (enum y estado), `whatsapp.service.ts`
(resume del lifecycle), `reports` (contar `SKIPPED`).

**Nota de alcance.** Es la única forma de cumplir §4.5. Sin esta tarea, la regla
"nunca mensajes retroactivos" queda documentada pero incumplida.

#### P0.11 · Origen del texto de cada hito

**Lo que ya está resuelto.** `planMilestones()`
(`apps/api/src/modules/lifecycle/lifecycle-milestones.ts`) devuelve qué hito,
cuándo y con qué prioridad, y `elapsedMilestones()` separa lo vencido de lo
futuro. La parte temporal de §3 está completa y probada.

**Lo que falta.** El texto de cada hito. Este documento define la **acción** de
cada hito, no su contenido, y no hay origen aprobado del que leerlo:

| Opción                                   | Problema                                                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `follow_up_sequences` (las 4 existentes) | Codifican un lifecycle **distinto**: offsets `−180/−60/−30/0/0/+90`, no los de §3. Adoptarlas contradiría esta spec.                                 |
| `templates` (el catálogo)                | Ninguna de las 169 plantillas coincide con los textos de la campaña Lifecycle, y el catálogo está pendiente de revisión con Meta.                    |
| Los textos de la campaña Lifecycle       | Solo existen en sus `113` filas estáticas, no como plantillas reutilizables. Copiarlos a otra estructura es una decisión de contenido, no de código. |

Por eso `MilestoneTemplateSource` está declarado como
`type MilestoneTemplateSource = 'PENDING_DECISION'` y ninguna capa de generación
lo consume todavía. Implementar la generación sin resolver esto significaría
inventar contenido o duplicar en otra tabla textos ya aprobados por escrito.

### P1 — Requerido para el lifecycle completo

| #    | Tarea                                                                                        | Estado                                                    | Depende de |
| ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| P1.1 | Migración: entidad `consents` auditable                                                      | Hecho (`506b469`, `f9db6e8`)                              | —          |
| P1.2 | G7: consentimiento vigente habilita los 2 intentos de revisión                               | Hecho (`c28f262`)                                         | P1.1, P0.1 |
| P1.3 | Ventanas por día de la semana (`weekly_hours`) + tabla `holidays`                            | Hecho con config de organización (`c28f262`)              | —          |
| P1.4 | Lógica de scheduling que aplica las ventanas y la excepción del lunes 12:15                  | Hecho (`c28f262`, `c2c6cb3`)                              | P1.3       |
| P1.5 | Fechas de las etapas: reseña 2–5 d, revisión +60, 2º intento +7, pre-venc. −30, +60, +90     | Fechas hechas (`aa040fb`); generación bloqueada por P0.11 | P0.3       |
| P1.6 | Campaña post-vencimiento — `PENDING_DECISION` (PD-1, PD-8)                                   | —                                                         | —          |
| P1.7 | Interacción estructurada / botones para consentimiento y agendar — `PENDING_DECISION` (PD-7) | —                                                         | —          |
| P1.8 | Regla de reintento del consentimiento si la reseña no se entrega — `PENDING_DECISION` (PD-6) | —                                                         | —          |
| P1.9 | Materialización de una batería instalada por lifecycle cuando exista registro individual     | `quantity` sigue sin convertirse en lifecycles            | —          |

### P2 — Futuro

| #    | Tarea                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| P2.1 | Exponer `SKIPPED` en la UI de automatizaciones para que un asesor vea por qué un cliente no recibió un hito |
| P2.2 | Revisar si PD-6/pd-7 siguen vigentes una vez en producción                                                  |
| P2.3 | Prioridad visible en el log de scheduler cuando G3 descarta una comunicación                                |

---

## 14. E. Decisiones: cerradas y pendientes

### Cerradas

| Decisión                        | Cierre                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Unidad del lifecycle            | Batería instalada, no una factura                                                            |
| Materialización                 | Un lifecycle por batería instalada **con registro individual**; nunca a partir de `quantity` |
| Sin instalación                 | No pertenece al lifecycle                                                                    |
| Sin WhatsApp                    | La compra persiste, no genera comunicaciones                                                 |
| Corrección de fecha ERP         | Se usa la última fecha válida                                                                |
| Reseña                          | 2–5 días tras instalación; máximo una efectiva por cliente/ciclo                             |
| Reseña bloqueada                | No se envía si hay reclamación/problema                                                      |
| Consentimiento de mantenimiento | Entidad auditable; requiere interacción **explícita**                                        |
| Sin respuesta                   | **No** hay consentimiento implícito                                                          |
| Mantenimiento                   | Solo con consentimiento vigente                                                              |
| 1er recordatorio                | `instalación + 60 días`                                                                      |
| 2º recordatorio                 | **1er intento + 7 días**                                                                     |
| Parada                          | Tras el 2º intento sin interacción válida, no hay más solicitudes                            |
| Rechazo de mantenimiento        | No termina el lifecycle ni bloquea garantía, vencimiento ni recompra                         |
| Garantía                        | Sin mensajes periódicos no consentidos                                                       |
| Pre-vencimiento                 | Primer contacto a `warrantyEnd − 30`                                                         |
| +60                             | Recuperación                                                                                 |
| +90                             | Se envía aunque ignoró +60                                                                   |
| Tras +90                        | Campaña de recompra post-vencimiento                                                         |
| Reclamación                     | Entidad `Complaint` auditable, no tag                                                        |
| Reclamación abierta             | Pausa las automatizaciones del lifecycle                                                     |
| Outcomes                        | 6, cada uno con transición única                                                             |
| Reclamación resuelta            | Sin mensajes retroactivos; lo vencido pasa a `SKIPPED`                                       |
| `SKIPPED`                       | Automatización vencida durante una pausa                                                     |
| `CANCELLED`                     | Reservado a cancelación explícita; **no** reutilizable para automatizaciones vencidas        |
| Nueva batería, mismo vehículo   | Termina el lifecycle anterior                                                                |
| Nueva batería, otro vehículo    | Lifecycle independiente                                                                      |
| Reemplazo no demostrado         | **No** se cancela automáticamente el lifecycle anterior                                      |
| Identificación de vehículo      | No bloquea P0                                                                                |
| Opt-out                         | Detiene automatizaciones; atención humana sí permitida                                       |
| Atención humana                 | Pausa el lifecycle hasta cierre                                                              |
| Mensaje manual                  | No consume el límite de frecuencia; activa 7 días de silencio                                |
| Frecuencia                      | Máximo 1 outbound automático cada 15 días                                                    |
| Ventanas                        | L-V 08:00–19:30; sábado 08:30–18:00; domingo/festivo sin programados                         |
| Domingo 02:00                   | Excepción explícita → lunes 12:15; no generalizable                                          |
| Prioridad                       | Vencimiento > mantenimiento consentido > resto (§5)                                          |

### Pendientes de decisión humana

| #        | Pendiente                                                                                                                                                                                                                                                                                                                                                                                                                                       | Bloquea |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **PD-1** | Condición exacta del **segundo contacto pre-vencimiento**. _"Falta definir bajo qué condición se genera el segundo contacto antes del vencimiento."_                                                                                                                                                                                                                                                                                            | P1.6    |
| **PD-6** | Mecanismo de **reintento o segunda presentación** del consentimiento si la solicitud de reseña no se entrega. La regla de "no hay consentimiento implícito" **queda cerrada**; lo que falta es si se vuelve a ofrecer.                                                                                                                                                                                                                          | P1.8    |
| **PD-7** | Soporte de **botones / interacción explícita** en el canal. Sin él, el consentimiento no es determinable y no se sustituye por clasificación de texto.                                                                                                                                                                                                                                                                                          | P1.7    |
| **PD-8** | **Cadencia de la campaña post-vencimiento** (número de contactos y condiciones de salida).                                                                                                                                                                                                                                                                                                                                                      | P1.6    |
| **PD-9** | **Origen del texto de cada hito.** Este documento define la acción de cada hito pero no su contenido, y ninguna fuente existente es adecuada: las 4 `follow_up_sequences` codifican un lifecycle distinto, y el catálogo de `templates` no contiene los textos de la campaña Lifecycle. Hay que elegir una: (a) secuencia nueva por spec con textos aprobados, (b) extraer los textos de la campaña Lifecycle al catálogo, o (c) otro catálogo. | P1.5    |

Nada más requiere decisión. Las reglas de negocio de este documento están
cerradas; PD-9 no es una regla de negocio sino una fuente de contenido.

---

## 15. Riesgos de producción ajenos a esta especificación

Ninguno es responsabilidad del lifecycle.

| #   | Riesgo                                                                                                                               | Estado                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **`--pancake` anula el sandbox**: `usePancake` ganaba a `simulated`; el script escribe la ruta como mutuamente excluyente            | **Cerrado** (`36d4245`). El sandbox gana siempre y avisa por log si coinciden. Con las 113, ya no disparan el 05/10/2026 14:02 |
| R2  | **Webhook pierde entrantes y devuelve 200**: `rawBody` no activado + `WHATSAPP_DEFAULT_ORGANIZATION_ID` apunta a una org inexistente | Abierto                                                                                                                        |
| R3  | **`seed-demo` borra en físico** el tenant real (`deleteMany` sobre `baterias-del-caribe`)                                            | Abierto                                                                                                                        |
| R4  | **e2e contra la BD de la app**: `auth.e2e-spec.ts:537` hace `audit.deleteMany({})` sin scope                                         | Abierto                                                                                                                        |
| R5  | **Pancake no configurado**: el contenedor no tiene ninguna variable `PANCAKE_*`                                                      | Abierto                                                                                                                        |
| R6  | **Sin backup**: no hay `pg_dump` ni procedimiento de restore                                                                         | Abierto                                                                                                                        |
| R7  | **Datos reales del cliente en Git**: 3 `.xlsx` en `specs/Data-Excel/` desde `431bf97`                                                | Abierto, decisión de David                                                                                                     |

R2 impide cualquier prueba de recepción real. R1 ya no dispara nada, pero el
script sigue eliminando la barrera por diseño: si alguien lo usa con
`--pancake` contra una organización en producción, la única protección que
queda es que esa organización no esté en
`WHATSAPP_SANDBOX_ORGANIZATION_IDS`.

---

## 16. Criterio de aceptación funcional

Cada fila es un caso de prueba, no una frase.

```
Entrada
  venta sin instalación              → 0 lifecycles
  venta con instalación              → 1 lifecycle con installationDate
  venta sin WhatsApp                 → compra persiste, 0 comunicaciones
  corrección de fecha ERP            → se usa la última
  quantity=2 sin registro individual → 1 lifecycle, no 2 inventadas

Reseña
  siempre cae entre +2 y +5 días
  segunda reseña efectiva            → imposible
  reclamación abierta               → no se envía
  reseña no entregada                → NO constituye consentimiento

Mantenimiento
  sin Consent                        → 0 revisiones
  con Consent                        → 1er intento a +60
  2º intento                         → exactamente +7 días del 1er
  tras el 2º intento                 → no hay 3er intento
  rechazo                            → sigue recibiendo pre-venc., +60 y +90

Pre-venc. / post-venc.
  -30 siempre presente
  +60 siempre presente
  +90 enviado aunque ignoró +60
  ignoró +60                         → entra en campaña post-venc.

Reclamación
  apertura                           → lifecycle pausado
  FALSE_ALARM                        → reanuda, sin retroactivos
  TECHNICAL_ISSUE_RESOLVED           → reanuda, conserva antecedente
  BATTERY_REPLACED                   → anterior FINISHED + lifecycle nuevo
  DEFECTIVE_PRODUCT_RETURNED         → anterior FINISHED
  DEFECTIVE_PRODUCT_REPLACED         → anterior FINISHED + lifecycle nuevo
  UNRESOLVED_NO_CONTACT              → lifecycle sigue vivo

SKIPPED
  pausa corta, hito vence mañana     → sigue SCHEDULED, se envía a su hora
  pausa larga, hito vence en pausa   → SKIPPED, no se envía al reanudar
  hito futuro durante la pausa       → no se toca
  reanudar dos veces                 → sin efectos adicionales
  mensaje perdido                    → no se genera sustituto

Nueva compra
  reemplazo demostrado               → anterior termina
  otro vehículo                      → ambos vivos
  sin evidencia                      → anterior NO se cancela

Frecuencia
  2 AUTOMATIC a 4 días               → el 2º se bloquea
  MANUAL a 3 días                    → AUTOMATIC se bloquea
  MANUAL a 10 días                   → AUTOMATIC pasa
  MANUAL no consume el límite de 15 d

Prioridad
  revisión y pre-venc. a 4 días     → gana pre-venc. (vencimiento)
  resto bloqueado por G3             → no se envía, no se reprograma

Ventanas
  sábado 08:00                       → bloqueado
  sábado 08:45                       → permitido
  domingo / festivo                  → bloqueado
  domingo 02:00                      → lunes 12:15
  sábado 19:00                       → lógica general, no la excepción

Consola
  domingo 19:00, cliente escribe    → respuesta automática instantánea
```

---

## 17. Trazabilidad

| Decisión                   | Cierre                                                     | Fecha      |
| -------------------------- | ---------------------------------------------------------- | ---------- |
| Unidad del lifecycle       | Batería instalada                                          | 2026-10-03 |
| Materialización            | Un lifecycle por batería con registro individual           | 2026-10-03 |
| Sin WhatsApp               | Compra persiste, no comunica                               | 2026-10-03 |
| Reseña                     | 2–5 días, una efectiva por cliente/ciclo                   | 2026-10-03 |
| Consentimiento             | Entidad auditable, requiere interacción explícita          | 2026-10-03 |
| Sin respuesta              | No hay consentimiento implícito                            | 2026-10-03 |
| Mantenimiento              | 1er intento +60; 2º intento +7; luego parada               | 2026-10-03 |
| Rechazo de mantenimiento   | No termina el lifecycle                                    | 2026-10-03 |
| +90                        | Se envía aunque ignoró +60                                 | 2026-10-03 |
| Reclamación                | Entidad `Complaint` auditable                              | 2026-10-03 |
| Outcomes de reclamación    | 6, cada uno con transición única                           | 2026-10-03 |
| `SKIPPED`                  | Vencida durante pausa; `CANCELLED` reservado a cancelación | 2026-10-03 |
| No retroactividad          | Sin mensajes sustitutivos                                  | 2026-10-03 |
| Reemplazo sin evidencia    | No cancelar lifecycle anterior                             | 2026-10-03 |
| Identificación de vehículo | No bloquea P0                                              | 2026-10-03 |
| Frecuencia                 | 1 AUTOMATIC / 15 d                                         | 2026-10-03 |
| Silencio manual            | 7 días                                                     | 2026-10-03 |
| Ventanas                   | L-V 08:00–19:30; Sáb 08:30–18:00; dom/festivo nada         | 2026-10-03 |
| Domingo 02:00              | Excepción explícita → lunes 12:15                          | 2026-10-03 |
| Prioridad                  | Vencimiento > mantenimiento > resto                        | 2026-10-03 |
