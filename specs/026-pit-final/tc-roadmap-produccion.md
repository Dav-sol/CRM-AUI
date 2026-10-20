# Roadmap de producción — Automatize IT Platform / Baterías del Caribe

> **Autoridad funcional:** `specs/026-pit-final/pit.md`. Este documento **no
> redefine ningún requisito**. Solo organiza, referencia y traza a PIT.
>
> - No modificar PIT para adaptarlo al código.
> - No usar `spec-025` como autoridad: está vacío (0 B).
> - Si código, pruebas o documentación contradicen PIT, la contradicción se
>   **registra como brecha**, no se resuelve por decreto.
> - El código se ajusta a PIT; PIT nunca se ajusta al código.

**Nivel de evidencia de este documento:** cada afirmación lleva marca de origen.

| Marca | Significado |
|---|---|
| **[O]** | Observado: verificado directamente en el repositorio o en la BD en solo lectura |
| **[I]** | Inferencia: deducido de lo observado, con la deducción explícita |
| **[P]** | Pendiente: no verificado, declarado como tal |

**Estado del documento:** vigente. **No autoriza ninguna operación.**

---

## 1. Verificación previa (2026-10-11)

### 1.1 Estado de Git **[O]**

```
rama:            main
HEAD:            3469432  chore(web): support stdout logging mode for systemd supervision
cambios:         201  (M=88, ??=113)
staging:         vacío
commits nuevos:  0
```

Los 201 cambios locales **se preservan íntegros**. Ninguna tarea de este roadmap
debe hacer `git add .`, `stash`, `clean`, `reset` ni `checkout`. El commit de
este trabajo es una decisión humana aparte, con selección por hunk (riesgo ya
registrado en PIT §11).

### 1.2 Metodología SDD disponible **[O]**

Spec Kit está instalado en `.specify/`:

```
.specify/templates/{spec,plan,tasks,checklist,constitution}-template.md
.specify/scripts/bash/{create-new-feature,setup-plan,setup-tasks,check-prerequisites,common,resolve-template}.sh
.specify/memory/constitution.md
.specify/workflows/{speckit/workflow.yml,workflow-registry.json}
.specify/integrations/{opencode,speckit}.manifest.json
```

**No existe binario global `specify`** ni script en `package.json` que lo
invoque. 16 directorios `specs/NNN-slug-v1/` ya siguen el formato de tareas
`[ID] [P?] [Story]` sobre `- [ ]` / `- [x]`.

Este roadmap adopta ese formato de trazabilidad **sin ejecutar ningún comando de
Spec Kit** y **sin instalar nada**.

Specs incompletos: `021-follow-up-sequences-v1`, `023-filters-v1` y
`024-configuraciones-v1` solo tienen `spec.md`. `025-lifecycle-postventa/spec.md`
está vacío.

### 1.3 Comandos realmente disponibles **[O]**

| Ámbito | Comando | Qué ejecuta |
|---|---|---|
| Raíz | `npm test` | `turbo run test --filter=web` — **solo web** |
| Raíz | `npm run lint` | `turbo run lint --filter=web` — **solo web** |
| Raíz | `npm run typecheck` | `turbo run typecheck --filter=web` — **solo web** |
| Raíz | `npm run build:web` | `turbo run build --filter=web` |
| Raíz | `npm run api:validate` | `api:lint` + `api:spectral` (Redocly + Spectral) |
| Raíz | `npm run api:bundle` | Redocly bundle → `specs/api/dist/openapi.yaml` |
| Raíz | `npm run api:generate` | Orval → SDK web |
| API | `npm run build` | `nest build` |
| API | `npm test` | `jest` |
| API | `npm run test:cov` | `jest --coverage` (**sin umbral configurado**) |
| API | `npm run test:e2e` | `jest --config ./test/jest-e2e.json` (16 suites) |
| API | — | **no existe `typecheck`** |
| Web | `npm test` / `typecheck` / `lint` / `build` | vitest / tsc / eslint / next |

No existen scripts de despliegue, de migración de base de datos ni de backup.

### 1.4 Estado de pruebas **[O]**

| Suite | Resultado |
|---|---|
| API (jest) | **1032 pasan · 6 fallan · 2 skipped** · 58/60 suites |
| Web (vitest) | **189 pasan / 189** · 29 archivos |
| `tsc --noEmit` API | **0 errores en producción** · 19 totales, todos en specs ajenas |
| Lint archivos tocados (T-C-FINAL) | **0 errores** |

Los 6 fallos son **preexistentes y ajenos**: `eligibility.service.spec.ts` usa
`const NOW = new Date()` (línea 19) y la fecha de verificación es domingo, día
que G5 prohíbe para envíos programados. 5 tests afectados + 1 que fija
`holidays: ['2026-10-05']`. **[I]** No son una regresión de T-C-FINAL: el mismo
set fallaba antes de ese bloque.

### 1.5 Hallazgos nuevos que no aparecen en los informes previos **[O]**

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **H-A** | **Deriva esquema↔BD.** El esquema Prisma declara `@db.Date` en `purchases.purchase_date`, `warranty_expires_at` e `installation_date`; la BD tiene `timestamp without time zone` y la migración no figura en `_prisma_migrations` | `information_schema` + `_prisma_migrations` | El artefacto declarado y la BD real **no coinciden**. `prisma migrate dev` detectaría deriva; el comportamiento entre entornos deja de ser determinista |
| **H-B** | **Pancake no está configurado.** El router org-scoped `shouldUsePancake()` existe y funciona, pero el contenedor **no expone ninguna variable `PANCAKE_*`** | `whatsapp.service.ts:1941`, `docker exec … printenv` | `shouldUsePancake()` siempre devuelve `false` → todo envío cae en `MetaWhatsAppProvider` |
| **H-C** | **El webhook es de forma Meta.** Verificación por `hub.verify_token` y firma `x-hub-signature-256`; `specs/API-Pancake/integration.md` **no documenta webhooks** | `whatsapp.webhook.controller.ts:29-65` | Si Pancake no firma con esa convención, **no entra ninguna respuesta ni estado de entrega** → RF-15 irrecuperable |
| **H-D** | **La puerta de calidad ignora la API.** Los 4 scripts raíz filtran `--filter=web` | `package.json:8-14` | `npm test` ejecuta 189 tests e ignora los 1032 del backend. Ninguna puerta automática cubre ~90 % del código |
| **H-E** | **`GET /health` es estático.** Devuelve `status:'ok'` fijo; no consulta PostgreSQL, Redis ni el scheduler | `health.service.ts:8-19` | RNF-05 insuficiente para detectar caídas en operación |

### 1.6 Límites de esta inspección

- No se ejecutaron los 16 suites e2e (requieren base de datos con escritura).
- No se verificó la documentación de Pancake contra la del proveedor: requiere
  acceso externo y acceso a la cuenta.
- No se midió cobertura: `collectCoverageFrom` existe pero **no hay
  `coverageThreshold`**, pese a que la constitución y `AGENTS.md` exigen >80 %.
- No se auditaron módulos fuera del ciclo comercial, la mensajería y la
  operación.

---

## 2. Matriz requisito PIT → estado → evidencia → tarea

Niveles: **I** implementado · **P** probado (unitario) · **E** validado de
extremo a extremo · **A** aceptado por humano · **O** autorizado para operar.

| PIT | Requisito | I | P | E | A | O | Evidencia | Tarea |
|---|---|:-:|:-:|:-:|:-:|:-:|---|---|
| RF-01 | Ingreso de compras | ✅ | ✅ | ⚠️ | ❌ | ❌ | `imports.processor.ts`; `imports.e2e-spec.ts` | RM-06 |
| RF-02 | Inicio y duración de garantía | ✅ | ✅ | ❌ | ❌ | ❌ | `warrantyEnd` → `addMonthsClamped`; 27/27 coherentes en BD | RM-03 |
| RF-03 | Campaña de garantía (bimensual) | ✅ | ✅ | ❌ | ❌ | ❌ | `planMilestones`: meses 2/4/6/8/10/12 | RM-03 |
| RF-04 | Contacto inicial y captura de placa | ❌ | ❌ | ❌ | ❌ | ❌ | Sin plazo en PIT; P0.6 + P1.3 abiertos | **RM-18** |
| RF-05 | Solicitud de reseña de Google | ❌ | ❌ | ❌ | ❌ | ❌ | Ídem RF-04 | **RM-18** |
| RF-06 | Vencimiento y transición a retención | ✅ | ✅ | ❌ | ❌ | ❌ | 5 impactos desde el vencimiento original | RM-03 |
| RF-07 | Vencimiento próximo (−30 d) | ✅ | ✅ | ❌ | ❌ | ❌ | `PRE_EXPIRY` | RM-03 |
| **RF-08** | **Frecuencia global** | ✅ | ✅ | ❌ | ❌ | ❌ | Motor OK; `messages.customer_id` NULL en **8 163/8 163** → G3 nunca bloquea | **RM-04** |
| RF-09 | Horarios por tipo de mensaje | ✅ | ✅ | ❌ | ❌ | ❌ | G5/G6; sin hora de envío comercial | **RM-05** |
| RF-10 | Exclusión voluntaria | ✅ | ✅ | ❌ | ❌ | ❌ | G2 `noContactAt` | RM-08 |
| RF-11 | Mensajes manuales | ✅ | ✅ | ❌ | ❌ | ❌ | `assertOutboundPermit` → 503 | RM-09 |
| RF-12 | Pausa y reanudación | ✅ | ✅ | ❌ | ❌ | ❌ | G1; `lifecycle.service.resume` | RM-08 |
| RF-13 | Recuperación después de una caída | ❌ | ❌ | ❌ | ❌ | ❌ | Sin procedimiento; scheduler `@Interval` en proceso | **RM-10** |
| RF-14 | Nueva compra y múltiples vehículos | ✅ | ✅ | ❌ | ❌ | ❌ | Ciclo por compra; `purchaseId` único | RM-03 |
| RF-15 | Resultados y estados | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | Falta contrato webhook (H-C) + P1.1 | **RM-11** |
| RNF-01 | Idempotencia | ✅ | ✅ | ❌ | ❌ | ❌ | `planMilestones` puro; fechas únicas | RM-03 |
| **RNF-02** | **Trazabilidad** | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | Roto en datos: sin `customer_id` no hay asociación | **RM-04** |
| RNF-03 | Seguridad | ✅ | ✅ | ⚠️ | ❌ | ❌ | `tenant-isolation.e2e-spec.ts` existe | RM-12 |
| RNF-04 | Recuperación | ❌ | ❌ | ❌ | ❌ | ❌ | Ídem RF-13 | **RM-10** |
| RNF-05 | Observabilidad | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | Auditoría ✅; health estático, sin métricas (H-E) | **RM-13** |
| RNF-06 | Compatibilidad | ✅ | ✅ | ⚠️ | ❌ | ❌ | Contrato civil; `api:validate` disponible | RM-14 |
| RNF-07 | Zona horaria | ✅ | ✅ | ❌ | ❌ | ❌ | `America/Bogota` explícito; tests de independencia de zona | RM-03 |

### 2.1 Bloqueantes PIT (§10) **[O]**

| # | Bloqueante | Estado | Tarea |
|---|---|---|---|
| P0.1 | Identificación de cliente y asociación del historial | **Incumplido en datos** | RM-04 |
| P0.2 | Comportamiento real del scheduler en el entorno objetivo | Sin verificar | RM-10 |
| P0.3 | Integración real con Pancake y recepción de respuestas | **Incumplido (H-B, H-C)** | RM-11 |
| P0.4 | Límite global de 15 días con todas las campañas | **Inoperante** | RM-04 |
| P0.5 | Transición de garantía a retención sin duplicados | Implementado, sin validar E | RM-03 |
| P0.6 | Plantillas existentes y aprobadas para el canal | Sin confirmar | RM-15 |
| P0.7 | Integridad de fecha base, garantía y contacto | Código ✅, datos sin verificar | RM-03 |

### 2.2 Definiciones pendientes PIT (§10 P1) **[O]**

| # | Definición | Estado | Destino |
|---|---|---|---|
| P1.1 | Estados y responsables para registrar resultado, respuesta e intención | Abierta | HG-11 |
| P1.2 | Fecha límite y estado de un ciclo sin placa | Abierta | HG-11 |
| P1.3 | Formatos de placa y corrección de respuestas inválidas | Abierta | RM-18 |
| P1.4 | Política exacta de festivos y siguiente ventana elegible | Abierta | HG-12 |
| P1.5 | Cierre y reapertura si una compra nueva es reemplazo | Abierta | HG-13 |
| P1.6 | Semántica de `NO_SEGUIMIENTO` | Abierta | HG-14 |
| P1.7 | Contenido y plantilla final de cada impacto de retención | Abierta | RM-15 |
| P1.8 | Regla de vencimiento en fin de mes | **RESUELTA 2026-10-10** (§2.1) | — |

---

## 3. Camino crítico

```
RM-01  La puerta de verificación cubre la API
   │   Sin esto, ninguna evidencia posterior es creíble (H-D)
   ▼
RM-04  RF-08 + RNF-02 de extremo a extremo          ⟵ HG-2 / D-2  ⟵ escritura
   │
   ▼
RM-05  HG-1 · hora comercial 09:00 America/Bogota
   │
   ▼
RM-11  HG-3 · contrato real de Pancake             ⟵ HG-10       ⟵ bloqueante
   │
   ├──────────────────────────────┐
   ▼                              ▼
RM-02  HG-5 · dry run E1–E3    RM-13  Salud y observabilidad reales
   │                              │
   ▼                              │
RM-16  HG-7 · checklist de migración + HG-9       │
   │                              │
   └──────────────┬───────────────┘
                  ▼
RM-17  Runbook, despliegue, backups, smoke tests
                  │
                  ▼
RM-19  HG-4 · aceptación BDC + autorización para operar
```

**Secuencia de datos contra secuencia de código.** RM-02 no escribe, pero produce
los conteos que justifican RM-16 y HG-9. Ambos deben cerrarse **antes** de la
primera escritura real.

---

## 4. Tareas

Formato de trazabilidad Spec Kit: `RM-nn [P?] Descripción`. `[P]` = ejecutable
en paralelo.

### RM-01 · La puerta de verificación debe cubrir la API

- **PIT:** Constitución X · RNF-05 · P0.2
- **Evidencia [O]:** `package.json:8-14` → `turbo run <t> --filter=web` en los
  4 scripts. `apps/api/package.json` sin script `typecheck`.
- **Brecha que resuelve:** hoy `npm test` no ejecuta los 1032 tests del backend.
- **Dependencias:** ninguna. **Bloquea:** toda evidencia de nivel **E** del roadmap.
- **Archivos:** `package.json`, `apps/api/package.json`, `turbo.json`
- **Objetivo y alcance:** que una sola invocación ejecute y valide API + web.
  Añadir `"typecheck": "tsc --noEmit -p tsconfig.json"` a la API y retirar
  `--filter=web` de los 4 scripts raíz.
- **Exclusiones:** no reescribir un pipeline de CI que no existe; no tocar
  configuración de despliegue; no corregir errores preexistentes que la puerta
  revele — reportarlos.
- **Pasos mínimos:** añadir `typecheck` a la API · retirar los 4 filtros ·
  ejecutar `npm test` y `npm run typecheck` · registrar la salida.
- **Pruebas y comandos:** `npm test` debe reportar API + web · `npm run
  typecheck` debe incluir la API.
- **Criterio de aceptación:** una invocación ejecuta 1032 + 189 tests y falla si
  cualquiera de las dos apps falla.
- **Riesgos / rollback:** el build de la API puede revelar errores latentes →
  reportar, nunca ocultar. Reversión: 2 archivos.
- **Human gates:** ninguno.
- **DoD:** comandos ejecutados y salida registrada en el informe de la tarea.
- **Estado:** 🟢 **LISTA**

### RM-02 · HG-5 · Dry run de la transición E1–E3

- **PIT:** RF-06 · RNF-01 · §11 (transición sin duplicados)
- **Evidencia [O]:** el plan ya existe en `tc-transicion-datos.md`. Los conteos
  provienen de una única lectura y **nunca se simularon**.
- **Brecha:** ausencia de verificación de conteos, elegibilidad y reversión.
- **Dependencias:** RM-01. **Bloquea:** RM-16, HG-9.
- **Archivos:** ninguno de producción. SQL de solo lectura en `/tmp/opencode/`.
- **Objetivo y alcance:** simular la unificación de los 12 ciclos divergentes y
  determinar qué ocurre con las 27 compras sin instalación.
- **Exclusiones:** **sin escrituras** en PostgreSQL, Redis o colas · **sin
  tocar** las 8 417 automatizaciones · **sin** recalcular automatizaciones ·
  **sin** cancelar nada.
- **Pasos mínimos:** listar los 12 ciclos con `purchase_id` y ambas fechas ·
  simular el `UPDATE … RETURNING` dentro de `READ ONLY … ROLLBACK` y contar
  filas · determinar de las 27 compras cuáles tienen `warranty_months` y qué
  hitos PIT generarían · una segunda lectura tras el `ROLLBACK` que confirme que
  los conteos son idénticos.
- **Pruebas:** el `ROLLBACK` debe devolver el estado exacto; sin excepción.
- **Criterio de aceptación:** tabla antes/después por categoría + demostración
  de reversión + veredicto sobre las 27 compras.
- **Riesgos:** ninguno por diseño (cero escritura).
- **Human gates:** HG-5 respondido → **requiere revisión humana de los
  resultados antes de RM-16**.
- **DoD:** informe con tablas y segunda lectura confirmatoria.
- **Estado:** 🟢 **LISTA**

### RM-03 · Cierre verificable del motor del ciclo de vida

- **PIT:** RF-02 · RF-03 · RF-06 · RF-07 · RF-14 · RNF-01 · RNF-07 · P0.5 · P0.7
- **Evidencia [O]:** T-C-FINAL implementado; 5 516/5 528 ciclos con base de
  compra; 12 divergentes; 27/27 vencimientos coherentes con P1.8.
- **Brecha:** nada validado contra datos reales; cobertura solo unitaria.
- **Dependencias:** RM-01. **Bloquea:** nivel **E** de RF-02/03/06/07/14,
  RNF-01, RNF-07.
- **Archivos:** `apps/api/src/modules/lifecycle/`, `apps/api/src/modules/automations/`
- **Objetivo y alcance:** pruebas de integración en modo sombra (sin escritura)
  que comparen `planMilestones` contra el SQL equivalente sobre el catálogo real.
- **Exclusiones:** no crear ciclos ni automatizaciones · no tocar los 12 ciclos
  divergentes (eso es RM-02/RM-16) · no ampliar a otros módulos.
- **Pasos mínimos:** derivar el SQL equivalente a `planMilestones` · ejecutar
  ambos sobre compras reales · comparar fecha a fecha · cubrir CP-01, CP-02,
  CP-03, CP-09, CP-10, CP-11 de PIT.
- **Pruebas:** batería de integración con la BD en `READ ONLY`; 0 discrepancias
  entre motor y SQL.
- **Criterio de aceptación:** los 6 casos de prueba PIT con resultado esperado y
  observado; 0 discrepancias.
- **Riesgos:** bajo. **Rollback:** no aplica (no escribe).
- **Human gates:** ninguno.
- **DoD:** casos publicados y reproducibles.
- **Estado:** 🟢 **LISTA**

### RM-04 · RF-08 y RNF-02 de extremo a extremo + plan de backfill D-2

- **PIT:** RF-08 · RNF-02 · P0.1 · P0.4 · §11 (riesgo 1)
- **Evidencia [O]:** `messages.customer_id` es NULL en **8 163 de 8 163** filas.
  G3 consulta por `customerId` → nunca devuelve filas →
  `automaticFrequencyBlocks(null, now)` devuelve `false` → **el límite global de
  15 días nunca bloquea**. Las pruebas unitarias pasan con datos que la BD no
  contiene.
- **Brecha:** RF-08 y RNF-02 **inoperantes en datos reales**.
- **Dependencias:** RM-01. **Bloquea:** aceptación de producción.
- **Archivos:** `apps/api/src/modules/lifecycle/eligibility.service.ts`,
  migración de backfill **nueva, no aplicada**.
- **Objetivo y alcance:** (a) clasificar los 8 163 mensajes sin cliente · (b)
  proponer el backfill · (c) verificar RF-08 con datos reales antes de escribir.
- **Exclusiones:** **no borrar, sobrescribir ni modificar ningún registro
  histórico sin autorización explícita** · **no asumir que todo es prueba** ·
  no tocar `automations`.
- **Criterios de clasificación propuestos [I]:**

  | Señal observada | Interpretación | Acción propuesta |
  |---|---|---|
  | `direction='OUTBOUND'`, `customer_id` NULL, teléfono resoluble a un cliente por E.164 | mensaje real trazable | candidato a backfill |
  | Teléfono no resoluble a ningún cliente | no trazable | reportar; **no inventar** cliente |
  | `created_at` en una ventana de pruebas manuales documentada | posible prueba | clasificar **aparte**, no mezclar con lo anterior |
  | `sent_at` NULL y fallo temprano | intento no materializado | candidato a backfill |

- **Pasos mínimos:** contar por cada criterio · presentar la distribución
  **antes** de proponer el `UPDATE` · redactar la migración **sin aplicarla** ·
  verificar la lógica de gate con datos reales.
- **Pruebas:** con filas reales, `automaticFrequencyBlocks` debe devolver `true`
  para un cliente con mensaje automático hace 14 días · G3 debe bloquear un
  envío real de ese cliente.
- **Criterio de aceptación:** evidencia **E** de RF-08 y RNF-02 con cifras
  antes y después, más el plan de reversión.
- **Riesgos:** **ALTO** — un backfill erróneo asocia mensajes al cliente
  equivocado, con consecuencia comercial y de privacidad.
- **Rollback:** tabla de respaldo `id → customer_id_anterior` creada **antes**
  de cualquier escritura.
- **Human gates:** **HG-2 → autorización explícita antes de ejecutar el backfill.**
- **DoD:** plan entregado + verificación E2E en sandbox; ejecución solo tras
  firma.
- **Estado:** 🟡 **LISTA PARA ELABORAR** · 🔴 **EJECUCIÓN REQUIERE AUTORIZACIÓN**

### RM-05 · HG-1 · Hora comercial 09:00 `America/Bogota`

- **PIT:** RF-09 · RNF-07 · §2.1 (control de cambios)
- **Evidencia [O]:** los hitos se persisten como fecha civil a `00:00 UTC`, que
  corresponde a **19:00 `America/Bogota` del día anterior**. G5/G6 difieren a la
  ventana válida, pero el primer intento cae en el día comercial equivocado.
- **Brecha:** no existe una hora de envío comercial objetivo.
- **Dependencias:** RM-01. **Bloquea:** RM-17.
- **Archivos:** `apps/api/src/modules/lifecycle/lifecycle-milestones.ts`,
  `apps/api/src/modules/lifecycle/eligibility.service.ts`
- **Objetivo y alcance:** implementar 09:00 `America/Bogota` como hora objetivo
  de envío de los hitos, **conservando intacto el cálculo de la fecha civil**.
  Bogotá no tiene horario de verano, así que no hay ambigüedad de DST.
- **Exclusiones:** **no modificar PIT** · no alterar la fecha civil del hito,
  solo su instante de disparo · no activar envíos · no cambiar la zona por
  organización (RNF-07 ya resuelve la presentación).
- **Pasos mínimos:** decidir si 09:00 se aplica como desplazamiento de
  `scheduled_date` o como preferencia de G5/G6 · implementar · **registrar en
  este mismo documento que HG-1 es una decisión operativa y requiere
  formalización en PIT §2.1**, sin editar PIT.
- **Pruebas:** la fecha civil del hito no cambia al aplicar la hora · el
  instante resultante es 09:00 Bogotá · un hito en domingo se difiere al lunes
  09:00 · CP-06 (orden de mensajes) sigue en orden.
- **Criterio de aceptación:** 3 pruebas en verde + nota de formalización
  presentada para firma.
- **Riesgos:** bajo. **Rollback:** revertir el commit.
- **Human gates:** HG-1 respondido. La **formalización en PIT** requiere
  aprobación aparte.
- **DoD:** implementación + pruebas + nota de formalización.
- **Estado:** 🟢 **LISTA**

### RM-06 · Importación y compatibilidad de entrada

- **PIT:** RF-01 · RNF-06
- **Evidencia [O]:** la frontera acepta `YYYY-MM-DD` o instante con zona y
  rechaza el instante sin zona. `imports.e2e-spec.ts` existe. El formulario web
  aún no emite `YYYY-MM-DD` de forma nativa.
- **Dependencias:** RM-01. **Bloquea:** RM-14.
- **Archivos:** `apps/web/…/create-purchase-sheet.tsx`, `specs/api/openapi.yaml`
- **Objetivo y alcance:** migrar el control a `type="date"`, regenerar OpenAPI
  (`api:bundle` + `api:generate`) y validar con `api:validate`.
- **Exclusiones:** no cambiar el contrato de la frontera, que ya convierte · no
  tocar otros parsers.
- **Pruebas:** `npm run api:validate` · `npx tsc --noEmit` en web · e2e de
  importación con `YYYY-MM-DD`.
- **Criterio de aceptación:** el formulario envía `YYYY-MM-DD`; OpenAPI
  regenerado y validado; 0 errores de tipo.
- **Estado:** 🟢 **LISTA**

### RM-07 · RF-10 · Exclusión voluntaria

- **PIT:** RF-10
- **Evidencia [O]:** G2 sobre `customer.noContactAt`; endpoints
  `no-contact` / `allow-contact`.
- **Dependencias:** RM-01. **Brecha:** sin validación E2E.
- **Objetivo y alcance:** e2e del flujo de alta, baja y efecto sobre el envío.
- **Exclusiones:** no cambiar la lógica salvo defecto encontrado.
- **Pruebas:** baja bloquea el envío; alta lo restaura; la exclusión persiste.
- **Criterio de aceptación:** CP-08 en verde.
- **Estado:** 🟢 **LISTA**

### RM-08 · RF-12 · Pausa y reanudación

- **PIT:** RF-12 · P1.2
- **Evidencia [O]:** G1 sobre `cycle.lifecyclePausedAt`; `lifecycle.service.resume`.
- **Dependencias:** RM-01. **Brecha:** sin validación E2E; P1.2 sigue abierta
  (fecha límite de un ciclo pausado).
- **Pruebas:** reanudar no genera hitos retroactivos; los hitos vencidos durante
  la pausa quedan marcados, no reprogramados.
- **Criterio de aceptación:** CP-12 en verde.
- **Estado:** 🟢 **LISTA**

### RM-09 · RF-11 · Mensajes manuales

- **PIT:** RF-11 · RNF-03
- **Evidencia [O]:** `assertOutboundPermit` lanza 503 bajo política `DENIED` y
  registra solo el motivo, nunca el cuerpo, el teléfono ni un token.
- **Dependencias:** RM-01.
- **Pruebas:** con `DENIED`, un envío manual devuelve 503 y no crea fila de
  mensaje; con permiso simulado, respeta la ventana horaria.
- **Criterio de aceptación:** ambos casos en verde y ninguna fuga de contenido en
  el log de auditoría.
- **Estado:** 🟢 **LISTA**

### RM-10 · RF-13 / RNF-04 · Recuperación y scheduler en el entorno objetivo

- **PIT:** RF-13 · RNF-04 · P0.2
- **Evidencia [O]:** el scheduler es `@Interval(60_000)` **en el proceso**
  (`whatsapp.scheduler.ts:19`), sin BullMQ ni lock distribuido. Bajo `DENIED` el
  tick es no-op total, incluidos `findMany` y `expireStuckExecuting`.
- **Brecha:** no existe procedimiento de recuperación ni verificación en el
  entorno objetivo; una segunda instancia duplicaría envíos (viola RNF-01).
- **Dependencias:** RM-01, RM-13. **Bloquea:** nivel E de RF-13/RNF-04.
- **Objetivo y alcance:** documentar y probar por diseño el comportamiento tras
  reinicio (qué ocurre con automatizaciones vencidas) y emitir veredicto sobre
  la necesidad de lock distribuido o garantía de instancia única.
- **Exclusiones:** **no reiniciar servicios** — la verificación es por lectura
  de código y diseño · no introducir la librería de lock sin aprobación.
- **Pruebas:** análisis del flujo `scheduled_date <= now()` tras reinicio ·
  identificación de la condición de carrera si hubiera dos instancias.
- **Criterio de aceptación:** documento de recuperación con el comportamiento
  real y veredicto explícito sobre instancia única.
- **Riesgos:** alto si se despliega con más de una instancia sin lock.
- **Human gates:** si el veredicto exige lock distribuido → **HG-15**.
- **Estado:** 🟢 **LISTA**

### RM-11 · HG-3 · Pancake: configuración, contrato de webhook y estados

- **PIT:** RF-15 · P0.3 · P0.6 · §11 (riesgo «Pancake no verificado»)
- **Evidencia [O]:**
  - `pancake.client.ts` tiene transporte `fetch` real, taxonomía de errores
    (`PancakeAuthError`, `RateLimit`, `Server`, `Timeout`) y throttling.
  - `shouldUsePancake()` enruta por organización, pero **el contenedor no expone
    ninguna variable `PANCAKE_*`** → siempre cae en `MetaWhatsAppProvider` (H-B).
  - El webhook verifica con `hub.verify_token` y `x-hub-signature-256`
    (convención **Meta**) y `specs/API-Pancake/integration.md` **no documenta
    webhooks** (H-C).
- **Brecha:** P0.3 incumplible — sin configuración no hay envío, y sin contrato
  verificado no hay recepción de respuestas ni estados.
- **Dependencias:** RM-01. **Bloquea:** RM-15 y la aceptación de producción.
- **Objetivo y alcance:** (a) documentar el contrato real de webhook de Pancake
  desde la documentación del proveedor · (b) decidir si se adapta el webhook
  existente o se añade uno específico · (c) listar las variables de
  configuración necesarias **por nombre, sin valores** · (d) mapear los estados
  de entrega de Pancake a los estados internos de `messages`.
- **Exclusiones:** **no enviar mensajes reales** · **no asumir integración
  directa con Meta Cloud API** · no introducir credenciales · no tocar
  `OUTBOUND_SEND_ENABLED`.
- **Pruebas:** con el cliente HTTP mockeado — payload de estado → transición de
  `messages.status` · firma ausente o inválida → 401 · payload duplicado →
  idempotente (RNF-01) · estado de error del proveedor → reintento según política.
- **Criterio de aceptación:** contrato documentado con ejemplos, mapa de estados
  completo y pruebas simuladas en verde.
- **Riesgos:** **ALTO** — si Pancake no firma como Meta, el webhook rechaza todo
  y no entra ninguna respuesta.
- **Rollback:** ningún cambio de datos; revertir 2 archivos.
- **Human gates:** HG-3 respondido (Pancake es el objetivo). **Falta confirmar el
  contrato con el proveedor → HG-10.**
- **Estado:** 🟡 **LISTA PARA ELABORAR EL CONTRATO** · 🔴 **IMPLEMENTACIÓN DEPENDE DE HG-10**

### RM-12 · RNF-03 · Seguridad y aislamiento multi-tenant

- **PIT:** RNF-03 · Constitución IV y V
- **Evidencia [O]:** `tenant-isolation.e2e-spec.ts` existe; JWT/RBAC
  implementados; 9 variables de entorno obligatorias validadas por Joi.
- **Dependencias:** RM-01. **Brecha:** el e2e no se ha ejecutado en esta
  inspección; no hay auditoría externa.
- **Objetivo y alcance:** ejecutar y verificar el e2e de aislamiento; revisar que
  ninguna consulta tenant-scoped del alcance omita `organizationId`.
- **Exclusiones:** no auditar módulos fuera del alcance.
- **Pruebas:** e2e de aislamiento en verde; 0 consultas sin frontera de
  organización en los módulos del ciclo.
- **Estado:** 🟢 **LISTA**

### RM-13 · RNF-05 · Salud y observabilidad reales

- **PIT:** RNF-05 · P2 (alertas y salud del scheduler)
- **Evidencia [O]:** `GET /health` devuelve `status:'ok'` fijo; no comprueba
  PostgreSQL, Redis ni el scheduler. La auditoría existe (7 llamadas en
  `automations.service`) pero no hay métricas ni trazas.
- **Dependencias:** RM-01. **Bloquea:** RM-10, RM-17.
- **Objetivo y alcance:** health que compruebe BD, Redis y edad del último tick
  del scheduler; conservar el estado efectivo de la política de envío sin
  exponer contenido de allowlists.
- **Exclusiones:** no introducir una plataforma de observabilidad completa
  (sería P2).
- **Pruebas:** BD caída → `degraded` · BD arriba → `ok` · la respuesta no expone
  identificadores de allowlist ni credenciales.
- **Criterio de aceptación:** el health refleja dependencias reales y no filtra
  datos sensibles.
- **Estado:** 🟢 **LISTA**

### RM-14 · RNF-06 · Contratos API y SDK

- **PIT:** RNF-06 · Constitución III
- **Evidencia [O]:** Redocly + Orval + Spectral disponibles (`api:lint`,
  `api:bundle`, `api:spectral`, `api:generate`, `api:validate`). El bundle puede
  estar desfasado tras el cambio de contrato de T-B3.
- **Dependencias:** RM-06. **Bloquea:** aceptación.
- **Pruebas:** `npm run api:validate` en verde · `npx tsc --noEmit` en web.
- **Criterio de aceptación:** OpenAPI y SDK regenerados sin errores de validación.
- **Estado:** 🟢 **LISTA**

### RM-15 · P0.6 / P1.7 · Plantillas aprobadas para el canal

- **PIT:** P0.6 · P1.7 · RF-06
- **Evidencia [O]:** PIT exige plantillas finales aprobadas antes de habilitar
  envíos; el contenido final de cada impacto de retención está pendiente.
  `templates.service.spec.ts` arrastra 13 errores de tipos preexistentes.
- **Dependencias:** RM-11. **Bloquea:** RM-19.
- **Objetivo y alcance:** inventariar las plantillas PIT requeridas — revisión
  de garantía, preaviso de vencimiento y los 5 impactos de retención — con su
  estado de aprobación y su autoridad.
- **Exclusiones:** **no redactar contenido no aprobado** · no inventar textos.
- **Criterio de aceptación:** matriz `plantilla → estado de aprobación →
  autoridad (PIT o decisión)`. Los huecos quedan como human gate, nunca como
  contenido inventado.
- **Human gates:** **HG-13** (aprobación del proveedor).
- **Estado:** 🟢 **LISTA PARA ELABORAR** · 🔴 **CONTENIDO REQUIERE AUTORIZACIÓN**

### RM-16 · HG-7 · Checklist de migración de fechas civiles + HG-9 (deriva H-A)

- **PIT:** RNF-06 · RNF-07 · P0.7 · §11
- **Evidencia [O]:** migración `20261010000000_purchase_civil_dates` revisada y
  **no aplicada**; no figura en `_prisma_migrations`. Simulación en solo lectura:
  **0** desplazamientos de día · **0** grupos que rompan el índice único ·
  **27/27** vencimientos coherentes con P1.8 tras el cast · 33 filas de
  `purchase_date` y 25 de `warranty_expires_at` perderán la hora (HG-01 lo
  autoriza) · 0 filas de `installation_date` con hora ·
  `automations.scheduled_date` correctamente excluida (279 filas con hora).
  **H-A:** el esquema declara `@db.Date` y la BD tiene `timestamp`.
- **Dependencias:** RM-02. **Bloquea:** RM-17, RM-19.
- **Objetivo y alcance:** checklist de respaldo → validación → ejecución →
  rollback, con la evidencia previa ya recogida, y **resolver HG-9** (orden entre
  aplicar la migración y desplegar el código que ya asume `DATE`).
- **Exclusiones:** **no aplicar la migración** · no ejecutar `prisma migrate dev`
  contra la BD · no desplegar.
- **Pruebas:** repetir la simulación en `READ ONLY` · verificar que el
  `ROLLBACK` restaura el estado exacto · verificar que el checklist cubre la
  ventana de downtime y la verificación de deriva.
- **Criterio de aceptación:** checklist firmado, con la deriva documentada y la
  secuencia ordenada.
- **Riesgos:** **ALTO** — aplicar sobre una instancia cuyo código ya asume
  `DATE` puede cambiar la semántica de lectura entre despliegues.
- **Rollback:** `ALTER COLUMN … TYPE timestamptz`. **La hora perdida NO se
  recupera** → el respaldo previo es obligatorio, no opcional.
- **Human gates:** **HG-7** (no aplicar) + **HG-9** (orden migración/despliegue).
- **Estado:** 🟡 **LISTA PARA ELABORAR** · 🔴 **APLICACIÓN REQUIERE AUTORIZACIÓN**

### RM-17 · Runbook, despliegue, backups, smoke tests y reversión

- **PIT:** §11 (riesgos 2 y 6) · RNF-04 · RNF-05
- **Evidencia [O]:** no hay `docker-compose` en la raíz — los contenedores se
  gestionan por Portainer, externo al repositorio. **No existe script de
  backup ni procedimiento de restauración.** `scripts/` solo contiene
  `human-testing-up.sh` y `web-dev.sh`.
- **Dependencias:** RM-13, RM-16. **Bloquea:** RM-19.
- **Objetivo y alcance:** runbook de despliegue con orden, ventana, verificación
  y reversión; smoke tests posteriores; **procedimiento de backup y restauración
  probado**.
- **Exclusiones:** **no desplegar, no reiniciar, no tocar Portainer, no tocar
  producción.**
- **Pruebas:** restauración real sobre un entorno no productivo · smoke tests
  ejecutados en sandbox.
- **Criterio de aceptación:** runbook ejecutable por otra persona sin contexto
  previo · backup restaurado con éxito y verificado.
- **Riesgos:** **ALTO** — sin backup probado **no hay reversión posible**; este
  es el punto que puede invalidar todo lo demás.
- **Estado:** 🟡 **LISTA PARA ELABORAR** · 🔴 **EJECUCIÓN REQUIERE AUTORIZACIÓN**

### RM-18 · HG-8 · RF-04 / RF-05 — Dependencias de placa y reseña

- **PIT:** RF-04 · RF-05 · P1.3 · P0.6
- **Evidencia [O]:** T-C-FINAL descartó los plazos `+3d` y la ventana `2..5` por
  no tener respaldo documental. PIT describe la acción de RF-04 y RF-05 pero
  **no fija desplazamiento**.
- **Dependencias:** RM-15. **Bloquea:** RF-04 y RF-05.
- **Objetivo y alcance:** **documentar** las tres dependencias (plazo del PIT,
  P0.6 plantillas, P1.3 formato de placa) y formular las preguntas concretas.
- **Exclusiones:** **no inventar plazos** · **no declarar estas funciones
  implementadas** · no implementar.
- **Criterio de aceptación:** documento con las 3 preguntas, su impacto y el
  momento límite para resolverlas.
- **Human gates:** **HG-11**.
- **Estado:** 🔴 **BLOQUEADA POR DECISIÓN HUMANA**

### RM-19 · HG-4 · Aceptación BDC y autorización para operar

- **PIT:** HG-4 (definición operativa de producción)
- **Dependencias:** RM-03, RM-04, RM-05, RM-10, RM-11, RM-12, RM-13, RM-15,
  RM-16, RM-17. **Es la última tarea.**
- **Objetivo y alcance:** aplicar los 5 niveles de §2 sobre la matriz completa;
  obtener aceptación del responsable de BDC y autorización explícita para
  operar.
- **Exclusiones:** no declarar producción lista por tener un plan.
- **Criterio de aceptación:** toda la matriz en nivel **O**, con evidencia
  adjunta y autorización firmada.
- **Estado:** 🔴 **BLOQUEADA — depende de todas**

---

## 5. Tabla de dependencias

| Tarea | Depende de | Bloquea | Clasificación |
|---|---|---|---|
| RM-01 | — | RM-02, RM-03, RM-04, RM-05, RM-06, RM-07/08/09, RM-10, RM-11, RM-12, RM-13 | 🟢 Lista |
| RM-02 | RM-01 | RM-16, HG-9 | 🟢 Lista |
| RM-03 | RM-01 | Aceptación RF-02/03/06/07/14, RNF-01, RNF-07 | 🟢 Lista |
| RM-04 | RM-01 | **Aceptación de producción** | 🟡 Elaborar · 🔴 Escribir |
| RM-05 | RM-01 | RM-17 | 🟢 Lista |
| RM-06 | RM-01 | RM-14 | 🟢 Lista |
| RM-07 / RM-08 | RM-01 | Aceptación | 🟢 Lista |
| RM-09 | RM-01 | Aceptación | 🟢 Lista |
| RM-10 | RM-01, RM-13 | Aceptación RF-13/RNF-04 | 🟢 Lista |
| RM-11 | RM-01 | RM-15, Aceptación | 🟡 Lista · 🔴 HG-10 |
| RM-12 | RM-01 | Aceptación | 🟢 Lista |
| RM-13 | RM-01 | RM-10, RM-17 | 🟢 Lista |
| RM-14 | RM-06 | Aceptación | 🟢 Lista |
| RM-15 | RM-11 | RM-19 | 🟢 Elaborar · 🔴 Contenido |
| RM-16 | RM-02 | RM-17, RM-19 | 🟡 Elaborar · 🔴 Aplicar |
| RM-17 | RM-13, RM-16 | RM-19 | 🟡 Elaborar · 🔴 Desplegar |
| RM-18 | RM-15 | RF-04, RF-05 | 🔴 HG-11 |
| RM-19 | Todas | — | 🔴 Última |

---

## 6. Tareas paralelizables

Tras RM-01, sin archivos compartidos ni estado compartido:

| Grupo | Tareas | Archivos |
|---|---|---|
| **A** | RM-03, RM-05, RM-12 | `modules/lifecycle/`, `modules/automations/` |
| **B** | RM-06, RM-14 | `modules/imports/`, `specs/api/`, `apps/web` |
| **C** | RM-13, RM-10 | `modules/health/`, scheduler |
| **D** | RM-04 | `messages`, `lifecycle/eligibility` |

⚠️ **RM-03 y RM-04 podrían tocar `eligibility.service.ts`.** Serializarlos o
repartirlos por archivo antes de ejecutarlos en paralelo.

---

## 7. Human gates pendientes

Las decisiones ya dadas (**HG-1 a HG-8**) **no se vuelven a preguntar**.
HG-1, HG-2, HG-3, HG-4, HG-5, HG-6 y HG-7 están respondidas; HG-8 asked que se
documenten las dependencias, lo cual es RM-18.

| Gate | Pregunta concreta | Impacto si no se resuelve | Momento límite |
|---|---|---|---|
| **HG-9** *(nuevo)* | ¿Se aplica `20261010000000` **antes** de desplegar el código que ya asume `@db.Date`, o **después**? Hoy hay deriva esquema↔BD activa (H-A) | Comportamiento no determinista entre entornos; `migrate dev` fallaría | Antes de RM-16 |
| **HG-10** *(nuevo)* | ¿Cuál es el contrato real de webhook de Pancake —endpoint, firma y payload de estado? La documentación local no lo cubre y el código usa convención Meta | Si Pancake no firma como Meta, **no entra ninguna respuesta ni estado** → RF-15 irrecuperable | Antes de implementar RM-11 |
| **HG-11** *(de HG-8 / P1.1 / P1.2)* | ¿En qué plazo se dispara la captura de placa (RF-04) y la solicitud de reseña (RF-05)? ¿Qué estados y responsables registran el resultado? ¿Cuál es la fecha límite de un ciclo que nunca recibe la placa? | Esos requisitos no son implementables; hoy no generan nada | Antes de RM-18 |
| **HG-12** *(de P1.4)* | Política exacta de festivos y de selección de la siguiente ventana elegible | Afecta a G5/G6 con el calendario real de festivos Colombian | Antes de aceptar RF-09 |
| **HG-13** *(de P0.6 / P1.7)* | ¿Qué plantillas están **aprobadas** por el proveedor y cuál es su contenido final? | Sin aprobación no se habilita ningún envío | Antes de RM-15 / RM-19 |
| **HG-14** *(de HG-6 / P1.6)* | Tratamiento de las **8 417 automatizaciones** obsoletas, y semántica de `NO_SEGUIMIENTO` | El calendario en BD no coincide con el PIT mientras tanto | Antes de RM-19 |
| **HG-15** *(nuevo, condicional)* | ¿Hace falta lock distribuido o garantía de instancia única para el scheduler `@Interval`? | Dos instancias ⇒ envíos duplicados (viola RNF-01) | Antes de RM-17 |
| **HG-16** *(nuevo)* | Autorización explícita para la **primera escritura en BD**: backfill D-2, E1–E3 y migración | Sin ella no hay producción | Antes de RM-19 |

---

## 8. Riesgos que podrían invalidar el calendario

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Deriva esquema↔BD (H-A)** | Ya materializada | Alto | HG-9 antes de RM-16; verificación de deriva en el checklist |
| **Pancake no firma como Meta (H-C)** | Media | Alto | RM-11 como bloqueante temprano, no tardío |
| Backfill D-2 asocia mensajes al cliente equivocado | Media | **Muy alto** | Tabla de respaldo `id → customer_id_anterior`; verificación E2E antes de escribir |
| La migración pierde la hora sin respaldo | **Materializada si se aplica sin respaldo** | Medio | HG-01 acepta la pérdida; el respaldo previo es obligatorio |
| Los 201 cambios sin commit se mezclan en un despliegue | **Alta si se ignora** | Alto | Riesgo ya en PIT §11. Ninguna tarea hace commit; el commit es decisión aparte con selección por hunk |
| Sin backup probado no hay reversión | Media | Alto | RM-17 con restauración real sobre entorno no productivo |
| PIT no define plazos de RF-04/RF-05 | **Confirmada** | Medio | RM-18 documenta; no inventa |
| Los 6 tests de `eligibility` fallan en domingo | **Confirmada, recurrente** | Bajo | Fijar `NOW` a una fecha laborable en el spec; no afecta al producto |

---

## 9. Criterios globales de salida a producción

Los cinco deben cumplirse simultáneamente.

1. **Puerta de verificación real.** RM-01 en verde: un comando ejecuta API + web
   y falla si algo falla.
2. **Ningún requisito crítico en nivel E.** RF-02, RF-03, RF-06, RF-07, RF-08,
   RF-09, RF-13, RF-15 y RNF-02 validados contra datos reales (sandbox), no solo
   unitarios.
3. **Datos íntegros y trazables.** `messages.customer_id` resuelto o la limitación
   de RF-08 formalmente aceptada por escrito · 12 ciclos unificados o excepción
   documentada · migración aplicada y verificada, o su ausencia formalmente
   aceptada.
4. **Proveedor listo.** Contrato de webhook verificado contra la documentación de
   Pancake · configuración presente **por nombre** · plantillas aprobadas ·
   envío probado **exclusivamente en sandbox**.
5. **Operación gobernada.** Health con dependencias reales · backup **restaurado
   con éxito** · runbook ejecutable · **autorización explícita** de BDC y de
   operaciones.

`OUTBOUND_SEND_ENABLED` permanece en `DENIED` hasta que el punto 4 se cierre por
completo. **No se declara producción lista por tener un plan.**

---

## 10. Operaciones expresamente fuera de autorización

No ejecutadas, no autorizadas y no solicitadas por este roadmap:

aplicar migraciones · ejecutar el backfill D-2 · ejecutar E1–E3 · cancelar,
eliminar o reprogramar las 8 417 automatizaciones obsoletas · modificar
`messages` u cualquier registro histórico · configurar credenciales de Pancake ·
enviar mensajes · desplegar · reiniciar servicios · tocar Portainer · cambiar
`OUTBOUND_SEND_ENABLED` o las allowlists · crear commits, ramas o push ·
`git add .` · `git stash` · `git clean` · `git reset`.

**Estado verificado de la contención:** `OUTBOUND_SEND_ENABLED=DENIED`, ambas
allowlists vacías, en el contenedor en ejecución.

---

## 11. Primer siguiente paso ejecutable

**RM-01 · La puerta de verificación debe cubrir la API.**

Es el único elemento del camino crítico que **no** requiere decisión humana, ni
escritura en base de datos, ni autorización de despliegue. Toca 2 archivos
(`package.json`, `apps/api/package.json`), es reversible en un commit y es la
condición previa de que toda evidencia posterior sea creíble: hoy `npm test`
ejecuta 189 tests e ignora los 1032 del backend.

**HG-9 y HG-10 son las dos decisiones que más urgentemente conviene resolver**,
porque bloquean RM-16 y RM-11 respectivamente y ninguna de las dos depende de
código: ambas salen de una conversación con el proveedor o con quien gobierna los
datos.

---

## Control de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-11 | Versión inicial. Incorpora los 8 human gates HG-1…HG-8 y los hallazgos H-A…H-E. | OpenCode |

**Este documento no autoriza ninguna operación.** La autorización es siempre un
acto humano explícito, posterior y específico.