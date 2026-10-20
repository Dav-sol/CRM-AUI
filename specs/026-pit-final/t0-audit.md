# T0-AUDIT — Informe de Auditoría de Solo Lectura

## 1. Identificación

| Campo | Valor |
|---|---|
| **Proyecto** | Automatize IT Platform |
| **Cliente piloto** | Baterías del Caribe (BDC) |
| **Documento rector** | `specs/026-pit-final/pit.md` (PIT-BDC-POSTVENTA-001, v0.1) |
| **Identificador de auditoría** | T0 |
| **Fase del PIT** | Fase 0 — T0: Auditoría de solo lectura (`pit.md` §7) |
| **Entregable exigido por** | `pit.md` §7 Fase 0 y §16 "Próximo paso inmediato" |
| **Fecha de elaboración** | 2026-10-10 |
| **Autor de la auditoría** | Agente OpenCode, bajo instrucción explícita del responsable funcional y técnico (David) |
| **Repositorio** | `/workspace/projects/automatize-it-platform` |
| **Rama / HEAD** | `main` @ `3469432` |

### 1.1 Autoridad documental declarada

**`pit.md` es la autoridad máxima de este proyecto** para requisitos funcionales, lógica de negocio, preparación para producción, fases, criterios de aceptación y decisiones de Baterías del Caribe.

En consecuencia, este informe:

- **No sustituye ningún requisito del PIT.**
- **No reinterpreta ni reduce el alcance de ningún requisito.**
- Registra como **brecha de implementación** toda divergencia entre el PIT y `spec-025`, `AGENTS.md`, el código, las pruebas o la base de datos.
- Cuando una fuente externa contradice al PIT, **el PIT prevalece** y la contradicción se documenta como brecha, no como corrección.
- Ninguna afirmación contenida aquí modifica requisitos. Cualquier cambio de requisito requiere el procedimiento de `pit.md` §2: identificador, motivo, responsable, impacto, pruebas afectadas y aprobación.

### 1.2 Alcance

Auditoría de **solo lectura** sobre el estado real del sistema frente a los requisitos del PIT: modelos de datos, cálculo de fechas, generación de automatizaciones, motor de elegibilidad, persistencia de mensajes, integración de mensajería, scheduler, y estado de la base de datos.

### 1.3 Limitaciones declaradas

| # | Limitación | Consecuencia |
|---|---|---|
| L1 | No se ejecutaron envíos reales, niandbox del proveedor, ni llamadas que pudieran provocar un envío | RF-04, RF-06, RNF-05 no pudieron verificarse contra el proveedor |
| L2 | No se ejecutaron migraciones, despliegues, reinicios ni builds | El estado del artefacto desplegado se verificó solo por inspección del contenido de la imagen |
| L3 | No se realizaron escrituras en base de datos; todas las consultas se ejecutaron en `BEGIN TRANSACTION READ ONLY … ROLLBACK` | Ninguna cifra de este informe procede de una mutación |
| L4 | No se modificó `OUTBOUND_SEND_ENABLED` ni ninguna allowlist | La contención de envíos permanece activa durante y después de la auditoría |
| L5 | `spec-025` estaba vacío en el working tree durante toda la auditoría | La contradicción D-1 no pudo resolverse documentalmente; se registró como brecha B1 |
| L6 | No se ejecutó la suite completa de pruebas de la API | El estado de pruebas se marca `[NO VERIFICADO]` salvo evidencia histórica explícita |

### 1.4 Etiquetas de evidencia

| Etiqueta | Significado |
|---|---|
| `[VERIFICADO]` | Comprobado directamente durante esta auditoría, con evidencia identificable (archivo:línea, consulta, respuesta HTTP). Confianza `[alta]` salvo indicación contraria |
| `[EVIDENCIA HISTÓRICA]` | Reportado por una auditoría anterior (AUTO-SAFETY-002…008, PIT-001, PIT-002). No reconfirmado en esta sesión. Confianza `[media]` |
| `[INFERIDO]` | Conclusión derivada de evidencia indirecta, sin comprobación completa. Confianza `[media]` o `[baja]` |
| `[NO VERIFICADO]` | No se encontró evidencia suficiente. |
| `[CONFLICTO]` | El código, un documento o la base de datos contradice el requisito rector del PIT |
| `[REQUIERE APROBACIÓN]` | Requiere decisión o autorización humana |

---

## 2. Resumen ejecutivo

### 2.1 Estado general

El PIT define **22 requisitos** (15 funcionales + 7 no funcionales), **9 fases**, **14 casos de prueba**, **17 criterios de aceptación** y **15 decisiones pendientes**.

Estado técnico consolidado de esos 22 requisitos:

| Estado | Cantidad | Requisitos |
|---|---|---|
| Ausente | 10 | RF-03*, RF-04, RF-05, RF-06, RF-07, RF-09, RF-10, RF-14, RNF-02* |
| Parcial | 9 | RF-01, RF-02*, RF-08*, RF-12, RF-13, RF-15, RNF-01, RNF-04, RNF-07 |
| Implementado | 3 | RF-11, RNF-05, RNF-06 |
| No verificado | 0 | — |

(*) Requisitos con矛盾Documental además de brecha técnica: ver §3 y §6.

**Ningún requisito está en estado "Aceptado por el responsable" ni "Autorizado para producción".** Ninguna de las 9 fases T0–T8 cumple su criterio de salida con aceptación del responsable.

### 2.2 Bloqueantes de producción

| # | Bloqueante | Requisitos afectados |
|---|---|---|
| **BL-1** | La base de datos no permite distinguir una compra válida de una incompleta. `purchases.warranty_months` es NULL en **5 510 de 5 537** compras | RF-01 |
| **BL-2** | `messages.customer_id` es NULL en **8 163 de 8 163** mensajes. El límite global de frecuencia consulta por `customerId`, por lo que **nunca encuentra historial** | RF-08, RNF-02 |
| **BL-3** | El calendario programado (+3d, +6m, +12m) no corresponde a las revisiones bimensuales del PIT. Hay **8 529 automatizaciones `SCHEDULED` con fecha futura** | RF-03, §14.4 |
| **BL-4** | No existe captura de placa en ninguna capa | RF-04, RF-05 |
| **BL-5** | `commercial_cycles.end_date` es NULL en **5 528 de 5 528** ciclos; 0 terminados; 0 pausados; 0 opt-out | RF-06, RF-10, RF-12 |

### 2.3 Riesgos críticos

1. **Contención de envíos activa como única barrera.** `OUTBOUND_SEND_ENABLED=DENIED`, allowlists vacías, health expone la política. `[VERIFICADO] [alta]` Esta barrera es lo que impide que BL-3 se convierta en contacto real con clientes.
2. **Divergencia documental de autoridad mayor.** El código implementa y cita "spec 025 §1"; el PIT fija fecha base de compra ERP. Además `spec-025` está vacío en disco. `[VERIFICADO] [alta]`
3. **Ausencia de artefactos de auditoría previos.** Este documento es el primer entregable T0 materializado; la auditoría T0 anterior solo existió en conversación.

### 2.4 Qué está comprobado y qué requiere verificación adicional

**Comprobado en esta sesión `[VERIFICADO]`:** modelo de datos de mensajes y ciclos, contenido real de la base de datos, cálculo de vencimiento, generación de automatizaciones, ventanas horarias, motor de elegibilidad, política de envíos desplegada, contenido de la imagen en producción.

**Evidencia histórica `[EVIDENCIA HISTÓRICA]`:** cobertura de superficies de red por el guard de seguridad (AUTO-SAFETY-004), comportamiento del frontend ante el bloqueo (AUTO-SAFETY-005/006/008), imagen desplegada correspondiente al código de seguridad (AUTO-SAFETY-003).

**Requiere verificación adicional `[NO VERIFICADO]`:** comportamiento real del scheduler en el entorno objetivo (P0.2 del PIT), verificación extremo a extremo de Pancake (P0.3), plantillas aprobadas por el proveedor (P0.6), ejecución real de recuperación post-caída (RF-13).

---

## 3. Matriz de requisitos

**Definiciones de estado aplicadas** (el PIT no las define explícitamente; se declaran aquí para evitar ambigüedad):

| Nivel | Significado |
|---|---|
| **Descrito** | El PIT lo exige y está redacto |
| **Implementado** | Existe código o configuración que lo produce |
| **Probado** | Existe prueba automatizada que lo verifica y se ha ejecutado |
| **Aceptado por el responsable** | David confirmó el resultado |
| **Autorizado para producción** | Existe autorización explícita para operar |

Un requisito **no** se declara cumplido por el hecho de que exista código relacionado: el estado "Implementado" exige haber leído el código; "Probado" exige evidencia de ejecución; los dos últimos requieren intervención humana.

### 3.1 Requisitos funcionales

| ID | Requisito rector | Ref. PIT | Criterio de aceptación (PIT) | Evidencia requerida | Estado documental | Estado técnico | Evidencia observada | Brecha | Riesgo | Dependencias | Aprobación humana |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **RF-01** | Ingreso de compras; validar datos obligatorios; **rechazar la fila si falta teléfono, fecha de compra o duración de garantía**; registrar motivo en `failed_sync_logs`; sin valor predeterminado para duración | §4 RF-01, §8, §14.2 | Fila válida crea/actualiza por idempotencia; fila inválida no genera automatizaciones; cada rechazo registra motivo legible, referencia de origen y fecha; reprocesar una fila corregida no duplica | CP-01, CP-02; pruebas de fila válida e inválida | Objetivo | **Parcial / Ausente en su regla de rechazo** `[VERIFICADO]` | `imports.processor.ts:25-33` `toWarrantyMonths` devuelve `null` si falta; `:434,449` persiste `warrantyMonths ?? undefined` (no rechaza); `:484` cae a `product.warrantyMonths`; `imports.parser.ts:73` marca instalación como **columna OPCIONAL**. BD: `purchases.warranty_months` NULL en **5 510/5 537**; tabla `failed_sync_logs` **no existe** (`information_schema.tables`=0) | La fila **no se rechaza**: se acepta sin duración y continúa. No existe registro de rechazos. La duración puede derivarse del producto, algo que §4 RF-01 prohíbe al afirmar "no se resuelve con un valor predeterminado" | Entran al lifecycle compras sin garantía. Ninguna auditoría de rechazos. Incumple §14.2 | T2.1, T2.2 | **Sí** — decisión sobre qué campos son realmente bloqueantes y dónde se registra el rechazo |
| **RF-02** | **La fecha base es la fecha de compra registrada en el ERP, no la fecha de instalación**; duraciones 12/15/18/24; la duración no se infiere del nombre comercial; **vencimiento centralizado y determinista**; regla de fin de mes definida | §4 RF-02, §14.3 | El mismo registro siempre produce la misma fecha de vencimiento; los casos de fin de mes tienen resultados documentados y probados; la fecha de compra **no se sustituye silenciosamente** por la de instalación; una garantía inválida bloquea la programación | Tabla de fechas esperadas y pruebas de límites (T1); CP-03 | Objetivo — **en conflicto abierto (D-1)** | **Parcial `[CONFLICTO]`** | `lifecycle.rules.ts:58-70`: comentario *"Fin de garantía contado desde la INSTALACIÓN, no desde la venta (§1)"*; firma `warrantyEnd(installationDate, warrantyMonths)`; cálculo `addDays(installationDate, Math.round(warrantyMonths * 30.4375))` — **días con factor 30,4375, no meses de calendario, sin clamp de fin de mes**. `automations.service.ts:297-311` rechaza explícitamente entrar sin `installationDate`. `imports.processor.ts:490` calcula `warrantyExpiresAt` con `addMonths(purchaseDate, months)` — **dos bases distintas en el mismo sistema**. BD: solo **27/5 537** compras tienen `warranty_expires_at` | Incumple tres criterios a la vez: base, método de cálculo (no calendario) y ausencia de regla de fin de mes. El vencimiento se desvía hasta ±15 días en garantías largas | Envíos en fechas incorrectas; staircases de garantía que el cliente percibe como error. Incumple §14.3 | **D-1** bloquea T1.2 | **Sí — D-1** |
| **RF-03** | Cada compra elegible genera un ciclo; revisiones **cada dos meses desde la fecha base: meses 2, 4, 6, 8, 10, 12, 14…** hasta el vencimiento, sin programar fuera de la garantía; el contacto inicial es etapa diferenciada | §4 RF-03, §14.4 | Calendario completo por duración; ninguna revisión posterior al vencimiento | CP-03; calendario completo por duración | Objetivo | **Ausente `[VERIFICADO]`** | `automations.service.ts:331-343`: `scheduledDates = [addDays(installationDate,3), addMonths(installationDate,6), addMonths(installationDate,12)]`;comment *"este es el calendario por defecto"*. `lifecycle-milestones.ts` genera `MAINTENANCE_1ST/2ND`, `REVIEW`, `PRE_EXPIRY`, `POST_EXPIRY_60/90` — **no hay generador bimensual**. BD: `stage_name` distintos observados incluyen `Revisión +60…+600 días`, `Seguimiento postventa (Día 3/Mes 6/Mes 12)`; **8 529** automatizaciones `SCHEDULED` con `scheduled_date > now()` | El calendario programado no es el del PIT: 3 hitos en lugar de 6–12 revisiones bimensuales | 8 529 automatizaciones pendientes se activarían sobre una cadencia que el negocio **no aprobó**. Incumple §14.4 | **D-1** (la cadencia depende de la fecha base); T1.3 | **Sí — D-1** |
| **RF-04** | Contacto inicial para **solicitar la PLACA**; procesar la respuesta: identificar conversación/cliente/ciclo, normalizar, validar formato colombiano, exigir asociación inequívoca, guardar placa, registrar evidencia; si es inválida o ambigua, **conservar el evento sin modificar otro vehículo**; la regex no puede ser el único mecanismo | §4 RF-04, §14.5, §14.6 | La placa se valida y se asocia al ciclo correcto; respuesta ambigua no modifica ningún ciclo; se conserva evidencia para resolver | CP-04, CP-05; T3.1–T3.5 | Objetivo | **Ausente `[VERIFICADO]`** | `grep -cniE "plate\|placa"` sobre `schema.prisma` devuelve 21 coincidencias **todas dentro de nombres de plantilla** (`template`, `templateD3`, `templateD180`, `templateD365`). Sin campo de placa en `Customer`, `Vehicle` o `CommercialCycle`. `grep` en código de dominio (excluyendo plantillas): **0 resultados**. `lifecycle-milestones.ts:181`: `export type MilestoneTemplateSource = 'PENDING_DECISION'`. BD: `commercial_cycles` no tiene columna de placa | No existe captura de placa en ninguna capa: ni almacenamiento, ni validación, ni webhook asociado | El primer contacto del PIT no puede existir. Sin placa, RF-05 queda bloqueada y §14.5–14.7 son inalcanzables | T3 completa | No (el PIT ya lo exige) |
| **RF-05** | Solicitud de reseña **solo después de capturar placa válida** y asociarla al ciclo correcto; **no se dispara por el mero transcurso de 48 h**; respeta horario, frecuencia global y políticas de WhatsApp; si la placa llega fuera de ventana, se reprograma a la siguiente elegible | §4 RF-05, §14.7 | La solicitud de reseña solo se habilita después de una placa válida; prueba que demuestra el orden obligatorio | CP-06; T3.6–T3.7 | Objetivo | **Ausente (depende de RF-04) `[INFERIDO]`** | No existe verificación previa a una captura válida. BD: existe etapa `Día +2 — Reseña Google` entre los `stage_name` observados, lo que sugiere que la reseña se programa por fecha y no por orden de captura | La condición principal del PIT es la **captura válida de placa**; el sistema no la conoce | Reseñas enviadas a clientes que nunca出去玩aron la campaña. §14.7 incumplida | RF-04 | No |
| **RF-06** | La campaña termina en la fecha de vencimiento calculada; marcar finalizada, cancelar/invalidatear etapas pendientes, evitar reejecución, activar retención, programar impactos, registrar la transición; **atómica o recuperable e idempotente**. Secuencia aprobada: **+60d, +90d, +6m, +12m, +18m desde el vencimiento original** (no desde el impacto anterior) | §4 RF-06, §14.12 | Una transición produce una sola campaña de retención y cinco etapas únicas; no deja recordatorios de garantía elegibles tras el vencimiento | CP-09; "Una transición y cinco etapas únicas" | Objetivo | **Ausente `[VERIFICADO]`** | `lifecycle-milestones.ts:137-155` ancla `PRE_EXPIRY` (−30d), `POST_EXPIRY_60` (+60d), `POST_EXPIRY_90` (+90d) al `warrantyEnd`; **faltan +6m, +12m y +18m**. `commercial_cycles` no tiene columna `termination_reason` poblada. BD: **`end_date` NULL en 5 528/5 528**; `termination_reason` no NULL en **0**; `deleted_at` no usado como cierre. Etapas observadas incluyen `Vencida +60 días` y `Vencida +90 días`, pero ninguna `+6m/+12m/+18m` | La transición nunca se ha ejecutado. Falta la mitad de la secuencia aprobada | La retención nunca se ejecuta: el cliente que sale de garantía no recibe ningún impacto comercial. §14.12 incumplida | RF-02 (depende del vencimiento) | No para la secuencia (ya está aprobada en el PIT); **sí** para el contenido de las 5 plantillas (P1.7) |
| **RF-07** | Etapa previa al vencimiento **30 días antes**, ventana **martes o miércoles, 9:30–11:00**; válida para todas las duraciones; nunca después de la expiración | §4 RF-07, §14.9 | Fecha objetivo y ventana correctas | T1/T5 | Objetivo | **Parcial `[VERIFICADO]`** | Existe `PRE_EXPIRY` a `end − PRE_EXPIRY_OFFSET_DAYS` (`lifecycle-milestones.ts:140-146`). La **ventana** no: `eligibility.service.ts:43-51` define ventanas semanales genéricas 08:00–19:30 (lun–vie) y 08:30–18:00 (sáb); domingo `null`. Etapa `Vencimiento −30 días` presente en BD | La fecha objetivo existe; la ventana horaria específica del PIT no | Etapa de vencimiento enviado en franja distinta a la aprobada | RF-02, T5.2 | No |
| **RF-08** | **Máximo un mensaje automático saliente cada 15 días calendario por número de WhatsApp**, global entre campañas; evaluar historial, estado, elegibilidad, ventana/festivos, exclusión y ausencia de duplicado antes de enviar; si no cumple, reprogramar conservando identidad e idempotencia; no contar un fallo definitivo como envío exitoso; **cómputo en zona America/Bogota** | §4 RF-08, §14.8 | Dos campañas concurrentes para el mismo número no producen doble envío | CP-07; "Dos campañas concurrentes sin doble envío" | Objetivo | **Parcial / inoperante en datos reales `[VERIFICADO]`** | Regla implementada: `lifecycle.rules.ts:167-181` `AUTOMATIC_FREQUENCY_DAYS = 15`, `automaticFrequencyBlocks()`; `eligibility.service.ts:296-318` consulta `message.findFirst({ where: { customerId, type: AUTOMATIC, direction: OUTBOUND, sentAt: { not: null } } })`. **BD: `messages.customer_id` NULL en 8 163/8 163 (100%); `count(DISTINCT customer_id) = 0`.** Pruebas unitarias existen (`lifecycle.rules.spec.ts`, `eligibility.service.spec.ts`) y usan fixtures con `customerId` | El motor es correcto pero **no tiene insumo**: sin `customer_id` la consulta nunca devuelve filas y la puerta G3 nunca bloquea. Las pruebas pasan porque fabrican datos que la BD no contiene | **El límite de frecuencia no existe en producción.** El cliente puede recibir ilimitados mensajes automáticos. §14.8 incumplida | **RNF-02** (misma causa) | **Sí — autorización de backfill (T2.5)** |
| **RF-09** | Ventanas por tipo: **reseña** 11:30–13:30 y 18:30–20:00 (lunes 11:30 si las 48 h caen en domingo); **revisiones** sábado 8:30–10:30 y martes/jueves 16:00–17:30; **vencimiento próximo** martes/miércoles 9:30–11:00 a −30d; **retención** jueves 17:30–19:00 y viernes 14:00–16:00; reprogramar a la siguiente ventana válida del tipo respetando simultáneamente frecuencia global | §4 RF-09, §14.9 | Las ventanas horarias y festivos se respetan | Pruebas por tipo de campaña y festivo | Objetivo | **Ausente `[VERIFICADO]`** | `eligibility.service.ts:43-51`: ventanas **semanales genéricas** (08:00–19:30 lun–vie, 08:30–18:00 sáb, domingo null), no por tipo de campaña. `:62-70` existe `SUNDAY_0200_EXCEPTION` (domingo 02:00 → lunes 12:15) — regla **distinta** de la del PIT. Festivos: `eligibility.service.ts:90` acepta `holidays?` como parámetro; `eligibility.service.spec.ts:384` lo fija a `['2026-10-05']` | Ninguna de las 4 ventanas por tipo existe. Las ventanas implementadas no distinguen campaña | Envíos fuera de las franjas acordadas con el negocio; riesgo de sanción del canal. §14.9 incumplida | T5.2, T5.3 | No |
| **RF-10** | Exclusión voluntaria: cancelar/invalidatear automatizaciones cubiertas, aplicar etiqueta **`NO_SEGUIMIENTO`**, evitar que tareas en cola se envíen, registrar solicitud/fecha/origen, conservar trazabilidad; los contactos manuales del asesor **no anulan** restricciones legales; distinguir baja de automatizaciones de prohibición general de contacto | §4 RF-10, §14.10 | `NO_SEGUIMIENTO` bloquea las automatizaciones aplicables; etapas canceladas y bloqueo posterior | CP-08; "Etapas canceladas y bloqueos posteriores" | Objetivo | **Parcial `[VERIFICADO]`** | Existe `noContactAt` en `Customer` y puerta G2 (`eligibility.service.ts:212-225`, `blockedBy:'G2'`, `reason:'cliente con no-contact'`). `whatsapp.service.ts:1490-1508` registra `customer.opt_out` con razón y metadatos de auditoría. **BD: `commercial_cycles.maintenance_opt_out_at` no NULL en 0 filas.** La etiqueta literal `NO_SEGUIMIENTO` **no existe** en el código | El bloqueo por `noContactAt` existe y es funcional; la **etiqueta, la cancelación de automatizaciones en cola y la distinción baja/prohibición total no**. No hay verificación de si la cola contiene tareas pendientes de un cliente dado al darse de baja | Un cliente dado de baja puede tener automatizaciones ya en cola que se envíen. §14.10 parcialmente incumplida | **P1.6** (semántica de la etiqueta) | **Sí — P1.6** |
| **RF-11** | Los mensajes manuales de asesores **no** están sujetos al límite interno de 1 automático/15 días; el asesor puede contactar cuando canal y permisos lo permitan; **distinguir** mensaje manual, automático, plantilla y respuesta en ventana; los manuales **deben quedar registrados** y no pueden eludir restricciones legales o del proveedor | §4 RF-11, §3.1, §3.2 | Diferenciación manual/automático y controles del canal | T5/T6 | Objetivo | **Implementado (parcial) `[EVIDENCIA HISTÓRICA]` + `[VERIFICADO]`** | `whatsapp.service.ts:788` crea mensajes con `type: MessageType.MANUAL`; `:76` `REPLY_ORIGIN_WINDOW_MS = 7 días` para respuestas; `:534-545` el sandbox tiene prioridad sobre el proveedor. `AGENTS.md` §RF-11 citado en el código. **AUDITORÍA AUTO-SAFETY-004 (histórica)** verificó 3 superficies de red con guard de seguridad | Los tipos se distinguen y se registran. **[NO VERIFICADO]** si la puerta de frecuencia global excluye correctamente los manuales en ejecución real | Un asesor podría enviar ilimitados mensajes manuales sin dejar rastro de la distinción | T5.1 | No |
| **RF-12** | Al pausar: **no eliminar fechas originales**, impedir ejecución de etapas suspendidas, conservar identidad de cada etapa. Al reanudar: evaluar fechas originales, identificar vencidas, recalcular conforme a política aprobada, reaplicar elegibilidad, **no duplicar ejecutadas** | §4 RF-12, §14.11 | Fechas originales conservadas y ausencia de duplicados | T5 | Objetivo | **Parcial `[VERIFICADO]`** | `lifecycle.service.ts:85-93` pausa con `lifecyclePausedAt` + `pauseReason` (motivo obligatorio para auditar). **BD: `lifecycle_paused_at` no NULL en 0 filas.** No se encontró lógica de reanudación con recálculo en `lifecycle.service.ts` | La pausa existe y es auditable; la **reanudación con recálculo y no duplicación no está implementada**. No hay datos que ejerciten el camino | Pausa/reanudación sin verificar contra datos reales | T5.5 | No |
| **RF-13** | Tras una caída, identificar etapas vencidas y procesarlas **solo si** siguen elegibles, no ejecutadas ni duplicadas, campaña activa, y cumplen frecuencia/horario/exclusión/canal. **Prohibido el envío masivo de recuperación** | §4 RF-13 | Solo ejecuta etapas todavía elegibles, sin duplicar mensajes ni ignorar la frecuencia | CP-12; T5.6 | Objetivo | **No verificado `[NO VERIFICADO]`** | No se localizó el procedimiento de recuperación post-caída en esta auditoría. `AUTOMATION` scheduler existe pero su comportamiento tras inactividad no fue ejercido (no se autoriza reinicio de servicios) | Sin evidencia de que la recuperación respete frecuencia/horario/exclusion | Al reiniciar el servicio tras una caída, posible avalancha de mensajes | T5.6 | No |
| **RF-14** | Cada nueva compra es un ciclo potencial: si llega una instalación para un número con ciclo activo y **ninguno de los dos registros tiene placa**, se asume **reemplazo absoluto** (cerrar campaña anterior conservando historial, iniciar nueva); si las placas distinguen vehículos, mantener ciclos independientes. Definir transaccionalmente qué ocurre con las automatizaciones pendientes y qué estado de cierre se usa | §4 RF-14, §14.13 | Placas iguales, distintas y ausentes; la nueva compra respeta reemplazo y separación de vehículos | CP-10, CP-11 | Objetivo | **Ausente `[VERIFICADO]`** | No se encontró implementación de reemplazo automático. `lifecycle.rules.ts:203-234` define `TERMINATION_REASONS` incluyendo `BATTERY_REPLACED` y `DEFECTIVE_PRODUCT_REPLACED` con `kind:'FINISH'` — son **razones de terminación**, no una regla de reemplazo automático. BD: `termination_reason` no NULL en **0** filas | La regla de reemplazo **no se ejecuta automáticamente**. Sin ella, una segunda compra para el mismo número **no cierra el ciclo anterior**: ambos ciclos quedan activos | Dos ciclos de garantía simultáneos para el mismo número; seguimiento duplicado y contradictorio | **RF-04** (sin placa no hay desempate), P1.5 | **Sí — P1.5** |
| **RF-15** | Cada etapa debe distinguir **al menos**: Programada, En proceso, Enviada/aceptada, Entregada, Fallida, Reprogramada, Cancelada, Respuesta pendiente, Resultado registrado. Estados conceptuales a mapear al modelo real **evitando duplicados semánticos**. La respuesta del cliente, la revisión realizada y la intención de recompra **son resultados de negocio distintos del estado técnico**; no se debe afirmar que el sistema registra una revisión solo porque envió un mensaje | §4 RF-15, §14.14 | Los estados de envío se corresponden con evidencia real del proveedor | T3/T6; "Estados persistidos y evidencia del proveedor" | Objetivo | **Parcial `[VERIFICADO]`** | `MessageStatus` (`schema.prisma:1034-1040`) = `QUEUED, SENT, DELIVERED, READ, FAILED` — **5 estados**. `whatsapp.service.ts:1207-1234` transiciones de proveedor con `providerMessageId` y `DELIVERED`. Faltan: En proceso, Reprogramada, **Cancelada**, Respuesta pendiente, Resultado registrado | 5 de 9 estados. **Falta `CANCELLED`**, crítico porque RF-10 y RF-06 exigen "cancelar o invalidar etapas" de forma observable | No se puede distinguir "cancelada por opt-out" de "fallida". La auditoría de bloqueos del PIT (§12.3 "Evidencia") se apoya en un estado inexistente | T3/T6 | No |

### 3.2 Requisitos no funcionales

| ID | Requisito rector | Ref. PIT | Criterio de aceptación (PIT) | Evidencia requerida | Estado documental | Estado técnico | Evidencia observada | Brecha | Riesgo | Dependencias | Aprobación humana |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **RNF-01** | Idempotencia: reprocesar un evento, compra o etapa **no puede crear envíos ni ciclos duplicados** | §5 RNF-01, §8 | Reprocesamiento sin duplicados | T1–T6 | Objetivo | **Parcial `[INFERIDO]`** | `imports.processor.ts:213-220` captura `PrismaClientKnownRequestError` código `P2002` (violación de unique) como vía de idempotencia. BD: 5 537 compras → 5 528 ciclos (9 compras sin ciclo, coherente con el rechazo por falta de `installationDate`); 16 820 automatizaciones sobre 5 531 compras distintas | La protección existe a nivel de restricción única, pero **no hay prueba de reprocesamiento completo** ni evidencia de que cubra etapas y eventos | Reprocesar una importación podría duplicar etapas | T1.6 | No |
| **RNF-02** | Trazabilidad: cada etapa debe vincularse a compra de origen, cliente y vehículo cuando aplique, campaña, regla de elegibilidad, fecha planificada y efectiva, mensaje o id de proveedor, estado final y motivo de bloqueo/fallo/cancelación | §5 RNF-02, §14.14 | Relación completa compra → ciclo → mensaje → resultado | T2/T6 | Objetivo | **Ausente `[VERIFICADO]`** | `Message` (`schema.prisma:566-590`) tiene `conversationId?`, `customerId?`, `providerMessageId?`, `providerConversationId?`, `provider?`, `status`. **`customerId` es nullable y está NULL en 8 163/8 163.** BD: `count(DISTINCT customer_id) = 0`. Los motivos de bloqueo se escriben en `AuditIdentityService` (`automation.cycle.skipped`, `customer.opt_out`), no en el mensaje | La columna existe pero **jamás se ha poblado**. La relación cliente↔mensaje no existe en los datos | **Ancla de RF-08, RF-10, RF-14 y §14.14.** Sin ella no hay auditoría posible de por qué se envió o bloqueó un mensaje | **Bloqueante de BL-2** | **Sí — autorización de backfill (T2.5)** |
| **RNF-03** | Los secretos de Pancake, credenciales y datos de clientes **no deben aparecer** en logs, prompts ni reportes de diagnóstico | §5 RNF-03, §8 | Ausencia de secretos en logs y artefactos | T6/T8 | Objetivo | **Parcial `[EVIDENCIA HISTÓRICA]` + `[VERIFICADO]`** | **`[EVIDENCIA HISTÓRICA]`** AUTO-SAFETY-002/003: política fail-closed con 4 variables de entorno declaradas en `environment:` de `docker-compose.yml` y `ENV OUTBOUND_SEND_ENABLED=DENIED` en el Dockerfile; ninguna credencial en el repositorio. **`[VERIFICADO]`** esta sesión: `docker exec automatizeit-api printenv \| grep OUTBOUND_` → 4 variables presentes; el código **no** las imprime en logs. `[EVIDENCIA HISTÓRICA]` `opencode.json` (sin versionar) contiene rutas de una máquina ajena | El código cumple. La higiene del repositorio tiene un archivo sin versionar con rutas de entorno ajeno | Exposición de rutas de infraestructura, no de credenciales | T6, T8 | No |
| **RNF-04** | Un fallo temporal **no debe eliminar silenciosamente etapas** ni generar envíos duplicados al reintentarse | §5 RNF-04, §8 | Prueba de reintento y recuperación | CP-13; T5 | Objetivo | **Parcial `[EVIDENCIA HISTÓRICA]`** | **`[EVIDENCIA HISTÓRICA]`** AUTO-SAFETY-002: `SendBlockedError` se maneja con handler propio que guarda `EXECUTING→SCHEDULED` **sin incrementar `retryCount`**, para que el bloqueo por política no consuma reintentos. `MessageStatus.FAILED` con `failureReason` | La política de no consumir reintentos está implementada. **[NO VERIFICADO]** el comportamiento ante fallo real del proveedor (no se autoriza provocar un envío) | Un bloqueo consumiendo reintentos agotaría la cola; un fallo de proveedor podría duplicar | T5.8 | No |
| **RNF-05** | Debe poder **distinguirse una automatización programada de un envío real confirmado por el proveedor** | §5 RNF-05, §14.14 | Diferencia entre simulado, aceptado y entregado | T6 | Objetivo | **Implementado (parcial) `[VERIFICADO]`** | `MessageStatus` distingue `QUEUED / SENT / DELIVERED / READ / FAILED`. `whatsapp.service.ts:1207-1234` procesa callbacks del proveedor con `providerMessageId`. `:546` marca `simulated: true` con `reason: 'sandbox'` en envíos simulados. `:534-545` sandbox tiene prioridad sobre el proveedor | Los estados técnicos existen y las simulaciones se marcan. **[NO VERIFICADO]** el mapeo real de estados devueltos por Pancake (requiere llamada al proveedor, L1) | Sin mapeo verificado no puede afirmarse que `DELIVERED` refleje entrega real | T6.4 | **Sí — P0.3** (verificación de integración) |
| **RNF-06** | La implementación debe seguir el stack y las convenciones del repositorio existente; **no cambiar de framework, proveedor o arquitectura por conveniencia** | §5 RNF-06 | — | — | Objetivo | **Implementado `[VERIFICADO]`** | NestJS + Prisma + PostgreSQL + Next.js, como en `AGENTS.md` §Architecture. No se observa migración de stack | Ninguna | — | — | No |
| **RNF-07** | Las fechas comerciales se interpretan según **`America/Bogota`**, con persistencia consistente y conversiones explícitas | §5 RNF-07, RF-08, RF-09 | Fechas correctas; cómputo determinista sin diferencias entre UTC, reloj del servidor y calendario comercial | T1/T5 | Objetivo | **Parcial `[CONFLICTO]`** | `configuration.ts:158` y `env.validation.ts:105` definen `SMS_TIMEZONE`/`DEFAULT_TIMEZONE = 'America/Bogota'`. **Pero `automations.service.ts:244-252` usa `getUTCDate`/`setUTCMonth`/`Date.UTC`** y `imports.processor.ts:19-22` usa `getMonth`/`setMonth` (**hora local del proceso**) | El valor por defecto está declarado, pero **los cálculos de fecha operan en UTC o en hora local del servidor, no en `America/Bogota`**. Esto contradice directamente el criterio de "evitar diferencias entre UTC, el reloj del servidor y el calendario comercial" | Desfase de horas o días en ventanas y vencimientos | **RF-02, RF-09** | **Sí — D-1** |

### 3.3 Hallazgos transversales de la matriz

1. **RNF-02 es el nodo crítico.** Su ausencia (BL-2) invalida simultáneamente RF-08, RF-10, RF-14 y §14.14. Ninguna de esas cuatro puede cumplirse sin.Actionar RNF-02 primero.
2. **D-1 es el nodo de negocio.** La fecha base afecta RF-02, RF-03, RF-07, RNF-07 y, por cascada, T1 → T3 → T4 → T7.
3. **Ningún requisito alcanza "Probado".** Existen suites unitarias para el motor de elegibilidad y las reglas de lifecycle (`lifecycle.rules.spec.ts`, `eligibility.service.spec.ts`, `lifecycle-milestones.spec.ts`, `lifecycle.service.spec.ts`, `inbound-classifier.spec.ts`), pero **no se ejecutaron en esta auditoría (L6)** y **las pruebas existentes citan "spec 025 §…"**, es decir, validan un documento que el PIT no ratifica.
4. **El código cita una autoridad distinta.** `automations.service.ts:297` y `imports.parser.ts:73` dicen literalmente *"Lifecycle 025 §1"*. Cero referencias a `PIT` en `lifecycle.rules.ts` y `eligibility.service.ts`. El sistema fue construido contra un documento que hoy está vacío en disco y que el PIT coloca por encima de sí mismo en autoridad.

---

## 4. Mapa de fases T0–T8

### 4.0 Resumen

| Fase | Nombre (PIT §7) | Criterio de salida (PIT) | ¿Cumple? | Evidencia disponible |
|---|---|---|---|---|
| **T0** | Auditoría de solo lectura | Cada requisito crítico marcado como implementado y verificado / parcial / ausente / no verificable | **Sí, con este informe** | Este documento |
| T1 | Modelo de dominio y calendario | Fechas reproducibles; ninguna etapa fuera de campaña | No | — |
| T2 | Integridad de datos y relación cliente-mensaje | Las reglas de frecuencia pueden identificar el historial, **o** existe tarea correctiva aprobada | No | — |
| T3 | Captura de placa y solicitud de reseña | Respuesta válida activa el siguiente paso una sola vez; inválida o ambigua no modifica ciclo | No | — |
| T4 | Transición de garantía a retención | Una transición, una sola campaña de retención, sin recordatorios de garantía elegibles | No | — |
| T5 | Reglas globales y excepciones | Todas las reglas críticas con pruebas positivas **y negativas** | No | — |
| T6 | Integración con Pancake | Evidencia de conexión, plantillas, asociación de respuestas y estados; distinguir simulación de actividad real | No | — |
| T7 | Validación integral | El recorrido completo cumple los criterios de aceptación | No | — |
| T8 | Preparación de entrega | Paquete reproducible, pruebas registradas, riesgos aceptados | No | — |

**Ninguna fase ha sido aceptada por el responsable ni autorizada para producción.**

### 4.1 Fases en detalle

#### Fase 0 — T0: Auditoría de solo lectura

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Saber exactamente qué existe, qué funciona y qué falta |
| **Tareas exigidas** | T0.1 Git · T0.2 spec principal y reglas G1–G8 · T0.3 mapear modelos · T0.4 verificar calendario y fechas · T0.5 revisar frecuencia/ventanas/festivos/exclusión/recuperación · T0.6 importador y `failed_sync_logs` · T0.7 asociación histórica mensajes-cliente · T0.8 integración Pancake · T0.9 migraciones pendientes · T0.10 matriz de brechas |
| **Entregable exigido** | Informe T0, **sin cambios en el sistema** |
| **Criterio de salida** | Cada requisito crítico marcado con estado real |
| **Dependencias** | Ninguna |
| **Evidencia disponible** | Este documento cubre T0.3, T0.4, T0.5, T0.6, T0.7, T0.9 y T0.10 con evidencia de código y BD. **T0.2 parcialmente**: el documento que el PIT señala como spec principal (§2 nivel 2) **está vacío en disco** (§7). **T0.8 no verificable** bajo L1 |
| **Estado de implementación** | Fase de auditoría, sin implementación propia |
| **Estado de pruebas** | N/A |
| **Aceptación del responsable** | **Pendiente** — este informe no ha sido revisado por David |
| **Autorización de producción** | N/A (solo lectura) |
| **Bloqueantes** | B1 (`spec-025` vacío) impide cerrar T0.2 |
| **Siguiente paso permitido** | Revisión de este informe. El PIT §16 dice: *"Después de revisar el informe T0, se divide la implementación en tareas pequeñas y se priorizan los bloqueantes del recorrido demostrable"* |

#### Fase 1 — T1: Modelo de dominio y calendario

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Definir el cálculo de vencimiento, revisiones bimensuales, secuencia de retención, cierre de campaña e idempotencia |
| **Tareas exigidas** | T1.1 documentar modelo · T1.2 vencimiento y fin de mes · T1.3 revisiones bimensuales · T1.4 secuencia de retención desde vencimiento original · T1.5 cierre y cancelación de etapas · T1.6 idempotencia |
| **Criterio de salida** | Las fechas calculadas son reproducibles y no generan etapas fuera de la campaña |
| **Dependencias** | T0 (este informe) · **D-1** |
| **Evidencia disponible** | T0.4/T0.5: `warrantyEnd` usa días y fecha de instalación (§3.1 RF-02); `addMonths` en `imports.processor.ts:19` **no tiene clamp**, `automations.service.ts:244` **sí lo tiene** — dos implementaciones divergentes del mismo concepto |
| **Estado de implementación** | **Ausente** |
| **Estado de pruebas** | **No ejecutado** (L6) |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | **D-1 sin resolver.** El PIT fija fecha de compra ERP; el código fija fecha de instalación y está escrito contra "spec 025 §1". Implementar T1 ahora sería codificar una de las dos sin autorización |
| **Siguiente paso permitido** | **Ninguno.** Requiere decisión humana D-1 |

#### Fase 2 — T2: Integridad de datos y relación cliente-mensaje

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Que las reglas de frecuencia puedan identificar el historial pertinente |
| **Tareas exigidas** | T2.1 validar campos obligatorios · T2.2 rechazo y auditoría de filas inválidas · T2.3 verificar relación mensajes-cliente · T2.4 analizar historial sin cliente · T2.5 proponer backfill con evidencia |
| **Criterio de salida** | Las reglas de frecuencia pueden identificar el historial de mensajes pertinente, **o** existe una tarea correctiva aprobada y documentada |
| **Dependencias** | T0 |
| **Evidencia disponible** | **T2.3/T2.4 ejecutadas** (`READ ONLY`): `messages` 8 163 filas, `customer_id` NULL en **8 163**, `DISTINCT customer_id = 0`. **T2.1**: `warranty_months` NULL en 5 510/5 537; `failed_sync_logs` no existe. **T2.5**: propuesta pendiente de redacción y autorización |
| **Estado de implementación** | **Ausente** en lo esencial |
| **Estado de pruebas** | No ejecutado |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | **`pit.md` §13**: backfill requiere **autorización explícita y separada**. §3.2 prohíbe ejecutar backfills sin autorización explícita. **D-2 abierta** |
| **Siguiente paso permitido** | Redactar la propuesta T2.5 con evidencia (solo lectura) y someterla a autorización. **No ejecutar el backfill** |

#### Fase 3 — T3: Captura de placa y solicitud de reseña

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Capturar la placa, asociarla al ciclo correcto y habilitar la reseña solo tras captura válida |
| **Tareas exigidas** | T3.1 verificar plantilla inicial · T3.2 webhook de respuestas · T3.3 validación de placas · T3.4 asociación al ciclo · T3.5 inválidas y ambiguas · T3.6 reseña tras captura válida · T3.7 horarios y frecuencia |
| **Criterio de salida** | Una respuesta válida activa el siguiente paso una sola vez; una inválida o ambigua no modifica un ciclo incorrecto |
| **Dependencias** | T1 (para el ciclo) · D-1 · **P0.6** (plantillas aprobadas) |
| **Evidencia disponible** | Sin campo de placa en el modelo; sin validación; sin webhook de placa. `lifecycle-milestones.ts:181` `MilestoneTemplateSource = 'PENDING_DECISION'` |
| **Estado de implementación** | **Ausente** |
| **Estado de pruebas** | No existe suite para este requisito |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | P0.6 (plantillas por aprobar) · P1.3 (formatos de placa admitidos y corrección de respuestas inválidas, sin definir) |
| **Siguiente paso permitido** | **Ninguno de implementación.** Requiere P1.3 y P0.6 |

#### Fase 4 — T4: Transición de garantía a retención

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Cerrar la garantía y activar la retención con la secuencia aprobada |
| **Tareas exigidas** | T4.1 fecha exacta de vencimiento · T4.2 finalizar campaña · T4.3 invalidar etapas pendientes · T4.4 activar retención · T4.5 programar +60d/+90d/+6m/+12m/+18m · T4.6 evitar transiciones duplicadas |
| **Criterio de salida** | Una transición produce una sola campaña de retención y no deja recordatorios de garantía elegibles después del vencimiento |
| **Dependencias** | T1 (T4.1) · T3 (T4.3 necesita cancelable) |
| **Evidencia disponible** | `end_date` NULL en 5 528/5 528; `termination_reason` no NULL en 0; hitos post-vencimiento existentes cubren solo +60d y +90d |
| **Estado de implementación** | **Ausente** |
| **Estado de pruebas** | No existe suite de transición |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | D-1 · P1.7 (contenido y plantilla final de cada impacto de retención) |
| **Siguiente paso permitido** | **Ninguno.** Bloqueada por T1 |

#### Fase 5 — T5: Reglas globales y excepciones

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Verificar frecuencia, ventanas, festivos, opt-out, pausa, recuperación, reemplazo y fallos |
| **Tareas exigidas** | T5.1 límite 15 días · T5.2 ventanas por campaña · T5.3 festivos y reprogramación · T5.4 `NO_SEGUIMIENTO` · T5.5 pausa/reanudación · T5.6 recuperación de vencidas · T5.7 múltiples compras y reemplazo · T5.8 fallos y reintentos |
| **Criterio de salida** | Todas las reglas críticas tienen **pruebas positivas y negativas** |
| **Dependencias** | T1, T2 |
| **Evidencia disponible** | T5.1: motor implementado, **inoperante por BL-2**. T5.2: ventanas genéricas, no por campaña. T5.4: `noContactAt` existe; etiqueta `NO_SEGUIMIENTO` no. T5.5: pausa implementada, reanudación no. T5.6: **no verificado**. T5.7: no implementado. T5.8: **`[EVIDENCIA HISTÓRICA]`** AUTO-SAFETY-002/004 |
| **Estado de implementación** | **Parcial** — 1 de 8 tareas con base funcional (y defectuosa) |
| **Estado de pruebas** | Suites unitarias existen pero **no se ejecutaron** (L6). No hay pruebas negativas contra datos reales |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | BL-2 (RNF-02) impide T5.1 · D-1 impide T5.2 |
| **Siguiente paso permitido** | Diseño (no implementación) de las pruebas positivas y negativas |

#### Fase 6 — T6: Integración con Pancake

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Verificar la integración real, plantillas, webhooks y estados, distinguiendo simulación de actividad real |
| **Tareas exigidas** | T6.1 cuenta y `page_id` · T6.2 consultas de lectura · T6.3 formatos de webhook y autenticación · T6.4 mapeo de estados · T6.5 límites y reintentos · T6.6 prueba controlada |
| **Restricción expresa (PIT)** | *"No se ejecuta un envío real hasta contar con aprobación explícita"* |
| **Criterio de salida** | Existe evidencia de conexión, plantillas, asociación de respuestas y comportamiento de estados |
| **Dependencias** | T3 (respuestas) · **P0.3** (integración real) · **P0.6** (plantillas) |
| **Evidencia disponible** | Adaptador y cliente webhooks presentes en `apps/api/src/modules/whatsapp/`. **[NO VERIFICADO]** contra el proveedor real (L1) |
| **Estado de implementación** | **Parcial, y deliberadamente bloqueado** |
| **Estado de pruebas** | No ejercitado contra el proveedor |
| **Aceptación del responsable** | No |
| **Autorización de producción** | **No — y bloqueada por diseño.** `OUTBOUND_SEND_ENABLED=DENIED` `[VERIFICADO]` |
| **Bloqueantes** | P0.3, P0.6 · **`pit.md` §13** exige autorización explícita para envío real de WhatsApp |
| **Siguiente paso permitido** | Operaciones de **solo lectura** contra el proveedor, si el responsable las autoriza por separado |

#### Fase 7 — T7: Validación integral

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Validar el recorrido completo en entorno aislado y sandbox |
| **Tareas exigidas** | T7.1 unitarias · T7.2 integración aislada · T7.3 calendario y reglas · T7.4 recuperación e idempotencia · T7.5 sandbox · T7.6 documentar · T7.7 solicitar aprobación de prueba real |
| **Criterio de salida** | El recorrido completo cumple los criterios de aceptación y el negocio observa evidencia verificable de cada etapa |
| **Dependencias** | T1–T6 |
| **Evidencia disponible** | Ninguna fase previa está cerrada |
| **Estado de implementación** | **Ausente** |
| **Estado de pruebas** | No ejecutado (L6) |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | Todas las fases anteriores |
| **Siguiente paso permitido** | **Ninguno** |

#### Fase 8 — T8: Preparación de entrega

| Campo | Valor |
|---|---|
| **Propósito (PIT)** | Paquete de entrega reproducible, documentado y reversible |
| **Tareas exigidas** | T8.1 diffs · T8.2 pruebas/lint/typecheck/build · T8.3 separar por alcance · T8.4 migraciones y orden de despliegue · T8.5 procedimiento de despliegue y reversión · T8.6 **solicitar aprobación explícita antes de commit, push, migración, deploy, reinicio o envío real** |
| **Criterio de salida** | Paquete reproducible, pruebas registradas y riesgos conocidos aceptados por el responsable |
| **Dependencias** | T7 |
| **Evidencia disponible** | El working tree acumula **164 cambios sin commit** (58 `M`, 106 `??`) y existe **1 migración pendiente de aplicar**: `20261009000000_inbound_button_fields` |
| **Estado de implementación** | **Ausente** |
| **Estado de pruebas** | No ejecutado |
| **Aceptación del responsable** | No |
| **Autorización de producción** | No |
| **Bloqueantes** | **`pit.md` §13**: commit y push requieren autorización explícita y separada |
| **Siguiente paso permitido** | Ninguno |

### 4.2 Grafo de dependencias

```
T0 ─┬─(D-1)──────► T1 ──► T3 ──► T4 ──────────┐
    │              ▲          ▲                 │
    │              │          │                 │
    └─► T2 ────────┘          │                 ▼
      (RNF-02)                │                T5 ──► T6 ──► T7 ──► T8
      BL-2                   │                 ▲
      D-2                    └─────────────────┘
                            (T4.3 necesita cancelación)
```

**Paralelizables sin decisión humana:** T2.1–T2.4 y T2.5 (redacción de la propuesta de backfill, sin ejecutarla).

---

## 5. Decisiones y autorizaciones pendientes

### 5.1 Decisiones que bloquean la ejecución

Las cuatro decisiones siguientes se identificaron en auditorías previas. Este informe **no las resuelve ni las reinterpreta**; registra su alcance, su evidencia y su estado.

| ID | Decisión | Alcance | Evidencia que la motiva | Estado | Quién decide |
|---|---|---|---|---|---|
| **D-1** | **¿Qué fecha base rige el ciclo: fecha de compra del ERP (PIT RF-02) o fecha de instalación (implementación actual)?** | Bloquea T1.2, T1.3, T1.4, T1.5; en cascada T3, T4 y T7; afecta RF-02, RF-03, RF-07, RF-14 y RNF-07 | `pit.md` §4 RF-02 ("la fecha base es la fecha de compra registrada en el ERP, no la fecha de instalación, salvo que una decisión formal futura modifique esta regla"). `lifecycle.rules.ts:58-70` usa `installationDate` con el comentario "contado desde la INSTALACIÓN, no desde la venta (§1)", citando `spec-025`, que **está vacío** | **ABIERTA** `[VERIFICADO]` | Responsable funcional (David), con apoyo del negocio de BDC |
| **D-2** | **¿Se autoriza el backfill de `messages.customer_id`?** | Sin esto, RF-08 y RNF-02 no pueden cumplirse nunca | `pit.md` §13: "Backfill o actualización masiva de datos" requiere "autorización explícita y separada". §7 T2.5: "Un backfill necesita autorización explícita antes de ejecutarse". Dato: 8 163/8 163 mensajes sin `customer_id` | **ABIERTA** `[VERIFICADO]` | Responsable funcional (David) |
| **D-3** | **¿Qué plantillas existen y están aprobadas para el canal?** | Bloquea T3.1 y el cierre de T6 | `pit.md` §10 P0.6: "Confirmar que las plantillas necesarias existen y están aprobadas para el canal". §4 RF-04: "La plantilla final, sus variables y su aprobación deben comprobarse en Pancake/WhatsApp antes de un envío real" | **ABIERTA** `[NO VERIFICADO]` — no comprobable bajo L1 | Responsable funcional + BDC |
| **D-4** | **¿Cuál es la definición operativa de "producción" para esta entrega?** | Determina si T6/T7 son alcanzables bajo §3.2 | `pit.md` §3.2 prohíbe "enviar mensajes reales durante la auditoría" y §13 exige autorización para envío real. La definición no está acotada en el documento | **ABIERTA** `[VERIFICADO]` | Responsable funcional (David) |

### 5.2 Bloqueantes técnicos declarados por el PIT (§10, P0)

**Estado de cada uno tras esta auditoría.** El PIT los enumera como "a confirmar"; este informe registra qué se pudo comprobar.

| # | Bloqueante P0 (texto del PIT) | Resultado de T0 | Etiqueta |
|---|---|---|---|
| P0.1 | Confirmar cómo se identifica al cliente y se asocia el historial de mensajes | **Confirmado el defecto**: `messages.customer_id` NULL en 8 163/8 163; `failed_sync_logs` no existe | `[VERIFICADO]` |
| P0.2 | Confirmar el comportamiento real del scheduler y su ejecución en el entorno objetivo | El scheduler existe; su comportamiento tras inactividad no fue ejercido (no se autoriza reinicio) | `[NO VERIFICADO]` |
| P0.3 | Verificar la integración real con Pancake y la recepción de respuestas | Cliente y webhooks presentes; no verificable sin llamar al proveedor (L1) | `[NO VERIFICADO]` |
| P0.4 | Verificar que el límite global de 15 días funciona con todas las campañas | **Motor implementado pero inoperante**: la consulta por `customerId` nunca encuentra filas | `[VERIFICADO]` |
| P0.5 | Verificar la transición de garantía a retención sin duplicados | **Nunca ejecutada**: `end_date` NULL en 5 528/5 528; `termination_reason` no NULL en 0 | `[VERIFICADO]` |
| P0.6 | Confirmar que las plantillas necesarias existen y están aprobadas | No verificable bajo L1 | `[NO VERIFICADO]` |
| P0.7 | Confirmar la integridad de la fecha base, garantía y datos de contacto | **Defecto confirmado**: `warranty_months` NULL en 5 510/5 537; base en discusión (D-1) | `[VERIFICADO]` |

### 5.3 Decisiones funcionales pendientes declaradas por el PIT (§10, P1)

Se conservan con su identificador y semántica originales. **Ninguna se resuelve aquí.**

| # | Decisión P1 | Estado | Dónde bloquea |
|---|---|---|---|
| P1.1 | Estados y responsables para registrar el resultado de la revisión, respuesta e intención de recompra | Abierta | RF-15, §14.15 |
| P1.2 | Fecha límite y estado de un ciclo que nunca recibe la placa | Abierta | RF-04, T3 |
| P1.3 | Formatos de placa admitidos y proceso de corrección de respuestas inválidas | Abierta | RF-04, T3.3 |
| P1.4 | Política exacta de festivos y selección de la siguiente ventana elegible | Abierta | RF-09, T5.3 |
| P1.5 | Política de cierre y reapertura si una compra nueva se interpreta como reemplazo | Abierta | RF-14, T5.7 |
| P1.6 | Semántica exacta de `NO_SEGUIMIENTO` respecto a contactos manuales y exclusiones más amplias | Abierta | RF-10, T5.4 |
| P1.7 | Contenido y plantilla final de cada impacto de retención | Abierta | RF-06, T4.5 |
| P1.8 | Regla exacta de vencimiento en fin de mes | Abierta | RF-02, T1.2 |

### 5.4 Operaciones que requieren autorización explícita (§13)

Se reproducen con el texto del PIT. **El permiso para crear este informe no constituye autorización para ninguna de ellas.**

> Este documento no autoriza operaciones de escritura.
>
> Requieren autorización explícita y separada, según corresponda:
> - Backfill o actualización masiva de datos.
> - Migración de base de datos.
> - Envío real de WhatsApp.
> - Pausa o cancelación de ciclos reales.
> - Cambio de configuración compartida.
> - Reinicio de servicios.
> - Despliegue.
> - Commit y push.
> - Procesamiento de producción que pueda crear o enviar automatizaciones.
>
> Las pruebas que escriben en una base de datos compartida no se consideran pruebas aisladas.

**Estado de cada autorización durante esta auditoría:**

| Operación | ¿Se realizó? | Base |
|---|---|---|
| Backfill o actualización masiva | **No** | No autorizado |
| Migración de base de datos | **No** | `20261009000000_inbound_button_fields` sigue pendiente |
| Envío real de WhatsApp | **No** | `OUTBOUND_SEND_ENABLED=DENIED` verificado; enviaría*a confirmar* además §13 |
| Pausa o cancelación de ciclos reales | **No** | No autorizado |
| Cambio de configuración compartida | **No** | La política de envíos **ya estaba** en `DENIED`; no se modificó |
| Reinicio de servicios | **No** | No autorizado |
| Despliegue | **No** | No autorizado |
| Commit y push | **No** | No autorizado; regla estricta de la tarea |
| Procesamiento de producción que cree o envíe automatizaciones | **No** | 8 529 automatizaciones `SCHEDULED`_future_ **permanecen intactas y sin procesar** |

---

## 6. Riesgos y brechas

Cada brecha identifica el requisito afectado, la evidencia, el impacto en producción, la dependencia, la próxima acción recomendada y la autorización necesaria. Las severidades se conservan de la auditoría PIT-002, revalidadas contra la evidencia de esta sesión.

### 6.1 Resumen de brechas

| ID | Severidad | Requisito | Resumen | Evidencia de esta sesión |
|---|---|---|---|---|
| **B1** | 🔴 Crítica | §2 autoridad | `spec-025` vacío en disco | `[VERIFICADO]` |
| **B2** | 🔴 Crítica | T0 entregable | Informe T0 no existía como artefacto | `[VERIFICADO]` |
| **B3** | 🔴 Crítica | RF-08, RNF-02 | `messages.customer_id` NULL en 8 163/8 163 | `[VERIFICADO]` |
| **B4** | 🔴 Alta | RF-03 | Calendario +3d/+6m/+12m, no bimensual | `[VERIFICADO]` |
| **B5** | 🔴 Alta | RF-06 | `end_date` NULL en 5 528/5 528 | `[VERIFICADO]` |
| **B6** | 🔴 Alta | RF-02 | `warrantyEnd` en días y fecha de instalación | `[VERIFICADO]` |
| **B7** | 🟠 Media | RF-01 | Sin rechazo por datos críticos; sin `failed_sync_logs` | `[VERIFICADO]` |
| **B8** | 🟠 Media | RF-04, RF-05 | Captura de placa inexistente | `[VERIFICADO]` |
| **B9** | 🟠 Media | RF-01, RF-10 | `failed_sync_logs` y `NO_SEGUIMIENTO` nombrados pero inexistentes | `[VERIFICADO]` |
| **B10** | 🟡 Baja | RF-15 | 5 de 9 estados; falta `CANCELLED` | `[VERIFICADO]` |
| **B11** | 🟡 Baja | §8 | La matriz del PIT no tiene columna de estado | `[VERIFICADO]` |
| **B12** | 🟡 Baja | RF-07 | Ventana martes/miércoles 9:30–11:00 no existe | `[VERIFICADO]` |

### 6.2 Detalle

#### B1 — `spec-025` vacío en el working tree · 🔴 Crítica

- **Requisito afectado.** `pit.md` §2 coloca la especificación funcional principal en el **nivel 2 de autoridad**, por encima del propio PIT (nivel 3). §4 RF-02 podría construed que "salvo que una decisión formal futura modifique esta regla" abre la puerta a spec-025 como esa decisión.
- **Evidencia.** `[VERIFICADO] [alta]` `stat -c%s specs/025-lifecycle-postventa/spec.md` → **0 bytes**. `git cat-file -s HEAD:specs/025-lifecycle-postventa/spec.md` → **57 230 bytes**. `git status --short` → ` M`. El archivo **existe en `HEAD` con 789 líneas** y está **vacío en el working tree**.
- **Impacto en producción.** El documento que el código implementa y cita literalmente (`"Lifecycle 025 §1"` en `automations.service.ts:297` e `imports.parser.ts:73`) **no es legible**. La jerarquía de autoridad del PIT apunta a un vacío. D-1 no puede resolverse documentalmente.
- **Dependencia.** Ninguna: es previa a todo.
- **Próxima acción.** Restaurar el archivo desde `HEAD`. **Requiere autorización**: la tarea P2-02 prohíbe expresamente `git checkout` y toda restauración.
- **Autorización necesaria.** Del responsable, en una tarea separada.

#### B2 — El entregable T0 no existía · 🔴 Crítica *(resuelta por este documento)*

- **Requisito afectado.** `pit.md` §7 Fase 0: *"Entregable: informe T0, sin cambios en el sistema"*. §16: la auditoría debe devolver una tabla de 9 columnas.
- **Evidencia.** `[VERIFICADO] [alta]` `ls -la specs/026-pit-final/` mostraba un único archivo (`pit.md`) al inicio de esta tarea. Ningún informe T0 existía en el repositorio.
- **Impacto en producción.** Sin T0 materializado no había estado verificable; cualquier afirmación de avance descansaba en conversaciones no versionables, con el mismo riesgo de pérdida que B1.
- **Impacto tras esta tarea.** Este documento materializa el entregable. **Pendiente**: que el responsable lo acepte (§4, T0).
- **Próxima acción.** Revisión de este informe por el responsable.
- **Autorización necesaria.** Ninguna para leerlo; aceptación para cerrar la fase T0.

#### B3 — Relación cliente↔mensaje inexistente · 🔴 Crítica

- **Requisito afectado.** RNF-02 (trazabilidad), y por dependencia RF-08, RF-10, RF-14, §14.14.
- **Evidencia.** `[VERIFICADO] [alta]` `BEGIN TRANSACTION READ ONLY; SELECT count(*) FROM messages WHERE customer_id IS NULL;` → **8 163 de 8 163**. `SELECT count(DISTINCT customer_id) FROM messages;` → **0**. `schema.prisma:568` `customerId String? @map("customer_id")` — la columna es nullable y nunca se ha poblado. `eligibility.service.ts:301-310` consulta el último automático **por `customerId`**.
- **Impacto en producción.** La puerta G3 (límite de 15 días) **nunca bloquea**: sin filas, `last` es `null` y `automaticFrequencyBlocks(null, now)` devuelve `false`. Un cliente puede recibir mensajes automáticos ilimitados. Sin histórico no hay forma de reconstruir qué se le envió, ni de verificar exclusions, ni de auditar un incidente.
- **Dependencia.** T2.3, T2.4, T2.5 del PIT.
- **Próxima acción.** Redactar la propuesta T2.5 con evidencia — **incluyendo el análisis de los pares con separación menor a 15 días**, para dimensionar el riesgo — y someterla a autorización. No ejecutar el backfill.
- **Autorización necesaria.** **D-2.** `pit.md` §13.

#### B4 — Calendario programado distinto al PIT · 🔴 Alta

- **Requisito afectado.** RF-03, §14.4, CP-03.
- **Evidencia.** `[VERIFICADO] [alta]` `automations.service.ts:334-338` programa exactamente tres hitos: `addDays(installationDate, 3)`, `addMonths(installationDate, 6)`, `addMonths(installationDate, 12)`, con el comentario *"este es el calendario por defecto"*. `lifecycle-milestones.ts` no genera revisiones bimensuales. BD: **8 529** filas en `automations` con `status='SCHEDULED'` y `scheduled_date > now()`. Los `stage_name` presentes incluyen `Seguimiento postventa (Día 3 / Mes 6 / Mes 12)` y `Revisión +60…+600 días` — **cuyosores no se localizaron en el código actual**, lo que sugiere datos generados por versiones previas o por otro módulo.
- **Impacto en producción.** Si la contención de envíos se levantara sin resolver D-1 y RF-03, el sistema emitiría una cadencia que el negocio **no aprobó**: 3 mensajes en lugar de 6–12 revisiones bimensuales, y a clientes cuya garantía no consta (5 510 compras sin `warranty_months`).
- **Dependencia.** **D-1** (la cadencia depende de la fecha base) y T1.3.
- **Próxima acción.** Decidir D-1 y luego redactar el diseño de calendario de T1 (sin implementar).
- **Autorización necesaria.** **D-1.**

#### B5 — La transición a retención nunca se ha ejecutado · 🔴 Alta

- **Requisito afectado.** RF-06, §14.12, CP-09.
- **Evidencia.** `[VERIFICADO] [alta]` `commercial_cycles`: `end_date` no NULL en **0 de 5 528**; `termination_reason` no NULL en **0**; `status` distinto presente: únicamente `ACTIVE`. `lifecycle-milestones.ts:140-155` genera `PRE_EXPIRY` (−30d), `POST_EXPIRY_60` (+60d) y `POST_EXPIRY_90` (+90d) — **no existen +6m, +12m, +18m**.
- **Impacto en producción.** Ningún cliente ha pasado de garantía a retención. La mitad de la secuencia aprobada por el negocio no está representada en el código. §14.12 es inalcanzable.
- **Dependencia.** RF-02 (el anclaje es el vencimiento) → D-1; P1.7 (contenido de plantillas).
- **Próxima acción.** Ninguna implementación hasta cerrar D-1.
- **Autorización necesaria.** **D-1** y **P1.7**.

#### B6 — El cálculo de vencimiento incumple tres criterios · 🔴 Alta

- **Requisito afectado.** RF-02, §14.3, RNF-07.
- **Evidencia.** `[VERIFICADO] [alta]` `lifecycle.rules.ts:62-70`: `return addDays(installationDate, Math.round(warrantyMonths * 30.4375));` con el comentario *"Fin de garantía contado desde la INSTALACIÓN, no desde la venta (§1)"*. Además `imports.processor.ts:490` calcula `warrantyExpiresAt` con `addMonths(purchaseDate, months)` — **dos bases y dos métodos distintos en el mismo sistema**. `automations.service.ts:244-252` usa `getUTCDate`/`setUTCMonth`; `imports.processor.ts:19-22` usa `getMonth`/`setMonth` (hora local del proceso) y **no tiene clamp**.
- **Impacto en producción.** El multiplicador 30,4375 es un promedio: para 24 meses produce 731 días frente a 730–731 reales según meses y zona; el error se acumula y las revisiones bimensuales quedan fuera de fecha. Sin clamp, el 31 de un mes de 30 días salta al mes siguiente. Con dos bases distintas, la fecha que ve el cliente puede no ser la que ve el sistema.
- **Dependencia.** **D-1**, P1.8 (fin de mes).
- **Próxima acción.** Definir **una única función de fechas** tras resolver D-1. Diseño primero, implementación después.
- **Autorización necesaria.** **D-1** y **P1.8.**

#### B7 — No hay rechazo por datos críticos ni auditoría de rechazos · 🟠 Media

- **Requisito afectado.** RF-01, §14.2, CP-02.
- **Evidencia.** `[VERIFICADO] [alta]` `imports.processor.ts:25-33` devuelve `null` si falta la duración; `:434,449` persiste `warrantyMonths ?? undefined` — **no rechaza**; `:484` cae a `product.warrantyMonths`; `imports.parser.ts:73` declara la fecha de instalación como **columna opcional**. `automations.service.ts:297-311` sí impide entrar sin `installationDate`, pero registra `automation.cycle.skipped` en la auditoría, **no en `failed_sync_logs`**. BD: `warranty_months` NULL en **5 510/5 537**; tabla `failed_sync_logs` **inexistente**.
- **Impacto en producción.** El 99,5% de las compras carecen de duración de garantía y **ninguna fue rechazada**. El sistema opera sobre compras cuya garantía no consta. Los rechazos que sí ocurren quedan dispersos en la tabla de auditoría, sin la referencia de origen ni la fecha de intento que §4 RF-01 exige.
- **Dependencia.** Decisión sobre qué campos son bloqueantes y dónde se registra el rechazo.
- **Próxima acción.** Especificar el contrato de rechazo (campos obligatorios, destino del registro, formato del motivo) antes de implementar.
- **Autorización necesaria.** Decisión de negocio sobre el conjunto exacto de campos bloqueantes.

#### B8 — Captura de placa inexistente · 🟠 Media

- **Requisito afectado.** RF-04, RF-05, §14.5, §14.6, §14.7, CP-04, CP-05, CP-06.
- **Evidencia.** `[VERIFICADO] [alta]` `grep -cniE "plate|placa" apps/api/prisma/schema.prisma` → 21 coincidencias, **todas dentro de identificadores de plantilla** (`template`, `templateD3`, `templateD180`, `templateD365`, `templatePlate…`). No existe columna de placa en `Customer`, `Vehicle` ni `CommercialCycle`. Búsqueda en código de dominio excluyendo plantillas: **0 resultados**. `lifecycle-milestones.ts:181`: `export type MilestoneTemplateSource = 'PENDING_DECISION'`.
- **Impacto en producción.** El primer mensaje del recorrido de posventa **no puede existir**: sin campo de placa no hay almacenamiento, sin parser no hay validación, sin webhook no hay asociación. RF-05 queda bloqueada porque su condición principal no puede ser certain.
- **Dependencia.** P1.3 (formatos de placa) y P0.6 (plantillas aprobadas).
- **Próxima acción.** Especificar el modelo de captura: entidad, ciclo de vida, estados de ambigüedad y resolución manual.
- **Autorización necesaria.** **P1.3** y **P0.6.**

#### B9 — El PIT nombra entidades que el código no tiene · 🟠 Media

- **Requisito afectado.** RF-01 (`failed_sync_logs`), RF-10 (`NO_SEGUIMIENTO`).
- **Evidencia.** `[VERIFICADO] [alta]` `grep -rn "failed_sync_logs\|failedSyncLog\|FailedSyncLog"` sobre `schema.prisma` y `src/` → **0 resultados**. `information_schema.tables WHERE table_name='failed_sync_logs'` → **0**. `grep -rn "NO_SEGUIMIENTO"` sobre `src/` → **0 resultados**. Lo que existe es `Customer.noContactAt` (`eligibility.service.ts:212-225`) y `CommercialCycle.maintenance_opt_out_at` (0 filas pobladas).
- **Impacto en producción.** El PIT describe su comportamiento esperado en términos de entidades concretas. Quien implemente literalmente discoverá que debe crearlas. Sin `CANCELLED` en `MessageStatus` (B10), una baja no es observable como estado de mensaje.
- **Dependencia.** Decisión sobre modelado: ¿se crea `failed_sync_logs` como tabla, o se extiende la auditoría existente con los campos que §4 RF-01 exige?
- **Próxima acción.** Especificar el destino del registro de rechazos antes de migrar.
- **Autorización necesaria.** Decisión de diseño + **autorización de migración** (§13) si implica esquema nuevo.

#### B10 — Estados insuficientes · 🟡 Baja

- **Requisito afectado.** RF-15, §14.14.
- **Evidencia.** `[VERIFICADO] [alta]` `MessageStatus` (`schema.prisma:1034-1040`) = `QUEUED, SENT, DELIVERED, READ, FAILED`. El PIT §4 RF-15 lista nueve estados conceptuales. `CANCELLED` **no existe**.
- **Impacto en producción.** No se distingue "cancelada por exclusión" de "fallida". Sin `CANCELLED`, la evidencia que §12.3 exige en el reporte de tarea ("motivo de bloqueo, fallo o cancelación") no puede extraerse del mensaje.
- **Dependencia.** RF-10 y RF-06 necesitan estados observables para cumplir "cancelar o invalidar".
- **Próxima acción.** Especificar el mapeo estado-conceptual → estado-real, respetando la instrucción del PIT de "evitar duplicados semánticos".
- **Autorización necesaria.** Migración → **§13**.

#### B11 — La matriz de trazabilidad del PIT no mide estado · 🟡 Baja

- **Requisito afectado.** §8, §15.
- **Evidencia.** `[VERIFICADO] [alta]` `pit.md` §588-600: la matriz tiene 4 columnas (ID, Requisito, Tarea principal, Evidencia de aceptación) para 22 filas. **No hay columna de estado real, ni de brecha, ni de evidencia observada.** §15 exige cadena bidireccional completa.
- **Impacto en producción.** La matriz permite afirmar qué está previsto, pero **no en qué punto está**. Esta auditoría (§3) aporta esas columnas; el PIT no las incorpora.
- **Dependencia.** Ninguna.
- **Próxima acción.** Extender §8 del PIT con las columnas de estado. **Fuera del alcance de esta tarea** (no se modificó `pit.md`).
- **Autorización necesaria.** Aprobación para modificar `pit.md`.

#### B12 — La ventana de vencimiento próximo no existe · 🟡 Baja

- **Requisito afectado.** RF-07, RF-09.
- **Evidencia.** `[VERIFICADO] [alta]` La fecha objetivo existe: `lifecycle-milestones.ts:140-146` `PRE_EXPIRY` a `end − PRE_EXPIRY_OFFSET_DAYS`; BD contiene la etapa `Vencimiento −30 días`. La ventana **no**: `eligibility.service.ts:43-51` define ventanas semanales genéricas 08:00–19:30 (lun–vie) y 08:30–18:00 (sáb). Ninguna definición menciona martes/miércoles 9:30–11:00.
- **Impacto en producción.** La etapa de vencimiento próximo se envía dentro de una franja mucho más amplia que la aprobada, si se ejecuta alguna vez.
- **Dependencia.** RF-09 (ventanas por tipo) debe resolverse primero.
- **Próxima acción.** Incluir en el diseño de T5.2.
- **Autorización necesaria.** Ninguna (ejecución de una regla ya aprobada).

### 6.3 Riesgos de la tabla §11 del PIT, actualizados

| Riesgo (§11) | Estado tras T0 |
|---|---|
| Historial de mensajes sin cliente asociado | **Confirmado y materializado** — B3 |
| Scheduler o artefacto desactualizado | **Parcialmente materializado** — la imagen desplegada contiene `core/safety/` y valida `OUTBOUND_SEND_ENABLED`, pero hay 1 migración pendiente de aplicar: `20261009000000_inbound_button_fields` `[VERIFICADO]` |
| Pancake no verificado de extremo a extremo | **No verificable** bajo L1 |
| Placa asociada al ciclo equivocado | **Sin superficie**: no hay captura de placa — B8 |
| Fechas o zonas horarias inconsistentes | **Confirmado** — B6, RNF-07 |
| Fallos en transición entre campañas | **No ejercitado**: la transición nunca se ha ejecutado — B5 |
| Cambios locales mezclados | **Vigente**: 164 cambios sin commit (58 `M`, 106 `??`) |
| Alcance creciente | Controlado por `pit.md` §3.3 |
| Prueba real no autorizada | **Controlado** — `OUTBOUND_SEND_ENABLED=DENIED` `[VERIFICADO]` |

---

## 7. Integridad documental

### 7.1 Estado de los documentos

| Documento | Ruta | Existe | Tamaño | Estado Git | Observación |
|---|---|---|---|---|---|
| PIT rector | `specs/026-pit-final/pit.md` | Sí | **39 311 B / 861 líneas** | **Sin versionar** (`?? specs/026-pit-final/`) | Nunca commiteado. `mtime` 2026-10-10 10:22 |
| Informe T0 | `specs/026-pit-final/t0-audit.md` | **No, antes de esta tarea** | — | — | Creado por esta tarea |
| Spec principal (§2 nivel 2) | `specs/025-lifecycle-postventa/spec.md` | Sí | **0 B** | **` M`** — modificado | **`HEAD` contiene 57 230 B / 789 líneas** — brecha B1 |
| Instrucciones del agente | `AGENTS.md` | Sí | 261 líneas | Versionado | No menciona el PIT |
| Estándares | `specs/09-development-standards.md` | Sí | 609 líneas | Versionado | No referenciado por `AGENTS.md` |
| Visión | `specs/00-vision.md` | Sí | **0 B** | Versionado, vacío | Vacío también en `HEAD` |
| README | `README.md` | Sí | **0 B** | Versionado, vacío | Vacío también en `HEAD` |

### 7.2 Working tree frente a documentos versionados

| Categoría | Cantidad | Nota |
|---|---|---|
| Archivos modificados sin commit (`M`) | 58 | Incluye el vaciado de `spec-025` |
| Archivos sin seguimiento (`??`) | 106 | Incluye el PIT completo |
| Documentos existentes solo en working tree | 2 | `specs/026-pit-final/` (PIT), `specs/024-configuraciones-v1/spec.md` |
| Documentos existen en `HEAD` pero vacíos en working tree | **1** | `specs/025-lifecycle-postventa/spec.md` — B1 |
| `HEAD` | `3469432` | Rama `main`; 47 commits por delante de `origin/main` |

**Riesgo de pérdida.** El PIT entero (39 KB, la autoridad máxima del proyecto) no está versionado. Una operación de limpieza lo eliminaría sin recuperación. `spec-025` está en el estado opuesto: versionado en `HEAD`, pero el contenido **no está en el working tree** y una operación de limpieza con esa面积 lo borraría de forma irrecuperable.

### 7.3 Conflictos de autoridad documental

| # | Conflicto | Documentos | Resolución aplicada en este informe |
|---|---|---|---|
| **C1** | El código implementa y cita **"spec 025 §1"**; el PIT fija **fecha de compra ERP**. El PIT coloca spec-025 por encima de sí mismo, y spec-025 **está vacío** | `automations.service.ts:297`, `imports.parser.ts:73` vs `pit.md` §4 RF-02 vs `HEAD:specs/025-…` | **Prevalece el PIT.** La implementación actual se registra como brecha B6 y el conflicto se eleva a **D-1** |
| **C2** | `AGENTS.md` define una jerarquía de autoridad de 5 niveles **que no incluye el PIT** | `AGENTS.md` §Source of Truth vs `pit.md` §2 | El PIT reina por instrucción expresa. La omisión en `AGENTS.md` se registra como pendiente documental. **`AGENTS.md` no se modificó** |
| **C3** | `pit.md` §2 sitúa el PIT en nivel 3, **por debajo** de la especificación funcional principal | `pit.md` §2 | Coherente con la instrucción de esta tarea: el PIT reina sobre requisitos **salvo** que la spec principal diga otra cosa. Como spec-025 está vacía, **no hay contradicción activa**; en cuanto se restaure, **puede aparecer una** |
| **C4** | `pit.md` §7 T0.6 pide revisar "registros `failed_sync_logs`"; la tabla no existe | `pit.md` §7 vs `schema.prisma` | Brecha B9. El PIT describe el comportamiento requerido; el código no tiene la entidad |
| **C5** | `pit.md` §4 RF-10 nombra la etiqueta `NO_SEGUIMIENTO`; el código usa `noContactAt` | `pit.md` §4 RF-10 vs `eligibility.service.ts:212` | Brecha B9 + decisión abierta P1.6 |

### 7.4 Nota sobre la autoridad de este informe

Este informe **no añade requisitos**. Si el código, un test o una fila de base de datos contradice al PIT, la contradicción queda registrada como brecha y el **PIT conserva su valor normativo**. En particular:

- El hecho de que `warrantyEnd` funcione y esté en producción **no** valida la fecha de instalación como base correcta.
- El hecho de que existan 5 528 ciclos `ACTIVE` **no** valida el modelo de reemplazo de RF-14.
- El hecho de que `AUTOMATIC_FREQUENCY_DAYS = 15` esté implementado y probado **no** satisface RF-08, cuya condición de aceptación es el comportamiento observable, no la constante.
- La contención de envíos (`DENIED`) **no** es un requisito cumplido del PIT: es una medida de contención adoptada mientras los requisitos no lo están.

---

## 8. Conclusión y siguiente paso

### 8.1 Conclusión

El sistema **no está en condiciones de producir posventa automatizada** conforme al PIT, y las brechas no son de implementación marginal: afectan la fecha base del ciclo, la existencia misma del primer contacto, la capacidad de medir a quién se le ha enviado un mensaje y la transición a retención.

A su favor, tres elementos están sólidos y verificados:

1. **RNF-06** — el stack y la arquitectura son los del repositorio.
2. **RF-11** — la diferenciación entre mensaje manual, automático y respuesta existe y el sandbox tiene prioridad sobre el proveedor.
3. **RNF-05** — los estados técnicos que distinguen programado de aceptado y entregado existen, y las simulaciones se marcan explícitamente.

La contención de envíos (`OUTBOUND_SEND_ENABLED=DENIED`, allowlists de organización y canal vacías, política expuesta en `/api/v1/health`) permanece activa y verificada. Es hoy **la única barrera** entre las 8 529 automatizaciones pendientes sobre un calendario no aprobado y el contacto real con clientes de BDC.

**El orden correcto no es implementar, es decidir.** Sin D-1, cualquier trabajo de calendario codifica una de dos reglas de negocio enfrentadas. Sin D-2, la trazabilidad y el límite de frecuencia son inejecutables por construcción.

### 8.2 Siguiente incremento recomendado

**No es una tarea de código.** Es la única acción que reduce el mayor riesgo sin requerir decisión de negocio, y es una prerrequisito literal de D-1.

| Campo | Valor |
|---|---|
| **Objetivo** | Restablecer la legibilidad de `specs/025-lifecycle-postventa/spec.md` sin alterar ningún otro archivo |
| **Acciones permitidas** | Exactamente una: restaurar el archivo desde `HEAD`. Sin opciones alternativas |
| **Archivos permitidos** | `specs/025-lifecycle-postventa/spec.md` — **ninguno más** |
| **Dependencias** | Ninguna. Precede a D-1 |
| **Riesgos** | **Ninguno de pérdida de datos**: el contenido existe en el objeto blob de `HEAD` (57 230 B) y la restauración es determinista. Riesgo residual: que el contenido de `HEAD` esté desactualizado respecto al PIT — eso es una discrepancia documental que debe registrarse, no un motivo para no leerlo |
| **Criterios de aceptación** | 1. El archivo pasa de 0 B a 57 230 B. 2. `git status --short specs/025-lifecycle-postventa/spec.md` deja de reportar ` M`. 3. Ningún otro archivo cambia. 4. `HEAD` sigue siendo `3469432` |
| **Verificaciones** | `stat -c%s` del archivo · `git status --short` acotado a esa ruta · recuento global de cambios sin commit antes y después |
| **Exclusiones explícitas** | No se ejecuta ningún comando de escritura en base de datos · no se aplica la migración pendiente · no se modifica `pit.md` · no se modifica `AGENTS.md` · no se toca `OUTBOUND_SEND_ENABLED` ni ninguna allowlist · no hay commit, push, `add`, `stash`, `reset` ni `clean` · no se despliega ni reinicia ningún servicio · no se envía ningún mensaje · no se ejecuta `npm run build` |
| **Autorización requerida** | **Sí.** La tarea P2-02 prohíbe expresamente `git checkout` y la restauración de archivos. Esta auditoría **no la ejecuta ni la presupone** |

### 8.3 Incrementos posteriores, en orden de dependencia

Cada uno queda bloqueado por el anterior. **Ninguno puede iniciarse sin la decisión que lo antecede.**

| Orden | Incremento | Depende de | Autorización |
|---|---|---|---|
| 1 | Restaurar `spec-025` desde `HEAD` | — | Responsable |
| 2 | **Resolver D-1**: fijar por escrito la fecha base del ciclo y la cadencia de revisiones | 1 | **Negocio BDC** |
| 3 | Redactar la propuesta T2.5 de backfill de `messages.customer_id`, **sin ejecutarla** | — | — |
| 4 | Decidir **D-2**: autorizar o rechazar el backfill | 3 | Responsable |
| 5 | Diseñar (no implementar) el contrato de rechazo de RF-01 y el destino del registro de rechazos | 4 | Diseño |
| 6 | Resolver **P1.3** y **P0.6**: formatos de placa y plantillas aprobadas | 2 | BDC |
| 7 | Diseñar el modelo de captura de placa (RF-04) | 6 | Diseño |
| 8 | Diseñar las ventanas por tipo de campaña (RF-09), incluidas las de RF-07 | 2 | Diseño |
| 9 | Diseñar la transición a retención (RF-06) con la secuencia de 5 impactos | 2, 8 | Diseño + P1.7 |

---

## Anexo A — Comandos ejecutados durante esta auditoría

Todos de lectura. Ninguno alteró el estado del sistema.

**Estado del repositorio**
```
git branch --show-current
git log --oneline -1
git status --short | wc -l
git ls-files specs/026-pit-final/
stat -c%s specs/026-pit-final/pit.md
stat -c%s specs/025-lifecycle-postventa/spec.md
git cat-file -s HEAD:specs/025-lifecycle-postventa/spec.md
git ls-files | while read f; do [ -f "$f" ] && [ ! -s "$f" ] && echo "$f"; done
```

**Código**
```
sed -n '55,80p' apps/api/src/modules/lifecycle/lifecycle.rules.ts
sed -n '165,185p' apps/api/src/modules/lifecycle/lifecycle.rules.ts
sed -n '244,252p' apps/api/src/modules/automations/automations.service.ts
sed -n '290,312p' apps/api/src/modules/automations/automations.service.ts
sed -n '325,345p' apps/api/src/modules/automations/automations.service.ts
sed -n '19,27p' apps/api/src/modules/imports/imports.processor.ts
sed -n '25,55p' apps/api/src/modules/imports/imports.processor.ts
sed -n '480,500p' apps/api/src/modules/imports/imports.processor.ts
sed -n '35,70p' apps/api/src/modules/lifecycle/eligibility.service.ts
sed -n '212,235p' apps/api/src/modules/lifecycle/eligibility.service.ts
sed -n '295,320p' apps/api/src/modules/lifecycle/eligibility.service.ts
sed -n '118,160p' apps/api/src/modules/lifecycle/lifecycle-milestones.ts
sed -n '530,545p' apps/api/src/modules/whatsapp/whatsapp.service.ts
grep -n "enum MessageStatus" -A 8 apps/api/prisma/schema.prisma
grep -n "enum AccountType" -A 5 apps/api/prisma/schema.prisma
grep -rn "failed_sync_logs\|NO_SEGUIMIENTO\|PLATFORM_OWNER" apps/api/src apps/api/prisma
grep -rniE "\bplate\b|placa" apps/api/src --include=*.ts
```

**Base de datos — todas en `BEGIN TRANSACTION READ ONLY … ROLLBACK`**
```sql
SELECT count(*) FROM messages;
SELECT count(*) FROM messages WHERE customer_id IS NULL;
SELECT count(DISTINCT customer_id) FROM messages;
SELECT count(*) FROM information_schema.tables WHERE table_name = 'failed_sync_logs';
SELECT count(*) FROM _prisma_migrations;
SELECT count(*) FROM automations;
SELECT count(*) FROM automations WHERE status='SCHEDULED' AND scheduled_date > now();
SELECT count(DISTINCT purchase_id) FROM automations;
SELECT count(*) FROM commercial_cycles;
SELECT count(*) FROM commercial_cycles WHERE end_date IS NOT NULL;
SELECT count(*) FROM commercial_cycles WHERE termination_reason IS NOT NULL;
SELECT count(*) FROM commercial_cycles WHERE lifecycle_paused_at IS NOT NULL;
SELECT count(*) FROM commercial_cycles WHERE maintenance_opt_out_at IS NOT NULL;
SELECT count(*) FROM purchases;
SELECT count(*) FROM purchases WHERE warranty_months IS NULL;
SELECT count(*) FROM purchases WHERE warranty_expires_at IS NOT NULL;
SELECT count(*) FROM templates;
SELECT count(*) FROM automations a JOIN purchases p ON p.id=a.purchase_id
  WHERE p.warranty_months IS NULL;
SELECT DISTINCT stage_name FROM automations WHERE stage_name IS NOT NULL;
SELECT DISTINCT status FROM commercial_cycles;
SELECT column_name FROM information_schema.columns
  WHERE table_name IN ('commercial_cycles','purchases');
```

**Contención de envíos**
```
docker exec automatizeit-api sh -c 'echo "ENABLED=[$OUTBOUND_SEND_ENABLED]"; \
  echo "ORG_allowlist_vacia=$([ -z "$OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS" ] && echo si || echo no)"; \
  echo "CHANNELS_vacia=$([ -z "$OUTBOUND_SEND_ALLOWED_CHANNELS" ] && echo si || echo no)"; \
  echo "UNTIL=$OUTBOUND_SEND_UNTIL"'
curl -s http://localhost:3002/api/v1/health
docker exec automatizeit-api sh -c 'ls dist/core/safety/'
docker exec automatizeit-api sh -c 'grep -c OUTBOUND_SEND_ENABLED dist/core/config/env.validation.js'
```

## Anexo B — Distribución de evidencia

**Verificado directamente en esta sesión `[VERIFICADO]`: 19 hallazgos** — modelo de datos (`Message.customerId` nullable, `MessageStatus` con 5 estados, ausencia de placa, ausencia de `failed_sync_logs`), contenido de la base de datos (9 agregados en transacción de solo lectura), código de cálculo de fechas (3 implementaciones divergentes de `addMonths`/`warrantyEnd`), ventanas horarias, motor de elegibilidad y su dependencia de `customerId`, plantilla de 3 hitos en `automations.service.ts`, hitos de `lifecycle-milestones.ts`, puerta G2 y campo `noContactAt`, política de envíos en el contenedor y expuesta en `/api/v1/health`, presencia de `core/safety/` en la imagen desplegada, y estado documental de `pit.md`, `spec-025` y `HEAD`.

**Evidencia histórica `[EVIDENCIA HISTÓRICA]`: 3 hallazgos** — cobertura de superficies de red por el guard de seguridad (AUTO-SAFETY-004), comportamiento del frontend ante el bloqueo (AUTO-SAFETY-005/006/008), y manejo de `SendBlockedError` sin consumo de reintentos (AUTO-SAFETY-002). No reconfirmados en esta sesión.

**No verificado `[NO VERIFICADO]`: 5 puntos** — comportamiento del scheduler tras inactividad (P0.2), integración real de extremo a extremo con Pancake (P0.3), plantillas aprobadas por el canal (P0.6), mapeo real de estados devueltos por el proveedor, y la suite de pruebas de la API (no ejecutada, limitación L6).

**Decisiones de negocio que este informe no toma: 12** — D-1 a D-4, más las ocho decisiones P1 del PIT §10, más el conjunto exacto de campos bloqueantes de RF-01.
