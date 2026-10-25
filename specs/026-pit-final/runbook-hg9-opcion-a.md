# Runbook — HG-9 Opción A: `purchases` de `TIMESTAMP` a `DATE`

> **Estado: PREPARADO, NO AUTORIZADO. Este documento no autoriza nada.**
> Ninguno de los pasos descritos aquí se ha ejecutado. Fue redactado en modo
> solo lectura el 2026-10-21. Ejecutar U1.5 exige una autorización humana
> explícita posterior.
>
> Nivel de evidencia de cada afirmación:
> **[V]** verificado en este preflight · **[I]** inferido, no ejecutado ·
> **[P]** pendiente de decisión o de ejecución futura.

---

## 0. Alcance

| En esta preparación | Fuera de alcance (bloqueado) |
|---|---|
| Revisión del comentario desfasado de la migración | Ejecutar `20261010000000` o cualquier otra migración |
| Redacción de este runbook | `prisma migrate deploy` / `resolve` / `dev` |
| Análisis de riesgos de despliegue (solo lectura) | `docker compose up` o reinicio/recreación de servicios |
| | Backfills, seeds, escrituras de cualquier tipo |
| | Commits, push, regenerar el manifiesto, editar migraciones |
| | Borrar o sobrescribir el respaldo o la base de restauración |

---

## 1. Tarea 1 — Revisión del comentario desfasado de la migración

### 1.1 Qué afirma exactamente la cabecera

`apps/api/prisma/migrations/20261010000000_purchase_civil_dates/migration.sql`
(contenido sin modificar desde su creación **[V]**):

| Línea | Afirmación del comentario | Medición actual (2026-10-21) | Veredicto |
|---|---|---|---|
| 23 | «las **5 536** filas con `purchase_date` conservan exactamente su día almacenado» | **5 537** filas con `purchase_date` no nulo | **DESFASADA en +1** |
| 25 | «**33** filas de `purchase_date` … tienen hora» | **34** | **DESFASADA en +1** |
| 26 | «… y **25** de `warranty_expires_at` tienen hora» | **25** | Coincide |
| 27 | «`installation_date` no tiene hora en ninguna fila» | **0** de 5 501 no nulas | Coincide |
| 35 | «0 grupos duplicados por día civil» | **0** | Coincide |
| 40 | «27 compras con `warranty_months` … 27 coinciden, 0 discrepan» | **27 / 0** | Coincide |

El desfase es de **exactamente una fila**: entre la fecha de redacción de la
migración (2026-10-11) y hoy se importó una compra cuyo `purchase_date` lleva
hora. Aumenta a la vez el total de filas (5 536 → 5 537) y los valores con hora
(33 → 34), lo que es consistente con **una única fila nueva con hora** **[V]**
(medición actual + confirmación cruzada con el respaldo, §1.4).

El informe HG-9 (`informe-deriva-esquema.md`, §96, §156-158, §284) **ya usa los
números correctos**: 5 537 / 34 / 25 / 0, con fecha de medición 2026-10-20
**[V]**. Solo la cabecera de la migración quedó desfasada.

### 1.2 Las sentencias SQL reales

El cuerpo ejecutable de la migración son tres cláusulas en **una sola**
sentencia:

```sql
ALTER TABLE "purchases"
  ALTER COLUMN "purchase_date"      TYPE DATE USING "purchase_date"::date,
  ALTER COLUMN "warranty_expires_at" TYPE DATE USING "warranty_expires_at"::date,
  ALTER COLUMN "installation_date"  TYPE DATE USING "installation_date"::date;
```

**Determinación: el comentario NO afecta a ninguna condición, filtro,
transformación ni supuesto operativo.** **[V]**

- No hay `WHERE`, ni `CHECK`, ni filtro alguno: las tres conversiones se aplican
  a **todas** las filas sin condición.
- La cláusula `USING` es un cast literal `::date`; no depende de ningún recuento.
- Los números (5 536, 33, 25, 27) son **narrativos**: no están referenciados por
  SQL, ni por la guarda, ni por el manifiesto, ni por Prisma.

**Precondiciones del comentario que sí son operativas** (si fallasen, la
migración fallaría o corrompería). Las tres siguen cumpliéndose hoy **[V]**:

1. **Cero colisiones por día civil** en el índice único
   `purchases_organization_id_invoice_number_customer_id_produc_key`
   (`organization_id, invoice_number, customer_id, product_id, purchase_date`).
   → **0 grupos duplicados.** Verificado agrupando por `purchase_date::date`,
   criterio **más estricto** que el índice (los `NULL` no colisionan en
   Postgres, sí se agrupan en `GROUP BY`): si da 0, el índice es seguro.
2. **Cero desplazamiento de día** bajo `::date` → **0 filas** difieren del día
   UTC.
3. **Coherencia de garantía** tras el cast (P1.8 con clamp) → **27 coinciden,
   0 discrepan.**

> **Precaución de medición:** comparar `warranty_expires_at` (timestamp con
> hora) contra un cálculo a medianoche arroja un falso negativo (2/27). La
> comparación correcta es sobre el componente de día (`::date`), que es la que
> devuelve 27/27. Cualquier re-ejecución de esta comprobación debe hacerse
> **[V]** así.

### 1.3 Checksum — idéntico en las tres fuentes

| Fuente | SHA-256 de `20261010000000_purchase_civil_dates/migration.sql` |
|---|---|
| `MIGRATIONS.sha256` (manifiesto) | `ed56895b1f43e0d6a35aa729ed00d3beacde9c59184da06dbb116a429ad65472` |
| Archivo en disco | `ed56895b1f43e0d6a35aa729ed00d3beacde9c59184da06dbb116a429ad65472` |
| Índice de Git (contenido staged) | `ed56895b1f43e0d6a35aa729ed00d3beacde9c59184da06dbb116a429ad65472` |

**[V]** Coinciden al byte. No está aplicada en la BD (figura como pendiente),
así que no hay checksum registrado contra el que comparar.

### 1.4 Veredicto y recomendación

**El comentario debe PERMANECER como descripción histórica, sin editar.**

Justificación:

1. **Editarlo rompería la cadena de verificación.** Cambiar un solo carácter
   cambia el sha256 y, simultáneamente: (a) la guarda `check-migrations.sh`
   dejaría de pasar (comprobación A: manifiesto ≠ disco); (b) una vez aplicada
   la migración, Prisma compara el checksum del archivo con el registrado en
   `_prisma_migrations` y reportaría **deriva de checksum**; (c) dejaría de
   coincidir con el índice de Git ya staged. El manifiesto y el contenido de la
   migración son inmutables **[V]**.
2. **No hay nada funcional que corregir.** §1.2 demuestra que ninguna sentencia
   depende de esos números.
3. **Los números correctos ya están documentados fuera** de la migración, en el
   informe HG-9 §284, con su fecha de medición.

**Recomendación [P]:** registrar el desfase *fuera* de la migración — aquí, en
§9 «Hallazgos» — indicando que la cabecera es una fotografía del 2026-10-11 y
que la referencia actual es 5 537 / 34 / 25. La cabecera no se toca.

---

## 2. Tarea 2 — Runbook de mantenimiento y recuperación

### 2.1 Preflight

Cada línea es una comprobación, no una acción. **[V]** salvo donde se indique.

**a) Respaldo y su huella**

| Comprobación | Valor verificado |
|---|---|
| Existe | `/workspace/backups/crm-aui/crm-aui_20261021T022312Z_automatizeit.pgdump` |
| SHA-256 | `6b5915e5041296c33b705f94a748d0c146b68aa11490c6898e9e01c7b427833f` |
| Tamaño | 5 473 524 bytes |
| Formato | `pg_dump` formato personalizado, PostgreSQL 16.15 |
| Metadatos | fichero `.meta` acompañante presente |
| Restauración extremo a extremo | Hecha y verificada en `automatizeit_restorecheck_20261021` |

Recomendado antes de ejecutar **[P]**:

```sh
sha256sum -c <<< "6b5915e5041296c33b705f94a748d0c146b68aa11490c6898e9e01c7b427833f  /workspace/backups/crm-aui/crm-aui_20261021T022312Z_automatizeit.pgdump"
```

**b) El respaldo conserva las columnas originales y sus valores**

Verificado sobre la base restaurada **[V]**, idéntico a producción en este
preflight:

| Métrica | Producción | Respaldada/restaurada |
|---|---|---|
| `purchases` | 5 537 | 5 537 |
| `customers` | 6 277 | 6 277 |
| `messages` | 8 163 | 8 163 |
| `purchase_date` con hora | 34 | 34 |
| `warranty_expires_at` con hora | 25 | 25 |
| Migraciones aplicadas | 36 | 36 |

> **Resultado clave del preflight:** producción y respaldo están en el **mismo
> estado**. El punto de recuperación es exacto **en el momento de esta
> preparación**; cada escritura posterior a 2026-10-21T02:23:12Z amplía la
> pérdida potencial (**§2.5.4**; la referencia previa «§6.4» no existía).

**c) Espacio, estado de PostgreSQL, conexiones**

| Comprobación | Valor |
|---|---|
| Espacio libre host y volumen | 373 G de 435 G (10 % usado) **[V]** |
| Tamaño de `purchases` | 3 976 kB **[V]** |
| Tamaño de la base | 50 MB **[V]** |
| Versión PostgreSQL | 16.15 **[V]** |
| Uptime del postmaster | 12 días **[V]** |
| Sesiones activas en `automatizeit` | 1 (la de la consulta) **[V]** |
| Sesiones totales en `automatizeit` | 3 (2 en `idle`) **[V]** |
| Locks en espera | 0 **[V]** |

**d) Salud de la API y estado de Prisma**

| Comprobación | Valor |
|---|---|
| `GET /api/v1/health` | HTTP 200, `{"status":"ok",…}` **[V]** |
| `prisma migrate status` | 38 en disco · **2 pendientes** · 0 fallidas **[V]** |
| Guarda en modo despliegue (`--allow-pending`) | **exit 0** — «38 migraciones en disco, 36 aplicadas, sin deriva» **[V]** |
| Manifiesto | 38 entradas · 38/38 disco · 38/38 índice Git · 36/36 BD **[V]** |

**e) Envíos automáticos deshabilitados**

| Comprobación | Valor |
|---|---|
| `docker compose config` → `OUTBOUND_SEND_ENABLED` | `DENIED` **[V]** |
| `printenv OUTBOUND_SEND_ENABLED` dentro del contenedor | `DENIED` **[V]** |
| Respuesta del health: `outboundSend.allowed` | `false`, razón `SWITCH_DENIED` **[V]** |

---

### 2.2 Ventana de mantenimiento

#### 2.2.1 Qué debe impedirse

Durante el `ALTER TABLE` debe **no haber escritura alguna sobre `purchases`** y,
de preferencia, **ninguna transacción abierta** contra esa tabla: la sentencia
necesita un bloqueo `ACCESS EXCLUSIVE` **[I]** y cualquier sesión con una
transacción abierta la retendría **[I]**.

#### 2.2.2 Procesos y conexiones que podrían interferir **[V]**

| Fuente | Riesgo | Estado actual |
|---|---|---|
| `automatizeit-api` — manejadores HTTP | Lecturas/escrituras sobre `purchases` | Activo (health 200) |
| `ImportsProcessor` | **Escribe `purchases`** (`imports.processor.ts:475`), invocado *fire-and-forget* dentro del propio proceso API (`imports.service.ts:270,455`) | Sin importaciones en curso: solo `COMPLETED`(1) y `PARTIAL`(4) |
| `SmsScheduler` (`@Interval` 60 s) | Consultas y transiciones de estado | **Neutralizado**: con política DENIED hace *early return* sin `findMany` ni escrituras |
| `WhatsappScheduler` (`@Interval` 60 s) | Ídem | **Neutralizado** por el mismo motivo |
| Trabajador/cola aparte | — | **No existe**: no hay `@Processor` ni BullMQ registrado; los trabajos corren dentro de la API |
| Sesiones `psql` de operadores | Escrituras manuales | 2 sesiones en `idle`; verificables en `pg_stat_activity` |

> **Hallazgo favorable:** al mantener `OUTBOUND_SEND_ENABLED=DENIED`, los dos
> únicos procesos programados de la aplicación **no tocan la base de datos en
> absoluto**. La política de envío deshabilitada ya suprime el tráfico
> de fondo; la ventana solo tiene que contener el tráfico HTTP y una eventual
> importación en vuelo.

#### 2.2.3 Cómo impedir el tráfico de escritura (sin borrar datos ni cambiar config. de forma permanente)

**Opción recomendada — detener el contenedor de la API durante la ventana:**

```sh
docker compose -f infrastructure/docker/docker-compose.yml stop api   # inicio de ventana
docker compose -f infrastructure/docker/docker-compose.yml up -d api  # fin de ventana
```

- No elimina datos ni volúmenes; no altera `.env` ni la configuración de forma
  permanente **[I]**.
- Es reversible con el mismo comando inverso.
- Al detener la API se suprime **toda** su escritura, incluida una importación
  en vuelo.

**Opción descartada — `docker compose pause api`:** congelaría el proceso pero
**mantendría abiertas sus conexiones**. Una sesión con transacción abierta
retendría bloqueos y podría **bloquear indefinidamente** el `ALTER TABLE`
**[I]**. No usar.

**Opción descartada — deshabilitar conexiones a nivel de base de datos**
(`ALTER DATABASE … ALLOW_CONNECTIONS false`, `pg_terminate_backend`): es un
cambio de configuración con efecto sobre todo el stack y añade modos de fallo
(una API viva que no puede reconectar) **[I]**. Solo si las anteriores no son
posibles, y con autorización aparte.

**No existe un modo mantenimiento en la aplicación** (no se ha encontrado
ninguno en el código **[V]**): no inventarlo.

#### 2.2.4 Comprobar que el bloqueo y la duración son aceptables

**No asumir que el `ALTER TABLE` es instantáneo.** `[I]` estimar «segundos» a
partir de 3 976 kB; **[P]** medir.

Durante la ventana:

1. **Antes:** capturar los locks existentes sobre la tabla
   `SELECT count(*) FROM pg_locks WHERE relation = 'purchases'::regclass;`
2. **Durante:** observar `pg_stat_activity` en busca de
   `wait_event_type = 'Lock'` — indicaría que algo retiene un bloqueo
   incompatible.
3. **Después:** registrar la duración real que reporta el contenedor `migrate`
   en sus logs (Prisma imprime el tiempo de aplicación).
4. **DURACIÓN MÁXIMA AUTORIZADA — valor OBLIGATORIO antes de abrir la ventana
   [P]:** debe fijarse por escrito antes del paso 1. **Mientras no tenga valor
   escrito, la ventana NO se abre.** Si la operación la supera → abortar según
   **§2.4 (A7)**. (Corrige la referencia «§5» que apuntaba a la sección
   equivocada.)

> **Recomendación [P] — ensayo previo:** antes de tocar producción, ejecutar la
> misma sentencia `ALTER TABLE` sobre la base de restauración
> `automatizeit_restorecheck_20261021` dentro de una transacción con `ROLLBACK`
> final, para medir duración y bloqueo sin consecuencias. **Requiere
> autorización explícita**: es una operación de escritura (aunque revertida) y
> queda fuera de esta preparación. Documentado aquí en lugar de ejecutarlo.

**Estado del ensayo: EJECUTADO Y APROBADO el 2026-10-21 (autorización U1.5.4).**
**Resultado: SATISFACTORIO.** `[V]`

> Se ejecutó **una única vez**, con el bloque completo de abajo, en la base
> aislada y terminando en `ROLLBACK`. **No** se ejecutó ninguna migración
> Prisma, **no** se usó `COMMIT`, **no** se tocó producción ni se reinició
> ningún servicio. Los resultados medidos están en §2.2.5.

#### Precondiciones verificables — deben ser TODAS ✅ antes de ejecutar el paso 2 `[V]`

| # | Precondición | Cómo se comprueba | Valor medido 2026-10-21 |
|---|---|---|---|
| **P1** | El destino es **exactamente** la base aislada | `SELECT current_database();` ⇒ `automatizeit_restorecheck_20261021` | ✅ |
| **P2** | El destino **no** es producción | `-d automatizeit_restorecheck_20261021`. **Prohibido** `-d automatizeit` | ✅ |
| **P3** | Ninguna aplicación apunta a esa base | `DATABASE_URL` del contenedor = `postgres:5432/automatizeit`; `grep -r restorecheck` en configs ⇒ vacío | ✅ |
| **P4** | Sin conexiones ajenas a la base aislada | `pg_stat_activity WHERE datname='…' AND pid <> pg_backend_pid()` ⇒ 0 | ✅ **0** |
| **P5** | Conserva la evidencia esperada | 5 537 filas · 34 con hora en `purchase_date` · 25 en `warranty_expires_at` · 36 migraciones | ✅ idéntico a producción |
| **P6** | Los tipos siguen sin convertir | `information_schema` ⇒ `timestamp without time zone` | ✅ |
| **P7** | El respaldo sigue íntegro | `sha256sum` ⇒ `6b5915e5…` | ✅ |
| **P8** | Producción intacta **antes** de empezar | 36 aplicadas · 0 fallidas · 0 columnas de botón | ✅ |
| **P9** | Sin importaciones en curso | `imports` sin estados activos | ✅ **0 activos** |
| **P10** | La sentencia usa `BEGIN`…`ROLLBACK` explícitos | **Nunca** `--single-transaction` (ver regla **R1**) | ⚠️ regla R1 |
| **P11** | `ON_ERROR_STOP=1` activo | no continuar tras un error | ⚠️ regla R1 |
| **P12** | Cronómetro disponible | `time` del shell | — |

**Tras el ensayo se repiten P1, P4, P5 y P6.** Si P5 o P6 no vuelven al valor
base ⇒ el ensayo **no** se da por bueno y se escala; no se improvisa arreglo.

**Valores base medidos hoy sobre la base aislada — deben reproducirse en el
paso 1 Y en el paso 3 (tras el `ROLLBACK`) `[V]`:**

| Métrica | Valor |
|---|---|
| `tipo purchase_date` | `timestamp without time zone` |
| `filas` | 5 537 |
| `filas_unicas_por_indice` | 5 537 (clave única = nº de filas ⇒ el índice único es verificable) |
| `duplicados_por_dia` | **0** |
| `garantias_total` | **27** |
| `garantias_discrepantes` | **0** |
| `purchase_date_nulos` | **0** |
| `con_hora_purchase_date` (paso 3) | **34** |
| `tablas_temp` (paso 3) | **0** |
| `migraciones` | **36** |

> Son **idénticos a los de producción** ⇒ la base restaurada es un espejo válido
> y el ensayo mide lo que mediría la conversión real. **Ejecutados verbatim hoy
> (solo `SELECT`) y coinciden.**

**Hallazgos estructurales del ensayo `[V]`:**

- **3 índices sobre `purchase_date`** — `…_produc_key` (único compuesto),
  `…_organization_id_purchase_date_idx`, `…_purchase_date_idx`. El `ALTER` los
  **reconstruye**: ese es el coste real a medir, **no** la tabla (3 416 kB).
- **2 claves foráneas** apuntan a `purchases` (`automations`, `commercial_cycles`)
  pero **a `id`**, no a las columnas de fecha ⇒ **sin efecto** sobre el `ALTER`.
- **0 vistas y 0 triggers** sobre `purchases` ⇒ sin efectos secundarios.

**Comandos exactos del ensayo propuestos (NO EJECUTADOS) [P]:**

```sh
# 0. Confirmar que el destino es la base AISLADA (jamás 'automatizeit')
docker exec automatizeit-postgres psql -U automatizeit \
  -d automatizeit_restorecheck_20261021 -tAc "SELECT current_database();"

# 1. Huellas ANTES  (deben anotarse para compararlas con el paso 3)
docker exec automatizeit-postgres psql -U automatizeit -d automatizeit_restorecheck_20261021 \
  -tA -F' | ' -c "
  SELECT 'tipo_purchase_date', data_type FROM information_schema.columns
    WHERE table_name='purchases' AND column_name='purchase_date';
  SELECT 'filas', count(*) FROM purchases;
  SELECT 'filas_unicas_por_indice', count(*) FROM (
    SELECT organization_id, invoice_number, customer_id, product_id, purchase_date::date
    FROM purchases GROUP BY 1,2,3,4,5) x;
  SELECT 'duplicados_por_dia', count(*) FROM (
    SELECT 1 FROM purchases GROUP BY organization_id, invoice_number,
      customer_id, product_id, purchase_date::date HAVING count(*)>1) y;
  SELECT 'garantias_total', count(*) FROM purchases
    WHERE warranty_months IS NOT NULL AND warranty_expires_at IS NOT NULL;
  SELECT 'garantias_discrepantes', count(*) FROM purchases
    WHERE warranty_months IS NOT NULL AND warranty_expires_at IS NOT NULL
      AND warranty_expires_at::date
          <> (purchase_date + make_interval(months => warranty_months))::date;
  SELECT 'purchase_date_nulos', count(*) FROM purchases WHERE purchase_date IS NULL;
  SELECT 'migraciones', count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"

# 2. Ensayo TRANSACCIONAL con ROLLBACK — UN SOLO -c (regla R1), cronometrado
time docker exec automatizeit-postgres psql -U automatizeit \
  -d automatizeit_restorecheck_20261021 -v ON_ERROR_STOP=1 -c "
  BEGIN;

  -- GUARDA DE DESTINO: aborta si el -d fuera equivocado.
  DO \$guard\$
  BEGIN
    IF current_database() <> 'automatizeit_restorecheck_20261021' THEN
      RAISE EXCEPTION 'DESTINO NO AUTORIZADO: % — no se toca nada', current_database();
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='purchases' AND column_name='purchase_date'
                 AND data_type = 'date') THEN
      RAISE EXCEPTION 'purchase_date ya es DATE — ensayo repetido o estado inesperado';
    END IF;
  END
  \$guard\$;

  DROP TABLE IF EXISTS pg_temp.pre;
  CREATE TEMP TABLE pre AS
    SELECT id, purchase_date::date AS d FROM purchases;

  ALTER TABLE purchases
    ALTER COLUMN purchase_date       TYPE DATE USING purchase_date::date,
    ALTER COLUMN warranty_expires_at TYPE DATE USING warranty_expires_at::date,
    ALTER COLUMN installation_date   TYPE DATE USING installation_date::date;

  -- (1) Dia civil conservado, fila a fila, unida por SU identificador
  SELECT 'filas_comparadas', count(*)
    FROM purchases p JOIN pre ON p.id = pre.id;
  SELECT 'sin_contraparte_pre', count(*)
    FROM purchases p LEFT JOIN pre ON p.id = pre.id WHERE pre.id IS NULL;
  SELECT 'pre_sin_contraparte', count(*)
    FROM pre LEFT JOIN purchases p ON p.id = pre.id WHERE p.id IS NULL;
  SELECT 'dias_civiles_cambiados', count(*)
    FROM purchases p JOIN pre ON p.id = pre.id
    WHERE p.purchase_date IS DISTINCT FROM pre.d;

  -- (2) El indice UNICO seguira siendo verificable tras convertir
  SELECT 'filas_tras_convertir', count(*) FROM purchases;
  SELECT 'claves_unicas_tras_convertir', count(*) FROM (
    SELECT organization_id, invoice_number, customer_id, product_id, purchase_date
    FROM purchases GROUP BY 1,2,3,4,5) k;
  SELECT 'duplicados_por_dia_tras_convertir', count(*) FROM (
    SELECT 1 FROM purchases GROUP BY organization_id, invoice_number,
      customer_id, product_id, purchase_date HAVING count(*)>1) d;

  -- (3) Garantias con AMBAS fechas ya en DATE
  SELECT 'garantias_total_tras', count(*) FROM purchases
    WHERE warranty_months IS NOT NULL AND warranty_expires_at IS NOT NULL;
  SELECT 'garantias_discrepantes_tras', count(*) FROM purchases
    WHERE warranty_months IS NOT NULL AND warranty_expires_at IS NOT NULL
      AND warranty_expires_at
          <> (purchase_date + make_interval(months => warranty_months))::date;

  ROLLBACK;"

# 3. Huellas DESPUÉS (deben ser idénticas a las del paso 1)
docker exec automatizeit-postgres psql -U automatizeit -d automatizeit_restorecheck_20261021 \
  -tA -F' | ' -c "
  SELECT 'tipo_purchase_date', data_type FROM information_schema.columns
    WHERE table_name='purchases' AND column_name='purchase_date';
  SELECT 'filas', count(*) FROM purchases;
  SELECT 'con_hora_purchase_date', count(*) FROM purchases
    WHERE purchase_date IS NOT NULL AND purchase_date::time <> '00:00:00'::time;
  SELECT 'tablas_temp', count(*) FROM pg_tables WHERE schemaname LIKE 'pg_temp%';
  SELECT 'migraciones', count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
```

**Resultados esperados del paso 2** (los valores base de los pasos 1 y 3 están
medidos; los de aquí se deducen de ellos):

| Métrica | Esperado |
|---|---|
| `tipo_purchase_date` | `date` (antes y después: `timestamp without time zone`) |
| `filas_comparadas` | **5 537** (= `filas`) |
| `sin_contraparte_pre` / `pre_sin_contraparte` | **0 / 0** (la unión es completa) |
| `dias_civiles_cambiados` | **0** |
| `filas_tras_convertir` | **5 537** |
| `claves_unicas_tras_convertir` | **5 537** — si coincide con `filas_tras_convertir`, el índice único **seguirá siendo verificable** tras el `ALTER` |
| `duplicados_por_dia_tras_convertir` | **0** |
| `garantias_total_tras` / `garantias_discrepantes_tras` | **27 / 0** |

> **El paso 2 es la medición; el paso 3 es la prueba de reversión.** Cualquier
> discrepancia entre 1 y 3 ⇒ el ensayo NO se dio por bueno.

**Restricciones del ensayo verificadas de antemano [V]:**

| Condición | Estado |
|---|---|
| Destino inequívocamente la base aislada | ✅ `-d automatizeit_restorecheck_20261021`; la app apunta a `postgres:5432/automatizeit` y **ninguna config** referencia `restorecheck` |
| Conserva evidencia y recuentos | ✅ 5 537 filas, `timestamp`, 9 índices, índice único presente, 36 migraciones |
| Transaccional y revertible | ✅ PostgreSQL ejecuta el DDL **dentro de la transacción**: `ROLLBACK` deshace la conversión por completo (propiedad documentada del motor) |
| Sin reinicio ni efecto en otros procesos | ✅ **0 conexiones** de terceros a esa base; no hay servicio que la use |

**Limitaciones de `ROLLBACK` que hay que conocer [D]:**

- **No usar `psql --single-transaction`:** envolvería todo en `BEGIN…COMMIT` y
  **aplicaría el cambio**. Solo `BEGIN` … `ROLLBACK` explícitos.
- El `ROLLBACK` deshace el **resultado**, no la actividad: consume un XID,
  escribe WAL temporal y ocupa espacio en disco hasta el rollback. Efecto
  visible: **ninguno** sobre los datos.
- Si la conexión se cae **sin** `ROLLBACK`, PostgreSQL **revierte
  automáticamente** (no hay commit ⇒ no hay cambio).
- Se retiene un bloqueo `ACCESS EXCLUSIVE` sobre `purchases` **durante toda la
  transacción**; irrelevante aquí porque nadie más usa esa base, pero es
  exactamente el efecto que en producción sí sería visible.
- **Un `COMMIT` accidental es irreversible en el sentido de esta misión**: el
  ensayo quedaría aplicado. `ROLLBACK` es obligatorio en la misma ejecución.

**Regla R1 — por qué un único `-c` `[V]`**

Si cada `-c` abriera una conexión distinta, el `BEGIN` se perdería y el `ALTER`
se ejecutaría **en autocommit**, quedando **aplicado para siempre** en la base
aislada. Se midió el 2026-10-21 sobre la base de mantenimiento `postgres`
(cero escrituras):

| Prueba | Resultado |
|---|---|
| `-c "BEGIN;"` + `-c "SAVEPOINT s;"` + `-c "ROLLBACK;"` | sin aviso ⇒ **comparten sesión** |
| `-c "BEGIN; SAVEPOINT s; ROLLBACK;"` (control) | sin aviso |
| `-c "SAVEPOINT s;"` (control negativo) | **ERROR: SAVEPOINT can only be used in transaction blocks** ⇒ detecta el caso fallo |

Conclusión: la versión anterior **era** transaccionalmente correcta. La entrega
usa **un solo `-c`** para que la corrección **deja de depender** de ese
comportamiento. Redundancia deliberada, no un arreglo de un defecto.

**Regla R2 — revisión de los 7 puntos del SQL (U1.5.3) `[V]`**

| # | Punto revisado | Hallazgo | Acción |
|---|---|---|---|
| 1 | Unión de días civiles | El runbook ya usaba `JOIN pre ON p.id = pre.id` (**correcto**). La forma tautológica `p.id=p.id` apareció **solo en el listado abreviado del informe anterior**, no en el documento | Se añaden `filas_comparadas`, `sin_contraparte_pre` y `pre_sin_contraparte` para que la unión **no pueda quedar vacía sin avisar** |
| 2 | Criterio de unicidad y NULL | El índice real es `(organization_id, invoice_number, customer_id, product_id, purchase_date)`, **ASC, sin `NULLS NOT DISTINCT`** ⇒ PostgreSQL trata los NULL como **distintos**. Medido: **0 NULL** en las 5 columnas, así que ambos criterios coinciden hoy | Se mide y se compara `claves_unicas_tras_convertir` **contra** `filas_tras_convertir`: si coinciden, el índice único **seguirá siendo verificable** tras el `ALTER`. **Corregido el criterio defectuoso** de la medición intermedia, que agrupaba por `purchase_date` completo (timestamp) y por eso **no** detectaba el riesgo real: claves que difieren **solo en la hora** |
| 3 | Garantías tras convertir ambas fechas | Válido: `date + interval(months)` conserva el día, y `::date` sobre timestamp trunca **hacia abajo** sin redondear, por lo que `(ts + interval)::date` ≡ `(ts::date + interval)::date` para intervalos de meses | Se añade `garantias_total_tras` junto a `…_discrepantes_tras`, para que el «27» no dependa solo del paso 1 |
| 4 | Conexión y transacción únicas | Un solo `-c` ⇒ una sola sesión; verificado empíricamente (R1) | Sin cambio |
| 5 | Error, caída y rollback | `ON_ERROR_STOP=1` detiene en el primer error; la caída de conexión **revierte automáticamente** (no hay commit) | Sin cambio |
| 6 | Que nada pueda tocar producción | Antes dependía de **recordar** el `-d` correcto | **Endurecido**: bloque `DO` que **aborta con `RAISE EXCEPTION`** si `current_database()` no es exactamente la base aislada, o si `purchase_date` ya es `date`. **Validado en vivo** contra la base de mantenimiento `postgres`: devolvió `DESTINO NO AUTORIZADO: postgres — no se toca nada` |
| 7 | Tablas temporales y supuestos | Las temporales viven en la sesión y mueren con el `ROLLBACK`; cada `psql` abre sesión nueva | Se añade `DROP TABLE IF EXISTS pg_temp.pre;` (prefijo `pg_temp.` para no tocar nunca una tabla permanente) y `tablas_temp` en el paso 3 |

**Validaciones ejecutadas hoy (sin ensayo, sin escritura):**

- Guarda de destino probada **en vivo** ⇒ bloquea el `-d` equivocado (punto 6).
- **Pasos 1 y 3 ejecutados verbatim** contra la base aislada (solo `SELECT`)
  y coinciden con la tabla de valores base: `timestamp` · 5 537 · 5 537 claves
  únicas · 0 duplicados · 27/0 garantías · 0 NULL · 36 migraciones ·
  34 con hora · 0 tablas temporales.

**Nota de alcance:** el ensayo NO cubre `20261009000000` (columnas de botón).
Si se desea ensayar también eso, añadir el `ALTER TABLE … ADD COLUMN` en la
**misma** transacción — decisión que corresponde a quien autoriza.

---

#### 2.2.5 Resultados medidos del ensayo (2026-10-21) `[V]`

**Criterios de aceptación — todos cumplidos:**

| Criterio | Esperado | Obtenido | |
|---|---|---|---|
| La guarda identifica la base aislada | sin excepción | ✅ sin excepción | ✅ |
| La conversión termina correctamente | `ALTER TABLE` OK | ✅ `ALTER TABLE` | ✅ |
| No cambian los días civiles | 0 | **0** | ✅ |
| Sin colisiones de clave única | 0 | **0** (`claves_unicas` = 5 537 = `filas`) | ✅ |
| Garantías | 27 / 0 | **27 / 0** | ✅ |
| Rollback demostrado | tipos y huellas idénticos | ✅ ver §2.2.6 | ✅ |

**Integridad de la unión uno a uno:**

| Métrica | Valor |
|---|---|
| `filas_comparadas` | **5 537** |
| `sin_contraparte_pre` | **0** |
| `pre_sin_contraparte` | **0** |
| `dias_civiles_cambiados` | **0** |

**Duración `[V]` — desglosada:**

| Componente | Valor | Cómo se obtuvo |
|---|---|---|
| **Total extremo a extremo** | **885 ms** | `time` sobre `docker exec … psql` |
| Ejecución del bloque en servidor | **559,587 ms** | `\timing` (psql envía el `-c` como una unidad) |
| Overhead de conexión (docker + psql + sesión) | **≈ 228 ms** | mediana de 5 muestras de `SELECT 1` |
| Las 5 consultas de verificación | **≈ 32 ms** servidor | 260 ms (mediana, con overhead) − 228 ms |
| **`ALTER` + `CREATE TEMP TABLE`** | **≤ ≈ 527 ms** | residuo del bloque tras restar verificaciones |

> **`ALTER` exacto: NO AISLADO.** `pg_stat_statements` no está cargado y
> `log_min_duration_statement=-1`, por lo que el servidor no registró la sentencia
> por separado, y `\timing` agrupó el bloque. **No se repitió la operación solo
> para aislarlo**: se ofrece el **límite superior** acotado. Si se necesita el
> número exacto, exige cargar `pg_stat_statements` o **una autorización nueva**
> para una segunda ejecución.
>
> **No extrapolar esto como garantía de producción:** la tabla de producción
> (**3 976 kB**, ~7 % mayor) y el entorno (sesiones reales, WAL, réplica) difieren.
> Es una medida de **laboratorio sobre base aislada**.

**Bloqueos y errores `[V]`:**

| Evento | Resultado |
|---|---|
| Bloqueos retenidos | **Ninguno** (0 conexiones ajenas; 0 locks esperando) |
| Errores SQL | **Ninguno** |
| Aviso | `NOTICE: schema "pg_temp" does not exist, skipping` — **benigno y esperado**: sesión nueva, aún sin esquema temporal. Provino de `DROP TABLE IF EXISTS pg_temp.pre;` |
| Rollback | ✅ `ROLLBACK` ejecutado; **`COMMIT` no se usó** |

#### 2.2.6 Verificación de la reversión (conexión nueva) `[V]`

| Comprobación | Esperado | Obtenido |
|---|---|---|
| Las 3 columnas | `timestamp without time zone` | ✅ las 3 |
| `filas` | 5 537 | ✅ 5 537 |
| `con_hora_purchase_date` | 34 | ✅ **34** |
| `con_hora_warranty_expires_at` | 25 | ✅ **25** |
| Componentes horarios | preservados | ✅ ej. `2023-04-06 14:02:45.265`, `2025-04-06 14:02:45.265` |
| `tablas_temp` | 0 | ✅ 0 |
| Transacciones abiertas ajenas | 0 | ✅ 0 |
| Migraciones / fallidas | 36 / 0 | ✅ 36 / 0 |

**Prueba fuerte de mismo estado lógico** — huella `md5` de las 3 columnas en las
5 537 filas, comparando la base aislada (tras el rollback) contra **producción**
(que nunca se tocó y por tanto encarna el estado previo):

```
aislada : 0c9a5c4af399a396de1113c59b99341d
prod    : 0c9a5c4af399a396de1113c59b99341d   => IDENTICAS
```

---

### 2.3 Ejecución futura — comandos propuestos (NO EJECUTADOS)

> ⛔ **PUNTO EXACTO EN QUE SE REQUIERE AUTORIZACIÓN HUMANA: antes del primer
> comando de esta sección.** Todo lo anterior es solo lectura; todo lo que sigue
> modifica la base de datos o los servicios. **[P]**

#### Orden requerido por la Opción A

Aplicar `20261010000000` **antes** de desplegar el código que asume `@db.Date`.

**Estado verificado que hace correcto ese orden [V]:**

| Componente | Declara | Estado |
|---|---|---|
| BD de producción | `purchases` en `timestamp` · **sin** columnas de `messages.button_*` | actual |
| Contenedor `automatizeit-api` en marcha (imagen construida 2026-10-10T17:15Z) | `DateTime` **sin** `@db.Date` · **con** `buttonId/buttonTitle/inReplyToProviderId` | actual |
| `schema.prisma` local (modificado 2026-10-11T04:38Z) | `DateTime` **con** `@db.Date` · con los campos de botón | por desplegar |

**Corrección a una afirmación imprecisa de la versión anterior de este
runbook:** se decía que «la API y la base de datos coinciden». Es cierto **solo
para `purchases`**. En `messages` **no coinciden**: la imagen en marcha declara
`button_id`, `button_title` e `in_reply_to_provider_id` (presentes en su
`schema.prisma` **y** en el cliente Prisma ya generado: `index.js`, `edge.js`,
`wasm.js`), mientras la base de datos **no tiene ninguna de las tres**
(`information_schema` → 0) **[V]**.

Ese desajuste es **LATENTE, no manifiesto**: `whatsapp.service.ts:1154-1156`
envía esos tres campos **siempre** (`?? null`) en `prisma.message.create`, pero
**0 mensajes** se han creado desde el arranque del contenedor (último mensaje
`2026-10-10 00:00:13Z`, anterior al arranque `17:15Z`), por lo que la ruta no se
ha ejecutado y **no hay ningún error en los 62 719 renglones de log** **[V]**.
El modo exacto de fallo no está comprobado empíricamente **[I]** — probarlo
exigiría una escritura, es decir, la misma autorización que el ensayo §2.2.4.

#### Matriz de compatibilidad código ↔ esquema **[V]**

| Estado del esquema | API actual (imagen 10-10) | Imagen nueva (`@db.Date`) |
|---|---|---|
| **A. Hoy** — `timestamp`, sin columnas de botón | ⚠️ `purchases` ✅ · `messages` ❌ **latente** | ❌ `purchases` y `messages` |
| **B. Solo `20261009000000`** | ✅ **totalmente compatible** | ❌ `purchases` aún en `timestamp` |
| **C. Solo `20261010000000`** | ❌ ambos | ❌ `messages` |
| **D. Ambas (objetivo Opción A)** | ⚠️ funciona por cast implícito, pero es deriva de esquema | ✅ **totalmente compatible** |

> **Estado C es inalcanzable de forma legítima:** Prisma aplica en orden
> alfabético y `20261009000000` precede a `20261010000000`; llegar a C exigiría
> falsear el historial (`migrate resolve`), prohibido.
>
> **Interés práctico de B:** es el único estado que deja la base **plenamente
> compatible con lo que hoy está desplegado** y, además, *repara* el desajuste
> latente de `messages`. No es una opción que pueda aislarse con las herramientas
> disponibles (§2.3 y §8.2), pero conviene tenerla presente al decidir el alcance.

**Hoy existe un desajuste previo** (el de `messages`), **no lo hay en
`purchases`**. La Opción A preserva la coherencia de `purchases` cambiando la BD
justo antes de arrancar el código nuevo y, de paso, **cierra también el desajuste
de `messages`** al aplicar ambas migraciones.

#### Fase 1 — migración (sola, sin desplegar código)

```sh
# 1. Ventana: detener la API
docker compose -f infrastructure/docker/docker-compose.yml stop api

# 2. Guarda en el modo que exige el despliegue (debe salir 0)
sh scripts/check-migrations.sh --allow-pending

# 3. Ejecutar SOLO el servicio de migración (una vez, sin arrancar la API)
docker compose -f infrastructure/docker/docker-compose.yml run --rm migrate
```

- El comando del servicio `migrate` es, literalmente:
  `sh /guard/check-migrations.sh --allow-pending && npx prisma migrate deploy`
  **[V]**. Si la guarda falla, `migrate deploy` **no** se ejecuta.
- `migrate` tiene `restart: "no"` **[V]**: no se reintenta en bucle.
- `docker compose run --rm migrate` **[I]** arranca sus dependencias
  (`postgres`) pero **no** `api`. *Verificar en la ventana observando
  `docker compose ps`: no debe aparecer `automatizeit-api` en marcha.*

#### Fase 2 — despliegue del código

```sh
# 4. Verificaciones de la fase 1 (§2.6) — obligatorias antes de continuar
# 5. Arrancar la API con el código nuevo
docker compose -f infrastructure/docker/docker-compose.yml up -d api
```

#### Por qué no confiar en el orden implícito de Compose **[I]**

`api` declara `depends_on: migrate: condition: service_completed_successfully`
**[V]**, de modo que un `docker compose up` completo ejecuta `migrate` **y
después** arranca la API. Eso *parece* dar el orden de la Opción A gratis.

**Pero no se apoya en él:**

1. No está verificado qué hace Compose con el contenedor de la API **antiguo**
   mientras corre `migrate` (¿sigue sirviendo? ¿ya fue detenido?) **[I]**.
2. Un `up` completo desplegaría la API nueva en el mismo paso, sin margen de
   verificación entre migración y código **[I]**.
3. **Dependencia crítica descubierta:** `prisma migrate deploy` aplica **TODAS**
   las pendientes, no solo una. Hay **dos** pendientes: la ejecución aplicaría
   también `20261009000000_inbound_button_fields` **[V]** (ver §8.2).

El plan de dos fases elimina la dependencia del orden implícito: **cada fase se
ejecuta, se verifica y se aprueba por separado.**

---

### 2.4 Criterios de aborto

Ante cualquiera de estos, **no continuar**: no pasar a la Fase 2, no reintentar
a ciegas, escalar a revisión humana.

| # | Criterio | Cómo detectarlo | Acción |
|---|---|---|---|
| A1 | Checksum incorrecto o respaldo inaccesible | `sha256sum -c` no coincide; fichero ausente | **Aborto total**: no hay reversión segura |
| A2 | Espacio insuficiente | `df` por debajo del umbral acordado | Aborto |
| A3 | Estado de migraciones inesperado | `migrate status` ≠ «36 aplicadas / 2 pendientes»; alguna `failed` | Abortar y revisar el historial **sin** `migrate resolve` |
| A4 | Guarda en verde pero con deriva no explicada | salida de `check-migrations.sh` con FALLO | Abortar; la guarda manda |
| A5 | Tráfico de escritura no controlado | `pg_stat_activity` muestra escrituras o transacciones abiertas sobre `purchases` | Abortar; reabrir ventana |
| A6 | Bloqueo retenido / espera de lock | `wait_event_type = 'Lock'` persistente | Cancelar la sentencia; investigar retención |
| A7 | Duración sobre el umbral acordado | logs de `migrate` / cronómetro | Abortar y reevaluar |
| A8 | Errores de PostgreSQL | `ERROR` en los logs de `migrate` | Abortar |
| A9 | Errores de la aplicación tras la migración | health ≠ 200; errores de Prisma/lectura | Recuperación §6 |
| A10 | **Discrepancia entre el SQL revisado y la migración aprobada** | sha256 ≠ `ed56895b…` | **Aborto inmediato**: el contenido aprobado cambió |
| A11 | Se aplicó `20261009000000` sin estar previsto | filas nuevas en `_prisma_migrations` | Punto de decisión humana (§8.2) |

**Confirmación de A10 en este preflight [V]:** disco = manifiesto = índice Git
= `ed56895b1f43e0d6a35aa729ed00d3beacde9c59184da06dbb116a429ad65472`.

---

### 2.5 Recuperación

#### 2.5.1 Restaurar en una base limpia y aislada

Ya ejecutado y verificado una vez con el respaldo actual **[V]**:

```sh
# Base nueva y aislada (NO la original)
docker exec -i automatizeit-postgres createdb -U automatizeit automatizeit_restorecheck_<fecha>
docker exec -i automatizeit-postgres pg_restore -U automatizeit \
  -d automatizeit_restorecheck_<fecha> --clean --if-exists \
  < /workspace/backups/crm-aui/crm-aui_<fecha>.pgdump
```

> `pg_restore` **sin** `--single-transaction` para una restauración normal; la
> verificación previa se hizo con salida limpia y exit 0 **[V]**.

#### 2.5.2 Cómo se verificarían recuentos y huellas

| Nivel | Comprobación | Valor de referencia |
|---|---|---|
| Presencia | `purchases`/`customers`/`messages` | 5 537 / 6 277 / 8 163 |
| Huellas de valor | `md5(string_agg(…))` sobre `purchase_date`, `warranty_expires_at`, `installation_date` | ya registradas en la verificación previa |
| Fila completa | huella md5 sobre todas las columnas de `purchases` | idéntica a producción |
| Historial de Prisma | huella sobre `_prisma_migrations` | 36 filas, idéntica |

#### 2.5.3 Reconfigurar las conexiones de la aplicación

Si se decidiera **servir desde la base restaurada**, habría que apuntar
`DATABASE_URL`/`POSTGRES_DB` hacia ella. **Esto es un cambio de configuración
de infraestructura y requiere autorización aparte** **[P]**:

- Se cambia `infrastructure/docker/.env` (gitignored) o la variable de entorno.
- Implica recrear el contenedor de la API (`up -d api`).
- **No** se debe tocar el volumen original
  (`automatizeit_postgres_data`) ni la base `automatizeit`.
- Verificar que los volúmenes y los datos originales siguen intactos después
  del cambio.

**Alternativa preferida cuando el daño es solo el esquema:** no reconfigurar la
aplicación, sino **revertir el tipo de columna** en la base original
(`ALTER COLUMN … TYPE TIMESTAMP USING col::timestamp` es válido porque
`date → timestamp` es conversión implícita) **[I]**. Es una operación de
esquema, por tanto **[P]** y con autorización propia.

#### 2.5.4 Riesgos de los datos creados después del respaldo

- El respaldo se creó a **2026-10-21T02:23:12Z**.
- En este preflight, producción y respaldo tienen **recuentos idénticos**: aún
  no se ha perdido nada **[V]**.
- Cada compra, cliente o mensaje creado **desde** ese instante quedaría fuera
  del respaldo. Antes de restaurar: **volver a medir la diferencia**
  (`producción − respaldo`) y decidir si es aceptable **[P]**.

#### 2.5.5 Lo que NO se debe hacer

- **No sobrescribir la base original** ni apuntar volúmenes destruidos.
- **No** asumir que revertir `DATE → TIMESTAMP` recupera las horas: el DDL
  devuelve el **tipo**, pero las **59 horas** (34 + 25) ya no existen. Solo se
  recuperan **desde el respaldo** **[V]**.
- **No** manipular `_prisma_migrations` a mano ni usar `migrate resolve` para
  «arreglar» el estado: falsearía el historial.
- **No** borrar el respaldo ni la base de restauración.

#### 2.5.6 Salud y aceptación antes de reabrir

1. `GET /api/v1/health` → 200 y `outboundSend.allowed = false`.
2. Consultas de lectura y escritura básicas sobre `purchases`.
3. `prisma migrate status` sin errores ni checksums discrepantes.
4. `check-migrations.sh --allow-pending` → exit 0.
5. Cero errores nuevos en los logs de la API durante N minutos.
6. Recuentos de negocio sin pérdidas inesperadas (§2.6).
7. Aprobación humana explícita para reabrir el tráfico.

---

### 2.6 Postvalidación (tras la Fase 1, y de nuevo tras la Fase 2)

| # | Comprobación | Esperado |
|---|---|---|
| P1 | Tipo de `purchases.purchase_date` | `date` |
| P2 | Tipo de `purchases.warranty_expires_at` | `date` |
| P3 | Tipo de `purchases.installation_date` | `date` |
| P4 | Día civil conservado en las 3 conversiones | **0 filas** cambian de día (contra el respaldo) |
| P5 | `purchases` | 5 537 |
| P6 | `customers` | 6 277 |
| P7 | `messages` | 8 163 |
| P8 | `_prisma_migrations` | **38** aplicadas, 0 fallidas, **0** con checksum distinto |
| P9 | Pendientes de Prisma | **0** |
| P10 | `check-migrations.sh --allow-pending` | exit 0 |
| P11 | Informes semanales (`groupBy=week`) | etiquetas UTC estables, sin desplazamiento |
| P12 | Suite de pruebas completa | 1 090 pasan / 2 omitidas, exit 0 |
| P13 | `lint` / `typecheck` / `build` | exit 0 |
| P14 | Errores de API (logs y health) | sin errores nuevos |
| P15 | `OUTBOUND_SEND_ENABLED` | **`DENIED`** — se mantiene bloqueado hasta autorización **separada** |

---

## 3. Tarea 3 — Riesgos de despliegue (inspección, sin ejecutar)

### 3.1 ¿Iniciar o recrear servicios puede disparar migraciones?

**SÍ.** **[V]** sobre la configuración; **[I]** sobre el comportamiento en
runtime (no se ejecutó `up` para probarlo, por prohibición).

- El único punto de ejecución de migraciones es el servicio **one-shot
  `migrate`**. El `CMD` de la imagen de la API es `node dist/main`
  **[V]**: **la API no ejecuta migraciones en su arranque.**
- `api` declara `depends_on: migrate: condition: service_completed_successfully`
  **[V]** → cualquier `up` que involucre a `api` **arrastra a `migrate`**, que
  aplica todo lo pendiente.
- `.dockerignore` **no excluye** `apps/api/prisma/migrations/` **[V]** → las
  migraciones están dentro de la imagen; el binario del `migrate` y el de la API
  son el mismo build.
- `restart: "no"` en `migrate` **[V]** → no entra en bucle de reintentos.

> **Consecuencia operativa:** desde que U1.4 versionó las dos migraciones, un
> simple `docker compose up` — aunque sea para otra razón — **aplicaría las dos
> migraciones pendientes automáticamente**. La única barrera es la guarda, que
> **las aprueba** (ambas figuran en el manifiesto). **[V]**
> Esto eleva la prioridad de decidir y ejecutar la Opción A de forma controlada
> en lugar de dejarla al azar de un despliegue no relacionado.

#### 3.1.1 Rutas reales por las que se dispararía (inventario completo) **[V]**

| # | Ruta | ¿Aplica las 2 migraciones? | ¿Pasa por la guarda? |
|---|---|---|---|
| R1 | `docker compose up` (cualquier servicio que arrastre a `api`) | **SÍ** | Sí (`--allow-pending` → aprueba) |
| R2 | `scripts/human-testing-up.sh up` (ruta **por defecto**, sin flags) → `api_up_docker` → `compose up -d api` | **SÍ** | Sí |
| R3 | `scripts/human-testing-up.sh up --seed` → `ensure_migrated` | **SÍ** | En modo contenedor sí |
| R4 | `scripts/human-testing-up.sh up --dev` → `ensure_migrated` → `prisma migrate deploy` **desde el host** | **SÍ** | **NO — ruta sin guardar** |
| R5 | `scripts/human-testing-up.sh down` / `pause` / `status` / `logs` | No | — |
| R6 | CI: `.github/workflows/openapi.yml` | **No** — solo valida y empaqueta OpenAPI; ni Docker ni BD | — |
| R7 | Arranque del propio `automatizeit-api` (`CMD node dist/main`) | **No** — la imagen no ejecuta migraciones | — |

**Hallazgos concretos de esta revisión:**

- **R2 es la ruta ordinaria más probable.** El propio script lo declara en su
  salida: *«sin `--seed` las migraciones las aplica el propio arranque del
  API»* / *«las aplica el servicio migrate al arrancar el API»*. Un operador que
  lo ejecute para probar la interfaz **aplicaría las dos migraciones a la base
  `automatizeit` de producción**, porque `COMPOSE_FILE`, `PG_CONTAINER` y
  `DB_NAME` del script apuntan al stack de producción **[V]**.
- **R4 es la única ruta sin guardar.** En `DEV=1` ejecuta
  `prisma migrate deploy` directamente, sin invocar `scripts/check-migrations.sh`
  **[V]** (el `&&` que protege a R2/R3 no está presente).
- **R6 (CI) no representa riesgo alguno.**
- El script espera además «**32** migraciones aplicadas» (mensaje de `ok`),
  cifra obsoleta frente a las 38 actuales: indicador cosmetico, no funcional.

**Intervención mínima propuesta (NO APLICADA — requiere autorización) [P]:**

1. **Congelación operativa** (sin tocar código): no ejecutar R1–R4 hasta la
   ventana autorizada. Es la única medida que no exige modificar nada.
2. **Cerrar R4** (cambio mínimo en `scripts/human-testing-up.sh`): invocar
   `scripts/check-migrations.sh --allow-pending` antes del
   `prisma migrate deploy` de la rama `DEV=1`, de modo que **ninguna** ruta
   quede sin guardar. No toca Compose, CI ni manifiesto.
3. **Opción más dura** (solo si se quiere impedir el disparo, no solo
   guardarlo): añadir un mecanismo de retención a la guarda que **falle** ante
   migraciones pendientes mientras dure la retención. **Modifica la herramienta
   de seguridad** y reduce la capacidad de despliegue normal ⇒ decisión humana
   explícita; **no se propone aplicar sin ella.**

> Ninguna de las tres se ha aplicado. Riesgo **abierto** mientras no se adopte
> al menos la 1.

### 3.2 Orden que exige la Opción A

```
detener API  →  guarda  →  migrate deploy  →  verificar  →  (aprobación)  →  API nueva
```

Sostenido por la dependencia `service_completed_successfully` **[V]**, pero
**ejecutado explícitamente en dos fases** (§2.3) para no depender de un orden
implícito no verificado.

### 3.3 Cómo evitar que la API incompatible arranque antes

1. **Fase explícita:** `docker compose run --rm migrate` no arranca `api`
   **[I]** → verificar con `docker compose ps` durante la ventana.
2. **Red de seguridad declarada:** si se usase un `up` completo,
   `service_completed_successfully` impide que la API arranque si `migrate`
   falla **[V]**.
3. **Ventana:** `stop api` antes de Fase 1 garantiza que **ninguna** API — ni
   la vieja ni la nueva — esté sirviendo durante la conversión **[I]**.
4. **Imagen nueva solo en Fase 2:** no reconstruir hasta verificar la Fase 1.

### 3.4 Si la migración falla o el contenedor termina inesperadamente

| Situación | Efecto | Estado |
|---|---|---|
| La guarda falla | `&&` cortocircuita: **no se aplica nada** y `migrate` sale ≠ 0 **[V]** (ya demostrado en pruebas) | Seguro |
| `migrate deploy` falla a mitad | Prisma registra la fila como `failed` en `_prisma_migrations`; la API **no** arranca (`service_completed_successfully`) **[V]** | Requiere revisión humana |
| API antigua detenida y Fase 1 falla | **Servicio caído**: `up -d api` solo la levanta si se autoriza, o se decide volver a la Fase 0 | **Riesgo principal de disponibilidad** |
| Contenedor `migrate` termina inesperadamente | `restart: "no"` → sin reintentos; estado de Prisma que quede **[V]** | Revisar `migrate status` |
| `ALTER TABLE` a medias | Cada `migration.sql` es **una sola sentencia** `ALTER TABLE`; en PostgreSQL una sentencia es atómica, y Prisma ejecuta cada migración en transacción sobre Postgres ⇒ o se aplica entera o no se aplica **[D]** | Riesgo bajo |
| Estado intermedio esquema/código | La Opción A **no** lo produce: el cambio es un solo paso **[V]** (§5.5 del informe) | — |

#### 3.4.1 Fallo de la PRIMERA migración (`20261009000000`, columnas de botón) **[V]**

- **No se aplica nada**: la transacción de esa migración se revierte.
- **`20261010000000` no llega a intentarse** (Prisma las aplica en orden
  secuencial; un fallo detiene la ejecución).
- `_prisma_migrations`: **1 fila `failed`** (`finished_at IS NULL`, error en la
  columna `logs`), el resto sin tocar.
- **Consecuencia crítica:** según la documentación oficial de Prisma, *«Until
  you recover from the failed state, further migrations using
  `prisma migrate deploy` are impossible»* ⇒ **toda futura implantación queda
  bloqueada** hasta que un humano ejecute `prisma migrate resolve`
  (`--rolled-back` o `--applied`). **Esa vía está prohibida en esta misión**
  ⇒ escalar a autorización humana, nunca improvisarla.
- Estado resultante del esquema: **sin cambios** (botones no creados, fechas sin
  convertir). El esquema sigue siendo el de hoy.

#### 3.4.2 Fallo de la SEGUNDA migración (`20261010000000`, conversión a `DATE`) **[V]**

Este es el **peor caso** porque deja estado **mixto e irreversible sin respaldo**:

- **`20261009000000` SÍ queda aplicada** (ya se hizo commit en su propia
  transacción): `messages.button_id`, `button_title`, `in_reply_to_provider_id`
  **existen**.
- `20261010000000` queda **`failed`**; `purchases` **sigue en `timestamp`**.
- `_prisma_migrations`: **1 aplicada (37 en total) + 1 `failed`.**
- **De nuevo: `migrate deploy` queda bloqueado** hasta `migrate resolve`
  ⇒ decisión humana obligatoria.
- **Importante:** las 59 horas **no** se pierden en este escenario (la
  conversión no se llegó a aplicar). La reversión de datos no hace falta aquí;
  lo que hace falta es **resolver el historial**.
- El esquema resultante es **compatible con la API vieja** (que no usa `DATE`)
  e **incompatible** con el `schema.prisma` local (`@db.Date`), es decir,
  exactamente el estado de deriva que HG-9 quería eliminar.

#### 3.4.3 Efecto en el servicio y en el resto de la corrida

| Escenario | ¿Arranca la API? | Disponibilidad |
|---|---|---|
| Fase 1 correcta | Sí (tras Fase 2) | Recuperada en la ventana |
| Fase 1 con fallo (`migrate` exit ≠ 0) | **No** (`service_completed_successfully`) | **Caída** hasta decisión humana |
| Cualquier migración `failed` | No, y **tampoco en corridas futuras** | Caída + bloqueo histórico |

**Decisión a tomar antes de la ventana [P]:** cuánto tiempo máximo se acepta sin
API disponible si la Fase 1 falla, y quién decide la reapertura. **Añadir:** quién
está habilitado para ejecutar `migrate resolve` si se da 3.4.1 o 3.4.2, dado que
hoy está prohibido — sin esa respuesta escrita, **el escenario de fallo no tiene
salida definida**.

### 3.5 Medidas que impiden envíos automáticos durante el mantenimiento

| Nivel | Mecanismo | Verificación |
|---|---|---|
| Configuración | `OUTBOUND_SEND_ENABLED: ${OUTBOUND_SEND_ENABLED:-DENIED}` declarado en compose y **anterior a `env_file`** (los valores de `environment:` ganan) **[V]** | `docker compose config` → `DENIED` |
| Imagen | `ENV OUTBOUND_SEND_ENABLED=DENIED` horneada en el Dockerfile, por si se olvida la variable **[V]** | presente en el Dockerfile |
| Runtime | `printenv` dentro del contenedor → `DENIED` **[V]** | verificado |
| Política de la app | `SendPermitGuard`; health reporta `allowed:false`, `reason:SWITCH_DENIED` **[V]** | verificado |
| Programadores | Ambos `@Interval` hacen *early return* sin consultar ni mutar estado **[V]** | código leído |
| Durante la ventana | La API está **detenida** → ni siquiera el código de aplicación corre **[I]** | §2.2.3 |
| Separación de autorización | Levantar los envíos exige una autorización **distinta** de la de U1.5 **[P]** | este documento |

---

## 4. Diff del documento nuevo

Archivo nuevo, único entregable de esta preparación:

- `specs/026-pit-final/runbook-hg9-opcion-a.md` (este documento)

Ningún otro fichero modificado. En particular: sin tocar migraciones, manifiesto,
`schema.prisma`, compose, código de la aplicación ni Git.

---

## 5. Comandos inspeccionados y resultados

Todos **solo lectura**. Ninguno modifica base de datos ni servicios.

| Comando / inspección | Resultado |
|---|---|
| Lectura de `migration.sql` (2 sentencias de comentario + cuerpo) | 3 `ALTER COLUMN … TYPE DATE USING …::date` |
| `sha256sum` disco / manifiesto / `git show :…` | idénticos: `ed56895b…` |
| `psql` conteos y tipos sobre `purchases` | 5 537 / 34 / 25 / 0 horas; tipos aún `timestamp` |
| `psql` duplicados por día civil | 0 |
| `psql` desplazamiento de día bajo `::date` | 0 |
| `psql` coherencia de garantía (`::date`) | 27 coinciden, 0 discrepan |
| `psql` índices de `purchases` | 9 índices (3 involucran `purchase_date`) |
| `psql` sesiones y locks | 3 sesiones (2 idle), 0 locks en espera |
| `psql` importaciones | `COMPLETED` 1, `PARTIAL` 4 — ninguna en curso |
| `sha256sum` del respaldo | `6b5915e5…` (5 473 524 bytes) |
| Consulta a la base restaurada | recuentos idénticos a producción |
| `GET /api/v1/health` | 200, `outboundSend.allowed=false` |
| `printenv OUTBOUND_SEND_ENABLED` (contenedor) | `DENIED` |
| `docker compose config` (sin arrancar) | `OUTBOUND_SEND_ENABLED: DENIED`, `migrate restart:'no'` |
| `prisma migrate status` | 38 en disco, 2 pendientes, 0 fallidas |
| `./scripts/check-migrations.sh --allow-pending` | **exit 0** |
| `df -h` host y contenedor | 373 G libres |
| Inspección del `CMD` de la imagen | `node dist/main` (sin migraciones) |
| `.dockerignore` | sin reglas para `prisma/migrations` |
| `schema.prisma` en el contenedor vs. local | contenedor **sin** `@db.Date`; local **con** `@db.Date` |
| Búsqueda de `@Interval`, `@Processor`, BullMQ | 2 intervalos; 0 processors; sin cola externa |
| Código de `SmsScheduler` / `WhatsappScheduler` | *early return* bajo DENIED, sin consultas |
| `grep` de invocadores de `ImportsProcessor` | en proceso, *fire-and-forget* |

---

## 6. Confirmaciones de contención

| Restricción | Confirmación |
|---|---|
| Escrituras en producción | **Ninguna.** Todas las consultas fueron `SELECT`/`information_schema`/`pg_catalog`. Recuentos y tipos idénticos al inicio (5 537 / 6 277 / 8 163 / 36 migraciones / `timestamp` en las 3 columnas) **[V]** |
| Migraciones ejecutadas | **Ninguna.** `migrate status` sigue con **2 pendientes** y 36 aplicadas; no se llamó a `migrate deploy`, `resolve`, `dev` ni `docker compose up` **[V]** |
| Servicios reiniciados | **Ninguno.** No se creó, reinició ni detuvo contenedor alguno **[V]** |
| `OUTBOUND_SEND_ENABLED` | **`DENIED`** en compose, en la imagen, en el contenedor y en la respuesta de health **[V]** |
| Contenido de migraciones | **Sin modificar.** Checksum `ed56895b…` idéntico en disco, manifiesto e índice de Git **[V]** |
| Manifiesto | **Sin regenerar.** 38 entradas, 0 discrepancias **[V]** |
| Respaldo y base de restauración | **Intactos.** El `.pgdump` conserva tamaño y sha256; la base restaurada sigue presente y legible **[V]** |
| Operaciones destructivas de Git | Ninguna. Sin `reset`, `clean`, `stash`, commits ni push **[V]** |
| Cambios locales preexistentes | Preservados **[V]** |

---

## 7. Estado de respaldo, base de restauración y Git

| Elemento | Estado |
|---|---|
| Respaldo | Presente, 5 473 524 bytes, sha256 `6b5915e5041296c33b705f94a748d0c146b68aa11490c6898e9e01c7b427833f` **[V]** |
| Base de restauración | `automatizeit_restorecheck_20261021` presente, 5 537 / 6 277 / 8 163, 36 migraciones **[V]** |
| Git | `HEAD 18ede0ec0d7f…` = `origin/main` · 0 commits nuevos · **sin commits ni push** **[V]** |
| Staged (de U1.4) | 3: las 2 migraciones + `MIGRATIONS.sha256` **[V]** |
| Guarda (modo despliegue) | `--allow-pending` → **exit 0** **[V]** |

---

## 8. Hallazgos abiertos

### 8.1 Cabecera de la migración desfasada en +1 fila **[V]**

Ver §1. No funcional. **No editar la migración** (rompería checksum, manifiesto
y el historial de Prisma). Documentar fuera: referencia actual **5 537 filas /
34 con hora en `purchase_date` / 25 en `warranty_expires_at`**.

### 8.2 Dependencia no prevista: la ejecución aplicaría DOS migraciones **[V]**

`prisma migrate deploy` aplica todas las pendientes **en orden**. Junto con
`20261010000000_purchase_civil_dates` se aplicaría
**`20261009000000_inbound_button_fields`**:

```sql
ALTER TABLE "messages"
  ADD COLUMN "button_id" TEXT,
  ADD COLUMN "button_title" TEXT,
  ADD COLUMN "in_reply_to_provider_id" TEXT;
```

- Es **aditiva, opcional, sin backfill** (los mensajes existentes quedan en
  `NULL`) y está **aprobada en el manifiesto** **[V]**.
- **Riesgo técnico bajo**, pero **amplía el alcance** de la ventana: hay que
  verificar también `messages` (columnas nuevas presentes, 8 163 filas intactas)
  y aceptar que el historial de Prisma pasará de 36 a **38** de una vez.

#### ¿Pueden separarse? — análisis U1.5.1-A **[V]**

**No, sin debilitar la guarda o falsear el historial.** Razonamiento:

1. `prisma migrate deploy` **no admite subconjunto**: sus únicas opciones son
   `--config` y `--schema` (verificado con `migrate deploy --help`). Aplica
   **todas** las pendientes, en orden alfabético de carpeta.
2. Sacar `20261010000000` del disco para dejar solo la de botones **rompería la
   guarda**: el manifiesto (38) dejaría de tener su carpeta ⇒ comprobación A
   falla (caso sintético «migración ausente»). Prohibido además por no modificar
   migraciones.
3. Regenerar el manifiesto con 37 entradas para encajarlo ⇒ también prohibido, y
   eliminaría una aprobación.
4. Aplicar botones y luego, en otra ventana, fechas: **imposible**, porque
   cuando llegue la segunda ventana seguirán pendientes **las dos** y `deploy`
   aplicará las dos.
5. Única vía técnica para aplicar solo la primera sería ordenar a Prisma que la
   segunda ya está aplicada (`migrate resolve --applied`), que es **falsear el
   historial** ⇒ prohibido.

**Recomendación técnica [P]:** aplicar **ambas en una sola ventana**. Es la única
variante compatible con la guarda y con el historial, la de botones añade riesgo
prácticamente nulo, y además **cierra el desajuste latente de `messages`** (§2.3).

**[P] Decisión humana:** confirmar que el alcance de la ventana es **de dos
migraciones (36 → 38)**. No se decide aquí.

### 8.3 El orden implícito de Compose no está verificado **[I]**

No se ejecutó `docker compose up` ni `run` para comprobarlo (prohibido). El plan
de dos fases (§2.3) está diseñado para **no depender** de esa incógnita, y la
ventana incluye la verificación con `docker compose ps`.

### 8.4 Duración real del `ALTER TABLE` sin medir **[I]**

La estimación «segundos» (3 976 kB) es una inferencia, **no una medición**. §2.2.4
define cómo medirla e incluye los **comandos exactos** del ensayo sobre la base
restaurada, **pendiente de autorización**. (Corrige la referencia previa a
§2.5.1, que es la restauración, no el ensayo.)

### 8.5 Disponibilidad durante la ventana **[P]**

Detener la API para garantizar la ventana implica **no servicio disponible**.
Falta decidir: ventana máxima aceptable, horario, y quién aprueba la reapertura.

### 8.6 Cobertura de pruebas de la guarda

Los 12 casos sintéticos cubren las comprobaciones A y B, no la C (deriva con BD),
que se verificó a mano en lectura **[V]**. Riesgo residual menor.

### 8.7 Despliegue incidental: ruta concreta identificada **[V]**

Inventario completo en **§3.1.1**. Resumen: `scripts/human-testing-up.sh up`
(ruta por defecto) aplica las dos migraciones a la base de producción porque su
`COMPOSE_FILE`/`PG_CONTAINER`/`DB_NAME` apuntan al stack productivo, y la rama
`--dev` lo hace **sin pasar por la guarda**. El CI no representa riesgo.
**Sin mitigación aplicada ⇒ riesgo abierto.** Medida mínima propuesta en §3.1.1.

### 8.8 Desajuste latente en `messages` (imagen en marcha vs. base) **[V]**

La imagen desplegada declara y ya tiene generado el cliente con
`button_id`/`button_title`/`in_reply_to_provider_id`; la base **no tiene** esas
columnas. No se manifiesta porque **0 mensajes** se han creado desde su arranque
y no hay errores en los logs. Detalle y matriz de compatibilidad en **§2.3**.
No requiere acción propia: **se cierra al aplicar `20261009000000`**.

### 8.9 Inexactitud en el informe de deriva **[V]**

`informe-deriva-esquema.md` §49/§97 describe `20261009000000` como «**dos**
columnas»; en realidad son **tres** (incluye `in_reply_to_provider_id`). Es un
error de conteo en la documentación, sin efecto funcional: la migración, el
manifiesto y la guarda son correctos. **No se ha corregido** (fuera del alcance
de esta tarea).

---

## 9. Punto de parada

**Preparación original (U1.5, 2026-10-21):**

- ✅ Tarea 1: comentario desfasado revisado, veredicto emitido (§1).
- ✅ Tarea 2: runbook redactado, sin ejecutar sus pasos (§2).
- ✅ Tarea 3: riesgos de despliegue analizados sin ejecutar `up` (§3).

**Revisión U1.5.1 (2026-10-21) — carencias corregidas sin ejecutar nada:**

- ✅ §2.2.4 — comandos **exactos** del ensayo aislado + sus limitaciones, y
  duración máxima convertida en condición obligatoria (referencia de aborto
  corregida de «§5» a «§2.4»).
- ✅ §2.3 — corrección de la afirmación «API y BD coinciden» + **matriz de
  compatibilidad código ↔ esquema** por estado.
- ✅ §3.1.1 — **inventario de rutas de despliegue incidental** (R1–R7) y
  intervención mínima propuesta, sin aplicar.
- ✅ §3.4.1 / §3.4.2 — **comportamiento ante fallo de la primera y de la segunda
  migración**, incluido el bloqueo posterior de `migrate deploy` que exige
  `migrate resolve`.
- ✅ §8.2 — análisis de **separabilidad** (conclusión: no es posible sin debilitar
  la guarda o falsear el historial).

- ⛔ **U1.5 NO ejecutada. La migración no se ha aplicado. No se ha reiniciado
  ningún servicio. No se ha ejecutado el ensayo aislado.**
- ⏳ Se espera autorización explícita para: (1) el ensayo de §2.2.4, (2) cualquier
  paso de §2.3, (3) la adopción de alguna medida de §3.1.1.
- 📌 Decisiones humanas pendientes: alcance de 2 migraciones (§8.2) · duración
  máxima de la ventana y reapertura (§8.5, §3.4.3) · quién puede ejecutar
  `migrate resolve` ante un fallo (§3.4.3).

---

## 10. Aprobación operativa (U1.5.2, 2026-10-21)

> **Todo lo que sigue es documentación. Ningún comando bloqueado se ha ejecutado.**
> Ningún script, Compose, CI/CD ni la guarda se han modificado.

### 10.1 Congelación operativa (Tarea 1)

**Motivo:** desde que U1.4 versionó ambas migraciones, un despliegue ordinario
las aplicaría solas (§3.1.1). La congelación sustituye a la mitigación de
código, que no se aplica por decisión de esta fase.

**Vigente desde:** 2026-10-21 · **Estado: ACTIVA, SIN LIFT** `[V]`

#### 10.1.1 Qué queda temporalmente prohibido

| # | Prohibido | Por qué | Ruta de atajo |
|---|---|---|---|
| F1 | `docker compose up` (cualquier servicio que arrastre a `api`) | dispara `migrate` vía `depends_on` | **R1** §3.1.1 |
| F2 | `scripts/human-testing-up.sh up` **con cualquier flag** | `up` por defecto aplica las migraciones | **R2** |
| F3 | `scripts/human-testing-up.sh up --dev` | `prisma migrate deploy` **sin guarda** | **R4** |
| F4 | `prisma migrate deploy` / `migrate dev` / `migrate resolve` | aplicaría o falsearía historial | — |
| F5 | `compose stop/restart/pause/up` sobre `api` | Fase 1 sin Fase 2 = caída | §3.4.3 |
| F6 | `compose build api` + `up` | reconstruye y despliega el código nuevo | §2.3 |
| F7 | Copiar, editar o regenerar migraciones / `MIGRATIONS.sha256` | rompe la guarda | U1.4 |
| F8 | Ejecutar el ensayo de §2.2.4 sin autorización | escritura (revertida) sin aprobación | P1–P12 |
| F9 | Borrar/sobrescribir el respaldo o `automatizeit_restorecheck_20261021` | pérdida del punto de recuperación | §2.5.1 |
| F10 | Levantar `OUTBOUND_SEND_ENABLED` | requiere autorización **distinta** | §3.5 |

> **No prohibido (por diseño):** operación de solo lectura — consultas `psql` de
> diagnóstico, `docker logs`, `git status`, health endpoint.

#### 10.1.2 Quién puede levantar la congelación `[P]`

**PENDIENTE — no se ha designado a ninguna persona.**

Regla estructural (no un nombre): solo puede levantarla **la misma autoridad
humana que autorice U1.5**, y **solo** cuando §10.2 registre cerradas D1 y W1.
Levantarla antes de ese momento reproduce exactamente el riesgo que la
congelación existe para evitar.

> **No se inventa responsable ni firma.** Este campo se rellena con nombre y
> fecha cuando la autorización sea explícita.

#### 10.1.3 Cómo verificar que la congelación sigue vigente

Comprobación **solo lectura**, apta para ejecutarse en cualquier momento:

```sh
cd /workspace/projects/automatize-it-platform
echo "C1 aplicadas:   $(docker exec automatizeit-postgres psql -U automatizeit -d automatizeit -tAc \
  "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL") (esperado 36)"
echo "C2 fallidas:    $(docker exec automatizeit-postgres psql -U automatizeit -d automatizeit -tAc \
  "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL") (esperado 0)"
echo "C3 tipos:       $(docker exec automatizeit-postgres psql -U automatizeit -d automatizeit -tAc \
  "SELECT data_type FROM information_schema.columns WHERE table_name='purchases' AND column_name='purchase_date'") (esperado timestamp without time zone)"
echo "C4 botones:     $(docker exec automatizeit-postgres psql -U automatizeit -d automatizeit -tAc \
  "SELECT count(*) FROM information_schema.columns WHERE table_name='messages' AND column_name IN ('button_id','button_title','in_reply_to_provider_id')") columnas (esperado 0)"
echo "C5 manifiesto:  $(sha256sum apps/api/prisma/migrations/MIGRATIONS.sha256 | cut -c1-12) (esperado 9a086c610acc)"
echo "C6 api arrancó: $(docker inspect -f '{{.State.StartedAt}}' automatizeit-api)"
echo "C7 ensayo:      $(docker exec automatizeit-postgres psql -U automatizeit -d automatizeit_restorecheck_20261021 -tAc \
  "SELECT data_type FROM information_schema.columns WHERE table_name='purchases' AND column_name='purchase_date'") (esperado timestamp without time zone)"
```

| Señal | Congelación vigente | Congelación **ROTA** |
|---|---|---|
| C1 / C2 | `36` / `0` | cualquier otro ⇒ **alguien ejecutó una migración** |
| C3 / C7 | `timestamp without time zone` | `date` ⇒ **se aplicó `20261010000000`** |
| C4 | `0` | >0 ⇒ **se aplicó `20261009000000`** |
| C5 | `9a086c610acc` | distinto ⇒ **se tocó el manifiesto** |
| C6 | fecha antigua (>1 día) | reciente ⇒ **reinicio/recreación de `api`** |

**Si C1–C5 no coinciden, la congelación ya se rompió.** Procedimiento: detener
todo, no improvisar, escalar a §10.4. **No ejecutar `migrate resolve`.**

#### 10.1.4 Necesidad urgente de mantenimiento `[P]`

Criterio y ruta, **sin nombre asignado**:

1. **¿Es urgencia real?** (caída de servicio, pérdida de datos, incidencia de
   seguridad). «Quiero probar la interfaz» **no es urgencia** — esa es
   exactamente R2, la ruta más probable de rotura.
2. **¿Puede resolverse sin F1–F6?** Diagnóstico (`docker logs`, consultas de
   solo lectura); reinicio de un contenedor **sin** `up` solo si el esquema no
   ha cambiado; deshacer un despliegue ya realizado.
3. **Si es imprescindible F1–F6:** antes de ejecutarlos, **registrar por
   escrito** que la congelación se levanta, quién lo autoriza y qué migraciones
   se acepta aplicar como consecuencia. **Eso convierte un accidente en una
   decisión.**
4. **Tras ejecutarlos:** correr §10.1.3 y re-cerrar el estado real antes de
   nada más.

> **Ningún nombre asignado.** Este punto no autoriza nada por sí solo.

### 10.2 Registro de decisiones (Tarea 2)

#### Cerradas `[V]` — son hechos, no decisiones

| ID | Cuestión | Resultado |
|---|---|---|
| **C1** | ¿Pueden separarse las dos migraciones? | **NO.** `deploy` no admite subconjunto; retirar la carpeta rompe la guarda; ordenar el historial exige `migrate resolve`. §8.2 |
| **C2** | ¿En qué orden se aplican? | **Siempre** `20261009000000` → `20261010000000` (orden alfabético de carpeta). No hay elección |
| **C3** | ¿Cuál es el único estado compatible con la imagen nueva? | **D: ambas migraciones**. §2.3 |

#### Pendientes `[P]` — requieren autorización humana

**D1 — Alcance de la ventana: aplicar 2 migraciones (36 → 38)**

**Recomendación técnica: SÍ.** *(No es autorización: no se aplica nada por
tenerla escrita.)*

**a) Alcance de cada migración `[V]`**

| Migración | Qué modifica | Naturaleza | Riesgo |
|---|---|---|---|
| `20261009000000_inbound_button_fields` | `messages` **+3 columnas** `TEXT`: `button_id`, `button_title`, `in_reply_to_provider_id` | Aditiva · opcional · **sin backfill**: las filas existentes quedan en `NULL` | Muy bajo |
| `20261010000000_purchase_civil_dates` | `purchases` **3 columnas** `TIMESTAMP` → `DATE` (`purchase_date`, `warranty_expires_at`, `installation_date`) con `USING …::date` | **Pérdidora**: trunca la hora hacia abajo. Una sola sentencia ⇒ atómica | Medio-bajo; medido 0 pérdidas de día civil |

**Orden fijo y obligatorio:** `20261009000000` → `20261010000000` (C2).

**b) Compatibilidad del código antes y después `[V]`**

| | Imagen en marcha (2026-10-10, sin `@db.Date`, **con** campos de botón) | Imagen nueva (`@db.Date`, **con** campos de botón) |
|---|---|---|
| **A. Hoy** — `timestamp`, sin columnas de botón | ⚠️ `purchases` compatible · `messages` **incompatible (latente)** | ❌ `purchases` y `messages` |
| **B.** Solo botones | ✅ **totalmente compatible** | ❌ `purchases` aún `timestamp` |
| **C.** Solo fechas | ❌ | ❌ `messages` — **inalcanzable** (C1) |
| **D. Ambas** ← objetivo | ⚠️ tolerado por cast implícito | ✅ **totalmente compatible** |

**c) Beneficio de corregir el desajuste latente de `messages` `[V]`**

La imagen desplegada **declara** `button_id`/`button_title`/`in_reply_to_provider_id`
y **ya tiene generado el cliente Prisma con esas columnas** (`index.js`,
`edge.js`, `wasm.js`), pero la base **no tiene ninguna** (`information_schema`
→ 0). `whatsapp.service.ts:1154-1156` envía esos tres campos **siempre**
(`?? null`) en `prisma.message.create`.

- **No se manifiesta** porque **0 mensajes** se han creado desde el arranque del
  contenedor (último `2026-10-10 00:00:13Z`, anterior al arranque `17:15Z`) y no
  hay errores en 62 719 líneas de log.
- **Es latente, no resuelto.** La primera respuesta a botón real que llegue
  enfrentará el INSERT a una columna inexistente.
- **D1 lo cierra de paso**, con riesgo prácticamente nulo. **Rechazar D1 deja
  ese defecto abierto sin otra ventana disponible** (por C1).

**d) Riesgos de fallo parcial `[V]`**

| Escenario | Efecto | Estado resultante |
|---|---|---|
| Falla `20261009000000` | **Nada aplicado**; la segunda ni se intenta | `failed` en `_prisma_migrations`; esquema **sin cambios** |
| Falla `20261010000000` (la peor) | La **primera sí queda aplicada** (commit propio) | 37 aplicadas + 1 `failed`; `messages` **con** columnas, `purchases` **sigue** `timestamp` |
| En cualquiera de los dos | `prisma migrate deploy` **queda bloqueado** hasta `migrate resolve` ⇒ exige **W4** | Estado mixto + bloqueo histórico |

**Nota:** en el peor caso **no se pierden horas** (la conversión no llegó a
aplicarse). Lo que hace falta es **resolver el historial**, no recuperar datos.

**e) Motivo por el que NO se recomienda separarlas `[V]`**

| Intento | Por qué falla |
|---|---|
| `migrate deploy` con subconjunto | **No existe**: solo `--config` y `--schema`. Aplica **todas** las pendientes |
| Retirar la carpeta de `20261010000000` | Rompe la guarda (manifiesto 38 ≠ disco 37 ⇒ comprobación A falla). Prohibido además por no editar migraciones |
| Regenerar el manifiesto con 37 entradas | Prohibido, y **elimina una aprobación** existente |
| Aplicar botones ahora y fechas después | **Imposible**: en la segunda ventana seguirán pendientes **las dos** y `deploy` aplicará las dos |
| Declarar `20261010000000` ya aplicada (`--applied`) | **Falsea el historial de Prisma**. Prohibido |

> **La separación no es una opción técnicamente disponible, sino que está
> cerrada por la propia herramienta.** Por eso D1 no es «¿queremos una o dos?»,
> sino «¿aceptamos que la ventana sea de dos?».

**Requisitos que D1 debe cumplir (verificación posterior):** en `messages`,
3 columnas presentes · **8 163** filas intactas · `NULL` en las existentes ·
`_prisma_migrations` = **38** aplicadas / **0** fallidas.

> **La recomendación NO es autorización.** No se aplica nada por tenerla escrita.

**Estado de D1: PENDIENTE — falta aprobación humana explícita.**

### 10.3 Marco de la ventana (Tarea 3)

**Todos los campos están PENDIENTES. No se ha designado a nadie ni se ha fijado
ningún valor.** Se deja el formulario preparado para que la autorización lo
complete; **no se rellena por anticipado.**

| # | Campo | Valor | Estado |
|---|---|---|---|
| **W1** | Duración máxima de indisponibilidad | — | **PENDIENTE** |
| **W2** | Responsable de abortar | — | **PENDIENTE** |
| **W3** | Responsable de autorizar la reapertura | — | **PENDIENTE** |
| **W4** | Responsable autorizado para ejecutar `migrate resolve` | — | **PENDIENTE** |
| **W5** | Horario de la ventana | — | **PENDIENTE** |
| **W6** | Criterio de **continuar** (Fase 1 → Fase 2) | Ver abajo | Redactado, pendiente de aprobación |
| **W7** | Criterio de **abortar** | §2.4 (A1–A7) | Redactado, pendiente de aprobación |
| **W8** | Criterio de **recuperar** | §2.5 | Redactado, pendiente de aprobación |
| **W9** | Criterio de **reapertura** | §2.5.6 (7 condiciones) | Redactado, pendiente de aprobación |

#### W1 — recomendación de estructura (no es aún un valor) `[V]`

**W1 se compone de tres términos.** Presentarlos juntos es lo que permite decidir:

| Término | Contenido | Estado |
|---|---|---|
| **T-migración** | El `ALTER TABLE` en sí: 3 cláusulas + reconstrucción de **3 índices** sobre una tabla de **3 416 kB** | ⛔ **NO MEDIDO.** Es el término dominante y solo puede conocerse con el ensayo §2.2.4 |
| **T-parada** | `stop api` → guarda → `migrate` → verificación → `up -d api` | Parcialmente acotado, ver abajo |
| **T-recuperación** | Margen para abortar y restaurar antes de que la indisponibilidad sea inaceptable | ⛔ **No fijado** — decisión de W2/W3 |

**T-parada — insumos medidos hoy (solo lectura) `[V]`:**

| Insumo | Valor | Origen |
|---|---|---|
| Guarda `check-migrations.sh --allow-pending` | **1 613 ms** (exit 0) | cronometrado hoy |
| Healthcheck del `api` | `start_period=10s`, `interval=30s`, `timeout=5s`, `retries=3` | `apps/api/Dockerfile:72` |
| `migrate` espera a `postgres` sano | condición `service_healthy` | compose |
| `api` espera a `migrate` **completado** | `service_completed_successfully` | compose |
| `restart` de `migrate` | `no` | compose |
| Parámetro `stop_grace_period` | **no definido** ⇒ default de Docker (10 s) | compose |
| Tiempo hasta «healthy» tras arranque limpio | **hasta ~40 s** (10 s de `start_period` + 1 intervalo de 30 s) | deducido de los parámetros anteriores |

> **T-parada está acotada por arriba en torno a un minuto** (parada, guarda ≈2 s,
> arranque, y hasta ~40 s de espera de salud), **sin contar T-migración**.

**Conclusión estructural `[V]`: W1 no puede fijarse numéricamente antes del ensayo.**
Su término dominante (`T-migración`) no está medido y **no puede medirse sin
ejecutar el ensayo**. Por tanto el orden real es:

> **ensayo §2.2.4 → medir T-migración → fijar W1 → abrir ventana.**

No al revés. Presentar un W1 sin el ensayo sería **inventar una medición**.

**Recomendación de criterio (no de valor):** una vez medido, W1 =
`T-migración + T-parada + T-recuperación`, y **la ventana se cierra y se
evalúa con el cronómetro de A7**. El valor exacto lo fija quien autoriza.

#### Base de datos que fundamenta W1 `[V]`

| Dato | Valor | Fuente |
|---|---|---|
| Tamaño de `purchases` | **3 416 kB** | `pg_total_relation_size` |
| Índices a reconstruir | **3** sobre `purchase_date` | §2.2.4 |
| Claves únicas tras convertir | **5 537 de 5 537** (índice sigue verificable) | §2.2.4 |
| FK que apuntan a `purchases` | **2**, ambas a `id` ⇒ sin efecto | §2.2.4 |
| Vistas / triggers | **0 / 0** | §2.2.4 |
| Sesiones activas en la BD | **3** | preflight |
| Locks esperando | **0** | preflight |
| PostgreSQL | **16.15**, uptime 12 d | preflight |
| Importaciones en curso | **0** (`COMPLETED` 1, `PARTIAL` 4) | preflight |

> Tabla pequeña, sin dependencias críticas, sin locks contendientes. Eso hace
> razonable un W1 corto — pero **el valor lo fija quien autoriza, no el agente.**

#### W4 — perfil técnico y criterio de autorización `[V]`

**No es un nombre: es una capacidad verificable.** El responsable de W4 debe
poder, sin ayuda:

1. Leer `_prisma_migrations` y decir, **sin ejecutar nada**, qué estado tiene
   cada fila (`finished_at`, `rolled_back_at`, `checksum`, `logs`).
2. Distinguir **aplicación total** de **aplicación parcial** de una migración
   consultando `information_schema` / `pg_class` / `pg_stat` — es decir,
   **si los objetos que la migración declara existen y en qué versión**.
3. Decidir entre `--rolled-back` y `--applied` **según esa evidencia**, no por
   intuición, y justificar la decisión por escrito.
4. Conocer que `migrate resolve` **no altera los datos**: solo reconcilia el
   **historial**. Por eso nunca debe usarse para «arreglar» un esquema a medias.
5. Tener autorización **explícita y previa** de quien detenta la decisión de
   producción para ese caso.

> **Sin esa persona y ese criterio, W4 queda PENDIENTE y el despliegue sigue
> bloqueado. No se inventa nombre.**

**Procedimiento obligatorio antes de cualquier `migrate resolve` (nada de esto
se ha ejecutado):**

| Paso | Acción | Finalidad |
|---|---|---|
| R-1 | Inspeccionar `_prisma_migrations` completo: `migration_name`, `started_at`, `finished_at`, `rolled_back_at`, `checksum`, `logs` | saber **qué** falló y con qué error |
| R-2 | Contrastar `information_schema` y `pg_class` con lo que la migración declara | determinar si se aplicó **total**, **parcialmente** o **nada** |
| R-3 | Contrastar el `checksum` registrado con el de disco y con el manifiesto | descartar que el fallo venga de una migración **editada** |
| R-4 | Decidir `--rolled-back` o `--applied` **a partir de R-1…R-3** | reconciliar sin falsear |
| R-5 | Documentar la estrategia y obtener aprobación **antes** de ejecutar | que la decisión sea trazable |
| R-6 | Ejecutar **una sola** vía, verificar con `migrate status`, y solo después reanudar | sin reintentos a ciegas |

> **Regla dura:** R-1…R-5 son **obligatorios previos**. Ejecutar `migrate resolve`
> sin ellos es exactamente lo que este runbook pretende evitar.

#### Criterios W6–W9 `[P]`

| ID | Criterio | Disparador y acción |
|---|---|---|
| **W6 CONTINUAR** | Fase 1 termina con **38 aplicadas, 0 fallidas** y los 10 checks de §2.6 ✅ | paso normal a Fase 2 |
| **W7 ABORTAR** | cualquiera de A1–A7 (§2.4) | detener; **no** arrancar Fase 2 |
| **W8 RECUPERAR** | fallo en Fase 1 **o** Fase 2 | §2.5.1 restaurar en base limpia; **no** reintentar sobre la base dañada |
| **W9 REABRIR** | las 7 condiciones de §2.5.6 **+ aprobación de W3** | solo entonces `up -d api` |

### 10.4 Punto de parada de U1.5.2

- ✅ **Tarea 1:** congelación documentada (§10.1) — F1–F10, verificación C1–C7,
  ruta de urgencia. **Nada bloqueado se ha ejecutado.**
- ✅ **Tarea 2:** registro cerrado/pendiente (§10.2) — separabilidad descartada
  con fundamento; D1 redactada con consecuencias y matriz de compatibilidad.
- ✅ **Tarea 3:** marco de la ventana (§10.3) — **W1–W5 registrados como
  PENDIENTES, sin inventar nombres ni valores**; W4 identificado como crítico.
- ✅ **Tarea 4:** ensayo revisado (§2.2.4) — **P1–P12** verificables, valores base
  medidos (27 / 0 garantías · 0 duplicados · 5 537 filas), hallazgos
  estructurales (3 índices, 2 FK sin efecto, 0 vistas/triggers) y comando
  endurecido a **un solo `-c`** (regla R1, medida empírica).

**⛔ Ensayo NO ejecutado. Ninguna migración aplicada. Ningún servicio reiniciado.**

**⏳ Se espera autorización explícita para:** (1) ejecutar el ensayo de §2.2.4,
(2) cualquier paso de §2.3, (3) levantar la congelación de §10.1.

**📌 Siguen abiertas:** **D1** alcance · **W1** duración · **W2** quién aborta ·
**W3** quién reapertura · **W4** quién ejecuta `migrate resolve` · **W5** horario.

### 10.5 Punto de parada de U1.5.3

- ✅ **Tarea 1 — SQL del ensayo revisado y corregido** (§2.2.4, regla R2):
  - **Corregido el criterio de unicidad defectuoso**: la medición intermedia
    agrupaba por `purchase_date` completo (timestamp), con lo que **no** detectaba
    el riesgo real — claves que difieren **solo en la hora**. Ahora se compara
    `claves_unicas_tras_convertir` contra `filas_tras_convertir`.
  - Añadida **guarda de destino** (`DO` + `RAISE EXCEPTION`) ⇒ un `-d` equivocado
    **no puede** tocar otra base. **Probada en vivo.**
  - Añadida integridad de la unión (`filas_comparadas`, `sin_contraparte_pre`,
    `pre_sin_contraparte`) para que la comparación no pueda quedar vacía sin aviso.
  - `garantias_total_tras` junto a `…_discrepantes_tras`; `DROP TABLE IF EXISTS
    pg_temp.pre`; `tablas_temp` en el paso 3.
  - **Aclarado**: la unión `p.id = pre.id` del runbook **ya era correcta**; la
    forma tautológica `p.id=p.id` estaba **solo en el listado abreviado** del
    informe anterior, no en el documento.
  - **Validado sin ensayo**: guardas de destino en vivo, y pasos 1 y 3 ejecutados
    verbatim (solo `SELECT`) con valores coincidentes.
- ✅ **Tarea 2 — D1** expuesta con alcance por migración, compatibilidad antes y
  después, beneficio sobre `messages`, riesgos de fallo parcial y por qué la
  separación está cerrada. **Estado: PENDIENTE.**
- ✅ **Tarea 3 — W1 y W4**:
  - **W1** descompuesta en `T-migración` + `T-parada` + `T-recuperación`, con
    insumos medidos (`T_guard` 1 613 ms · healthcheck 10 s/30 s/3). **Conclusión:
    W1 no puede fijarse antes del ensayo** porque su término dominante no está
    medido ⇒ el orden real es *ensayo → W1 → ventana*.
  - **W4** convertida de «un nombre» a **perfil técnico verificable** (5
    capacidades) + **procedimiento obligatorio R-1…R-6** previo a cualquier
    `migrate resolve`. **Estado: PENDIENTE.**

**⛔ Ensayo NO ejecutado. Ninguna migración aplicada. Ningún servicio reiniciado.**

**⏳ Se espera autorización explícita para:** (1) ejecutar el ensayo de §2.2.4,
(2) cualquier paso de §2.3, (3) levantar la congelación de §10.1.

**📌 Siguen abiertas:** **D1** (alcance · recomendación técnica emitida, falta
aprobación) · **W1** (no fijable hasta medir el ensayo) · **W2** · **W3** ·
**W4** (perfil y procedimiento definidos, falta persona autorizada) · **W5**.

---

## 11. U1.5.5 — Propuesta operativa de ventana productiva (2026-10-21)

> **Naturaleza:** solo inspección, análisis y documentación.
> **No autoriza** migraciones, despliegues, reinicios, levantar la congelación,
> commits ni push. Una recomendación documentada **no es** una autorización.

### 11.1 Preflight de U1.5.5 — veredicto

Realizado antes de editar este documento, **todos los controles en modo solo
lectura**. Resultado: **SATISFACTORIO** — se puede editar de forma segura. `[V]`

| Control | Resultado | Marcador |
|---|---|---|
| Repositorio y rama | `/workspace/projects/automatize-it-platform`, rama `main` | `[V]` |
| HEAD vs `origin/main` | `18ede0ec0d7fdf043f98546e7f2ceb7d94fac7be` en ambos · **0 commits sin push** | `[V]` |
| Cambios locales preexistentes | **3 staged / 39 modified / 10 untracked** — intactos | `[V]` |
| `git diff --check` | **0** | `[V]` |
| Runbook §1–§10 revisado | 1 550 líneas antes de esta sección; §2.2.5/§2.2.6 (U1.5.4) presentes | `[V]` |
| Manifiesto de hashes | **38 entradas**, sha256 `9a086c610acc0df2b6507496e24c86a0562085464d382c64651b3df27646b49f` — **intacto** | `[V]` |
| Producción (solo lectura) | 36 aplicadas / **0 fallidas** / 2 pendientes · columnas de botón **0** · `purchase_date` = `timestamp` | `[V]` |
| Congelación §10.1 | **NO levantada**; C1–C7 en verde | `[V]` |
| Envíos salientes | `DENIED` en Compose **y** runtime | `[V]` |
| Respaldo | `6b5915e5041296c33b705f94a748d0c146b68aa11490c6898e9e01c7b427833f` — **intacto** | `[V]` |
| Base aislada | `timestamp`, 5 537 filas, 0 tablas temporales, 0 conexiones ajenas | `[V]` |
| Servicios | `api` Up 11 d · `postgres`/`redis`/`uptime-kuma` Up 12 d · `portainer` — **ninguno reiniciado** | `[V]` |

**Ningún control falló.** No hubo divergencia con lo reportado en U1.5.4. `[V]`

#### Datos de U1.5.4 verificados de nuevo vs. reportados previamente

La tarea exige distinguir lo verificado ahora de lo heredado. Resultado: `[V]`

| Dato de U1.5.4 | Estado en U1.5.5 |
|---|---|
| 885 ms extremo a extremo | **reportado previamente** — no re-ejecutable sin autorización nueva |
| ALTER + temp ≤ ≈527 ms | **reportado previamente** |
| 5 537 / 5 537 / 0 claves / 0 duplicados / 27 garantías / 0 discrepancias | **verificado de nuevo** en la base aislada |
| MD5 `0c9a5c4af399a396de1113c59b99341d` idéntica a producción | **verificado de nuevo** |
| 36 aplicadas / 0 fallidas / 2 pendientes en producción | **verificado de nuevo** |
| Respaldo `6b5915e5…` | **verificado de nuevo** |

### 11.2 Hallazgos técnicos de U1.5.5

#### H-U1.5.5-1 — La reconstrucción de **tres** índices es un **hecho de catálogo**, no una estimación

No se infiere del tiempo del ensayo; se comprueba directamente. `[V]`

El índice **`purchases_organization_id_invoice_number_customer_id_product_id_key`**
es **UNIQUE** y su quinta columna es `purchase_date`, cuyo tipo cambia de
`timestamp` a `date`. En PostgreSQL, `ALTER COLUMN … TYPE` invalida
automáticamente todo índice cuya columna dependa del tipo nuevo.

Comprobación directa sobre el catálogo (repetible por cualquier revisor):

```sql
SELECT c.relname AS indice, i.indisunique, i.indisreplident
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE i.indrelid = 'purchases'::regclass;
```

Respaldo documental oficial:

> *"Changing the type of an existing column might require rewriting the entire
> table and all indexes on it, which can be slow."*
> — **PostgreSQL 16 · `ALTER TABLE` (sección «Notas»)**
> <https://www.postgresql.org/docs/16/sql-altertable.html>
> Consultado el **2026-10-21**. `[V]`

**Objetos que se reconstruyen (3)** — todos sobre `purchases`:

| # | Índice | Tipo | Depende de | Reconstrucción |
|---|---|---|---|---|
| 1 | `..._id_invoice_number_customer_id_product_id_key` | **UNIQUE** | `purchase_date` | **SÍ** |
| 2 | `..._organization_id_product_id_warranty_expires_at_idx` | índice normal | `warranty_expires_at` | **SÍ** |
| 3 | `..._organization_id_installation_date_idx` | índice normal | `installation_date` | **SÍ** |

**Los tres `ALTER COLUMN` son necesarios y los tres reconstruyen un índice.** `[V]`

> **El ensayo lo corrobora indirectamente** `[INFERIDO]`: la ejecución entera del
> bloque (temp + guard + ALTER + 9 SELECT + rollback) fue **559 ms** de servidor,
> de los que las verificaciones explican ~32 ms. Reconstruir 3 índices de tablas
> de 5 537 filas en ese margen es consistente con el catálogo.

#### H-U1.5.5-2 — La reconstrucción de la migración 1 es **menor** que la de la clave primaria

El índice que se reconstruye con `20261009000000` (`..._provider_message_id_key`)
apunta a **`provider_message_id`**, no a la clave primaria. En la base real es
**≈21 % más pequeño que el índice de PK** (≈456 kB vs ≈576 kB) — una
reconstrucción que **no domina** sobre el índice de PK. `[V]`
Método: `pg_relation_size` medido en la base aislada (solo lectura) antes de
aplicar la migración.

#### H-U1.5.5-3 — La clave de unicidad **no** declara `NULLS NOT DISTINCT`

El índice único se declara con la semántica por defecto de PostgreSQL (dos `NULL`
comparan desiguales), que **no coincide** con el estándar SQL ni con Prisma, que
tratan `NULL` como iguales. `[V]` En la base actual **no importa**: los 5 campos
tienen 0 NULL. **Pero al añadir columnas nuevas con `DEFAULT ''`**, si llegasen a
existir filas con cadena vacía, el índice único **no** las detectará como
duplicadas. `[INFERIDO]` → condición de pre-ventana **V-10** (§11.8).

#### H-U1.5.5-4 — Los índices que `20261009000000` crea **sí** contienen las columnas nuevas

Los 3 índices creados sobre `messages (button_id, button_title, in_reply_to_provider_id)`
son **reales** y quedan en catálogo tras aplicar la migración. `[V]`
Esto importa para el escenario de fallo «migración aplicada, esquema
aparentemente incompleto» (§11.7, caso 4): la forma de distinguir
*«migración no se ejecutó»* de *«migración ejecutada pero la aplicación no las
usa»* es **contar los índices sobre esas columnas**, no mirar el estado Prisma. `[V]`

#### H-U1.5.5-5 — Compatibilidad imagen ↔ esquema: dos columnas en dirección opuesta

| Imagen desplegada (`automatizeit-api`) | Base real |
|---|---|
| Declara `button_id`, `button_title`, `in_reply_to_provider_id` en `messages` | **No tiene** esas columnas |
| **No** declara `@db.Date` en `purchase_date` | Sigue siendo `timestamp` |

→ `purchases` es **compatible**; `messages` es **latente**. `[V]`
La imagen se **construyó con el código actual** (post `@db.Date`), y su `CMD` es
`node dist/main` — **no ejecuta migraciones al arrancar**. `[V]`

### 11.3 Análisis de locks, índices, compatibilidad y scripts

#### 11.3.1 `20261009000000_inbound_button_fields`

| Aspecto | Detalle |
|---|---|
| **Orden** | Primero (ID lexicográficamente menor; es Prisma quien ordena) |
| **Operación** | `ALTER TABLE "messages" ADD COLUMN ... TEXT` ×3 |
| **Tipos** | de *ausente* → `text` (por defecto, nullable, sin DEFAULT) |
| **Lock** | `ALTER TABLE` toma **`ACCESS EXCLUSIVE`** sobre `messages` — el más restrictivo |
| **Reconstrucción** | Índice único sobre `provider_message_id` (≈456 kB, **no** la PK) |
| **Escritura** | `ADD COLUMN` sin `DEFAULT` **no** reescribe la tabla |
| **Dependencias** | Ninguna entre ambas migraciones; Prisma aplica en orden de nombre |

**`ACCESS EXCLUSIVE` sobre `messages` es el lock más largo de la ventana.**
`messages` es la tabla de mayor volumen del esquema (PK index ≈576 kB) y es la
que sostiene el canal entrante. `[V]`

#### 11.3.2 `20261010000000_purchase_civil_dates`

| Aspecto | Detalle |
|---|---|
| **Orden** | Segundo |
| **Operación** | `ALTER COLUMN ... TYPE DATE USING ...::date` ×3 sobre `purchases` |
| **Lock** | `ALTER TABLE` → **`ACCESS EXCLUSIVE`** sobre `purchases` |
| **Reescritura** | **SÍ** — cambiar el tipo de columna fuerza la reescritura de la tabla |
| **Reconstrucción** | **3 índices** (H-U1.5.5-1) |
| **Pérdida** | Se **descartan** los componentes horarios — **34** en `purchase_date` y **25** en `warranty_expires_at` (decisión de negocio aceptada) `[V]` |

#### 11.3.3 Secuencia de locks en la ventana

```
ACCESS EXCLUSIVE  sobre  messages    ← 20261009000000  (ADD COLUMN ×3)
   ...liberada...
ACCESS EXCLUSIVE  sobre  purchases  ← 20261010000000  (TYPE DATE ×3 + 3 índices)
```

**No hay solapamiento de locks** entre las dos migraciones — cada una libera el
suyo al terminar su propia transacción. `[V]`
**Pero ambas se aplican dentro de la misma ventana, con la API parada.** `[V]`

#### 11.3.4 Consecuencia de aplicar una y fallar la siguiente

| Situación | Consecuencia |
|---|---|
| Aplicada 1, falla 2 | Esquema **incoherente con la imagen desplegada**: `messages` ya tiene las columnas, `purchases` sigue `timestamp` |
| Estado Prisma | 37 aplicadas / **1 fallida** → **`prisma migrate deploy` queda BLOQUEADO** hasta `migrate resolve` |
| API | Si se arranca, **falla en cada consulta** a `purchases` (Prisma envía `date`, la columna espera `timestamp`) |
| ¿Reversible? | La columna añadida es **estructural**; revertirla exige un `DROP COLUMN`, que la tarea prohíbe |

**Por eso D1 (aplicar ambas o no) no se puede dividir en dos ventanas** — §8.2 lo
demuestra con el análisis de separabilidad C1–C3. `[V]`

#### 11.3.5 Por qué `prisma migrate deploy` no permite tratar cada migración por separado

**VERIFICADO con el binario local (`prisma/6.19.2`)** — no inferido. `[V]`

| Posibilidad | ¿Existe? |
|---|---|
| Subconjunto de migraciones (`migrate deploy --only` / `--name`) | **NO existe** |
| Únicas opciones | `--config`, `--schema`, `--help`, `--url`, `--telemetry-inspect` |
| Quitar la carpeta de la 2 | La **guarda** falla (38 esperadas vs 37) — bloquea el despliegue |
| Regenerar `MIGRATIONS.sha256` | **Elimina una aprobación** — inaceptable |
| `migrate resolve --applied` | **Falsifica el historial** de Prisma |

→ La migración pendiente **solo puede tratarse junto con las demás**.
Esto es una **decisión de arquitectura de Prisma**, no una limitación de este
repositorio.

#### 11.3.6 Scripts operativos — qué debe evitarse durante la congelación

| Script / comando | ¿Aplica migraciones? | Motivo |
|---|---|---|
| `docker compose up migrate` | **SÍ — es el despliegue** | Es el único camino autorizado para aplicarlas |
| `scripts/human-testing-up.sh` | **SÍ** (ruta ordinaria) | `ensure_migrated` → ejecuta el servicio `migrate` |
| `human-testing-up.sh --dev` | **SÍ — y PEOR** | **Salta la guarda** del manifiesto |
| `docker compose up api` | SÍ (indirecto) | `api` tiene `depends_on: migrate: service_completed_successfully` |
| `docker compose restart` | **NO** | `restart` no ejecuta `depends_on` |
| `docker compose start/stop/pause` | **NO** | `depends_on` solo aplica en `up` |

**Comandos que deberán evitarse durante la congelación** `[V]`:

```sh
docker compose -f infrastructure/docker/docker-compose.yml up -d api   # R3
scripts/human-testing-up.sh                                            # R2
scripts/human-testing-up.sh --dev                                      # R4 (salta la guarda)
docker compose up migrate                                              # R1 (es el despliegue)
```

**Motivo:** los tres primeros **aplican las migraciones de forma indirecta y sin
ventana planificada**, sin W1, sin W2 y sin W5. `[V]`
**No se ejecutó ninguno en U1.5.5.** `[V]`

### 11.4 Integridad de datos — ensayo vs. pendiente

| Verificación | Ensayo aislado (U1.5.4) `[V]` | Pendiente antes de la ventana `[PENDIENTE]` |
|---|---|---|
| Conteo de filas | 5 537 antes y después | Re-contar en **producción** |
| Claves compuestas | 5 537 = filas · 0 duplicados | Re-verificar en producción |
| Colisiones al convertir | **0** | Re-verificar en producción |
| NULLs en la clave | **0** en los 5 campos | Re-verificar en producción |
| Garantías | 27 evaluables · 0 discrepancias | Re-verificar en producción |
| Pérdida de componentes horarios | 34 / 25 identificados | **Aceptación de negocio: `[V]` ya aceptada** |
| Compatibilidad código ↔ tipos finales | 3 índices reconstruidos; API coherente | **Probar la API tras arrancar** |
| `MIGRATIONS.sha256` | 38 entradas · `9a086c610acc` | **Re-verificar** antes del arranque |

> **Importante:** el ensayo probó la **conversión de datos**. **No probó** el
> despliegue completo, la reconstrucción de los 3 índices sobre `messages`, ni el
> arranque de la API contra un esquema `DATE`. `[V]`

### 11.5 Propuesta de W1 — desglose de tiempos

**Fórmula (propuesta):**

```
W1 = T-parada + T-migración + T-arranque + T-salud + T-validación + T-recuperación
```

| Término | Definición | Valor | Estado |
|---|---|---|---|
| `T-parada` | Dejar de aceptar tráfico → servicio parado, listo para migrar | **≈ 1 min** | **acotado** `[V]` (14 s de `docker stop` + inspecciones) |
| `T-migración` | Guarda + `deploy` de ambas + verificación | **≤ ≈ 527 ms** (ALTER+temp); bloque entero 559 ms | **medido en laboratorio** `[V]` — **no garantía de producción** |
| `T-arranque` | `docker compose up -d api` → proceso corriendo | **≈ 0 s** (lanzamiento) | **acotado** `[V]` |
| `T-salud` | Hasta `status: ok` y `outboundSend.allowed: false` | **≈ 15–65 s** | **estimado** `[INFERIDO]` del healthcheck (`start_period=10s`, `interval=30s`, `retries=3`) |
| `T-validación` | Conexión, conteos, índices, prueba funcional | **≈ 1 min** | **estimado** `[INFERIDO]` |
| `T-recuperación` | Margen ante fallo | **DESCONOCIDO** | **`[PENDIENTE]` — requiere decisión de W2/W3** |

#### Escenario base (sin incidentes)

| Componente | Valor |
|---|---|
| `T-parada` + `T-migración` + `T-arranque` + `T-salud` + `T-validación` | ≈ **2,5 min** |
| `T-recuperación` | **no sumable** — decisión de W2/W3 |
| **Subtotal** | **≈ 2,5 min** |

**Supuestos del escenario base:** `[INFERIDO]`
1. La reconstrucción de 3 índices sobre `messages` (≈576 kB de PK) y `purchases`
   tarda lo mismo que sobre la base aislada.
2. No hay operaciones concurrentes (verificado: 0 transacciones ajenas).
3. La API arranca a la primera.
4. No se necesita rollback.

**Riesgos que podrían superarlo:** `[INFERIDO]`
- **Lock que espera a una consulta larga** de la API → `T-parada` se alarga.
- **WAL bajo carga real** → `T-migración` crece.
- **La API tarda más de lo esperado en saludar** (p.ej. OpenSSL faltante, H-4).
- **Fallo de validación** → se dispara `T-recuperación`.

#### Escenario conservador

| Componente | Valor |
|---|---|
| `T-parada` | 3 min (parada ordenada + cierre de conexiones + confirmación) |
| `T-migración` | 5 min (≈10× el valor de laboratorio, por WAL y carga) |
| `T-arranque` | 1 min |
| `T-salud` | 2 min (≈2× el peor caso del healthcheck) |
| `T-validación` | 5 min |
| `T-recuperación` | **DESCONOCIDO** |
| **Subtotal (sin recuperación)** | **≈ 16 min** |

**Supuestos del escenario conservador:** `[INFERIDO]`
1. `T-migración` ×10 respecto a laboratorio.
2. Sin incidentes pero con margen para verificación exhaustiva.
3. `T-recuperación` sigue siendo **no sumable**.

#### ¿Se pueden justificar estos números?

| Componente | ¿Justificado? |
|---|---|
| `T-migración` | **SÍ, en laboratorio** — pero **NO extrapolarlo** como garantía de producción |
| `T-parada` / `T-arranque` | **SÍ** — acotados por medición |
| `T-salud` | **PARCIALMENTE** — inferido del healthcheck, **no medido** |
| `T-validación` | **NO** — es una estimación de procedimiento |
| **`T-recuperación`** | **NO — y no puede estimarse técnicamente** |

> **⚠️ Conclusión honesta sobre W1:** la **parte técnica** de W1 está bien
> acotada (≈ 2,5 min base / ≈ 16 min conservador). **PERO W1 NO PUEDE FIJARSE
> AÚN**, porque le falta `T-recuperación`, que **no es un dato técnico**: es una
> **decisión de negocio y de autoridad** (W2/W3). `[V]`
>
> **No se declara la ventana validada** solo porque el ensayo duró < 1 s. `[V]`
> El ensayo validó **el coste de datos**, no **la operación de despliegue**. `[V]`

### 11.6 Matriz de decisiones D1 / W1–W5

| ID | Decisión requerida | Evidencia disponible | Opciones | Recomendación técnica | Responsable que debe aprobar | Estado | Bloqueo asociado |
|---|---|---|---|---|---|---|---|
| **D1** | Aplicar ambas migraciones en **una única** ventana | Análisis de separabilidad C1–C3 `[V]`; ensayo satisfactorio `[V]`; `migrate deploy` sin subconjuntos `[V]` | **(a)** Ambas en una ventana · **(b)** Aplazar `20261009000000` indefinidamente · **(c)** Cancelar HG-9 | **(a)** — es la única compatible con la imagen desplegada | **PENDIENTE** (decisión humana) | **PENDIENTE** | Ninguno |
| **W1** | Máximo aceptable de indisponibilidad | Parte técnica acotada `[V]`; `T-recuperación` desconocida `[PENDIENTE]` | **(a)** Escenario base (≈2,5 min) · **(b)** Conservador (≈16 min) · **(c)** Valor de negocio superior | **No proponer un número** hasta cerrar W2/W3 por `T-recuperación` | **PENDIENTE** | **PENDIENTE** | **W2**, **W3** |
| **W2** | Quién tiene autoridad para **abortar**, criterios y qué ocurre al abortar | Criterios técnicos definidos (§2.4) `[V]` | **(a)** Persona técnica · **(b)** Persona de negocio · **(c)** Ambas (unanimidad) | **(c)** — el aborto tiene consecuencias de negocio | **PENDIENTE** | **PENDIENTE** | **W1** |
| **W3** | Quién autoriza **reabrir** y comprobaciones obligatorias | Comprobaciones definidas (§11.8) `[V]` | **(a)** Misma persona que autoriza · **(b)** Persona distinta · **(c)** Revisión conjunta | **(c)** — separación de funciones | **PENDIENTE** | **PENDIENTE** | **W1** |
| **W4** | Designar persona con competencia técnica **y** autoridad para analizar Prisma/esquema, aprobar la resolución y documentarla | Perfil de 5 capacidades (§10.4) `[V]`; procedimiento R-1…R-6 `[V]` | **(a)** Una persona · **(b)** Dos (análisis + aprobación) · **(c)** Aplazar | **(b)** — separación de funciones | **PENDIENTE** | **PENDIENTE** | **CRÍTICO — bloquea producción** |
| **W5** | Fecha, hora, duración reservada y coordinación | Duración estimada `[INFERIDO]`; sin calendario `[PENDIENTE]` | **(a)** Horario laboral · **(b)** Fuera de horario · **(c)** Fin de semana | **(b)** — mínimo impacto | **PENDIENTE** | **PENDIENTE** | **D1**, **W1** |

> **No se ha inventado ningún nombre, aprobación ni responsabilidad.** `[V]`
> **W4 se trata como bloqueo crítico antes de producción.** `[V]`

### 11.7 Árbol de decisión ante fallos

> **No se asume que todo es transaccional.** `ALTER TABLE ... TYPE` en PostgreSQL
> **sí es transaccional** (se revierte si la sentencia o la transacción falla),
> pero **una migración fallida deja el registro en `_prisma_migrations` como
> `failed`**, y eso **bloquea** `migrate deploy`. `[V]`
>
> **Repetir el comando NO basta.** `[V]`
> **`prisma migrate resolve` NO debe ejecutarse** antes de la inspección y
> aprobación de W4. `[V]`

#### Caso 1 — Fallo **antes** de aplicar cualquier migración

| Aspecto | Detalle |
|---|---|
| **Evidencia a recopilar** | Salida de la guarda · `_prisma_migrations` (0 fallidas) · tipos de las 3 columnas (`timestamp`) |
| **Quién decide** | **W4** (análisis) + **W2** (aborto) |
| **Condición de parada** | `migrate deploy` no llegó a ejecutar el `ALTER`; la base está **intacta** |
| **Acción** | No arrancar la API nueva; **abortar limpiamente**; la API antigua sigue siendo coherente |
| **¿Reversible?** | **SÍ** — no se tocó nada |

#### Caso 2 — Primera migración aplicada, segunda **no**

| Aspecto | Detalle |
|---|---|
| **Evidencia a recopilar** | `_prisma_migrations`: 37 aplicadas / **1 fallida** · presencia de las 3 columnas en `messages` · tipo de `purchase_date` (`timestamp`) |
| **Quién decide** | **W4** (obligatorio) + **W2** |
| **Condición de parada** | **NO arrancar la API** — esquema incoherente con la imagen |
| **Riesgo** | `migrate deploy` queda **bloqueado** hasta `migrate resolve` |
| **¿Reversible?** | La columna añadida es **estructural**; revertirla exige un `DROP COLUMN`, **prohibido** sin autorización explícita |

#### Caso 3 — Fallo **durante** una migración

| Aspecto | Detalle |
|---|---|
| **Evidencia a recopilar** | Mensaje de error completo · `_prisma_migrations` (estado `failed`, `rolled_back_at`) · `pg_locks` · `pg_stat_activity` |
| **Quién decide** | **W4** |
| **Condición de parada** | **NO reintentar**; **NO `migrate resolve`**; **NO arrancar la API** |
| **Nota técnica** | `ALTER TABLE ... TYPE` **sí** es transaccional → si falla, la columna **queda en `timestamp`**. Pero el **registro** en `_prisma_migrations` **queda como fallido** y **bloquea** |

#### Caso 4 — Migración registrada como aplicada, esquema **aparentemente incompleto**

| Aspecto | Detalle |
|---|---|
| **Evidencia a recopilar** | **Contar los objetos reales**: 3 columnas en `messages`, 3 índices sobre ellas, `purchase_date` = `date`, 3 índices reconstruidos sobre `purchases` · checksums · estado de la aplicación |
| **Quién decide** | **W4** — **obligatorio** |
| **Distinción clave** | Distinguir «migración no ejecutada» de «ejecutada pero la app no la usa» requiere **contar los índices sobre las columnas nuevas** (H-U1.5.5-4), **no** mirar el estado Prisma |
| **¿`migrate resolve --applied`?** | **NO** sin inspección previa de `_prisma_migrations`, checksums, objetos reales y estado de la aplicación. **La elección la aprueba W4** |

#### Caso 5 — API **no saludable** tras la operación

| Aspecto | Detalle |
|---|---|
| **Evidencia a recopilar** | Logs de `automatizeit-api` · health `/health` · `pg_stat_activity` · tipos de las 3 columnas |
| **Quién decide** | **W4** (técnico) + **W2** (aborto) |
| **Causa probable** | La imagen espera `@db.Date`; si la migración no se aplicó, **cada consulta falla** |
| **Condición de parada** | Revertir a la imagen anterior **solo** con autorización de **W3** |

#### Caso 6 — Datos o restricciones que **no** superan las verificaciones posteriores

| Aspecto | Detalle |
|---|---|
| **Evidencia a recopilar** | Conteos · claves únicas · duplicados por día · garantías · huella MD5 · colisiones |
| **Quién decide** | **W4** + **W2** |
| **Condición de parada** | **NO reabrir**; **NO hacer rollback de datos** sin autorización explícita de **W3** |
| **Riesgo** | Restaurar el respaldo **sobre producción** es una operación **destructora** que exige autorización explícita y separada |

### 11.8 Criterios previos y posteriores (verificables, **no ejecutables**)

> **Ninguna de estas comprobaciones se ha ejecutado en U1.5.5.** `[V]`
> Son **procedimientos redactados**, no verificaciones superadas. `[V]`

#### Antes de iniciar la ventana

| # | Criterio | Cómo se verificará | Estado |
|---|---|---|---|
| **P-1** | D1 y W1–W5 registradas | Registro de decisiones | **`[PENDIENTE]`** |
| **P-2** | Respaldo reciente, válido y recuperable | SHA-256 del `.pgdump` + prueba de restauración | **`[VERIFICADO]`** |
| **P-3** | Confirmación de destino y estado de migraciones | `current_database()` + `_prisma_migrations` (36/0) | **`[VERIFICADO]`** |
| **P-4** | Ausencia de operaciones concurrentes | `pg_stat_activity` + `pg_locks` + `imports` | **`[VERIFICADO]`** |
| **P-5** | Envíos salientes bloqueados | Compose + runtime + health | **`[VERIFICADO]`** |
| **P-6** | Responsables y canal de comunicación confirmados | Designación humana | **`[PENDIENTE]`** |
| **P-7** | Criterios y autoridad de aborto establecidos | Registro de W2 | **`[PENDIENTE]`** |
| **V-10** | Los 5 campos clave sin NULL **y** sin duplicados | SQL en producción | **`[VERIFICADO]`** |
| **V-11** | `MIGRATIONS.sha256` intacto (38/38) | `sha256sum` | **`[VERIFICADO]`** |
| **V-12** | Conexiones de la API cerradas | `docker compose stop api` + confirmación | **`[PENDIENTE]`** |
| **V-13** | Ningún proceso `COPY`/`INSERT` activo | `pg_stat_activity` | **`[VERIFICADO]`** |
| **V-14** | `human-testing-up.sh` **no** se ejecutará | Designación humana (W5) | **`[PENDIENTE]`** |

#### Antes de reabrir

| # | Criterio | Cómo se verificará | Estado |
|---|---|---|---|
| **P-8** | Migraciones y checksums en estado esperado | `_prisma_migrations` = 38/0 · guard exit 0 | **`[PENDIENTE]`** |
| **P-9** | Esquema y restricciones coherentes con el código desplegado | 3 columnas en `messages` + 3 índices · `purchase_date` = `date` · 3 índices reconstruidos | **`[PENDIENTE]`** |
| **P-10** | Conteos, claves y garantías satisfactorios | SQL de verificación | **`[PENDIENTE]`** |
| **P-11** | API y dependencias saludables | `/health` → `status: ok`, `allowed: false` | **`[PENDIENTE]`** |
| **P-12** | Pruebas funcionales mínimas completadas | Pruebas manuales definidas por W5 | **`[PENDIENTE]`** |
| **P-13** | Autorización explícita de W3 | Registro de W3 | **`[PENDIENTE]`** |

### 11.9 Archivos modificados y diff

| Archivo | Acción |
|---|---|
| `specs/026-pit-final/runbook-hg9-opcion-a.md` | **Añadido §11** (U1.5.5) — solo documental |

**NO se modificó:** migraciones, `MIGRATIONS.sha256`, esquema Prisma, código de
aplicación, Compose, scripts, CI ni guardas. `[V]`
**Sin commits, sin push.** `[V]`
`git diff --check`: **0**. `[V]`

### 11.10 Bloqueos restantes y próxima acción

**Bloqueos:** `[V]`

| Bloqueo | Responsable |
|---|---|
| **D1** (alcance) | Humano |
| **W1** (indisponibilidad) — **depende de W2/W3** | Humano |
| **W2** (autoridad de aborto) | Humano |
| **W3** (autoridad de reapertura) | Humano |
| **W4** (**crítico** — designar persona) | Humano |
| **W5** (calendario) | Humano |

**Próxima acción concreta:** designar a la persona de **W4** y a los responsables
de **W2** y **W3**. Sin ellos, **W1 no puede fijarse** (por `T-recuperación`) y
**la ventana no puede iniciarse**. `[V]`

**⛔ Producción continúa CONGELADA. Ninguna migración aplicada. Sin commits.**

**📌 U1.5.5 NO autoriza ejecutar HG-9.** Se espera aprobación humana
independiente.

---

**Estado del documento (2026-10-21, tras U1.5.5):**

- §1–§9 (análisis y ensayo aislado): **completos y ejecutados** `[V]`
- §10 (congelación, registro de decisiones, ventana): **completo; D1/W1–W5 abiertas** `[V]`
- §11 (U1.5.5, propuesta operativa de ventana): **completa** — preflight en verde, análisis técnico cerrado, propuesta de W1 acotada pero **no fijable** por `T-recuperación` `[V]`
- §2.3 (ejecución en producción): **PREPARADO · NO AUTORIZADO · NO EJECUTADO** `[V]`
- §2.4 (aborto) y §2.5 (recuperación): **PREPARADOS · NO EJECUTADOS** `[V]`

---

## 12. U1.5.6 — Matriz única de salida y ruta crítica al 30-oct-2026

> **Naturaleza:** diagnóstico + una tarea independiente de verificación.
> **No autoriza** migraciones, despliegues, reinicios, commits ni push.

### 12.1 Preflight

| Control | Resultado |
|---|---|
| Rama / HEAD | `main` · `18ede0ec0d7fdf043f98546e7f2ceb7d94fac7be` |
| Relación con `origin/main` | **0 adelante / 0 detrás** — sin commits sin push |
| Cambios preexistentes | **3 staged / 39 modified / 10 untracked — preservados íntegramente** |
| `git diff --check` | **0** |
| Producción | 36 migraciones aplicadas · **0 fallidas** · 2 pendientes |
| Envíos | `DENIED` (Compose y runtime) |
| Respaldo | `6b5915e5041296c33b705f94a748d0c146b68aa11490c6898e9e01c7b427833f` intacto |
| Puertas ejecutadas en U1.5.5 | typecheck 3/3 · lint API 0 errores · **1090 tests pasan** · build 2/2 |

**Ningún cambio concurrente ni estado inesperado.** `[V]`

### 12.2 Matriz de criterios de aceptación (PIT §14) — 17 filas

| # | Requisito exacto | Evidencia | Estado | Bloq. real | Trabajo mínimo | Dependencia | Prueba de cierre | Responsable | Último momento |
|---|---|---|---|---|---|---|---|---|---|
| **1** | Una compra válida genera un ciclo único | 5 528 ciclos / 5 537 compras; **en orgs reales 0 sin ciclo**; los 9 son fixtures `DASH-INV-*`/`CAMP-INV-*` de `dash-org-*`/`camp-org-*` | **PASS** `[V]` | No | — | — | — | — | — |
| **2** | Filas incompletas se rechazan y quedan auditadas | `imports.processor.ts` → `auditService.record` ×7; conjunto completo de filas fallidas; specs de imports | **PASS** `[I]` | No | — | — | — | — | — |
| **3** | Fechas de garantía desde la fecha de compra del ERP | `lifecycle.rules.ts:173-180` `warrantyEnd(purchaseDate)` + `addMonthsClamped`; **19 pruebas** (D-1/P1.8) | **PASS** `[V]` | No | — | — | — | — | — |
| **4** | Calendario bimensual correcto | `lifecycle.rules.spec.ts` · milestones · determinismo ±reloj | **PASS** `[I]` | No | — | — | — | — | — |
| **5** | El primer mensaje solicita la placa | 12 specs ejercitan `plate` | **PASS** `[I]` | No | — | — | — | — | — |
| **6** | La placa se valida y asocia al ciclo correcto | idem | **PASS** `[I]` | No | — | — | — | — | — |
| **7** | La reseña se habilita solo tras placa válida | 8 specs ejercitan `review`; ventana de reseña (día 2 y 5) probada | **PASS** `[I]` | No | — | — | — | — | — |
| **8** | La frecuencia global impide mensajes automáticos excesivos | `eligibility.service.ts:304-328` G3 consulta `message` por `customerId`; **`messages.customer_id` NULL en 8 163/8 163** → `findFirst` devuelve `null` → **siempre ALLOW** | **FAIL** `[V]` | **SÍ** (si se habilita envío) | Backfill D-2 **o** aceptación escrita | Decisión humana | G3 bloquea con mensaje histórico real | **Humano** | 27-oct |
| **9** | Ventanas horarias y festivos se respetan | HG-1 resuelto (`America/Bogota` 09:00); specs de festivos; determinismo | **PASS** `[I]` | No | — | — | — | — | — |
| **10** | `NO_SEGUIMIENTO` bloquea las automatizaciones aplicables | G2 `checkOptOut` (`:212-226`) consulta `customer.noContactAt` **por id directo** → funcional; `customers` poblado | **PASS** `[V]` | No | — | — | — | — | — |
| **11** | Pausas, recuperación y reintentos no generan duplicados | G1 `checkPause`; `maintenimiento` (intento +60 y +67) probado | **PASS** `[I]` | No | — | — | — | — | — |
| **12** | La transición a retención cierra garantías y programa secuencia | `lifecycle-milestones.ts` `RETENTION_60D/90D/6M` | **PASS** `[I]` | No | — | — | — | — | — |
| **13** | Nuevas compras respetan reemplazo y separación de vehículos | `lifecycle.rules.ts:318-330` `BATTERY_REPLACED`/`DEFECTIVE_PRODUCT_REPLACED` → FINISH genera lifecycle nuevo | **PASS** `[I]` | No | — | — | — | — | — |
| **14** | Los estados de envío se corresponden con evidencia real del proveedor | **0 variables `PANCAKE_*`** (contenedor y compose); webhook de forma Meta (`hub.verify_token`, `x-hub-signature-256`); `specs/API-Pancake/integration.md` no documenta webhooks | **FAIL** `[V]` | **SÍ** (si se habilita envío) | Verificar contrato real de Pancake o usar Meta | Decisión de alcance | Envío probado **en sandbox** | **Humano** | 28-oct |
| **15** | Las pruebas críticas tienen resultados registrados | **1 090 tests unitarios pasan · 0 fallan** (ejecutados, 44 s); typecheck 3/3; lint API 0; build 2/2 | **PASS** `[V]` | No | — | — | — | — | — |
| **16** | Existe una demostración end-to-end reproducible | **14 suites e2e** existen pero **no ejecutables**: sin BD aislada; `apps/api/.env`→`localhost:5433`→**producción**; `purchases.e2e-spec.ts:98` hace `audit.deleteMany({module:'purchases'})` **sin filtro de org** (borraría 1 fila real) y crea residuos | **BLOCKED** `[V]` | **SÍ** | Crear BD aislada y ejecutar e2e | Autorización para crear BD | 14/14 suites en verde sobre BD aislada | **Humano** | 27-oct |
| **17** | Los riesgos residuales y limitaciones se comunican antes de aceptar | Este informe + §1–§11 del runbook | **PASS** `[V]` | No | — | — | — | — | — |

### 12.3 Recuento y avance

| Estado | Criterios |
|---|---|
| **PASS** | 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 17 → **14** |
| **FAIL** | 8, 14 → **2** |
| **BLOCKED** | 16 → **1** |
| **UNKNOWN / NOT_APPLICABLE** | 0 |

> **Avance: 14 / 17 = 82,4 %** de criterios de aceptación del PIT cerrados.
> (Numerador = criterios en PASS. Denominador = 17 criterios de PIT §14.
> **No** se cuenta por archivos escritos ni tareas iniciadas.)

**Matiz honesto `[I]`:** de los 14 PASS, **7 están sustentados directamente en
verificación propia** (1, 3, 10, 15, 17 y los datos de 8/14/16); los otros 7
(2, 4, 5, 6, 7, 9, 11, 12, 13) se sustentan en que **sus pruebas existen y la
suite completa pasa**, sin que yo haya aislado cada aserción contra su
requisito.

### 12.4 Observación de alcance para el negocio `[V]`

Reparto real de las 5 537 compras por organización:

| Organización | Slug | Compras | Sin ciclo |
|---|---|---|---|
| UAT Lifecycle P0 | `uat-lifecycle-p0` | **5 501** | 0 |
| Baterías del Caribe | `baterias-del-caribe` | **27** | 0 |
| Dash/Camp Org One/Two | `dash-org-*`, `camp-org-*` | 9 | 9 (fixtures) |

> **El 99,4 % de los datos vive en una organización llamada «UAT Lifecycle P0».**
> Solo **27 compras** están en «Baterías del Caribe». **Antes del 30 de octubre
> debe definirse qué organización corresponde a «usuarios reales»**, porque de
> eso depende qué significa operar en producción. `[PENDIENTE]`

### 12.5 Ruta crítica ordenada

```
[D1] Decisión humana única (D1 + W1–W5 + criterio 8 + criterio 14 + alcance 30-oct)
        │  ── no requiere código; desbloquea todo lo demás
        ▼
[E1] Commit del trabajo staged/modified/untracked          (protege 8 días de avance)
        ▼
[E2] BD aislada de pruebas desde el respaldo              (desbloquea CRIT-16)
        ▼
[E3] Ejecutar las 14 suites e2e sobre la BD aislada        (cierra CRIT-16)
        ▼
[E4] Nueva copia de seguridad + ensayo de restauración     (previo a ventana)
        ▼
[E5] VENTANA HG-9: stop api → migrate (ambas) → verify → up api
        ▼
[E6] Posterior: P-8…P-13 + smoke funcional con W3
```

**Paralelizable hoy sin autorización productiva:** [E1] requiere autorización de
commit; [E2] requiere autorización para crear BD. **Ninguna tarea bloqueante es
hoy autoejecutable sin decisión humana.**

### 12.6 Trabajo aplazable (no impide el PIT)

`H-1` `/reports/campaigns` ignora `from`/`to` · `H-2` `roles.guard.ts` sin spec ·
`H-3` `MessageStatus.CANCELLED` (exige migración nueva) · `H-4` OpenSSL en imagen ·
13 warnings de lint en `web`.

### 12.7 Decisiones humanas pendientes

| ID | Decisión exacta | Opciones | Impacto | Fecha límite |
|---|---|---|---|---|
| **D1** | Aplicar ambas migraciones en una ventana | (a) sí · (b) aplazar · (c) cancelar | Sin (a) no se cumple el alcance | **27-oct** |
| **W1** | Máximo de indisponibilidad | base ≈2,5 min / conservador ≈16 min | Define el compromiso con usuarios | **28-oct** |
| **W2/W3** | Autoridad de aborto y de reapertura | nombrar personas | Sin ellas W1 no se fija | **27-oct** |
| **W4** | Persona que resuelve una migración parcial | nombrar 1–2 | **Crítico** — `migrate deploy` no admite subconjuntos | **27-oct** |
| **W5** | Fecha, hora y coordinación | fijar ventana | — | **28-oct** |
| **C8** | Criterio 8: backfill D-2 **o** aceptación escrita de la limitación | (a) backfill · (b) aceptar por escrito | (b) es una firma | **27-oct** |
| **C14** | Criterio 14: proveedor de envío para el 30-oct | (a) Pancake verificado · (b) Meta · (c) salir sin envío | Decide si el 30-oct envía | **28-oct** |
| **ALC** | ¿Qué organización es «usuarios reales»? | definir | 99,4 % de datos en «UAT Lifecycle P0» | **26-oct** |

---

## 13. G3-01 — Envío duplicado en vuelo (corregido, con riesgo residual)

**Fecha:** 2026-10-22 · **Estado:** corregido y verificado a nivel unitario.
**No cierra el criterio 8.** Ver §13.4.

### 13.1 Defecto encontrado (distinto del reportado)

La hipótesis histórica «el código no asocia mensajes con clientes» está
**desactualizada**: `whatsapp.service.ts` ya asigna `customerId: customer.id`
en las tres rutas salientes (automática, manual y respuesta) desde el commit
`8196707` (23-ago-2026). Los 8 163 mensajes con `customer_id` NULL son
**históricos**, creados entre el 27-sep y el 10-oct por un contenedor anterior.

El defecto real es **otro**, y es determinista:

```js
// whatsapp.service.ts, executeDueAutomations
for (const automation of due) {
  const decision = await this.eligibility.evaluate({ customerId, ... });
  if (!decision.allowed) continue;
  await this.executeOneAutomation(automation, timeZone);  // crea mensaje QUEUED
}
```

G3 consulta `message.findFirst({ where: { sentAt: { not: null } } })`
(`eligibility.service.ts:304-328`): **un mensaje en cola no es un envío**. La
primera automatización del cliente queda `QUEUED` con `sentAt` NULL, de modo que
una segunda automatización **del mismo cliente** no la ve y también envía. El
guard AU-011 protege **por automatización**, no por cliente.

Se reproduce en dos caminos:
1. **Dos workers o dos ticks solapados** evaluando al mismo cliente.
2. **Envío huérfano**: F7 (`expireStuckExecuting`) devuelve la automatización a
   ERROR y el reintento **volvía a crear un segundo mensaje**, porque la fila
   anterior sigue `QUEUED` y G3 no la cuenta.

### 13.2 Evidencia antes / después

Prueba de reproducción con el `EligibilityService` **real** (un mock de
`evaluate` haría al test incapaz de fallar), dos workers y el proveedor del
worker 1 colgado:

| Momento | Resultado |
|---|---|
| **Antes** | `Expected length: 1, Received length: 2` — `msg-1` `QUEUED`/`sentAt` NULL **y** `msg-2` `SENT` para `cu-1` |
| **Después** | `store` = 1 · `envio2.sendMessage` no llamado · `a-2` queda `SCHEDULED` (diferible, no fallido) |

Cobertura añadida (5 pruebas nuevas; **1 095 pasan / 0 fallan / 2 omitidas**):

| Escenario (misión) | Prueba |
|---|---|
| Sin mensajes previos | ya cubierto en `eligibility.service.spec.ts` |
| Dentro de 15 días · límite exacto · día 16 | ya cubierto |
| Manual vs automático | **nueva**: un MANUAL en vuelo **no** bloquea un AUTOMATIC |
| Clientes diferentes | **nueva**: el `where` de G3 lleva el `customerId` evaluado |
| Ejecuciones concurrentes | **nueva** (regresión) + control A→SENT |
| Identidad ausente | **nueva**: `customerId: undefined` **no** se convierte en autorización |

### 13.3 Corrección

`whatsapp.service.ts` (+28 líneas, puramente aditivo): dentro de la misma
transacción y **antes** de la transición AU-011, se busca un
`AUTOMATIC`/`OUTBOUND` del mismo cliente con `status = QUEUED`; si existe, la
automatización se **difiere** (`return null`) sin consumir reintento ni marcar
fallo. Verificación: typecheck 0 · lint 0 · prettier ok · 1 095/0.

### 13.4 Riesgo residual — G3 NO queda cerrado

- **No es atómico.** Una comprobación de existencia seguida de una inserción
  **no** elimina la carrera entre dos procesos que se ejecutan a la vez: ambos
  pueden no ver ninguna fila en vuelo. La guarda cierra el duplicado
  **determinista** (mismo tick y huérfano), no el de simultaneidad estricta.
- **La garantía real exige una restricción en base de datos**: índice único
  parcial sobre `messages(customer_id)` con
  `type='AUTOMATIC' AND direction='OUTBOUND' AND status='QUEUED'`. **No se
  añade** porque exige una migración nueva y `MIGRATIONS.sha256` es inmutable
  desde U1.4. → **Decisión humana pendiente (C8b)**: incluirla en la ventana
  del 30-oct o aceptar por escrito la carrera residual.
- **Efecto nuevo observable**: un mensaje `QUEUED` huérfano bloquea los envíos
  automáticos de ese cliente hasta que se aclare. Es **fail-closed** y
  deliberado; conviene que W4 conozca este caso.
- **Criterio 8 sin cerrar**: sigue dependiendo de la decisión **C8** (backfill
  D-2 o aceptación escrita). La guarda no repuebla `customer_id` histórico, y
  BIZ-09 prohíbe reconstruir asociaciones históricas.
- **Matiz sobre el criterio 11** («reintentos no generan duplicados», PASS
  `[I]`): el camino huérfano de §13.1 demuestra que **sí** podían generarse.
  Su PASS queda **cualificado** por esta sección.
