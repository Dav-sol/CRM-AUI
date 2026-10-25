# Línea base de verificación

**Fecha:** 2026-10-20
**Repositorio:** `CRM-AUI` / Automatize IT Platform
**Rama / HEAD:** `main` @ `18ede0ec0d7fdf043f98546e7f2ceb7d94fac7be` (= `origin/main`, 0/0 ahead-behind)
**Alcance de este documento:** registrar el estado real y reproducible de la puerta de verificación del proyecto, y los criterios para que siga siendo verde.

> Documento redactado en la FASE 0 del plan de producción (U0.5). Sustituye a cualquier afirmación anterior sobre "la suite pasa": aquí están los comandos, las cifras y cómo repetirlas.

---

## 1. Estado de las puertas

| Puerta | Comando | Antes de la FASE 0 | **Ahora** |
|---|---|---|---|
| Lint (API) | `npm run lint` | 🔴 153 errores · 4 warnings | 🟢 **0 errores · 0 warnings** |
| Lint (web) | `npm run lint` | 🟡 13 warnings · 0 errores | 🟡 **13 warnings · 0 errores** (preexistente, `apps/web` fuera del alcance de esta fase) |
| Tipos | `npm run typecheck` | 🔴 19 errores | 🟢 **0 errores** |
| Pruebas | `npm test` | 🔴 1077 ✅ · **1 ❌** · 2 ⏭ | 🟢 **1078 ✅ · 0 ❌ · 2 ⏭** |
| Build | `npm run build` | 🟢 correcto | 🟢 **correcto** |
| Determinismo temporal | `scripts/check-test-determinism.sh` | 🔴 no existía | 🟢 **1078 ✅ en 12 escenarios** |
| Guarda de migraciones | `scripts/check-migrations.sh` | 🔴 no existía | 🟢 **desplegada; bloquea 2 migraciones no aprobadas** |

Las cuatro puertas del proyecto (`lint`, `typecheck`, `test`, `build`) están **en verde**. La única diferencia con el estado inicial es que la de lint pasó de 153 errores a 0, y la de pruebas de 1 fallo a 0.

**Reproducir:**

```bash
npm run lint
npm run typecheck
npm test
npm run build
scripts/check-test-determinism.sh
scripts/check-migrations.sh
```

---

## 2. Cifras de la suite

| Medida | Valor |
|---|---|
| Suites | 60 (59 ejecutadas, 1 omitida) |
| Pruebas | 1080 (1078 ejecutadas, 2 omitidas) |
| Pruebas fallidas | **0** |
| Cobertura de `test/**/*` por `tsc --noEmit` | ✅ (los 15 ficheros de `test/` — 14 e2e + `jest-e2e.setup.ts` — entran en el proyecto de TypeScript) |
| E2e incluidos en el lint tipado | ✅ (antes no se analizaban: ESLint los reportaba como «not found by the project service», 15 errores de parseo) |

Las 2 pruebas omitidas están en **una única suite de integración** (`altiria-sms.provider.integration.spec.ts`), que se salta **condicionalmente**: `hasCredentials && testTo ? describe : describe.skip` — se ejecuta solo si existen `ALTIRIA_USERNAME`, `ALTIRIA_API_PASSWORD` y `ALTIRIA_TEST_TO`. No es un `it.skip` fijo: es una suite de integración contra un proveedor real que, sin credenciales, no debe ejecutarse. La omisión es deliberada y preexistente.

---

## 3. Determinismo temporal

Una prueba no puede depender del día en que se ejecuta. La comprobación mueve el reloj ±varios años y cambia la zona horaria del proceso:

```bash
scripts/check-test-determinism.sh
```

**12 escenarios**: 8 desplazamientos de reloj (0, 45, 200, 400, 800, 1000, −60 y −400 días) y 4 zonas horarias.

| Escenario | Resultado |
|---|---|
| Reloj desplazado 0 / 45 / 200 / 400 / 800 / 1000 días | 🟢 1078 ✅ en todos |
| Reloj desplazado −60 / −400 días | 🟢 1078 ✅ en todos |
| `TZ=UTC` | 🟢 1078 ✅ |
| `TZ=America/Bogota` | 🟢 1078 ✅ |
| `TZ=Europe/Madrid` (horario de verano) | 🟢 1078 ✅ |
| `TZ=Australia/Lord_Howe` (desfase de 30 min) | 🟢 1078 ✅ |

### 3.1 Defectos de determinismo encontrados y corregidos

| # | Defecto | Consecuencia | Corrección |
|---|---|---|---|
| 1 | `eligibility.service.spec.ts` combinaba `NOW = new Date()` (reloj) con `holidays: ['2026-10-05']` (fecha absoluta) | La prueba **falló del 2026-10-12 al 2026-10-20** sin que nadie lo notara, porque la puerta ya estaba roja por otra causa. Empezaría a fallar de nuevo el 2026-12-05 | `NOW` pasa a ser un instante fijo y el festivo se deriva del instante evaluado |
| 2 | `campaigns.service.spec.ts` usaba fechas absolutas para expresar «compra futura» (`2027-01-01`) y «garantía vencida» (`2026-01-01`) | **8 pruebas** fallaban con el reloj desplazado +400 días y **6** con −400 días. Con el calendario real, la primera habría roto el 2027-01-01 | Fechas relativas al instante de la prueba (`daysFromNow` / `isoDaysFromNow`), con un único ancla por caso cuando fixture y aserción deben coincidir |
| 3 | `imports.processor.spec.ts` comparaba la fecha de instalación contra `Date.now()` | Fallaba con el reloj desplazado −400 días | La aserción pasa a ser «el valor es exactamente el día civil del ERP» |
| 4 | `imports.processor.spec.ts` calculaba el vencimiento esperado con `setMonth()` (hora local) mientras la producción usa UTC | Fallaba con `TZ=Europe/Madrid` (cambio de horario de verano): la mitad de la hora | Expectativa explícita en UTC: `2028-02-01T00:00:00.000Z` |
| 5 | `dashboard.service.spec.ts` comparaba el corte de mes contra un `new Date()` del test, mientras el servicio lo calcula con **su propio** reloj | Carrera estrecha: si el reloj cruzaba el cambio de mes entre las dos llamadas, el test fallaba sin que hubiera cambiado el código | Se localiza la llamada que lleva el corte (sin depender del orden) y se aceptan los dos inicios de mes posibles (el actual y el siguiente), manteniendo la aserción: el corte debe seguir siendo un inicio de mes UTC |

### 3.2 Auditoría de los 19 ficheros de prueba con `new Date()` dinámico

`58` usos sin argumentos repartidos en `19` ficheros. Veredicto fichero a fichero:

| Fichero | Usos | Veredicto |
|---|---|---|
| `common/civil-date.spec.ts` | 2 | ✅ Intencional: `isCivilDate(new Date())` comprueba el **tipo** (un `Date` no es una fecha civil), no el valor |
| `modules/auth/auth.service.spec.ts` | 1 | ✅ `deletedAt` de fixture |
| `modules/campaigns/campaigns.controller.spec.ts` | 2 | ✅ `createdAt` / `startedAt` de fixture |
| `modules/campaigns/campaigns.service.spec.ts` | 8 | 🔧 **Corregido** (defecto 2): los 8 son ahora relativos (`daysFromNow` / `isoDaysFromNow`) |
| `modules/conversations/conversations.service.spec.ts` | 2 | ✅ `deletedAt` de fixture |
| `modules/customers/customers.service.spec.ts` | 1 | ✅ `deletedAt` de fixture |
| `modules/dashboard/dashboard.service.spec.ts` | 2 | 🔧 **Corregido** (defecto 5) |
| `modules/follow-up-sequences/follow-up-sequences.service.spec.ts` | 6 | ✅ `createdAt` de fixture |
| `modules/imports/imports.controller.spec.ts` | 2 | ✅ `createdAt` / `updatedAt` de fixture |
| `modules/imports/imports.processor.spec.ts` | 3 | 🔧 **Corregido** (defectos 3 y 4); los 3 restantes son `createdAt` / `updatedAt` / `deletedAt` de fixture |
| `modules/imports/imports.service.spec.ts` | 2 | ✅ `createdAt` / `updatedAt` de fixture |
| `modules/invitations/invitations.service.spec.ts` | 2 | ✅ `createdAt` / `updatedAt` de fixture |
| `modules/lifecycle/eligibility.service.spec.ts` | 5 | 🔧 **Corregido** (defecto 1); los 5 restantes son marcadores (`noContactAt`, `lifecyclePausedAt`) |
| `modules/lifecycle/lifecycle.service.spec.ts` | 5 | ✅ `purchaseDate` (solo truthiness), `deletedAt`, `lifecyclePausedAt`, `resolvedAt`, `reviewRequestedAt`: ninguno se compara con el reloj |
| `modules/password-reset/password-reset.service.spec.ts` | 1 | ✅ `deletedAt` de fixture |
| `modules/products/products.service.spec.ts` | 2 | ✅ `deletedAt` de fixture |
| `modules/quotes/quotes.service.spec.ts` | 2 | ✅ `sentAt` / `acceptedAt` como **dato de entrada** (la aserción no los compara con el reloj) |
| `modules/users/user-sessions.service.spec.ts` | 5 | ✅ Patrón relativo ya correcto: `new Date(Date.now() + 3600_000)` (válido) y `new Date(Date.now() - 1000)` (caducado) |
| `modules/whatsapp/whatsapp.service.spec.ts` | 6 | ✅ `scheduledDate` / `purchaseDate` de fixture: el cálculo de días usa dos instantes casi idénticos y la rama (`<= 3`) no cambia |

**Resultado: 4 ficheros con dependencia real (corregidos) y 15 sin dependencia.** Ninguno de los 15 introduce dependencia temporal, y el criterio es verificable: la suite da **1078 ✅ idénticos** con el reloj desplazado ±varios años y en 5 zonas horarias.

### 3.3 Patrones ya relativos en el repositorio

`user-sessions.service.spec.ts` ya usaba `new Date(Date.now() ± …)` para las caducidades: es el patrón correcto y el que se ha extendido a `campaigns`, `eligibility`, `imports` y `dashboard`.

---

## 4. Correcciones de lint y de tipos

Ninguna regla se desactivó y ningún tipo se degradó. El único ajuste de configuración es `argsIgnorePattern: '^_'` en `@typescript-eslint/no-unused-vars` (la regla sigue activa como `error` y sigue reportando variables e imports sin usar): es la convención que el repositorio ya usaba en `current-user.decorator.ts` (`_data`) y en los `@ValidateIf` de los DTO (`_o`).

| Corrección | Ficheros | Qué era |
|---|---|---|
| Tipado explícito del mock de Prisma | `templates`, `follow-up-sequences`, `campaigns`, `dashboard` | `Record<string, jest.Mock>` hacía ilegibles los delegates (`prisma.template.findMany` → TS2339) |
| `anchor` con el enum de Prisma | `follow-up-sequences.service.spec.ts` | El literal se infería `string` y no era asignable a `CreateFollowUpSequenceStageDto` |
| Tipo real del `tx` de la transacción | `campaigns.service.spec.ts` | Declaraba un `purchase.count` que ni el mock ni el servicio tienen |
| Mock de Prisma declarado con su forma real | `dashboard.service.spec.ts` | Faltaban `customer.findMany` y el delegate `quote` |
| Matchers asimétricos con cast (`as object` / `as Date` / `as string`) | 12 ficheros de prueba | `expect.stringContaining(...)` devuelve `any` en `@types/jest`; se aplica la convención ya existente en `imports.processor.spec.ts` |
| Lectura de `mock.calls` con tipo | `eligibility`, `campaigns` | `mock.calls` es `any[][]`; ahora se tipa `unknown[][]` |
| Mocks de `fetch` con tipo | `pancake.adapter`, `pancake.client` | `mock.calls[0]` se leía como `any` |
| Mocks de API en constantes con nombre | `pancake-whatsapp.provider.spec.ts` | `expect(api.sendInboxMessage)` disparaba `unbound-method` |
| Import sin usar retirado | `messages.service.ts`, `create-template.dto.ts` | `Prisma`, `Type` |
| Interpolación de un `unknown` estrechado | `messages.service.ts` | `stage.name ?? \`Etapa ${i+1}\`` podía producir `[object Object]` |
| `require-await` resuelto | `pancake.*`, `campaigns` | `async () => body` sin `await` |

### 4.1 `test/**/*` entra en el proyecto de TypeScript

`apps/api/tsconfig.json` pasa a incluir `test/**/*`. Antes, los 15 ficheros de `test/` (14 e2e + `jest-e2e.setup.ts`) quedaban fuera del proyecto de ESLint («not found by the project service»): **no se analizaban, no se tipaban y sus errores quedaban invisibles**. Ahora se analizan con las mismas reglas tipadas, y `tsc --noEmit` los cubre (0 errores).

---

## 5. Hallazgos abiertos (documentados, NO corregidos)

Estos defectos son reales pero su corrección cambia comportamiento o alcance, y quedan fuera de la FASE 0:

| # | Hallazgo | Ubicación | Por qué no se corrigió |
|---|---|---|---|
| **H-1** | **`GET /reports/campaigns` acepta `from`/`to` y los ignora.** El contrato publicado los declara; los otros cuatro informes (`customers`, `purchases`, `automations`, `messages`) sí aplican el rango. Es una **violación de contrato**, no una decisión de diseño | `apps/api/src/modules/reports/reports.service.ts:239` (`campaigns(user, _dto)`) | Corregirlo cambia la salida de un endpoint en producción. Requiere autorización |
| **H-2** | `roles.guard.ts` **no tiene spec**, y el gate de roles de las secuencias (`MANAGER_ROLES`) solo se ejercita por el guard genérico | `apps/api/src/core/guards/` | Cobertura nueva; el guard no cambió en esta fase |
| **H-3** | `MessageStatus` no incluye `CANCELLED` (B10 del T0): una baja no es observable como estado de mensaje | `apps/api/prisma/schema.prisma` | Requiere migración (PIT §13) |

---

## 6. Guardas añadidas

| Script | Qué hace | Cuándo corre |
|---|---|---|
| `scripts/check-migrations.sh` | Verifica que toda migración en disco esté **aprobada** (manifiesto `MIGRATIONS.sha256` con el sha256 exacto), que el manifiesto y las migraciones estén versionados, y que la base de datos y el repositorio describan el mismo esquema. **Solo lee** | Antes de `prisma migrate deploy` en el servicio `migrate` del compose; y a mano |
| `scripts/test-check-migrations.sh` | 12 casos sintéticos en un repositorio temporal aislado (sin BD, sin tocar el repositorio de trabajo) | A mano / en integración continua |
| `scripts/check-test-determinism.sh` | Ejecuta la suite con el reloj desplazado y con 4 zonas horarias | A mano / en integración continua |

Detalle de la deriva y alternativas para HG-9: [`informe-deriva-esquema.md`](./informe-deriva-esquema.md).

### 6.1 Verificación de la guarda de migraciones en la imagen real

La guarda se ejecuta dentro de `node:24-slim`, cuyo `/bin/sh` es `dash` (no bash): el script está escrito en **POSIX sh** a propósito.

| Escenario | Resultado |
|---|---|
| Casos sintéticos en repo temporal (`scripts/test-check-migrations.sh`) | 🟢 **12/12** — conforme, no aprobada, modificada, ausente, sin manifiesto, versionada-sin-aprobar, manifiesto sin versionar |
| Guarda en la **imagen real**, estado actual del repositorio | 🔴 sale con **1** y nombra las 2 migraciones no aprobadas |
| Guarda + `&& npx prisma migrate deploy` (orden exacto del compose) | 🔴 **el `&&` corta antes**: `migrate deploy` **no** llega a ejecutarse (sin salida "Applying migration") |
| Guarda con las 2 migraciones aprobadas en un manifiesto temporal montado en solo lectura | 🟢 sale con **0** — la guarda **no bloquea todo**, bloquea exactamente lo no aprobado |
| Estado de `_prisma_migrations` antes y después de ejecutar la guarda | **36 → 36**: la guarda no escribe |
| `npx prisma migrate status` en la imagen | 🟢 funciona (avisa de que la imagen no trae OpenSSL, pero la operación es correcta) |

⚠️ **La guarda bloquea hoy el despliegue**, porque hay dos migraciones sin aprobar en disco. Es el comportamiento previsto: su objetivo es que la aprobación de una migración sea una **decisión explícita**, no un efecto secundario de un `docker compose up`. Resolverlo es U1.3/U1.4 (decisión de David).

---

## 7. Estado de Git tras la FASE 0

```
HEAD            : 18ede0e  (= origin/main, 0/0)
staged          : 0
commits         : 0  (no se ha hecho ningún commit)
```

Los **18 cambios locales preexistentes** (configuración por organización + fechas civiles) siguen intactos y sin tocar:

```
 M apps/api/prisma/schema.prisma
 M apps/api/src/modules/organizations/organizations.controller.ts
 M apps/api/src/modules/organizations/organizations.module.ts
 M apps/api/src/modules/organizations/organizations.service.spec.ts
 M apps/api/src/modules/organizations/organizations.service.ts
 M apps/api/src/modules/purchases/dto/create-purchase.dto.ts
 M apps/api/src/modules/purchases/dto/update-purchase.dto.ts
 M apps/api/src/modules/purchases/purchases.service.spec.ts
 M apps/api/src/modules/purchases/purchases.service.ts
 M specs/api/components/schemas/Organization/Organization.yaml
 M specs/api/components/schemas/Organization/UpdateOrganizationRequest.yaml
 M specs/api/components/schemas/Purchase/CreatePurchaseRequest.yaml
 M specs/api/components/schemas/Purchase/UpdatePurchaseRequest.yaml
 M specs/api/openapi.yaml
 M specs/api/paths/organizations.yaml
?? apps/api/prisma/migrations/20261001000000_add_organization_config/
?? apps/api/prisma/migrations/20261010000000_purchase_civil_dates/
?? apps/api/src/modules/organizations/dto/
```

**Las dos migraciones no versionadas siguen sin versionarse y su contenido no se ha modificado.** La guarda de migraciones las bloquea, que es exactamente su propósito.

### 7.1 Un fichero estaba en ambos conjuntos

`apps/api/src/modules/purchases/purchases.service.spec.ts` figuraba **entre los 18 cambios preexistentes** (trabajo T‑B3 del contrato de fecha civil de compra) y además tenía 4 errores de lint.

- El trabajo preexistente está **íntegro**: el bloque `describe('contrato de entrada de purchaseDate (T-B3)')` con sus 4 casos, y las aserciones de fecha civil (`purchaseDate: '2026-07-22'`), siguen exactamente como estaban.
- Lo único que añade esta fase son **4 líneas**, todas puramente aditivas y sin efecto semántico: tres `}) as object` y un `expect.objectContaining({...}) as object` (los casts que exige `@typescript-eslint/no-unsafe-assignment`).
- Por eso el recuento del conjunto preexistente pasa de `+463 / −143` a `+467 / −147`: **+4 / −4 son exactamente esas cuatro líneas**. Ninguna línea preexistente se alteró.

Ningún otro fichero preexistente fue tocado: `schema.prisma`, `organizations/**`, `purchases/dto/**`, `purchases.service.ts` y `specs/api/**` conservan su diff intacto.
