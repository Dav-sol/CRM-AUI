# G3-02 · Protección de concurrencia para el envío automático en vuelo

**Fecha:** 2026-10-22
**Sesión:** OpenCode — ciclo autónomo post-G3-01
**Autoridad:** decisión **C8b** de David (Davnote, apéndice 2026-10-22):

> _«autorizado diseñar la migración y las pruebas de protección de concurrencia G3.
> **No aplicar esa migración en ninguna base** hasta recibir aprobación explícita
> adicional de David. Presentar propuesta, compatibilidad de estados, detección de
> conflictos existentes y evidencia de pruebas concurrentes.»_

**Alcance de este documento:** cerrar los cuatro puntos exigidos por C8b.
Ninguna migración se ha creado en `apps/api/prisma/migrations/`, ni se ha
aplicado en ninguna base de datos.

---

## 0. Resumen ejecutivo

| Punto exigido por C8b                | Estado                                               | Dónde |
| ------------------------------------ | ---------------------------------------------------- | ----- |
| Propuesta                            | **Hecho**                                            | §2    |
| Compatibilidad de estados            | **Hecho**                                            | §3    |
| Detección de conflictos existentes   | **Hecho** (0 conflictos)                             | §4    |
| Evidencia de pruebas concurrentes    | **Hecho** (3/3 corridas)                             | §6    |
| Migración diseñada y **no aplicada** | **Hecho** (borrador, fuera del árbol de migraciones) | §5    |

**Recomendación:** aplicar **Opción A** (índice único parcial) como garantía de
base de datos **y** mantener **Opción B** (candado `FOR UPDATE`) ya implementada
como serialización inmediata sin migración. Ambas son complementarias, no
excluyentes: A protege ante cualquier escritor, B da orden y evita bloqueos
innecesarios. **Opción B ya está en el árbol de código con sus tests.**

---

## 1. Diagnóstico: por qué la guarda de G3-01 no basta

G3-01 añadió una comprobación de "mensaje en vuelo" **dentro** de la transacción
de `executeOneAutomation` (`whatsapp.service.ts`). Es correcta para dos
automatizaciones que se ejecutan secuencialmente en el mismo tick.

Pero la comprobación y la inserción son dos sentencias separadas. En Postgres
con aislamiento `READ COMMITTED`, dos procesos pueden ejecutar la comprobación
**a la vez**, ambos no ven el mensaje del otro (que aún no ha hecho `COMMIT`) y
ambos insertan. El candado `AU-011` no protege: es por automatización, y las dos
automatizaciones son filas distintas.

**Carrera reproducida** (§6.1): sin candado quedan **2** mensajes; con candado
queda **1**.

---

## 2. Propuesta: tres opciones evaluadas

### Opción A — Índice único parcial en base de datos (requiere migración)

```sql
CREATE UNIQUE INDEX CONCURRENTLY "messages_one_inflight_automatic_per_customer"
ON "messages" ("customer_id")
WHERE "type" = 'AUTOMATIC' AND "direction" = 'OUTBOUND' AND "status" = 'QUEUED';
```

- **Garantía:** fuerte. La base de datos rechaza el segundo insert, sea quien
  sea el escritor, aunque fuera SQL directo fuera del código de la aplicación.
- **Coste:** exige una migración → **C8b, pendiente de aprobación explícita**.
- **Fallo:** si un insert viola el índice, Prisma lanza `P2002`; el código debe
  traducirlo a "diferible", no a error. Eso implica un cambio en el manejo de
  excepciones de `executeOneAutomation`.
- **Índice de apoyo:** ya existe `messages_customer_id_idx` sobre `customer_id`,
  de modo que la consulta de la guarda está indexada y no necesita índice nuevo.

### Opción B — Candado `FOR UPDATE` sobre la fila del cliente (SIN migración) ✅ implementada

```sql
SELECT id FROM "customers" WHERE id = $1 FOR UPDATE;
```

- **Garantía:** fuerte para todos los escritores que pasan por
  `executeOneAutomation`. Serializa por cliente: el segundo proceso espera a que
  el primero confirme y entonces **ve** su mensaje.
- **Coste:** cero migración. **Ya implementado** en esta tarea.
- **Patrón reutilizado:** el proyecto ya usa exactamente este patrón en
  `follow-up-sequences.service.ts:232` y `:326`, con pruebas de orden de bloqueo.
  Se respeta así la regla de reutilizar diseño existente (AGENTS.md §7).
- **Fallo:** depende de que todo escritor tome el candado. Un `INSERT` directo
  externo a la aplicación no lo tomaría.

### Opción C — `pg_advisory_xact_lock` (SIN migración, descartada)

- Bloqueo lógico por hash del `customer_id`, liberado solo al terminar la
  transacción. Sin contención de filas de `customers`.
- **Por qué se descarta:** introduce SQL crudo _nuevo_ cuando el proyecto ya
  tiene un patrón `FOR UPDATE` probado; no mejora la garantía respecto a B y
  añade una segunda forma de resolver el mismo problema. Se queda documentada
  como alternativa si B demostrara contención en la tabla `customers`.

### Decisión propuesta

|                    | Garantía                   | Migración    | Estado           |
| ------------------ | -------------------------- | ------------ | ---------------- |
| **A** índice único | total (cualquier escritor) | **sí** → C8b | borrador §5      |
| **B** `FOR UPDATE` | total dentro de la app     | no           | **implementada** |
| C advisory lock    | total dentro de la app     | no           | descartada (§2)  |

**Aplicar A + mantener B.** B ya cubre hoy el camino de la aplicación; A cierra
el único resto: un escritor que no pase por el candado.

---

## 3. Compatibilidad con los estados del mensaje

### Transiciones reales de `MessageStatus`

| Transición                            | Dónde                                   | `sent_at`    | Efecto sobre la guarda                               |
| ------------------------------------- | --------------------------------------- | ------------ | ---------------------------------------------------- |
| `QUEUED → SENT`                       | `markSent` (`whatsapp.service.ts:1890`) | se rellena   | deja de estar en vuelo → **libera**                  |
| `QUEUED → FAILED`                     | `failMessage` (`:1913`)                 | queda `NULL` | sale del predicado (`status<>'QUEUED'`) → **libera** |
| `QUEUED → SENT/DELIVERED/READ/FAILED` | `sms-webhook.controller.ts:19-24`       | según evento | **libera**                                           |

**No existe ninguna transición que devuelva una fila a `QUEUED`.** Verificado
por búsqueda de `MessageStatus.QUEUED` en `apps/api/src` (§1 anexo). Por tanto
`QUEUED` identifica de forma unívoca "en vuelo", condición necesaria para que un
índice parcial sobre ese estado sea correcto.

### Compatibilidad con cada opción

- **A (índice parcial):** el predicado `type='AUTOMATIC' AND
direction='OUTBOUND' AND status='QUEUED'` coincide exactamente con la
  condición de "en vuelo". Un mensaje `FAILED` queda fuera, así que **un fallo no
  bloquea el reintento**: el reintento crea una fila nueva sin chocar.
- **B (candado):** no depende de ningún estado; solo serializa. No puede generar
  falso bloqueo permanente.
- **Mensaje `MANUAL` en vuelo:** exento en A por el predicado `type='AUTOMATIC'`,
  y en B solo retrasa (no niega). **La política de mensajes manuales no cambia**,
  consistente con lo decidido en G3-01.
- **Cliente `customer_id IS NULL`:** ver §4 y §5.

### Segundo camino de creación: SMS (`sms-execution.service.ts`)

Hallazgo relevante para la compatibilidad, verificado por lectura de código:

- `sms-execution.service.ts:110-124` crea mensajes con
  `type: AUTOMATIC, direction: OUTBOUND, status: QUEUED, channel: SMS` **dentro
  de su propia transacción**, es decir **fuera** del candado de la Opción B, que
  solo se toma en `executeOneAutomation` (WhatsApp).
- Ese servicio **no tiene ninguna guarda de "en vuelo"**: sus únicas menciones de
  `QUEUED` son creaciones (líneas 120 y 143), no comprobaciones. `[VERIFICADO]`
- La guarda de G3-01 **no filtra por canal**: busca
  `type='AUTOMATIC' AND direction='OUTBOUND' AND status='QUEUED'` sin `channel`.
  Un mensaje SMS en vuelo bloquearía la guarda de WhatsApp y viceversa.

**Contexto de producción** `[VERIFICADO]`:

```
canal_<NULL>                  | 8135   ← todos los AUTOMATIC/OUTBOUND
automations WHATSAPP_CLIENTS  | 16820  ← todos, no hay ninguno SMS
```

**Lectura honesta:** la brecha existe **en código**, pero **no en datos** hoy:
no hay ninguna automatización SMS en producción y todos los mensajes
automáticos tienen `channel NULL`. Es un riesgo latente, no un defecto activo.

**Pregunta de diseño abierta para C8b (aplicación):** ¿el índice de la Opción A
debe filtrar `channel`?

- **Sin filtrar `channel`** (como está redactado el borrador y como ya se
  comporta G3-01): coherente con la regla actual "un solo envío automático en
  vuelo por cliente", pero impide que SMS y WhatsApp convivan.
- **Filtrando `channel`**: permite convivencia por canal, pero **cambia la
  semántica de G3-01**, que hoy no distingue canal.
- **No decidirlo ahora.** Se documenta como parte de la decisión C8b; cambiar la
  semántica de G3-01 sería una decisión de dominio que no corresponde a esta
  sesión (AGENTS.md, «decisión no definida por specs → preguntar»).

### Semántica del límite por cliente entre canales (C8b, continuado 22-10)

La pregunta no es solo «¿el índice filtra `channel`?», sino **qué regla de
negocio se está codificando**. Hay tres candidatas, y hoy el código implementa
la primera sin decirlo:

| Regla                                                                                                    | Cómo se expresa                                                                            | Consecuencia                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 · un solo envío automático en vuelo por cliente, sin distinguir canal** (comportamiento **actual**) | índice `(customer_id) WHERE type='AUTOMATIC' AND direction='OUTBOUND' AND status='QUEUED'` | SMS y WhatsApp se excluyen entre sí. Es lo que ya hace G3-01, cuyo `where` **no contiene `channel`**.                                                                                                     |
| **R2 · un envío en vuelo por cliente Y canal**                                                           | índice `(customer_id, channel)`                                                            | Los dos canales conviven. **Cambia la semántica de G3-01**, que habría que tocar igualmente: el candado `FOR UPDATE` seguiría serializando al cliente entero aunque el índice permitiera los dos canales. |
| **R3 · un envío en vuelo por cliente solo para el canal con guard**                                      | índice sin canal + guarda también en SMS                                                   | Cierra la brecha SMS manteniendo R1. Exige replicar la guarda en `sms-execution.service.ts`.                                                                                                              |

**Acoplamiento que R2 no resuelve por sí sola.** Incluso con
`(customer_id, channel)`:

1. El candado de la Opción B bloquea **la fila del cliente**, no la fila del
   mensaje: con R2 los dos canales seguirían serializados y el segundo esperaría
   al primero, que es un límite más estricto que el que declara el índice. Para
   que R2 sea real habría que pasar el candado a `(customer_id, channel)`.
2. La guarda de G3-01 se tendría que filtrar por canal en **el mismo cambio**.
   Dejar índice con canal y guarda sin canal no produce convivencia: la guarda
   sigue denegando.

Conclusión: **R2 no es «solo un índice»**; es un cambio coordinado de guarda +
candado + índice. **No se propone aquí** (AGENTS.md: cambio de semántica de
dominio → preguntar).

**R1 es la regla que hoy existe en producción** y la que el borrador de
índice ya expresa, por lo que el índice de la Opción A **sin filtro de canal**
es fiel al comportamiento observado y no cambia ninguna semántica. R3 es el
complemento que hace que esa regla sea verdadera también en SMS.

### Ruta SMS: qué se verificó y qué queda

Hechos `[VERIFICADO]` por lectura de código (22-10):

- `apps/api/src/modules/messaging/sms-execution.service.ts` ejecuta
  `automation.updateMany` (AU-011) y seguidamente `message.create` con
  `channel: SMS`, `type: AUTOMATIC`, `direction: OUTBOUND`,
  `status: QUEUED` **dentro de su propia transacción**.
- Esa transacción **no contiene ninguna consulta de "en vuelo"**: no hay
  `message.findFirst` previo. Es decir, no replica la guarda de G3-01.
- Inversamente, la guarda de G3-01 tampoco filtra canal, así que **un SMS en
  vuelo sí bloquearía un envío WhatsApp** del mismo cliente (R1 en acción), mientras
  que **un WhatsApp en vuelo no bloquea al SMS** (asimetría).
- **No es activo hoy**: producción tiene `16 820` automatizaciones, todas
  `WHATSAPP_CLIENTS`, y los `8 135` mensajes `AUTOMATIC/OUTBOUND` tienen todos
  `channel NULL`.

### Propuesta preparada — dos variantes de índice (NINGUNA APLICADA)

Ambas están **fuera** de `prisma/migrations/` y **no se ha creado ninguna
índice en ninguna base** (ni `automatizeit`, ni `automatizeit_e2e`,
`automatizeit_lock` ni `automatizeit_race`).

```sql
-- V1 (recomendada): fiel a R1, la regla observada. No toca filas históricas.
CREATE UNIQUE INDEX CONCURRENTLY "messages_one_inflight_per_customer"
  ON "messages" ("customer_id")
  WHERE "type" = 'AUTOMATIC' AND "direction" = 'OUTBOUND'
    AND "status" = 'QUEUED' AND "deleted_at" IS NULL;

-- V2: R2, convivencia por canal. Requiere además cambiar guarda + candado.
CREATE UNIQUE INDEX CONCURRENTLY "messages_one_inflight_per_customer_channel"
  ON "messages" ("customer_id", "channel")   -- ← V2, NO lista para aplicar
  WHERE "type" = 'AUTOMATIC' AND "direction" = 'OUTBOUND'
    AND "status" = 'QUEUED' AND "deleted_at" IS NULL;
```

Se excluye `NULLS NOT DISTINCT`: la única fila histórica `QUEUED` tiene
`customer_id NULL` (§4), y hacer colisionar los `NULL` tocaría historia que C8/BIZ-09
prohíbe modificar.

### Plan de pruebas preparado (pendiente de aprobación)

| #   | Prueba                                                                                                | Qué fija                                  | Por qué no corre todavía         |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| T1  | Existencia y unicidad del índice: insertar dos `QUEUED` para el mismo cliente → `P2002` en el segundo | que V1 protege **también entre procesos** | requiere crear el índice         |
| T2  | El índice **no** captura filas históricas (SENT/DELIVERED/READ/FAILED) ni `customer_id NULL`          | compatibilidad con C8/BIZ-09              | requiere crear el índice         |
| T3  | El índice con canal permite SMS y WhatsApp a la vez (V2)                                              | semántica R2                              | requiere elegir V2               |
| T4  | `sms-execution.service` difiere si ya hay un `QUEUED` del mismo cliente y canal                       | cierra la asimetría de R3                 | cambio de código, no solo índice |
| T5  | G3-01 filtra por canal cuando R2 esté elegida                                                         | coherencia guarda ↔ índice                | R2 no elegida                    |

T1/T2 son las que certifican C8b; T3/T4/T5 dependen de decidir R2 o R3. Ninguna
se ejecuta hasta que David apruebe crear el índice.

### Unión con G3-01

G3-01 permanece como lógica de **decisión** (diferir y dejar `SCHEDULED`, sin
consumir reintento). B añade **orden**. Sin G3-01, el candado solo garantizaría
que el segundo ve al primero, pero no se sabe qué hacer con ello; sin B, G3-01
se salta entre procesos. Se necesitan las dos.

---

## 4. Detección de conflictos existentes (solo lectura, sobre producción)

Consulta ejecutada con `psql` en modo **solo SELECT** contra la base de
producción. **No se escribió nada.**

```
filas_AUTOMATIC_OUTBOUND_total        | 8135
estado_QUEUED_en_vuelo                | 1
por_estado                            | QUEUED=1  SENT=8133  FAILED=1
clientes_con_mas_de_un_QUEUED         | 0
QUEUED_con_customer_id_NULO           | 1
distinct_customer_id_en_vuelo         | 0
```

**Lectura:**

1. **0 conflictos.** No hay ningún cliente con más de un mensaje en vuelo, así
   que el índice único parcial de la Opción A **se podría crear sin
   pre-limpieza**. `[VERIFICADO]`
2. **El único `QUEUED` existente tiene `customer_id = NULL`**, `automation_id`
   `NULL`, `sent_at` `NULL`, creado el **2026-09-27 23:28:12 UTC**, con **598,1
   horas** de antigüedad. Es un huérfano histórico, no un envío en curso real.
   `[VERIFICADO]`
3. **`distinct_customer_id_en_vuelo = 0`**, es decir, ninguna fila en vuelo está
   asociada a un cliente. `[VERIFICADO]`

### Consecuencias para la propuesta

- Un índice único normal sobre `customer_id` trata los `NULL` como distintos
  (comportamiento por defecto de PostgreSQL), de modo que **este huérfano no
  bloquearía la creación del índice ni a ningún otro cliente**. `NULLS NOT
DISTINCT` quedaría **descartado**: impediría varios `NULL`, que es justo el
  caso histórico ya existente (8 163 mensajes `AUTOMATIC/OUTBOUND` con
  `customer_id NULL` según C8/BIZ-09) y obligaría a tocar datos históricos, cosa
  que David ha **prohibido**.
- La guarda de G3-01/G3-02 busca por `customerId` concreto, así que **este
  huérfano tampoco la afecta**: ni bloquea ni desbloquea. Es un hallazgo
  separado (limitación histórica ya documentada bajo C8/BIZ-09), **no** algo que
  esta tarea deba ni pueda resolver.

---

## 5. Migración en borrador — **NO APLICADA**

> **ADVERTENCIA (C8b).** Este SQL es un borrador de propuesta. **No** se ha
> creado en `apps/api/prisma/migrations/`, **no** se ha ejecutado en ninguna
> base de datos, y `MIGRATIONS.sha256` **no** se ha tocado. Se incluye aquí
> (fuera del árbol de migraciones) precisamente para que no pueda desplegarse
> por accidente mientras el manifiesto siga siendo inmutable.

```sql
-- CreateOutboxSingleInflightAutomaticMessagePerCustomer
-- Estado: BORRADOR. No aplicar sin aprobación explícita de David (C8b).

CREATE UNIQUE INDEX CONCURRENTLY "messages_one_inflight_automatic_per_customer"
ON "messages" ("customer_id")
WHERE "type" = 'AUTOMATIC'
  AND "direction" = 'OUTBOUND'
  AND "status" = 'QUEUED';
```

### Plan de aplicación (cuando haya aprobación)

1. Confirmar de nuevo `clientes_con_mas_de_un_QUEUED = 0` (lectura).
2. Crear la migración en `apps/api/prisma/migrations/` con su entrada en
   `MIGRATIONS.sha256` — **esta acción exige levantar la inmutabilidad del
   manifiesto, que es una decisión de David, no de esta sesión.**
3. Ejecutar `prisma migrate deploy` dentro de la ventana HG-9 ya planificada
   (§11 del runbook), junto con las migraciones pendientes `20261009000000` y
   `20261010000000`.
4. **Riesgo de `CREATE INDEX CONCURRENTLY`:** no se puede ejecutar dentro de una
   transacción, por lo que `prisma migrate deploy` lo ejecutará fuera de ella.
   Falla con `ERROR: duplicate key value` si aparece un conflicto entre la
   lectura del paso 1 y la creación. **Plan de contingencia:** si falla,
   revisar las filas en vuelo creadas entre medias, vaciar el estado de vuelo de
   esos clientes (solo si se autoriza) y reintentar. **No** reintentar a ciegas.
5. Verificar con `SELECT indexname FROM pg_indexes WHERE tablename='messages'`.

### Cambio de código que A exige (no incluido, pendiente)

Interceptar `P2002` sobre ese índice en `executeOneAutomation` y traducirlo a
**diferible** (`return null`), igual que la guarda actual. Sin este cambio, un
conflicto se convertiría en error de automatización. **Se deja para después de
la aprobación**, porque forma parte de la misma decisión.

### Rollback

```sql
DROP INDEX CONCURRENTLY "messages_one_inflight_automatic_per_customer";
```

Solo elimina la restricción; **no** toca datos.

---

## 6. Evidencia de pruebas concurrentes

### 6.1 Demostración real en Postgres — dos sesiones paralelas

Script completo en **§8**. Cada sesión ejecuta exactamente el flujo de
`executeOneAutomation`: `BEGIN` → _[opcional]_ candado `FOR UPDATE` →
`check-and-insert` del mensaje `AUTOMATIC/OUTBOUND/QUEUED` → `COMMIT`.

**Base de datos:** `automatizeit_lock`
`current_database() = automatizeit_lock` · `produccion = NO` ·
`customers = 0` · `mensajes = 0` · `automations = 0` al empezar.
Se crea un fixture propio (`org-g302` + `cu-g302`) y **se borra al final**:
`filas_residuales = 0`, efecto neto cero. `[VERIFICADO]`

**Resultado (3 corridas idénticas):**

| Corrida | Sin candado                                           | Con candado `FOR UPDATE`          |
| ------- | ----------------------------------------------------- | --------------------------------- |
| 1       | `mensajes_en_vuelo_resultantes=2` → **DUPLICADO (2)** | `=1` → **EXCLUSION CORRECTA (1)** |
| 2       | `=2` → **DUPLICADO (2)**                              | `=1` → **EXCLUSION CORRECTA (1)** |
| 3       | `=2` → **DUPLICADO (2)**                              | `=1` → **EXCLUSION CORRECTA (1)** |

**3/3 estable, no anecdótico.** `[VERIFICADO]`

Salida literal de la corrida 3:

```
=== caso: SIN candado (comportamiento actual, reproduce el defecto) (candado=nolock) ===
mensajes_en_vuelo_resultantes=2
detalle:
  msg-A status=QUEUED
  msg-B status=QUEUED
veredicto: DUPLICADO (2)

=== caso: CON candado FOR UPDATE (proteccion G3-02) (candado=lock) ===
mensajes_en_vuelo_resultantes=1
detalle:
  msg-B status=QUEUED
veredicto: EXCLUSION CORRECTA (1)

=== limpieza ===
filas_residuales|0
```

**Conclusión:** la carrera es **real y determinista**, y el candado la elimina.
`[VERIFICADO]`

### 6.2 Pruebas unitarias añadidas

En `apps/api/src/modules/whatsapp/whatsapp.service.spec.ts`, bloque
`G3-02 · candado FOR UPDATE por cliente (serialización sin migración)`:

| Test                                                              | Qué prueba                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `bloquea la fila del cliente ANTES de leer el estado en vuelo`    | Orden `candado → lectura → escritura` vía `invocationCallOrder` (misma convención que `follow-up-sequences.service.spec.ts:619`) |
| `el candado apunta a la fila del cliente exacto y usa FOR UPDATE` | El SQL contiene `"customers"` y `FOR UPDATE`, y la interpolación es el `customer.id` correcto (`cu-1`)                           |
| `toma el candado aunque no haya mensaje previo`                   | El candado se toma también en el caso feliz: es lo que serializa a un segundo proceso que llegaría en paralelo                   |

**Discriminador del orden:** el mock `message` sirve a la lectura G3 del
servicio de elegibilidad (fuera de la transacción) y a la consulta "en vuelo de
G3-01 (dentro). Se identifica la segunda por su forma exacta
(`status: 'QUEUED'`, `deletedAt: null`, `select: { id: true }`) para no medir la
consulta equivocada.

---

## 7. Riesgos residuales y límites conocidos

1. **Opción B no protege ante escritores externos.** Un `INSERT` directo en la
   base (SQL manual, otro servicio) no tomaría el candado. Solo la Opción A lo
   cierra. _Por eso se recomienda aplicar A cuando haya aprobación._
2. **Muerte del proceso entre candado y commit.** PostgreSQL libera el candado
   al abortar la transacción; no queda bloqueo permanente. `[INFERIDO]` de la
   semántica de candados de fila de PostgreSQL; no se ha ensayado matando el
   proceso.
3. **Falso bloqueo por mensaje en vuelo permanente.** Si un mensaje se queda
   `QUEUED` para siempre (envío huérfano), ese cliente **no** recibe más
   mensajes automáticos. Es **fail-closed, deliberado**: se prefiere no enviar a
   duplicar. Ya existía desde G3-01; el candado no lo agrava. Detectable con:
   `SELECT ... WHERE status='QUEUED' AND now()-created_at > interval '1 hour'`.
4. **Candado sobre `customers` añade contención.** Dos clientes distintos no
   compiten (el candado es por fila), así que solo afecta a múltiples
   automatizaciones del **mismo** cliente, que es exactamente el caso que se
   quiere serializar. `[INFERIDO]`
5. **El huérfano histórico con `customer_id NULL` queda fuera** de ambas
   protecciones. Limitación histórica ya aceptada bajo C8/BIZ-09; **no** se
   reconstruye ninguna asociación.
6. **La Opción B no cubre el canal SMS** (`sms-execution.service.ts`), que crea
   `AUTOMATIC/OUTBOUND` en su propia transacción y **no tiene ninguna guarda de
   "en vuelo"** (§3). Hoy es **latente**: no hay automatizaciones SMS en
   producción (16 820 `WHATSAPP_CLIENTS`, 0 SMS). Si algún día se activa ese
   canal, el duplicado vuelve a ser posible **solo** en SMS, y sería cubierto
   por la Opción A si el índice no filtra `channel`. `[VERIFICADO]`

---

## 8. Anexo: script de la demostración de concurrencia

Guardado en la sesión como
`/tmp/opencode/g3-02-concurrencia.sh`. No se añade al repositorio de código
funcional; se documenta aquí para que sea reproducible.

```bash
#!/usr/bin/env bash
# G3-02 · evidencia de concurrencia
set -euo pipefail

DB=automatizeit_lock
PSQL=(docker exec -i automatizeit-postgres psql -U automatizeit -d "$DB" -v ON_ERROR_STOP=1 -qAt)
ORG='org-g302'
CUST='cu-g302'

q() { "${PSQL[@]}" -c "$1"; }

echo "=== base y destino ==="
q "SELECT 'base_datos', current_database()"
q "SELECT 'produccion', CASE WHEN current_database()='automatizeit' THEN 'SI' ELSE 'NO' END"

# --- fixture ---------------------------------------------------------------
q "DELETE FROM messages WHERE organization_id='${ORG}'"
q "DELETE FROM customers WHERE id='${CUST}'"
q "DELETE FROM organizations WHERE id='${ORG}'"
q "INSERT INTO organizations (id,uuid,name,slug,updated_at) VALUES ('${ORG}','uuid-${ORG}','scratch g302','g302',now())"
q "INSERT INTO customers (id,uuid,organization_id,codcli,name,updated_at) VALUES ('${CUST}','uuid-${CUST}','${ORG}','G302','scratch g302',now())"

# --- una sesión concurrente ------------------------------------------------
session() {
  local tag="$1" mode="$2" lock=""
  if [[ "$mode" == "lock" ]]; then
    lock="SELECT id FROM \"customers\" WHERE id = '${CUST}' FOR UPDATE;"
  fi
  "${PSQL[@]}" <<SQL
BEGIN;
\o /dev/null
SELECT pg_sleep(0.4);
${lock}
\o
INSERT INTO messages (id, uuid, organization_id, type, content, direction, status, customer_id, created_at, updated_at)
SELECT 'msg-${tag}', 'uuid-msg-${tag}', '${ORG}', 'AUTOMATIC', 'g302 scratch', 'OUTBOUND', 'QUEUED', '${CUST}', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM messages
  WHERE customer_id = '${CUST}'
    AND type = 'AUTOMATIC' AND direction = 'OUTBOUND' AND status = 'QUEUED'
);
\o /dev/null
SELECT pg_sleep(0.3);
\o
COMMIT;
SQL
}

run_case() {
  local label="$1" mode="$2"
  echo
  echo "=== caso: ${label} (candado=${mode}) ==="
  q "DELETE FROM messages WHERE organization_id='${ORG}'"
  session A "$mode" &
  local pidA=$!
  session B "$mode" &
  local pidB=$!
  local st=0
  wait "$pidA" || st=$?
  wait "$pidB" || st=$?
  if [[ "$st" -ne 0 ]]; then echo "ERROR: una sesion fallo (exit=${st})"; fi
  local n
  n=$(q "SELECT count(*) FROM messages WHERE customer_id='${CUST}' AND type='AUTOMATIC' AND direction='OUTBOUND' AND status='QUEUED'")
  echo "mensajes_en_vuelo_resultantes=${n}"
  echo "detalle:"
  q "SELECT '  '||id||' status='||status FROM messages WHERE organization_id='${ORG}' ORDER BY id"
  local veredicto
  if [[ "$n" == "1" ]]; then veredicto="EXCLUSION CORRECTA (1)"; else veredicto="DUPLICADO (${n})"; fi
  echo "veredicto: ${veredicto}"
}

run_case "SIN candado (comportamiento actual, reproduce el defecto)" "nolock"
run_case "CON candado FOR UPDATE (proteccion G3-02)"                "lock"

# --- limpieza: efecto neto cero --------------------------------------------
echo
echo "=== limpieza ==="
q "DELETE FROM messages WHERE organization_id='${ORG}'"
q "DELETE FROM customers WHERE id='${CUST}'"
q "DELETE FROM organizations WHERE id='${ORG}'"
q "SELECT 'filas_residuales', (SELECT count(*) FROM messages WHERE organization_id='${ORG}') + (SELECT count(*) FROM customers WHERE id='${CUST}') + (SELECT count(*) FROM organizations WHERE id='${ORG}')"
```

---

## 9. Verificación y contención de esta tarea

| Comprobación                                             | Resultado                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npx jest` (API completo)                                | **1098 passed / 0 failed / 2 skipped** (60 suites) — antes 1095            |
| `npx jest src/modules/whatsapp/whatsapp.service.spec.ts` | **96 passed / 0 failed**                                                   |
| `npx tsc --noEmit`                                       | **0 errores**                                                              |
| `npx eslint src/modules/whatsapp/`                       | **0 errores**                                                              |
| `npx prettier --check` (2 ficheros)                      | **correcto**                                                               |
| `git diff --check`                                       | **0**                                                                      |
| Migraciones: `git diff -- apps/api/prisma/migrations`    | **0 líneas**                                                               |
| `MIGRATIONS.sha256`                                      | **intacto**, 3 ficheros staged como antes                                  |
| Estado Git                                               | **staged 3 / modified 40 / untracked 10** (sin cambios respecto al inicio) |
| `OUTBOUND_SEND_ENABLED` (compose y contenedor)           | **DENIED / DENIED**                                                        |
| Contenedor `automatizeit-api`                            | `StartedAt 2026-10-10T17:15:19Z` — **no reiniciado**                       |
| Producción                                               | 5 537 compras · 8 163 mensajes · 36 migraciones aplicadas · **0 fallidas** |

### Cambios de código de esta tarea

| Fichero                                                  | Diff                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/whatsapp/whatsapp.service.ts`      | **+11 / −0** (solo aditivo: comentario del candado + 1 sentencia). Total del fichero contra HEAD: **+39/−0**, que incluye los +28 de G3-01                                                                                     |
| `apps/api/src/modules/whatsapp/whatsapp.service.spec.ts` | +3 tests G3-02 y `$queryRaw` añadido a 4 mocks de transacción existentes (`txMock`, uno en `buildWorld`, uno en el bloque R1 y uno inline). Total contra HEAD **+461/−5**, cifra que incluye cambios preexistentes del usuario |

---

## 10. Qué queda pendiente (requiere aprobación de David)

| ID              | Pendiente                                                                  | Autoridad                                                           |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **C8b-aplicar** | Crear la migración del índice único y aplicarla                            | **aprobación explícita de David** — prohibido hasta entonces        |
| **C8b-P2002**   | Manejo de `P2002` → diferible en `executeOneAutomation`                    | queda tras C8b-aplicar                                              |
| **C8**          | CRIT-8 · validación para mensajes nuevos + documentar limitación histórica | decidido: **sin backfill**; falta documentar el criterio            |
| **C14**         | Integración Pancake (send/receive/events) con mocks y contratos            | David lo fijó como no vuelva a preguntar; no incluido en esta tarea |
| **D1/W1-W5**    | Ventana HG-9                                                               | pendiente de reunión                                                |
| **CRIT-16**     | Aislamiento E2E                                                            | autorizado condicionado (PIT-16), no emprendido en esta tarea       |
| **C8b-canal**   | ¿El índice de A filtra `channel`? Pregunta abierta de diseño (§3)          | decisión de dominio — **no decidida aquí**                          |
| **SMS-guarda**  | `sms-execution.service.ts` crea AUTOMATIC/OUTBOUND sin guarda ni candado   | latente (0 automatizaciones SMS); cubierto por A si no filtra canal |

---

## 11. Semántica del límite de 15 días ENTRE CANALES (C8b · continuado 22-10)

David pidió expresamente documentar la semántica de la limitación de 15 días
entre canales y **presentar la decisión si sigue ambigua**. Se verificó en
código; no se cambió nada.

### 11.1 Qué hace hoy la regla `[VERIFICADO]`

`EligibilityService.checkAutomaticFrequency` (`eligibility.service.ts:304`) y su
función pura `automaticFrequencyBlocks` (`lifecycle.rules.ts:289`):

```ts
where: {
  customerId,
  type: MessageType.AUTOMATIC,
  direction: MessageDirection.OUTBOUND,
  sentAt: { not: null },
  deletedAt: null,
}
orderBy: { sentAt: 'desc' }
```

**No hay filtro de `channel`.** Cuenta cualquier outbound `AUTOMATIC` del
cliente, sea el canal que sea. Un SMS automático enviado hoy bloquearía un
WhatsApp automático al mismo cliente durante 15 días, y a la inversa.

### 11.2 Pero esa regla solo se aplica en la ruta de WhatsApp `[VERIFICADO]`

| Ruta                        | ¿Evalúa G3 (15 días)?                     |
| --------------------------- | ------------------------------------------ |
| WhatsApp (`whatsapp.service.ts:276`) | **Sí** — llama a `eligibility.evaluate()` |
| SMS (`sms-execution.service.ts`)     | **NO** — solo evalúa `sendPermit` (política de salida) |

`SmsExecutionService.executeOneAutomation` comprueba únicamente
`customer.status`, `customer.phone`, `content` y la política de envío. **No
invoca ningún gate de `EligibilityService`**: ni G3 (15 días), ni G4 (silencio
7 días tras manual), ni G5 (ventana horaria), ni G2 (opt-out global).

Esto es **independiente** de la ausencia de guard de concurrencia ya
documentada (SMS crea `QUEUED` sin el `FOR UPDATE` de G3-02): son dos huecos
distintos en la misma ruta.

### 11.3 Estado real consolidado `[VERIFICADO]`

Hoy el límite de 15 días **no es un límite por canal**: es un límite **de
WhatsApp**. La ruta SMS no lo aplica, y la consulta de G3 está redactada como si
ambos canales compartieran presupuesto.

Producción confirma que el hueco es latente, no activo: **16 820 automatizaciones,
todas `WHATSAPP_CLIENTS`, 0 SMS**, y **8 135 `AUTOMATIC`/`OUTBOUND` con
`channel` NULL** (WhatsApp histórico; el canal se escribía después).

### 11.4 Ambigüedad que requiere decisión de David `[PENDIENTE]`

La especificación (PIT §4.1) dice: *«se permite como máximo un mensaje
automático saliente cada 15 días calendario **por número de WhatsApp**»*. La
redacción es explícitamente de WhatsApp y no contempla SMS, que la propia PIT
trata en un apartado distinto. De ahí dos lecturas igualmente defendibles:

| Opción | Semántica                     | Consecuencia                                                                              |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------- |
| **S1** | 15 días **compartidos** entre canales | coherente con la consulta actual (sin filtro `channel`); un SMS consume el presupuesto de WhatsApp |
| **S2** | 15 días **por canal**                 | requiere añadir `channel` al `where` de G3 y aislamiento explícito por canal               |

**No se decide aquí.** Elegir S2 es un **cambio de semántica de negocio**, no un
refactor, y afectaría a cómo se interpreta el histórico de 8 135 mensajes
`AUTOMATIC`/`OUTBOUND` con `channel` NULL: en S2 habría que definir si esos
registros NULL cuentan para WhatsApp, para ninguno o para ambos.

### 11.5 Coupling con las reglas R1/R2/R3 (§3)

La decisión S1/S2 **precede** y condiciona la de C8b:

- Bajo **S1**, la opción **R2** (`(customer_id, channel)`) sería **incorrecta**:
  impondría un filtro de canal que la regla de negocio no tendría.
- Bajo **S2**, **R2** sería la coherente, y **R1** quedaría sin canal pero con
  la guarda replicada en SMS (**R3**).

Por eso ambas quedan **sin decidir**: no se puede elegir el índice sin saber
antes si el presupuesto de 15 días es compartido o por canal.

### 11.6 Qué NO se hizo

- No se creó ni aplicó ningún índice, migración ni cambio de código.
- No se añadió el filtro de `channel` a G3.
- No se cableó `EligibilityService` en la ruta SMS (sería ampliar alcance sin
  autorización, y alteraría el comportamiento de envío).
- No se tocó producción.

---

## 12. S1 condicionado a RF-04/RF-05 — análisis, precedencia y decisión pendiente

David aprobó **S1** (15 días compartidos entre WhatsApp y SMS para un mismo
cliente) el 22-10-2026, con una condición obligatoria: **S1 no debe romper,
suprimir ni alterar el orden funcional RF-04 → RF-05**. Este apartado recoge la
inspección pedida, el modelado, la precedencia definida, las pruebas añadidas y
las alternativas que requieren su decisión. **No se implementó S1**: queda
condicionada por §12.5.

> **Estado confirmado por David, 25-10-2026.** S1 sigue **aprobado como
> principio de diseño**, y sigue **sin implementarse**. Dos condiciones
> acumulativas antes de tocar `eligibility.service.ts`:
>
> 1. Resolver **D-01** (¿RF-04 consume el presupuesto de 15 días?).
> 2. **Demostrar** que la solución elegida no interfiere con RF-04/RF-05 —
>    no basta con que parezca compatible.
>
> Mientras, **AC-05.1 … AC-05.7 no se implementan** y **no se inventan plazos**
> de RF-04/RF-05: el PIT no los fija y ambas funciones siguen sin decisión
> funcional aprobada (§12.1).

### 12.1 Inspección — estado real de RF-04 y RF-05 `[VERIFICADO]`

| Requisito | Estado en código | Evidencia |
| --- | --- | --- |
| **RF-04** (captura de placa) | **No existe en ninguna capa** | `grep -inE "plate\|placa" prisma/schema.prisma \| grep -v template` → **0**; en `src/` la única coincidencia es un comentario de `lifecycle-milestones.ts:21` que declara que RF-04 **no se implementa**. `MilestoneKind` no contempla captura de placa. `MilestoneTemplateSource = 'PENDING_DECISION'`. |
| **RF-05** (reseña tras placa válida) | **No existe como flujo disparado por placa** | Ningún evento, estado ni llamada que verifique la previa «captura válida de placa». |

**Código huérfano relacionado (hallazgo, no tocado).** Sí existe un concepto de
reseña, pero **nadie lo invoca**:

- `CommercialCycle.reviewRequestedAt`, `markReviewRequested()`,
  `isReviewRequested()` (`lifecycle.service.ts:459-473`) — **0 llamadas** en
  `src/` fuera de su propia definición.
- `isWithinReviewWindow()` con `REVIEW_MIN_DAYS = 2` / `REVIEW_MAX_DAYS = 5`
  (`lifecycle.rules.ts:60,188`) — **0 llamadas**.
- Todos citan **«§3»**, que corresponde a
  `specs/025-lifecycle-postventa/spec.md`, un fichero de **0 bytes**: **sin
  autoridad funcional**. El propio `lifecycle-milestones.ts:16-22` lo reconoce
  («procedían de spec-025, que está vacío… no se reimplementan aquí ni se
  sustituyen por otros plazos inventados»).

**Consecuencia para este análisis:** no hay un diseño RF-04/RF-05 que S1 pueda
romper, porque **no existe**. Lo que S1 puede romper es el **orden funcional que
el PIT exige** cuando RF-04 se construya. Ese es el objeto de §12.2.

### 12.2 Modelado de ambos flujos con S1

Secuencia que el PIT exige (RF-04, RF-05, RF-08, RF-09), con el presupuesto S1:

```
Día 0        RF-04  mensaje automático saliente (WhatsApp)  → consume 1 del presupuesto
   ↓          el cliente responde la placa (cuándo, no lo decide el PIT)
Día 0..N     captura de placa válida e inequívoca (RF-04.5-7)
   ↓          RF-05 queda DESBLOQUEADA por su condición de placa
Día 0..N     RF-05 solicitud de reseña  → ¿ cabe en el presupuesto ?
```

**Caso límite central:** la captura de placa ocurre normalmente **dentro de los
15 días** del mensaje RF-04. Con S1, RF-05 choca contra el presupuesto que
acaba de consumir RF-04 y queda **reprogramada al día 15+**.

### 12.3 Hallazgo relevante: el conflicto RF-04 → RF-05 **no lo causa S1**

|RF-04 y RF-05 son **ambos** mensajes automáticos por WhatsApp (RF-09 les asigna
ventanas de WhatsApp). Por tanto:

> **El bloqueo de RF-05 dentro de los 15 días ocurre igualmente bajo S1 y bajo
> S2.** Cambiar de canal no resuelve nada, porque los dos eventos están en el
> mismo canal.

La pregunta real es **si RF-04 consume el presupuesto**, que es ortogonal a
S1/S2. Esto importa para no decidir S1 cargando sobre ella un problema que no
le corresponde.

### 12.4 Precedencia definida (punto 3 del encargo)

Orden **expreso**, sin excepciones silenciosas:

| # | Compromiso | Fuente |
| --- | --- | --- |
| 1 | **Condición de disparo de RF-05**: debe existir placa válida e inequívoca. Es **previa y necesaria**; sin ella, RF-05 no se evalúa siquiera. | pit.md:216, CP-06 |
| 2 | **RF-08 (15 días) es incondicional y posterior**: se evalúa **después** de la condición de disparo y **no se desactiva, no se exceptúa** para ningún evento. | pit.md:266-280 |
| 3 | **RF-09 (horario, festivos, domingo)** se evalúa después de RF-08. | pit.md:286-294 |
| 4 | **Si RF-08 bloquea, RF-05 se REPROGRAMA conservando identidad e idempotencia.** No se cancela, no se pierde. | pit.md:280 (literal: «debe reprogramar el impacto, conservando su identidad e idempotencia») |
| 5 | **RF-05 se subordina explícitamente a la frecuencia global**: el propio PIT lo dice. No hay contradicción textual entre RF-05 y RF-08. | pit.md:224 |

Punto 4 tiene una **consecuencia de implementación** que ya hoy sería un defecto
si el código huérfano se cableara tal cual: `markReviewRequested()` escribe
`reviewRequestedAt` **en el momento de la decisión**, no del envío. Bajo esta
precedencia, una reseña **bloqueada** quedaría registrada como «solicitada» y
**se perdería para siempre**, incumpliendo el punto 4. Debe marcarse **solo en
el envío aceptado por el proveedor**.

### 12.5 Decisiones que se presentan a David `[PENDIENTE]`

S1 **no se implementa** hasta resolver D-01, que es la única que puede hacer
que S1 no preserve RF-04/RF-05.

#### D-01 · ¿RF-04 consume el presupuesto de 15 días?

| Opción | Descripción | Consecuencias |
| --- | --- | --- |
| **A1 — consume (recomendada)** | RF-04 es un mensaje automático saliente normal. | **RF-05 se reprograma a ≥15 días tras RF-04** de forma sistemática. Respeta literalmente RF-08 («independientemente de la cantidad de vehículos, baterías, ciclos o campañas», sin excluir ningún evento) y el propio RF-05 se subordina. Sin excepciones. Riesgo: la reseña llega tarde siempre; si el cliente nunca responde la placa, RF-05 puede no ser útil. |
| **A2 — no consume (excepción explícita)** | Categoría de mensaje de captura que no descuenta. | RF-05 podría salir a los ~2 días. **Requiere aprobar una excepción de negocio que el PIT no contempla** y que RF-08 no autoriza. Riesgo: si RF-04 no descuenta, cualquier reintento de captura tampoco descuenta → ventana de spam sin coste. Excepción ruidosa, no silenciosa; David debe firmarla. |

**Recomendación: A1.** Motivo: RF-08 no exime ningún evento y RF-05 ya acepta
subordinarse. Si el negocio necesita la reseña temprano, la palanca correcta no
es exceptuar RF-04, sino reconsiderar si la reseña merece un slot del
presupuesto.

#### D-02 · ¿Dónde se marca `reviewRequestedAt`?

**Recomendación: solo en el envío aceptado por el proveedor**, no en la decisión.
Es lo único compatible con el punto 4 (reprogramación con identidad e
idempotencia). Marcándolo en la decisión, S1 haría perder reseñas.

#### D-03 · Código huérfano con autoridad muerta

`REVIEW_MIN_DAYS`/`REVIEW_MAX_DAYS` y los offsets de mantenimiento
(`MAINTENANCE_*`) citan «§3» de un fichero **vacío**; `markReviewRequested`,
`isReviewRequested` e `isWithinReviewWindow` **no se usan**. El PIT RF-05 no fija
plazo. **Alternativas:** (a) eliminar el código huérfano; (b) re-autorizarlo con
un spec real; (c) dejarlo a la espera de C-04/T3. **No se toca nada** sin
decisión.

### 12.6 Pruebas de aceptación

#### Añadidas y ejecutadas ahora `[VERIFICADO]`

En `src/modules/lifecycle/eligibility.service.spec.ts`, bloque **«S1 · el límite
de 15 días es compartido entre canales»**:

| Escenario pedido | Prueba | Resultado |
| --- | --- | --- |
| **Cambio de canal** | `el where NO filtra channel (garantía estructural de S1)` — falla si alguien introduce `channel` y convierte S1 en S2 | **PASS** |
| **Cambio de canal** | `un SMS automático consumido bloquea el siguiente envío` | **PASS** |
| **Cambio de canal** | `un WhatsApp automático consumido también bloquea el siguiente` | **PASS** |
| **< 15 días / > 15 días** | `el cambio de canal no reinicia la ventana: día 16 sigue siendo el primero elegible` (0,5,10,14,15 bloquean; 16 permite) | **PASS** |
| **< 15 días / > 15 días** | ya existentes: `exactamente 15 días bloquea`, `menos de 15 días bloquea`, `más de 15 días permite` | **PASS** |
| Fallos no cuentan | `los mensajes QUEUED o fallidos (sentAt null) no consumen el presupuesto` — RF-08 exige no tratar un fallo como envío exitoso sin evidencia | **PASS** |

Suite completa: **47/47**.

#### No se pudieron añadir — y por qué `[BLOQUEADO]`

Los escenarios **placa válida**, **placa inválida** y **RF-05 nunca antes de
una captura válida** **no se pueden implementar como pruebas**: RF-04 y RF-05 no
existen (§12.1). Escribirlas pasaría por **fabricar código y fixtures inventados**
o por generar fallos artificiales, ambas cosas prohibidas.

Se dejan redactados como **criterios de aceptación**, listos para convertirse en
pruebas en cuanto C-04/T3 exista:

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| **AC-05.1** | ciclo sin placa y sin envíos automáticos previos | llega una respuesta con formato de placa colombiano **válido** e inequívoco | se asocia al ciclo correcto y RF-05 queda desbloqueada |
| **AC-05.2** | ciclo esperando placa | llega un texto **no** coincidente con los formatos admitidos | **no** se asocia nada, **no** se modifica ningún vehículo, el evento se conserva pendiente (pit.md:206) |
| **AC-05.3** | ciclo esperando placa | respuesta **ambigua** entre dos ciclos del cliente | **ningún** ciclo se modifica; se conserva evidencia |
| **AC-05.4** | captura de placa **válida** a las *N* días | se evalúa RF-05 | **primero** condición de placa (paso 1), **después** RF-08 (paso 2). RF-05 jamás se evalúa sin placa válida |
| **AC-05.5** | RF-04 enviado en el día 0 | RF-05 intenta ejecutarse dentro de los 15 días | RF-05 **se reprograma** conservando identidad e idempotencia; `reviewRequestedAt` **no** se marca |
| **AC-05.6** | reseña reprogramada | llega el día 15+ elegible | se envía una **única** vez y solo entonces se marca `reviewRequestedAt` |
| **AC-05.7** | cliente con automático reciente por **SMS** | RF-05 intenta ejecutarse por WhatsApp | bloqueada por G3 (S1 compartido) |

### 12.7 Qué NO se hizo

- **No se implementó S1** en `eligibility.service.ts`: el cambio de comportamiento
  sigue pendiente de D-01. Las pruebas de §12.6 fijan la semántica que ya existe
  y que S1 debe preservar, sin alterarla. **Confirmado por David 25-10-2026:**
  S1 aprobado como principio, implementación condicionada a D-01 **y** a
  demostrar la no interferencia con RF-04/RF-05.
- **No se implementaron AC-05.1 … AC-05.7** ni se inventaron plazos de
  RF-04/RF-05: ambas funciones siguen **sin decisión funcional aprobada**.
- No se creó ni aplicó índice ni migración.
- No se cableó RF-04/RF-05, ni se eliminó el código huérfano.
- No se tocó producción.

---

## 13. Revisión de la protección concurrente WhatsApp/SMS — 25-10-2026

Encargo de David: *«revisión de la protección concurrente de WhatsApp/SMS»*.
**Solo lectura**: no se modificó ningún camino de envío. Todo lo citado es
`[VERIFICADO]` sobre el código actual (HEAD `18ede0e`).

### 13.1 Qué está protegido hoy `[VERIFICADO]`

| Ruta | Protección | Ubicación |
| --- | --- | --- |
| WhatsApp | `eligibility.evaluate()` → G2/G3/G4/G5/G7, saltando sin mutar | `whatsapp.service.ts:276` |
| WhatsApp | Transacción + **`FOR UPDATE` sobre `customers`** (G3-02) | `whatsapp.service.ts:455,466` |
| WhatsApp | Consulta de **"en vuelo"** `AUTOMATIC/OUTBOUND/QUEUED` (G3-01) | `whatsapp.service.ts:478` |
| WhatsApp | Transición optimista `updateMany(SCHEDULED/ERROR → EXECUTING)` con `count===0 → null` | `whatsapp.service.ts:500-506` |
| WhatsApp | `sendPermit.evaluate(org,'WHATSAPP')` antes de cualquier efecto | `whatsapp.service.ts:423` |
| SMS | `sendPermit.evaluate(org,'SMS')` antes de cualquier efecto | `sms-execution.service.ts:74` |
| SMS | Transición optimista `updateMany(SCHEDULED/ERROR → EXECUTING)`, `count===0 → abort` | `sms-execution.service.ts:102-108` |
| SMS | Silencio comercial por horario (`COMMERCIAL` + quiet hours) | `sms-scheduler.ts:112-126` |

**La guarda optimista `updateMany` sí protege contra la doble ejecución de la
MISMA automatización**, por eso es redundante pero inocua. Lo que protege entre
automatizaciones **distintas del mismo cliente** en WhatsApp es la combinación
`FOR UPDATE` + consulta en vuelo.

### 13.2 Hallazgo nuevo (F1): la ventana `QUEUED → SENT` entre las dos lecturas

Secuencia de `executeDueAutomations` (un solo bucle, `for` secuencial):

```
línea 276   evaluate()           ← G3 consulta `sentAt NOT NULL`  FUERA de la transacción
línea 296   executeOneAutomation()
línea 455     $transaction        ← aquí se toma el candado
línea 466       FOR UPDATE customers
línea 478       findFirst(QUEUED) ← G3-01 consulta `status = QUEUED` DENTRO del candado
            ...fin de transacción: candado liberado
línea 630   markSent()           ← escribe `status=SENT` + `sentAt` FUERA del candado
```

**Las dos lecturas cubren condiciones distintas y ninguna cubre la transición:**

- `evaluate()` solo ve mensajes **ya enviados** (`sentAt NOT NULL`).
- `findFirst` solo ve mensajes **aún en cola** (`status = QUEUED`).
- `markSent` ocurre **fuera de la transacción y fuera del candado**
  (`whatsapp.service.ts:630`, sobre `message.update` propio, sin `FOR UPDATE`).

**Ventana:** si un mensaje pasa de `QUEUED` a `SENT` **entre** la línea 276 y
la línea 478 de una segunda automatización del mismo cliente, entonces:
`evaluate()` no lo contó (no tenía `sentAt` al leer) **y** `findFirst` no lo
encuentra (ya no es `QUEUED`) → **ambas lo dejan pasar** y se crean dos
mensajes automáticos con diferencia inferior a 15 días.

| Atributo | Valor |
| --- | --- |
| ¿Es real? | Sí: no hay ninguna lectura que cubra ambas condiciones a la vez, ni candado que cubra `markSent` |
| Tamaño de la ventana | Escala de **milisegundos** (entre `evaluate()` y el `findFirst`: `esEtapaDeMantenimiento`, `sendPermit`, `buildAutomaticContent`, apertura de transacción y `FOR UPDATE`) |
| ¿Reproducido? | **NO.** `[INFERIDO]` del orden de las lecturas; **no** se ensayó ni se observó en producción |
| ¿Agravante? | Sí: los ticks pueden solaparse (§13.3), lo que multiplica las parejas concurrentes |
| Estado de G3 con ello | **Sigue sin poderse cerrar** — es un motivo adicional y distinto a los ya registrados en §7 |

#### D-04 · Propuesta de cierre (NO implementada)

Consolidar **las dos condiciones en una sola consulta `findFirst` dentro de la
transacción**, con `OR`:

```ts
findFirst({
  where: {
    customerId: customer.id,
    type: AUTOMATIC, direction: OUTBOUND, deletedAt: null,
    OR: [
      { status: QUEUED },
      { sentAt: { not: null }, sentAt: { gte: hace15dias } },  // o la expresión equivalente
    ],
  },
})
```

Una **única sentencia** obtiene un `snapshot` consistente: o el mensaje es
`QUEUED` (aborta), o ya tiene `sentAt` visible (bloquea), y no hay instrucción
intermedia en la que escapar. **No requiere migración ni índice** (la lectura es
por `customerId`, ya cubierto por las FK/índices existentes) y **no filtra
`channel`**, de modo que respeta R1/S1.

**No se implementa** por tres razones, en este orden:

1. Toca el **camino de salida real** durante la **congelación operativa §10.1**.
2. Altera **cuándo se envía** un mensaje: semántica de negocio persistente, que
   AGENTS.md exige confirmación para modificar.
3. Su conveniencia depende de **D-01/S1**: si RF-04 no consume presupuesto, el
   cálculo de la ventana de 15 días dentro del candado cambia de forma.

**Requiere autorización explícita de David.** `[PENDIENTE]`

### 13.3 Hallazgo nuevo (F2): los ticks no tienen guarda de reentrada

| Dato | Valor |
| --- | --- |
| Disparador | `@Interval(60_000)` en `whatsapp.scheduler.ts:19` y `sms-scheduler.ts:23` |
| Lote | `SCHEDULER_BATCH_SIZE = 100` en ambos (`whatsapp.service.ts:70`, `sms-scheduler.ts:9`) |
| Guarda de reentrada | **NINGUNA** — `grep running/inFlight/isTicking/busy` → **0 coincidencias** en ambos ficheros |
| Riesgo | Un tick de **>60 s** (100 automatizaciones × ida y vuelta al proveedor) permite que **arranque el siguiente mientras el anterior aún corre** |

**Qué cubre el solape de ticks:**

- **Misma automatización**: lo salva `updateMany(... → EXECUTING)` con
  `count === 0 → null` — el segundo pierde y aborta. ✔
- **Automatizaciones distintas, mismo cliente (WhatsApp)**: lo salva
  `FOR UPDATE` — el segundo **espera** al primero en el candado y entonces ve
  su `QUEUED`. ✔ (salvo la ventana de F1).
- **Automatizaciones distintas, mismo cliente (SMS)**: **no hay nada**
  (§13.4). ✘

También consta que `expireStuckExecuting` (timeout 600 s) devuelve
`EXECUTING → ERROR` y permite reintento; ya está cubierto por el riesgo 3 de
§7 (fail-closed por mensaje `QUEUED` permanente) y por G3-01.

### 13.4 Balance SMS: qué protege y qué no `[VERIFICADO]`

| ¿Qué? | Estado | Detalle |
| --- | --- | --- |
| Política de salida | ✔ `sendPermit` | `sms-execution.service.ts:74` |
| Doble ejecución de **la misma** automatización | ✔ `updateMany` optimista | `sms-execution.service.ts:102-108` |
| Silencio comercial por horario | ✔ solo `purpose === 'COMMERCIAL'` | `sms-scheduler.ts:116-122` |
| **G2** (opt-out global) | ✘ **no se evalúa** | — |
| **G3** (15 días) | ✘ **no se evalúa** | — |
| **G4** (silencio 7 días) / **G5** (ventana) | ✘ **no se evalúan** | — |
| `FOR UPDATE` por cliente (G3-02) | ✘ **no existe** | solo hay `$transaction` en `sms-execution.service.ts:101` |
| Guarda de "en vuelo" entre automatizaciones | ✘ **no existe** | no hay equivalente a `whatsapp.service.ts:478` |

**Consecuencia concreta:** dos automatizaciones **SMS distintas** dirigidas al
mismo cliente, dentro del mismo tick, **ambas crean su fila `QUEUED`** y ambas
envían: cada una solo mira su propia automatización.

**Estado: LATENTE.** `[VERIFICADO]` producción tiene **16 820 automatizaciones,
todas `WHATSAPP_CLIENTS`, 0 SMS** (§11.3). No es una falla activa hoy. Si se
activa el canal SMS, pasa a serlo — ya registrado como riesgo 6 de §7 y §11.2.

### 13.5 Conclusión de la revisión

| | WhatsApp | SMS |
| --- | --- | --- |
| Gates de elegibilidad | ✔ completos (G2–G5, G7) | ✘ **ninguno** |
| Serialización por cliente | ✔ `FOR UPDATE` | ✘ ninguna |
| Anti-duplicado en vuelo | ✔ G3-01, **con ventana residual F1** | ✘ ninguno |
| Anti-doble-ejecución (misma automatización) | ✔ `updateMany` | ✔ `updateMany` |
| Política de salida | ✔ | ✔ |

- **WhatsApp**: protección **sólida** con **una ventana residual estrecha y no
  reproducida (F1)**, cerrable con **D-04** sin migración. **G3 no se declara
  cerrado.**
- **SMS**: protegido contra duplicados **de la misma** automatización, pero
  **sin ningún gate de negocio ni serialización**. Latente mientras no haya
  automatizaciones SMS.
- **D-04** y la activación de gates en SMS **quedan presentados, no
  implementados** — requieren decisión.

### 13.6 Qué NO se hizo en esta revisión

- No se modificó `whatsapp.service.ts`, `sms-execution.service.ts`,
  `sms-scheduler.ts` ni `whatsapp.scheduler.ts`.
- No se creó ni aplicó índice o migración.
- No se implementó D-04 ni se añadieron gates a SMS.
- No se desactivó ninguna guarda existente.
- No se ejecutó ningún envío (política `DENIED`).
