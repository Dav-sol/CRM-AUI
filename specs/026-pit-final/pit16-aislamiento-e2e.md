# PIT-16 · Aislamiento de las pruebas E2E — evidencia

**Fecha:** 2026-10-22
**Autoridad:** decisión **PIT-16** de David (Davnote, apéndice 2026-10-22):

> _«autorizado crear base de datos aislada, pero solo ANTES de verificar host,
> nombre, credenciales, permisos; debe ser imposible escribir en producción
> desde la configuración de test; no reutilizar `automatizeit` ni
> `automatizeit_restorecheck_20261021`. No puede ejecutar E2E hasta auditar
> operaciones destructivas y demostrar la guarda.»_

---

## 0. Resumen

| Requisito de PIT-16                                                  | Estado                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Verificar host, nombre, credenciales y permisos **antes** de crear   | **Hecho** (§1)                                                         |
| No reutilizar `automatizeit` ni `automatizeit_restorecheck_20261021` | **Cumplido** — base nueva `automatizeit_e2e` (§1)                      |
| Imposible escribir en producción desde la config de test             | **Demostrado** (§3)                                                    |
| Auditar operaciones destructivas de los specs                        | **Hecho** (§2)                                                         |
| Demostrar la guarda                                                  | **Hecho, repetible** — `scripts/check-e2e-isolation.sh` (§3)           |
| Ejecutar E2E                                                         | **Ejecutado** en la base aislada; producción medida antes/después (§4) |
| Cerrar CRIT-16                                                       | **NO** — ver §5: quedan dos causas ajenas al aislamiento               |
| Mecanismo exclusivo de test (CRIT-16-B)                              | **RATIFICADO 25-10-2026** con limitaciones L1–L7 (§9.0)                |
| Migraciones pendientes (CRIT-16-A)                                   | **BLOQUEADAS** — ninguna, ni siquiera en la BD de test (§8)            |

---

## 1. Verificación previa (FASE 1 del aprovisionamiento)

Ejecutada **antes** de crear nada; el script aborta si algún control no cuadra.

```
destino que usa hoy la app: localhost:5433 automatizeit
bases existentes en la instancia:
  automatizeit
  automatizeit_lock
  automatizeit_race
  automatizeit_restorecheck_20261021
  postgres
  template1
permisos del rol administrador:
  automatizeit super=true createdb=true canlogin=true
VERIFICACION OK
  host      : automatizeit-postgres publicado en localhost:5433
  nombre    : automatizeit_e2e (no reutiliza ninguna base prohibida)
  permisos  : rol automatizeit con SUPER=y CREATEDB=y -> puede crear
  poblado   : backup crm-aui_20261021T022312Z_automatizeit.pgdump presente
```

Controles adicionales antes de poblar:

- El backup **no contiene declaraciones de rol** (0 coincidencias con
  `CREATE ROLE|DATABASE CONNECT|SET SESSION AUTHORIZATION`), así que el restore
  no intenta crear usuarios. `[VERIFICADO]`
- **Ninguna migración contiene `INSERT`** (0 ficheros), de modo que un
  `--schema-only` no pierde datos semilla. `[VERIFICADO]`
- El contenedor no monta `/workspace/backups`; se usa `pg_restore` **por stdin**
  para no modificar el filesystem del contenedor ni reiniciarlo. `[VERIFICADO]`

---

## 2. Auditoría de operaciones destructivas

14 suites (`apps/api/test/*.e2e-spec.ts`). Contenido: 29 `deleteMany` de
organización/usuario/rol, en su mayoría acotados a `slug` o `email` de fixture.

### Peligrosas si llegaran a producción

| Fichero:línea                                                         | Operación                                   | Alcance real                                                   |
| --------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `auth.e2e-spec.ts:537`                                                | `audit.deleteMany({})`                      | **Sin `where`: TODA la tabla de auditoría, todos los tenants** |
| `invitations.e2e-spec.ts:58`                                          | `invitation.deleteMany({})`                 | **Sin `where`: TODAS las invitaciones**                        |
| `invitations.e2e-spec.ts:131`                                         | `invitation.deleteMany({})`                 | **Sin `where`: TODAS las invitaciones**                        |
| `purchases.e2e-spec.ts:98`                                            | `audit.deleteMany({ module: 'purchases' })` | Solo por `module`: **transversal a tenants**                   |
| `conversations.e2e-spec.ts:80,292,293`                                | `audit.deleteMany({ module })`              | igual                                                          |
| `whatsapp/automations/dashboard/campaigns/products/customers/imports` | `audit.deleteMany({ module })`              | igual                                                          |

**Conclusión de la auditoría:** con la config actual
(`apps/api/.env` → `localhost:5433/automatizeit`) una ejecución de E2E habría
**destruido la tabla de auditoría de producción** (19 471 filas) y borrado
invitaciones reales. `[VERIFICADO]`

El borrado por `module` además no distingue organización: en producción conviven
6 organizaciones con 5 501 compras en `uat-lifecycle-p0`, así que el daño no se
habría limitado a los fixtures.

**Tabla real de auditoría:** `audits` (el modelo Prisma se llama `audit`).

---

## 3. Creación y demostración de la guarda

### Qué se creó

| Objeto       | Valor                                              | Por qué                                                |
| ------------ | -------------------------------------------------- | ------------------------------------------------------ |
| Base         | `automatizeit_e2e`                                 | nombre de test, no reutiliza ninguna base prohibida    |
| Rol          | `automatizeit_e2e` (LOGIN, **no** superusuario)    | dueño de la base                                       |
| Fichero      | `apps/api/.env.e2e` (600, gitignored por `.env.*`) | única fuente de la `DATABASE_URL` de test              |
| Poblado      | `--schema-only` desde el backup verificado         | **sin datos de clientes**, sin `prisma migrate deploy` |
| Comprobación | `scripts/check-e2e-isolation.sh`                   | repetible, en el repositorio                           |

El secreto vive solo en `.env.e2e`; nunca se imprimió ni fue argv de ningún
proceso (se pasó por un env-file temporal de 600, borrado con `trap`).

### Resultado de la comprobación (`scripts/check-e2e-isolation.sh`, exit 0)

```
=== 1. la configuración de test apunta a la base aislada ===
  [OK]   DATABASE_URL -> base='automatizeit_e2e' rol='automatizeit_e2e'
  [OK]   no apunta a producción ('automatizeit')
=== 2. permisos del rol de test en PRODUCCIÓN (catálogo) ===
  [OK]   sin USAGE de esquema, sin SELECT, sin INSERT, 0 grants de tabla
=== 3. intento REAL de lectura/escritura en producción (rol de test) ===
  [OK]   bloqueado: SELECT count(*) FROM customers -> ERROR:  relation "customers" does not exist
  [OK]   bloqueado: SELECT count(*) FROM purchases -> ERROR:  relation "purchases" does not exist
  [OK]   bloqueado: INSERT INTO organizations ...   -> ERROR:  relation "organizations" does not exist
=== 4. control: la base de test SÍ es utilizable con ese mismo rol ===
  [OK]   conecta y consulta en automatizeit_e2e: automatizeit_e2e rows_customers=0
=== 5. la base aislada tiene esquema pero no datos de producción ===
  [OK]   29 tablas · 146 índices · 0 customers · 0 purchases · 0 messages

AISLAMIENTO E2E VERIFICADO
```

### Nota sobre `CONNECT` (matiz importante, para que no se malinterprete)

El intento `SELECT 1` **sí conecta** a producción, porque PostgreSQL concede
`CONNECT` a `PUBLIC` por defecto y revocarlo solo del rol no basta. **Eso no
importa:** `CONNECT` no da acceso a ningún dato. Lo que bloquea es `REVOKE ALL
ON SCHEMA public`:

| Privilegio sobre `automatizeit` (producción) | Rol `automatizeit_e2e` |
| -------------------------------------------- | ---------------------- |
| `USAGE` en schema `public`                   | **false**              |
| `SELECT` en `customers`                      | **false**              |
| `INSERT` en `customers`                      | **false**              |
| grants de tabla                              | **0**                  |

mientras que sobre `automatizeit_e2e` es `true / true / true`.
No se tocó el `PUBLIC` de producción: eso habría sido modificar el control de
accesos de producción, que **no** está autorizado.

### Cómo se cableó en los tests

`apps/api/test/jest-e2e.setup.ts` (es `setupFiles`, corre **antes** de Nest):

1. Lee `.env.e2e`; si falta → **aborta** (jamás cae en `.env`).
2. Exige que la base sea `automatizeit_e2e` y el rol `automatizeit_e2e`.
3. Fija `process.env.DATABASE_URL`.

Precedencia verificada **en el código fuente de la dependencia**, no supuesta:
`@nestjs/config@4.0.4` `dist/config.module.js` filtra
`Object.keys(config).filter((key) => !(key in process.env))`, es decir solo
asigna claves **que aún no existan**. El valor fijado por el setup prevalece.

Los cinco caminos del guard, probados con copias en `/tmp` (sin tocar el real):

| Caso                    | Resultado                                                                         |
| ----------------------- | --------------------------------------------------------------------------------- |
| `.env.e2e` válido       | resuelve `postgresql://automatizeit_e2e:<oculto>@localhost:5433/automatizeit_e2e` |
| falta `.env.e2e`        | aborta: _«Sin él, las E2E caerían en '.env' (producción)»_                        |
| apunta a `automatizeit` | aborta: _«apunta a la base de producción ('automatizeit')»_                       |
| nombre de base distinto | aborta: _«no es la base de test aislada»_                                         |
| rol distinto            | aborta: _«El rol es lo que impide el acceso a producción»_                        |

---

## 4. Ejecución real y prueba de que producción no cambió

**Recuento de producción antes y después** de ejecutar las 14 suites:

| Tabla           | Antes  | Después |
| --------------- | ------ | ------- |
| `customers`     | 6 277  | 6 277   |
| `purchases`     | 5 537  | 5 537   |
| `messages`      | 8 163  | 8 163   |
| `organizations` | 6      | 6       |
| `audits`        | 19 471 | 19 471  |

`diff` entre ambas tomas: **sin diferencias**. `[VERIFICADO]`

Observación directa de `pg_stat_activity` durante una ejecución: el proceso de
test abre conexiones sobre `automatizeit_e2e`. `[VERIFICADO]`

### Resultado de las 14 suites (base aislada)

```
Test Suites: 6 failed, 8 passed, 14 total
Tests:       35 failed, 117 passed, 152 total
Time:        128.13 s
```

Fallo por suite: `whatsapp` 10 · `conversations` 8 · `automations` 7 ·
`campaigns` 6 · `dashboard` 3 · `purchases` 1.

---

## 5. Por qué CRIT-16 NO se cierra todavía

El aislamiento está resuelto y demostrado, pero **los tests no están en verde**
y las causas son ajenas al aislamiento:

### Causa A — el esquema pendiente de HG-9 (bloqueante)

El error dominante es:

```
PrismaClientKnownRequestError: The column `button_id` does not exist in the current database.
```

- `button_id` lo añade **`20261009000000_inbound_button_fields`**, una de las
  **2 migraciones pendientes** de HG-9. `[VERIFICADO]`
- No está en `_prisma_migrations` ni en producción (`0`) ni en la base de test
  (`0`), pero **sí** en `schema.prisma` local (línea 587 `buttonId`), así que el
  cliente Prisma generado la exige. `[VERIFICADO]`
- 12 menciones a `button_id` en el informe; 15 `PrismaClientKnownRequestError`.

**Conclusión:** el código local ya modela el **estado final post-HG-9**, mientras
que la BD —producción **y** la copia aislada— está en estado **pre-HG-9**.

Dato relevante: el cliente Prisma **dentro del contenedor de producción no
conoce `button_id`**, por lo que **producción no está afectada**. El desajuste es
del árbol de código local, no de la BD en explotación. `[VERIFICADO]`

**Implicación:** CRIT-16 depende de HG-9. Para que las suites pasen, la base de
test debe llevarse al **estado final de 38 migraciones**. Hay dos caminos y
**ninguno es mío de decidir**:

1. Aplicar las 2 migraciones pendientes **solo** a `automatizeit_e2e`. Va en
   contra de la regla vigente _«no `prisma migrate deploy`»_ tal como está
   redactada, aunque sea con `DATABASE_URL` apuntando inequívocamente a la base
   de test.
2. Dejar CRIT-16 **bloqueada hasta la ventana HG-9**, que ya estaba prevista.

### Causa B — el interruptor de envío en el entorno de test

`OUTBOUND_SEND_ENABLED` **no está definido** en `apps/api/.env`. El token
ausente produce `SWITCH_MISSING` → denegado (fail-closed). De ahí los fallos
con `outbound.send.blocked`.

David autorizó el 22-10-2026 un **mecanismo exclusivo de prueba** con proveedor
simulado, sin alterar la política productiva. Queda implementado y verificado
en **§9**: `outbound.send.blocked` pasó de 2 a **0** ocurrencias y la causa B
queda **resuelta**. Las suites no se ponen verdes por eso todavía: ahora todo
lo que queda en ellas lo bloquea la **Causa A** (HG-9), no esta.

### Causa C — resto

3 `Foreign key constraint` y varios fallos de aserción (validación, conteos) sin
atribuir aún a A ni B. Pendiente de triaje una vez resueltas A y B.

---

## 6. Verificación y contención de esta tarea

| Comprobación                              | Resultado                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Producción antes/después de las 14 suites | **idéntica** (5 tablas medidas)                                              |
| `npx jest` (unitario API)                 | **1098 passed / 0 failed / 2 skipped**                                       |
| `npx tsc --noEmit`                        | **0 errores**                                                                |
| `npx eslint` (src, test, nuevo script)    | **0 errores**                                                                |
| `npx prettier --check`                    | **correcto**                                                                 |
| `scripts/check-e2e-isolation.sh`          | **exit 0**                                                                   |
| Migraciones                               | `git diff -- apps/api/prisma/migrations` = **0 líneas**; sin carpetas nuevas |
| `MIGRATIONS.sha256`                       | intacto, prefijo `9a086c610acc0df2`                                          |
| `prisma migrate deploy`                   | **no ejecutado**                                                             |
| `OUTBOUND_SEND_ENABLED`                   | **DENIED** (compose y contenedor)                                            |
| Contenedor `automatizeit-api`             | `StartedAt 2026-10-10` — **no reiniciado**                                   |
| Contenedor Postgres                       | **no reiniciado** (todo por `docker exec`)                                   |
| Estado Git                                | staged 3 / modified 40 / untracked 12                                        |
| Restaurar/eliminar backups                | **no tocado**; `automatizeit_restorecheck_20261021` sin tocar                |

### Cambios de código de esta tarea

| Fichero                           | Cambio                                          |
| --------------------------------- | ----------------------------------------------- |
| `apps/api/test/jest-e2e.setup.ts` | pasa de 1 línea a guard completo de aislamiento |
| `scripts/check-e2e-isolation.sh`  | **nuevo**, comprobación repetible de la guarda  |
| `apps/api/.env.e2e`               | **nuevo, gitignored** (600), credencial de test |

---

## 7. Corrección de seguridad de la limpieza E2E (E2E-01)

Orden exigido por David el 22-10-2026: corregir la seguridad de E2E **antes**
de volver a ejecutar las suites.

### 7.1 Qué estaba roto

Auditoría completa de `.deleteMany` sobre `audits` e `invitations` en
`apps/api/test/`:

| Sitio                                 | Alcance anterior            | Riesgo                                                |
| ------------------------------------- | --------------------------- | ----------------------------------------------------- |
| `auth.e2e-spec.ts:537`                | `audit.deleteMany({})`      | **borraba la tabla entera**, incluidas otras suites   |
| `invitations.e2e-spec.ts:58` y `:131` | `invitation.deleteMany({})` | **borraba la tabla entera** de invitaciones           |
| 16 sitios repartidos en 9 suites      | `where: { module: 'X' }`    | `module` es **transversal al tenant**                 |
| `auth.e2e-spec.ts` (lectura, T065)    | sin filtro de tenant        | aserción sostenible con filas ajenas (falso positivo) |
| `dashboard.e2e-spec.ts:58`            | ya acotado por organización | único sitio correcto — tomado como modelo             |

Al ejecutar suites **en paralelo** contra la misma base, un `deleteMany` por
`module` no solo cruza tenants: puede borrar filas que otra suite esté creando
en ese mismo instante.

### 7.2 Qué se hizo

- **`apps/api/test/helpers/fixture-cleanup.ts`** (nuevo): expresa la única
  regla segura —borrar solo lo perteneciente a las organizaciones de la suite—
  en `deleteFixtureAudits`, `deleteFixtureInvitations`,
  `deleteIdentityAuditsForUser` y `fixtureOrgScope`. Al compartirlo, la
  propiedad es testeable sobre el predicado **real** que ejecutan las suites.
  `Audit.organizationId` es anulable, así que la relación se filtra con `is` y
  las filas con organización `NULL` (auditorías de plataforma, compartidas)
  quedan fuera del alcance **por construcción**.
- **19 sitios corregidos**. Se descartó el filtro `module`: al borrar la
  organización al final de la suite, una auditoría de otro módulo (p. ej.
  `identity`, creada al hacer login) quedaría con `organization_id` NULL y ya no
  sería distinguible de las compartidas.
- **`auth.e2e-spec.ts`**: acote por `user.email` (su fixture es de plataforma,
  `organization_id` NULL, no hay organización por la que acotar) y corregida
  también la **lectura** de T065, que era el origen de un posible falso
  positivo.
- **`apps/api/test/cleanup-safety.e2e-spec.ts`** (nuevo): demuestra que las
  auditorías e invitaciones **ajenas a los fixtures permanecen intactas** y que
  la organización de fixture se puede borrar sin dejar huérfanos. Las
  aserciones son por **pertenencia de ID**, no por recuento global, para que
  no dependan de lo que otras suites estén escribiendo.

### 7.3 Reparación de `scripts/check-e2e-isolation.sh` (modificación de guarda)

Se modifica una guarda y **queda señalado para ratificación**:

| §   | Antes                     | Después                                                         | Motivo                                                          |
| --- | ------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| 4   | exigía `rows_customers=0` | exige `rows_customers=<número>` (**usabilidad**)                | el vaciado no era el objeto del punto 4                         |
| 5   | exigía `29 146 0 0 0`     | exige `29 146` **+ 0 identificadores solapados con producción** | la propiedad declarada es «sin datos de producción», no «vacía» |

**No se debilita la seguridad: se añade una comprobación que no existía.**
§1–§3 quedan intactos. §5 pasa de un recuento que daba **falso negativo** a la
comprobación directa de la propiedad: ningún `uuid` de la base de test
(`organizations`, `customers`, `purchases`, `messages`) existe en producción.
El recuento de residuo sigue apareciendo, etiquetado como **higiene**.

Motivo técnico: los suites limpian en `beforeAll`, no en `afterAll`
(`campaigns.e2e-spec.ts:223` solo cierra la app), así que **ninguna ejecución
puede dejar la base vacía**. Exigir vacío hacía imposible pasar la guarda
después de cualquier E2E legítimo.

### 7.4 Evidencia

| Comprobación                                        | Resultado                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Solape de `uuid` test ↔ producción                  | **0 / 0 / 0 / 0** (orgs · customers · purchases · messages)                               |
| Emails de customers del test no nulos               | **0** (los 7 son `NULL`; la coincidencia inicial era entre `NULL`)                        |
| `scripts/check-e2e-isolation.sh`                    | **exit 0** con la guarda reparada                                                         |
| `npx jest` (11 suites afectadas)                    | **5 fallidas / 6 correctas · 32 fallos / 103 ok** — **paridad exacta** con la línea base  |
| `cleanup-safety.e2e-spec.ts`                        | **2 / 2 correctas** (aislada y junto al resto)                                            |
| `npx tsc --noEmit` · `npx eslint test` · `prettier` | **0 / 0 / correcto**                                                                      |
| `git diff --check`                                  | **0**                                                                                     |
| `git diff -- apps/api/prisma/migrations`            | **0 líneas**                                                                              |
| Restauración fallida (FK a `automations`)           | transacción **revirtió**: estado idéntico antes/después (`orgs=4 customers=7 audits=163`) |

**Ninguna suite regresó**: las 5 suites fallantes eran exactamente las de la
línea base, con el mismo número de fallos, y el error
`audits_organization_id_fkey` (6 ocurrencias) ya estaba en la línea base.

### 7.5 Residuo pendiente — inventario y propiedad (higiene, no seguridad)

Se intentó dejar la base prístino y **se abortó**: 22 tablas tienen FK a
`organizations` y un orden de borrado incompleto revirtió la transacción (sin
daño). Le sigue aplicando que los slugs `camp-org-1/2` y `dash-org-1/2` existen
**también en producción** (residuo histórico), por lo que cualquier borrado debe
ir precedido de una **validación explícita de `current_database()`**.

#### 7.5.1 Inventario (conteo real, 2026-10-23) `[VERIFICADO]`

Comprobaciones previas: `current_database()=automatizeit_e2e`,
`current_user=automatizeit`; `_prisma_migrations` **0 filas**; **29 tablas** en
`public`.

| Tabla | Filas | `org` con valor | `org` NULL | Propiedad (quién la crea) |
| --- | ---: | ---: | ---: | --- |
| `audits` | 521 | 32 | **489** | `audit.identity.service.ts:59` — auditorías de **plataforma** (login/identidad) |
| `roles` | 25 | 12 | 13 | fixtures de org (4 orgs × 3) + 13 globales de las suites de identidad |
| `user_sessions` | 15 | — | — | flujo de login/refresh (`refresh_token_hash`) |
| `campaigns` | 12 | 12 | 0 | suite `campaigns`/`dashboard` |
| `purchases` | 9 | 9 | 0 | suites `purchases`, `dashboard`, `products`, `automations`, `whatsapp` |
| `customers` | 7 | 7 | 0 | suites `customers`, `dashboard`, `whatsapp`, `campaigns`, `products`, `purchases`, `imports` |
| `users` | 5 | 5 | 0 | suites `auth`, `password-reset`, `invitations`, `conversations`, `whatsapp` |
| `messages` | 4 | 4 | 0 | suite `dashboard` |
| `organizations` | 4 | 4 | 0 | prácticamente todas las suites |
| `products` | 4 | 4 | 0 | suites `products`, `purchases`, `dashboard`, `imports`, `campaigns`, `whatsapp` |
| `automations` | 3 | 3 | 0 | suites `automations`, `dashboard`, `whatsapp` |
| `conversations` | 3 | 3 | 0 | suites `conversations`, `dashboard` |
| `invitations` | 0 | — | — | — |
| `quick_replies` | 0 | — | — | — |

#### 7.5.2 Propiedad de las 17 suites `[VERIFICADO]`

- **14 suites** ejecutan limpieza con `fixture-cleanup.ts` / `deleteMany`
  acotada al tenant de la prueba, **en `beforeAll`** — por eso el residuo de
  tenant se repite entre ejecuciones en cifras estables en lugar de crecer sin
  límite.
- **3 suites no escriben en BD** (`app`, `egress-guard`, `outbound-permit`):
  `grep prisma.\*.create|update|delete` → **0 coincidencias**. No producen
  residuo.
- **Las auditorías con `organization_id` NULL quedan fuera del alcance de la
  limpieza por construcción** (`fixture-cleanup.ts`, comentario en
  `fixtureOrgScope`/`deleteFixtureAudits`): son auditorías de plataforma,
  compartidas entre tenants, y no pueden distinguirse de las de otros tenants.
  **Son la única fila que crece con cada ejecución** (163 → 521 entre
  mediciones). El resto de tablas se mantiene estable.

#### 7.5.3 Solape con producción `[VERIFICADO]`

Comparación por `uuid` (volcados a fichero y `comm`, por no poder referenciar
otra base en SQL):

| Tabla | e2e | producción | solape |
| --- | ---: | ---: | ---: |
| `organizations` | 4 | 6 | **0** |
| `customers` | 7 | 6 277 | **0** |
| `purchases` | 9 | 5 537 | **0** |
| `messages` | 4 | 8 163 | **0** |
| `automations` | 3 | 16 820 | **0** |
| `campaigns` | 12 | 21 | **0** |
| `users` | 5 | 7 | **0** |
| `roles` | 25 | 14 | **0** |
| `invitations` | 0 | 0 | **0** |
| `audits` (PK `uuid`) | 521 | 19 471 | **0** |

**Ningún identificador de producción está presente en la base de test.**

#### 7.5.4 Estado

Residuo **inventariado y con propiedad determinada**. No se borró nada. El
único punto que exige decisión es el crecimiento de las auditorías de plataforma
(org NULL), que la limpieza excluye deliberadamente: eliminarlas exigiría
validar `current_database()` y decidir si se permiten borrar auditorías de
plataforma desde una suite — **no se propone hacerlo sin autorización**.

#### 7.5.5 Separación: dato identificado vs. dato ambiguo `[VERIFICADO] — borrado PAUSADO 25-10-2026`

David ha prohibido **borrar residuos de E2E y auditorías de plataforma**. El
inventario se conserva y se separa en tres clases para que, si algún día hay
autorización, el alcance sea exacto y no haya que decidir sobre lo ambiguo.

**Clase A — identificado, atribuible y acotado** (origen: fixture de test;
`uuid` solape 0 con producción; alcance por `organization_id`, o por su FK
directa cuando la tabla no tiene columna de organización):

| Tabla | Filas | Alcance de borrado seguro |
| --- | ---: | --- |
| `organizations` | 4 | por `uuid`/`slug` de fixture |
| `customers` | 7 | `organization_id IN (<fixture>)` |
| `purchases` | 9 | idem |
| `messages` | 4 | idem |
| `automations` | 3 | idem |
| `campaigns` | 12 | idem |
| `products` | 4 | idem |
| `conversations` | 3 | idem |
| `audits` (con org) | 32 | `fixtureOrgScope()` — helper ya existe |
| `users` | 5 | `organization_id IN (<fixture>)` |
| `roles` (con org) | 12 | 4 orgs × 3 roles, por org |
| `user_sessions` | 15 | **`user_id IN (<users de fixture>)`** — no tiene columna de org, pero su FK a `users` sí es acotable |

**Clase B — EXCLUIDO DEL BORRADO por veto explícito de David (25-10-2026)**:

| Tabla | Filas | Origen | Motivo del veto |
| --- | ---: | --- | --- |
| `audits` (`organization_id` NULL) | **489** | `audit.identity.service.ts:59` en cada login | **Prohibido explícitamente**. Además, `fixtureOrgScope` los excluye **por construcción**: son auditorías de plataforma compartidas entre tenants y ninguna suite los deja marcados, así que **no hay predicate de tenant** con el que acotarlos |

**Clase C — AMBIGUO, no determinable con la evidencia actual** (sobre estas
filas **no se emite ninguna propuesta**):

| Elemento | Por qué es ambiguo |
| --- | --- |
| `roles` con `organization_id` NULL (**13**) | Origen **de test** sí es seguro — producción tiene **0** roles NULL (sus 14 filas son de 6 orgs), y el esquema cargó con `--schema-only`, **sin datos ni seeds** (`package.json` no define `seed`). Pero `roles` **no tiene otra FK** con la que acotarlos, así que no hay predicate seguro. **No son «roles de plataforma»**: la comparación con producción lo descarta |
| Suite propietaria de `user_sessions` | Varias suites hacen login (`auth`, `password-reset`, `invitations`…); no hay marca que indique cuál creó cada fila. El **alcance** sí es acotable (Clase A); la **autoría** no |
| Suite propietaria de `users`/`roles` NULL | Mismo caso: origen de test seguro, propietario concreto no recuperable |
| Crecimiento de `audits` NULL | 489 filas, creciente (163 → 521 en dos mediciones): **no es un conjunto cerrado** que pueda inventariarse una sola vez |

**Regla aplicada:** sobre la Clase A nada se borra (veto 25-10-2026), pero su
alcance queda **ya definido**; la Clase B queda vetada y sin predicate; sobre
la Clase C **no se propone nada mientras siga siendo ambigua**.

---

## 8. Pendiente

| ID            | Pendiente                                                                                         | Autoridad                                                   |
| ------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **CRIT-16-A** | **MANTENIDO BLOQUEADO** (25-10-2026): no aplicar migraciones **ni siquiera en `automatizeit_e2e`** sin autorización explícita | **David** — decisión confirmada, no se ejecuta nada         |
| **CRIT-16-B** | ~~Valor de `OUTBOUND_SEND_ENABLED` en el entorno de test~~ → **resuelto en §9** → **RATIFICADO 25-10-2026** con limitaciones L1–L7 (§9.0) | **cerrado y ratificado**                                   |
| **CRIT-16-C** | Triage de los fallos E2E restantes (FK + aserción + `button_id`)                                  | **abierto**: A corregido (7.4), B cerrado y ratificado (§9); **35 fallos = línea base** |
| **E2E-01-D**  | ~~Inventario y propiedad del residuo~~ → **resuelto en §7.5**. Queda **solo el borrado** | **PAUSADO 25-10-2026**: David ha prohibido borrar residuos de E2E **y** auditorías de plataforma. Sin autorización |
| **C14**       | Integración Pancake                                                                               | no emprendido en esta tarea                                 |

---

## 9. Mecanismo EXCLUSIVO de test para la política de organizaciones (CRIT-16-B)

Autorización de David, 22-10-2026 (apartado B): «Diseñar un mecanismo
exclusivo de prueba para la política de organizaciones, con proveedor de
envío simulado. No introducir autorizaciones dinámicas indiscriminadas ni
alterar la política productiva. Demostrar aislamiento de Pancake y Meta,
incluyendo conexiones por sockets directos, no solo `fetch`».

### 9.0 Ratificación `[VERIFICADO — decisión de David, 25-10-2026]`

**CRIT-16-B queda RATIFICADO.** El mecanismo de §9 (permiso exclusivo de test
inyectado antes de `.compile()` + egreso cortado a dos capas + proveedor
mockeado) queda aceptado, **con estas limitaciones que pasan a formar parte del
registro y no pueden omitirse al citar el resultado**:

| # | Limitación | Qué cubre / qué no |
| --- | --- | --- |
| **L1** | **El bloqueo de red es in-process** | Cubre `globalThis.fetch` **y** `net.Socket.prototype.connect` / `net.connect` / `net.createConnection` / `tls.connect`. **No** cubre nada que abra sockets fuera del módulo `net` de Node. |
| **L2** | **El motor nativo de Prisma queda FUERA del guard** | Abre sockets sin pasar por `net`, así que el guard no lo intercepta (documentado en §9.3 y en el propio código). **No es una omisión accidental**: ese tráfico no es el vector que aquí se cierra. |
| **L3** | **La protección de Prisma es SEPARADA** | Se sustenta en `DATABASE_URL` (= `automatizeit_e2e`) + rol `automatizeit_e2e` **sin privilegios sobre producción**, verificado por `scripts/check-e2e-isolation.sh` §2–§3 (exit 0). Es la **única** garantía para el tráfico nativo. |
| **L4** | **Loopback queda permitido por diseño** | Sin `localhost:5433` Prisma no conectaría al Postgres de test. Un destino loopback **no** está bloqueado por L1: es una vía abierta deliberada hacia la BD de test, no hacia internet. |
| **L5** | **Cubre salida, no llegada** | El guard impide **invocar** a un proveedor. **No** demuestra nada sobre validación de payloads entrantes de Pancake/Meta (eso es PAN-01/PAN-03). |
| **L6** | **Solo canal WhatsApp mockeado** | `OUTBOUND_SEND_ALLOWED_CHANNELS=WHATSAPP` y proveedor `jest.fn()`. **No** se demuestra nada del canal SMS en cuanto a política de envío. |
| **L7** | **`OUTBOUND_SEND_UNTIL` en test es 2099-12-31** | Ventana forzosamente no vencida **dentro del proceso de test**. La productiva sigue viniendo de `send-permit.guard.ts` con `OUTBOUND_SEND_ENABLED=DENIED` (§9.4). |

**Qué NO cambia con la ratificación:**

- **CRIT-16-A sigue bloqueado** (§5 causa A, §8): `messages.button_id` ausente
  en `automatizeit_e2e` **y** en producción. **Ninguna migración se aplica,
  ni siquiera en la BD de test, sin autorización explícita.**
- **CRIT-16-C** sigue abierto: los 35 fallos E2E son idénticos a la línea base.
- La ratificación **no** autoriza envíos reales: `OUTBOUND_SEND_ENABLED=DENIED`
  se mantiene.

### 9.1 El obstáculo real que había que resolver

No era solo el interruptor. `ConfigModule.forRoot({ load: [configuration] })`
congela `process.env` en `internalConfig` **una sola vez**, al hacer
`.compile()` del `TestingModule`. Después de ese punto, cualquier asignación a
`process.env` es invisible para `ConfigService.get('safety.*')`.

Por eso la allowlist «no podía cubrir IDs de organización generados en
runtime» (anotación previa de CRIT-16-B): las suites crean las organizaciones
con UUID aleatorio y **después** arrancan Nest, cuando la lista ya estaba
congelada y vacía.

### 9.2 La solución: inyectarla ANTES de `.compile()`

`apps/api/test/helpers/outbound-permit.ts` → `enableOutboundSendForTest(ids)`.

No inventa una vía nueva: sigue el patrón que el propio repositorio ya usaba
para `WHATSAPP_DEFAULT_ORGANIZATION_ID` (`conversations.e2e-spec.ts:7`,
`whatsapp.e2e-spec.ts:122`), es decir, fijar config de test en `process.env`
antes del arranque de Nest. Se llama entre la creación de las orgs y
`.compile()`, y devuelve un restaurador que se invoca en `afterAll`.

**Qué NO es** (y por qué no es relajar una guarda):

| Garantía                                   | Cómo se consigue                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| La lógica evaluada es la de producción      | no se toca `send-permit.ts`, `send-permit.guard.ts` ni `configuration.ts`                        |
| Sin autorización dinámica indiscriminada    | allowlist = solo los UUIDs que la propia suite creó; ni comodín, ni `*`, ni wildcard              |
| La política productiva no cambia            | solo escribe `process.env` del proceso de test; contenedor `automatizeit-api` intacto (`DENIED`) |
| Solo puede activarse sobre la BD aislada    | fallo cerrado: `NODE_ENV=test` **y** `DATABASE_URL` exactamente `automatizeit_e2e`, o lanza       |
| No se filtra a otras suites                 | restaurador en `afterAll` (`--runInBand` comparte `process.env`)                                 |
| Solo el canal mockeado                      | `OUTBOUND_SEND_ALLOWED_CHANNELS=WHATSAPP`; SMS queda fuera                                       |
| Ventana no vencida pero acotada             | `OUTBOUND_SEND_UNTIL=2099-12-31T23:59:59.000Z`, en test                                         |

### 9.3 Aislamiento de Pancake y Meta: además de `fetch`, a nivel de socket

`fetch` no bastaba: un cliente con transporte propio podría abrir el socket
sin pasar por `globalThis.fetch`. En `test/jest-e2e.setup.ts` se parchean
`net.Socket.prototype.connect`, `net.connect`, `net.createConnection` y
`tls.connect`; todo destino que no sea loopback se rechaza **antes** de
conectar y se registra en `__E2E_BLOCKED_EGRESS__`, el mismo inventario que
los bloqueos de `fetch`.

Se conserva loopback, porque ahí vive el Postgres de test (`localhost:5433`);
sin ello Prisma no conectaría. Se conservan también los sockets Unix, que no
salen de la máquina.

Salvedad honesta documentada en el propio código: el motor **nativo** de
Prisma abre sockets sin pasar por el módulo `net` de Node, así que este guard
no lo intercepta. Ese tráfico está cubierto por el otro lado del aislamiento
(`DATABASE_URL` + rol sin privilegios sobre producción, `check-e2e-isolation.sh`
§2–§3), y no es el vector que aquí se cierra: el objetivo es que el proceso de
test **no pueda invocar** a un proveedor.

Un descubrimiento durante las pruebas: en Node, `net.connect('host', 443)` con
el string primero **no es TCP** —se toma como ruta de socket Unix
(`PipeConnectWrap`)—, así que la forma corta legítima es `net.connect(443,
'host')`. Está cubierta por su propia prueba.

### 9.4 Evidencia

| Comprobación                                                    | Resultado                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `outbound-permit.e2e-spec.ts` (fallo cerrado del mecanismo)      | **7/7**                                                                |
| `egress-guard.e2e-spec.ts` (`fetch` + socket)                    | **16/16** (9 nuevas de socket)                                         |
| `cleanup-safety.e2e-spec.ts`                                     | **2/2**                                                                |
| `outbound.send.blocked` en el run completo                       | **2 → 0** ocurrencias                                                  |
| Suites `whatsapp` + `conversations`, conjunto de fallos          | **idéntico** al de la línea base (18 → 18, `diff` vacío)                |
| Motivo residual de esos 18 fallos                                | `messages.button_id` → **Causa A (HG-9)**, ya no la política           |
| Run completo de E2E                                              | **17 suites: 35 failed / 142 passed / 177 total**                      |
| Conjunto de los 35 fallos vs. línea base                         | **idéntico** (`diff` vacío)                                            |
| Intentos de egress bloqueados inesperados                        | **0**                                                                  |
| `npx jest` unitario                                              | **1117 passed / 0 failed / 2 skipped**                                 |
| `tsc --noEmit` / `eslint src test` / `prettier` de lo tocado     | **0 / 0 / correcto**                                                   |
| `scripts/check-e2e-isolation.sh`                                 | **exit 0** (§1–§5, con solapamiento de identificadores)                |
| `OUTBOUND_SEND_ENABLED` en el contenedor productivo              | **DENIED**                                                             |
| `git diff -- apps/api/prisma/migrations`                         | **0 líneas**                                                           |
| Commits / push                                                   | **0 / 0**                                                              |
| Contenedores                                                     | `api` Up 12 days, `postgres`/`redis` Up 2 weeks — **sin reinicio**     |

### 9.5 Límite de lo que esto NO demuestra

- **No** cierra CRIT-16-A: `messages.button_id` sigue ausente en
  `automatizeit_e2e` **y en producción** (`_prisma_migrations` vacía en la
  base de test). Mientras HG-9 no se aplique, esos 18 tests siguen rojos.
- **No** envía nada: los dos únicos specs que activan la política mockean
  `WHATSAPP_PROVIDER` con un `jest.fn()`, y el egreso está cortado a dos capas.
- **No** ha tocado la política productiva ni ninguna migración.
- ~~Queda pendiente de **ratificación de David**~~ → **ratificado el
  25-10-2026**, con las limitaciones **L1–L7** de §9.0. La ratificación no
  amplía el alcance de lo demostrado: L1–L3 delimitan exactamente dónde acaba
  la cobertura del guard de red y dónde empieza la protección separada de
  Prisma.
