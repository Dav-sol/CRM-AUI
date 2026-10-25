# Informe de deriva de esquema y migraciones

**Fecha:** 2026-10-20
**Alcance:** repositorio `CRM-AUI` / `Automatize IT Platform`, rama `main` @ `18ede0e`
**Naturaleza:** lectura. Ninguna de las consultas de este informe escribe en la base de datos.

---

## 1. Resumen ejecutivo

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| **D-1** | Una migración **no versionada** (`20261010000000_purchase_civil_dates`) está en disco y `prisma migrate deploy` la aplicaría en el próximo `docker compose up` | 🔴 Crítica | **Guarda desplegada** (FASE 0 / U1.1). La aplicación sigue pendiente de autorización |
| **D-2** | La base de datos está **adelantada respecto a Git**: la tabla `organization_configs` existe, pero su migración no está versionada | 🔴 Crítica | Abierta — requiere versionar la migración |
| **D-3** | `schema.prisma` (working tree) está **adelantada respecto a la base de datos**: 3 columnas `@db.Date` y 2 columnas `messages.button_*` que la BD no tiene | 🟠 Alta | Abierta — HG-9 |
| **D-4** | Dos migraciones **pendientes de aplicar**, una de ellas versionada y la otra no | 🟠 Alta | Abierta — HG-9 / HG-16 |
| **D-5** | Ninguna migración aplicada tiene el checksum distinto al del archivo en disco | 🟢 Limpio | — |
| **D-6** | Ninguna migración aplicada falta en el disco | 🟢 Limpio | — |

**Conclusión.** No hay evidencia de que una migración aplicada haya sido editada después (D-5, D-6). La deriva es de **origen**: el repositorio y la base de datos nunca llegaron a sincronizarse, porque el trabajo de fechas civiles y configuración por organización está a medio camino y sin versionar.

---

## 2. Inventario de migraciones

Fuente: `apps/api/prisma/migrations/` en disco, `MIGRATIONS.sha256` (manifiesto de migraciones aprobadas) y `_prisma_migrations` en la base de datos.

| Medida | Valor |
|---|---|
| Carpetas de migración en disco | **38** |
| Migraciones en el manifiesto (aprobadas) | **36** |
| Migraciones aplicadas en la BD (`finished_at` no nulo, `rolled_back_at` nulo) | **36** |
| Migraciones fallidas o revertidas | **0** |
| Migraciones aplicadas con checksum distinto al archivo | **0** |
| Migraciones aplicadas ausentes del disco | **0** |
| Migraciones pendientes de aplicar | **2** |

### 2.1 Las dos migraciones no aprobadas

| Migración | Git | Manifiesto | BD | Qué hace |
|---|---|---|---|---|
| `20261001000000_add_organization_config` | ❌ sin versionar | ❌ ausente | ✅ **aplicada** | Crea `organization_configs` (configuración efectiva por organización: zona horaria, horario comercial, costes) |
| `20261010000000_purchase_civil_dates` | ❌ sin versionar | ❌ ausente | ❌ pendiente | Convierte `purchases.purchase_date`, `warranty_expires_at` e `installation_date` de `timestamp` a `DATE` |

### 2.2 La migración versionada y pendiente

| Migración | Git | Manifiesto | BD | Qué hace |
|---|---|---|---|---|
| `20261009000000_inbound_button_fields` | ✅ versionada | ✅ aprobada | ❌ pendiente | Añade `messages.button_id` y `messages.button_title` (respuesta a botón interactivo) |

---

## 3. Deriva de esquema (schema.prisma frente a la base de datos)

Consultas de solo lectura sobre `information_schema.columns`.

### 3.1 Columnas declaradas `DATE` en el esquema, `timestamp` en la BD

| Tabla | Columna | `schema.prisma` (working tree) | Tipo real en la BD |
|---|---|---|---|
| `purchases` | `purchase_date` | `DateTime @db.Date` | `timestamp without time zone` |
| `purchases` | `warranty_expires_at` | `DateTime? @db.Date` | `timestamp without time zone` |
| `purchases` | `installation_date` | `DateTime? @db.Date` | `timestamp without time zone` |

La conversión es exactamente la que propone `20261010000000_purchase_civil_dates` (migración no versionada y pendiente).

### 3.2 Columnas del esquema que no existen en la BD

| Tabla | Columna | En `schema.prisma` | En la BD |
|---|---|---|---|
| `messages` | `button_id` | ✅ declarada | ❌ no existe |
| `messages` | `button_title` | ✅ declarada | ❌ no existe |

Corresponden a la migración `20261009000000_inbound_button_fields`, versionada y pendiente.

### 3.3 Tabla en la BD que el esquema del repositorio no describe con una migración versionada

| Tabla | En la BD | Migración en Git | Estado |
|---|---|---|---|
| `organization_configs` | ✅ existe | ❌ `20261001000000_add_organization_config` sin versionar | **La BD está adelantada respecto a Git** |

**Consecuencia operativa:** un despliegue desde un clon limpio del repositorio **no crearía** `organization_configs`, y el módulo `configuraciones` —que la consulta en cada resolución de zona horaria y de horario comercial— fallaría en runtime.

---

## 4. Riesgo que esto representaba antes de la guarda

`.dockerignore` **no excluye** `apps/api/prisma/migrations/`, de modo que el contexto de build de la imagen incluye todas las carpetas de migración, versionadas o no. El servicio `migrate` del compose ejecutaba:

```yaml
command: ["sh", "-c", "npx prisma migrate deploy"]
```

`prisma migrate deploy` aplica **todo lo que encuentra en disco, sin preguntar**. Por tanto, un `docker compose up` habría aplicado, sin revisión y sin registro en el historial de Git:

- `20261010000000_purchase_civil_dates` → conversión de las 5 537 filas de `purchases` a `DATE`. El **impacto real** es acotado: solo **59 celdas pierden información** (34 `purchase_date` + 25 `warranty_expires_at` tenían hora; las otras 5 503 `purchase_date` ya estaban a medianoche y su día no cambia). `installation_date` no tiene hora en ninguna fila.
- `20261009000000_inbound_button_fields` → dos columnas nuevas (riesgo bajo).

### 4.1 Guarda desplegada

`scripts/check-migrations.sh` se ejecuta **antes** de `migrate deploy` en el servicio `migrate` del compose. Fallo de la guarda ⇒ **no se aplica ninguna migración** y la API no arranca (la dependencia `service_completed_successfully` lo impide).

Comprobaciones:

- **A. Manifiesto** — toda migración en disco figura en `MIGRATIONS.sha256` con el sha256 exacto de su `migration.sql`, y toda aprobada existe y no ha cambiado.
- **B. Git** (solo en el host) — el manifiesto y las carpetas están versionados, y su contenido no tiene cambios sin commitear.
- **C. Base de datos** (solo lectura) — ninguna migración aplicada tiene un checksum distinto al del archivo, y ninguna aplicada falta en disco.

La guarda **no resuelve** la deriva, **no migra** y **no aprueba** nada por sí misma: solo detecta y para el despliegue.

### 4.2 ¿Distingue los tres estados? Sí, pero cada uno lo detecta una comprobación distinta

| Estado | Lo detecta | Comprobación | Verificado |
|---|---|---|---|
| Migración **en disco y no versionada** en Git | `git ls-files --others` | B (host) | ✅ `20261001000000` y `20261010000000` |
| Migración **en disco, no versionada y no aprobada** | ¿está en `MIGRATIONS.sha256`? | A | ✅ ambas |
| Migración **aplicada en la BD y ausente de Git** (pero en disco y aprobada) | `git ls-files --others` | B (host) | ⚠️ **no hay caso real hoy**: ninguna aplicada está fuera de Git |
| Migración **aplicada en la BD y ausente del disco** | ¿existe la carpeta? | C | ✅ Prisma también lo detecta: *"The following migration(s) are applied to the database but missing from the local migrations directory"* |
| Migración **aplicada y editada después** | ¿coincide el checksum? | C | ✅ Prisma también: *"` was modified after it was applied."* |
| Migración **pendiente** (aprobada, en disco, sin aplicar) | ¿consta en `_prisma_migrations`? | C | ✅ AVISO con `--allow-pending`; **FALLO** sin el flag |

**Asimetría a corregir/documentar:** el guard de host (`scripts/check-migrations.sh` sin flags) **falla** si hay migraciones pendientes, mientras que el del contenedor (`--allow-pending`, el que usa el compose) solo **avisa**. Ambos son fail-safe, pero responden a preguntas distintas: el de host responde *"¿estoy sincronizado con la BD?"* y el de contenedor *"¿lo que voy a aplicar está aprobado?"*. Conviene que la diferencia sea explícita en la ayuda del script.

**Cobertura que falta:** los casos sintéticos de `scripts/test-check-migrations.sh` cubren A y B (12/12) pero **no C**, porque evitan la base de datos a propósito. El bloque C está verificado contra la BD real en modo lectura, no por prueba automática.

---

## 5. Alternativas para HG-9

HG-9 («¿se aplica `20261010000000` antes o después de desplegar el código que ya asume `@db.Date`?») sigue abierta. Esta sección se reescribió tras el análisis técnico de U1.3 (2026-10-20): todas las cifras están medidas sobre la base de datos real, en modo solo lectura.

### 5.1 Qué estado representa cada cosa (son tres estados distintos)

| Plano | Qué dice hoy |
|---|---|
| **Git** | Conoce **36** carpetas de migración. `20261001000000` y `20261010000000` **no están versionadas**. `schema.prisma` (working tree) declara `@db.Date` y `messages.button_id/button_title`, que **no existen en la base de datos**. |
| **Prisma** (`prisma migrate status`) | «**38** migrations found in prisma/migrations» — cuenta el **disco**, no Git. Pendientes: `20261009000000` y `20261010000000`. **`20261001000000` NO figura como pendiente.** |
| **Físico (base de datos)** | **36** migraciones aplicadas, **0** fallidas o revertidas, **0** con checksum distinto al del archivo, **0** aplicadas ausentes del disco. La tabla `organization_configs` **existe** (creada por la migración no versionada). `purchases.purchase_date`, `warranty_expires_at` e `installation_date` son `timestamp without time zone`, no `DATE`. |

**Prisma no sabe qué es Git.** Determina «aplicada» por la presencia de la carpeta y la coincidencia del checksum. Por eso `20261001000000` ya consta como aplicada aunque Git no la conozca.

### 5.2 Qué cambia físicamente cada alternativa

| Alternativa | Cambio en la base de datos | Cambio en el repositorio | Efecto sobre el código |
|---|---|---|---|
| **A** | `ALTER TABLE purchases ALTER COLUMN … TYPE DATE` sobre 5 537 filas (reescritura de tabla con bloqueo `ACCESS EXCLUSIVE` durante la conversión) | Versionar 2 migraciones + regenerar el manifiesto + desplegar el código | El código que ya asume `@db.Date` pasa a ser correcto |
| **B** | El mismo `ALTER`, pero **después** de desplegar el código | Igual que A, más un despliegue previo | Entre el despliegue y la migración, el código lee `DATE` sobre columnas `timestamp` |
| **C** | **Ninguno** | Revertir los tres `@db.Date` de `schema.prisma` y retirar la migración del disco; versionar igualmente `20261001000000` | El código sigue leyendo `timestamp`; hay que resolver la ambigüedad de zona solo por convención |

### 5.3 Riesgo de truncar las horas (medido, no estimado)

| Medida | Valor |
|---|---|
| Filas de `purchases` | **5 537** |
| Filas cuyo **día civil** cambia con `::date` | **0** — el `::date` conserva la parte de fecha |
| `purchase_date` con hora (se pierde la hora) | **34** (2023: 1 · 2024: 3 · 2025: 12 · 2026: 18) |
| `warranty_expires_at` con hora | **25** (las 25 tienen `warranty_months`) |
| `installation_date` con hora | **0** |
| **Celdas cuya hora se destruye** | **59** |

**Qué ven los lectores, antes y después:**

- Las **5 503** filas ya estaban a medianoche: el `Date` que devuelve Prisma es **idéntico bit a bit** antes y después. Ningún lector, con ninguna zona, nota nada.
- Las **34** filas con hora: el `Date` pasa de `…T14:02:45.265Z` a `…T00:00:00Z`.
  - Los lectores **en UTC** (`civil-date.ts`, `lifecycle.rules.addMonthsClamped`, `campaigns.service.ts.addDaysUtc`) ven **el mismo día civil**. No cambia nada.
  - Un lector con **getters locales** (`getDate()`/`getDay()`) ve un día distinto **solo si el proceso no corre en UTC**.

**El único lector con getters locales en producción** es `reports.service.ts:97`:

```ts
d.setDate(d.getDate() - d.getDay());   // getters LOCALES
return d.toISOString().slice(0, 10);   // salida en UTC
```

Alimenta la agrupación semanal del informe de compras (`truncateDate(p.purchaseDate, groupBy)`, línea 214). En el contenedor de producción la zona es **UTC** (`docker exec automatizeit-api date` → UTC; el compose no declara `TZ`), así que **hoy el impacto observable es nulo**. En el host, que corre en `America/Bogota` (UTC−5), la etiqueta semanal de esas 34 compras se desplaza **+1 día**.

> **Este es el hallazgo nuevo de U1.3.** El módulo `campaigns` ya corrigió exactamente este patrón (`addDaysUtc`, con el comentario de por qué); `reports` no. **La corrección es de código y es independiente de la migración**: hacer `truncateDate` basado en UTC hace que la conversión sea inocua en cualquier zona. Debe entrar **antes** de aplicar la migración.

### 5.4 Cómo versionar `20261001000000` sin recrear la tabla ni falsear el historial

**Hecho medido:** el checksum registrado en la base de datos para esa migración es `a10b9fd004b751c0e37cf008ff57f69a29e855471cd854ccd5bcffa621979b33`, **idéntico** al sha256 del archivo en disco. La migración tiene `applied_steps_count = 1`, `rolled_back_at IS NULL` y `finished_at IS NOT NULL`: se aplicó limpia y completa.

**Consecuencia:** `prisma migrate deploy` determina «aplicada» por *carpeta + checksum coincidente*, **no por Git** — prueba empírica: figura en la base de datos y **no** aparece en la lista de pendientes de `migrate status` pese a estar sin versionar. Por tanto:

> **Versionar la carpeta en Git es una operación puramente de Git, con efecto CERO en la base de datos.** `migrate deploy` la encontrará en disco, comprobará que el checksum coincide con el ya registrado y la dará por aplicada sin ejecutar nada. No se recrea la tabla y no se falsea el historial: la fila de `_prisma_migrations` es la que Prisma escribió al aplicarla, y sigue siendo la misma.

No hace falta `migrate resolve`, ni marca `rolled_back_at`, ni tocar `_prisma_migrations` a mano. **Cualquier manipulación manual del historial de Prisma sería falsearlo** y es precisamente lo que esta vía evita.

### 5.5 Las tres alternativas, en detalle

#### Opción A — Aplicar la migración antes de desplegar el código compatible

- **Ventajas:** deja esquema, base de datos y repositorio describiendo lo mismo **antes** de que arranque el código que asume `@db.Date`; es la única coherente con el trabajo ya hecho (la cabecera de `civil-date.ts` ya dice «Estas columnas se persisten como `DATE`»); no deja estado intermedio; termina la deriva en un solo paso.
- **Riesgos:**
  - Pérdida de 59 horas (sin impacto en el día civil). **Medido: 0 filas cambian de día.**
  - Bloqueo `ACCESS EXCLUSIVE` durante la reescritura de 5 537 filas (tabla de 3 976 kB → segundos).
  - **Un lector con getters locales cambiaría de salida** si el proceso corriera en `America/Bogota` (hoy corre en UTC). Se elimina corrigiendo `reports.service.ts:97`.
  - **No hay reversión sin respaldo.** El tipo sí se puede revertir (`ALTER COLUMN … TYPE TIMESTAMP USING col::timestamp` es válida, porque `date → timestamp` es conversión implícita), pero **las 59 horas perdidas no se recuperan con ningún DDL**: solo desde un respaldo.
- **Reversibilidad:** **parcial y condicionada.** El *tipo* es reversible; los *datos* de hora solo desde un `pg_dump` verificado.
- **Precondiciones:** (1) `pg_dump` creado **y restaurado y verificado** — hoy **no existe ningún procedimiento de backup en el repositorio** (`scripts/` no tiene ninguno; el roadmap lo dice: *«sin backup probado no hay reversión posible»*, RM-17); (2) `reports.service.ts:97` corregido a UTC; (3) `20261001000000` y `20261010000000` versionadas **sin modificar su contenido**; (4) manifiesto regenerado con 38 entradas; (5) ventana autorizada.
- **Impacto en despliegue:** un `docker compose up` aplica la migración y el API arranca después (`service_completed_successfully`).
- **Recuperación:** restaurar el `pg_dump` (datos) o revertir el tipo (solo el tipo).

#### Opción B — Desplegar el código compatible antes de aplicar la migración

- **Ventajas:** no necesita ventana de mantenimiento para la base de datos.
- **Riesgos:**
  - Deja un estado en el que **el esquema y el código discrepan**, que es exactamente lo que HG-9 pregunta. La migración pendiente queda como bomba de relojería: cualquier `docker compose up` la aplica.
  - **No reduce el riesgo de la conversión**, solo lo aplaza: cuando la migración se aplique, el cambio de lectura seguirá produciéndose.
  - Con el esquema y el código en desacuerdo, `prisma migrate dev` falla por deriva y `migrate deploy` aplicaría la conversión sin que nadie la haya revisado en ese momento.
- **Reversibilidad:** la misma que A para la conversión (parcial, con respaldo). La diferencia es *cuándo* se puede deshacer, no *si*.
- **Precondiciones:** las de A, más la aceptación de un estado intermedio inconsistente.
- **Impacto en despliegue:** dos despliegues coordinados, con la ventana entre ambos.
- **Recuperación:** la de A.

#### Opción C — Abandonar `@db.Date` y quedarse con `timestamp`

- **Ventajas:** **riesgo de datos nulo**; no toca ninguna fila; elimina la deriva con el menor coste.
- **Riesgos:**
  - **Exige modificar trabajo preexistente ajeno.** Los tres `@db.Date` de `schema.prisma` son precisamente las líneas `+` del diff preexistente (el trabajo T-B3/T4-G4, ya en curso). Revertirlas es descartar trabajo de otro frente, no una decisión de esta tarea.
  - Deja la ambigüedad de zona (`getDate()` vs `getUTCDate()`) resuelta **solo por convención**, que es el problema que la cabecera de la propia migración describe como el que quiere evitar.
  - Deja `20261010000000` como migración huérfana que hay que retirar del disco.
- **Reversibilidad:** no aplica — no hay cambio de datos que revertir.
- **Precondiciones:** decisión del propietario del trabajo T-B3/T4-G4; retirada de la migración del disco; `20261001000000` versionada igualmente; corrección de `reports.service.ts:97` (que hace falta en cualquier caso).
- **Impacto en despliegue:** ninguno en la base de datos; sí un cambio de esquema en el repositorio.
- **Recuperación:** no aplica.

### 5.6 Recomendación

**Opción A**, condicionada a las precondiciones de §5.5.

Justificación:

1. **Es la única que resuelve la deriva de raíz.** El problema no es «cuándo se aplica la migración», sino que el esquema, la base de datos y el repositorio dicen cosas distintas. A los deja iguales antes de que arranque el código que depende de `@db.Date`; B solo reordena y C solo lo esconde.
2. **Es la coherente con el trabajo ya hecho y en curso.** `civil-date.ts` ya declara que esas columnas se persisten como `DATE`; la cabecera de la migración ya Justifica la decisión; el trabajo T-B3 ya normaliza la frontera de compras. C lo abandonaría.
3. **El riesgo de datos está medido y es acotado:** 0 filas cambian de día; 59 celdas pierden una hora que ningún contrato de negocio usa (el día civil es el contrato); las 5 503 filas con midnight no cambian ni de byte.
4. **C es la alternativa de menor riesgo de datos, pero exige tocar trabajo preexistente de otro frente** y deja la ambigüedad de zona por convención. Es un coste organizativo, no técnico.

**Corrección de la recomendación anterior:** esta sección afirmaba que en la Opción B «el día no cambia». Es cierto para los lectores en UTC, que son los que dominan, pero **no** para `reports.service.ts:97` cuando el proceso no corre en UTC. La distinción correcta es entre *día civil* (no cambia: 0 filas) y *etiqueta semanal del informe* (cambia en zona no UTC, en 34 filas). El riesgo de la conversión es menor de lo que se suponía, pero no es cero, y la corrección que lo elimina es de código y está disponible ya.

**Una precondición nueva y obligatoria para U1.5:** corregir `reports.service.ts:97` para que el agrupamiento semanal se calcule en UTC (como ya hace `campaigns.service.ts` con `addDaysUtc`). Sin ella, la migración es inocua **hoy** (contenedor en UTC) pero frágil ante cualquier cambio de zona del proceso.

**Y la precondición que ya era la más dura:** no existe procedimiento de backup. `pg_dump` está disponible en el contenedor de postgres (16.15) y el volumen ocupa 171,6 MB, así que el respaldo es barato y viable — pero **tiene que existir y estar restaurado y verificado**, no solo creado.

**En cualquiera de las tres, `20261001000000` debe versionarse** (§5.4): su tabla ya existe en producción y el módulo `configuraciones` la consulta.

---

## 6. Consultas ejecutadas

Todas de solo lectura. Las de `_prisma_migrations` y `information_schema` se ejecutaron dentro de `BEGIN TRANSACTION READ ONLY; ... ROLLBACK;`.

```sql
-- 1. Estado de las migraciones en la base de datos
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM _prisma_migrations ORDER BY started_at ASC;

-- 2. Comparación de checksums (BD frente a sha256 del archivo)
--    Verificado: el checksum de Prisma ES el sha256 de migration.sql
--    (20261003000000_lifecycle_p0 -> 764deec238cd3b5c... en ambos)

-- 3. Tipos reales de las columnas de purchases
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'purchases'
  AND column_name IN ('purchase_date','warranty_expires_at','installation_date');

-- 4. Columnas del esquema que faltan en la base de datos
SELECT column_name FROM information_schema.columns
WHERE table_name = 'messages' AND column_name IN ('button_id','button_title');

-- 5. Tablas que existen en la BD
SELECT table_name FROM information_schema.tables WHERE table_name = 'organization_configs';

-- 6. Impacto real de la conversion a DATE (cifras citadas en §4)
SELECT count(*) FROM purchases WHERE purchase_date::time <> '00:00:00'::time;          -- 34
SELECT count(*) FROM purchases
 WHERE warranty_expires_at IS NOT NULL
   AND warranty_expires_at::time <> '00:00:00'::time;                                    -- 25
SELECT count(*) FROM purchases
 WHERE installation_date IS NOT NULL
   AND installation_date::time <> '00:00:00'::time;                                      -- 0
```

Mediciones de referencia de este informe (2026-10-20): `purchases` = **5 537** filas · `purchase_date` con hora = **34** · `warranty_expires_at` con hora = **25** · `installation_date` con hora = **0** · migraciones aplicadas = **36** · carpetas de migración en disco = **38** · entradas del manifiesto = **36**.

Ninguna consulta de este informe modifica datos.

---

## 7. Cómo reproducir

```bash
# Estado de la deriva (host, con BD)
scripts/check-migrations.sh

# Solo el manifiesto, sin git y sin BD
scripts/check-migrations.sh --manifest-only

# Casos sintéticos en un repositorio temporal aislado
scripts/test-check-migrations.sh
```
