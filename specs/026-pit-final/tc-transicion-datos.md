# T-C-FINAL — Transición de datos y automatizaciones históricas

> **Estado: PREPARADO, NO EJECUTADO.** Ninguna sentencia de este documento se ha
> aplicado. No se ha escrito en PostgreSQL, Redis ni colas. No se ha modificado,
> cancelado ni reprogramado ninguna automatización existente.
>
> Contención intacta durante todo el trabajo: `OUTBOUND_SEND_ENABLED=DENIED`,
> `OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS` y `OUTBOUND_SEND_ALLOWED_CHANNELS`
> vacías (verificado en el contenedor en ejecución).

---

## 1. Qué cambió en la lógica activa

| | Antes | Ahora |
|---|---|---|
| Base de `commercial_cycles.start_date` | fecha de **instalación** (en `automations.service`) o de **compra** (en `campaigns.service`): dos bases | fecha de **compra** del ERP, unificada en los tres escritores |
| Requisito para entrar al ciclo | `installationDate` presente (gate G8) | `purchaseDate` presente (gate G8 evalúa `cycle.startDate`) |
| Hitos generados | `+3d`, `+6m`, `+12m` desde la instalación | RF-03 revisiones bimensuales, RF-07 preaviso −30d, RF-06 retención +60d/+90d/+6m/+12m/+18m, todos desde compra/vencimiento |

Detalle en el informe consolidado. Este documento cubre **solo** el efecto sobre
los datos que ya existen.

---

## 2. Registros que quedan obsoletos (y por qué NO se tocan)

### 2.1 Automatizaciones del calendario heredado

| `stage_name` | Estado | Filas | ¿La crea aún el motor? |
|---|---|---:|---|
| `Seguimiento postventa (Mes 12)` | `SCHEDULED` | 5 505 | **No** |
| `Seguimiento postventa (Mes 6)` | `SCHEDULED` | 2 912 | **No** |
| `Seguimiento postventa (Día 3)` | `EXECUTED` | 5 507 | **No** |
| `Seguimiento postventa (Mes 6)` | `EXECUTED` | 2 595 | **No** |
| `Seguimiento postventa (Mes 12)` | `EXECUTED` | 2 | **No** |

- **8 417 `SCHEDULED`**: 8 381 con `scheduled_date` futura (máx. `2027-09-27 12:00`) y 36 ya vencidas. Son el objetivo natural de la transición.
- **8 104 `EXECUTED`**: son envíos ya realizados. **Histórico, no se revierte ni se toca bajo ningún concepto.**

Estos hitos enumerados en `automations.service` (`addDays(installationDate, 3)`,
`addMonths(installationDate, 6)`, `addMonths(installationDate, 12)`) procedían de
`specs/025-lifecycle-postventa/spec.md`, que está **vacío** y por tanto ya no
aporta autoridad funcional. El PIT (`specs/026-pit-final/pit.md`) define las
etapas de la tabla de arriba pero **no fija ningún desplazamiento** para el
contacto inicial de captura de placa (RF-04), así que no se ha inventado un
plazo sustituto. Esa ausencia queda registrada como requisito pendiente, no como
regla.

### 2.2 Hitos que SÍ coinciden con el PIT y no deben tocarse

| `stage_name` | Estado | Filas |
|---|---|---:|
| `Vencida +60 días` | `SCHEDULED` / `CANCELLED` | 16 / 13 |
| `Vencida +90 días` | `SCHEDULED` / `CANCELLED` | 16 / 13 |
| `Vencimiento −30 días` | `SCHEDULED` / `CANCELLED` / `EXECUTED` | 13 / 13 / 3 |
| `Revisión +60/120/180/240/300/360/420/480/540/600 días` | `SCHEDULED` | 67 en total |
| `Revisión mitad de garantía (Mes 6)` | `EXECUTED` / `PAUSED` | 14 / 9 |

Son coherentes con RF-06 y RF-07 (o son histórico ya ejecutado). Quedan fuera de
la transición.

---

## 3. Ciclos con `start_date` heredada

De 5 528 ciclos vigentes:

| Relación con la compra | Ciclos |
|---|---:|
| `start_date = purchase_date` | 5 516 |
| `start_date ≠ purchase_date` (creados por `campaigns` con base de compra y luego… o por `automations` con base de instalación) | **12** (`ACTIVE`) |
| `start_date = installation_date` | 5 501 |

Los **12 `ACTIVE`** son los que deben migrar su `start_date` a `purchase_date`
para que lector y escritor compartan semántica. Además hay **27 compras sin
`installationDate`**: bajo la regla anterior quedaban fuera del lifecycle; con la
decisión aprobada son elegibles, pero **no se les crea ciclo aquí** — eso es
escritura en base de datos y queda como operación a ejecutar tras la
aprobación.

---

## 4. Plan de transición (requiere autorización explícita)

Ninguno de estos pasos se ha ejecutado.

### 4.1 Precomprobaciones

```sql
-- P1 · Coherencia de la base antes de migrar
SELECT count(*) FROM commercial_cycles c JOIN purchases p ON p.id = c.purchase_id
WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL
  AND c.start_date IS DISTINCT FROM p.purchase_date;
-- Esperado: 12 (o el número que reporte la P1 en el momento de aplicar)

-- P2 · Nada debe estar ya encolado ni en curso
SELECT count(*) FROM automations
WHERE deleted_at IS NULL AND status IN ('PENDING','EXECUTING','ERROR');
-- Esperado: 0. Si no lo es, detener: hay que drenar antes de tocar nada.
```

### 4.2 Respaldo

```sql
CREATE TABLE backup_tcf_automations AS
SELECT id, uuid, status, scheduled_date, stage_name, commercial_cycle_id, updated_at
FROM automations
WHERE deleted_at IS NULL
  AND stage_name IN ('Seguimiento postventa (Mes 6)','Seguimiento postventa (Mes 12)');

CREATE TABLE backup_tcf_cycles AS
SELECT c.id, c.start_date AS start_date_previo, p.purchase_date
FROM commercial_cycles c JOIN purchases p ON p.id = c.purchase_id
WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL
  AND c.start_date IS DISTINCT FROM p.purchase_date;
```

### 4.3 Escrituras (a ejecutar solo tras OK)

```sql
-- E1 · Unificar la base del ciclo (12 filas)
UPDATE commercial_cycles c SET start_date = p.purchase_date
FROM purchases p
WHERE p.id = c.purchase_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL
  AND c.start_date IS DISTINCT FROM p.purchase_date;

-- E2 · Neutralizar el calendario heredado NO terminal (8 417 filas).
--      CANCELLED, no se borra: preserva la auditoría y es reversible.
UPDATE automations SET status = 'CANCELLED', updated_at = now()
WHERE deleted_at IS NULL AND status IN ('SCHEDULED','ERROR')
  AND stage_name IN ('Seguimiento postventa (Mes 6)','Seguimiento postventa (Mes 12)');

-- E3 · Backfill de los hitos PIT que falten por ciclo activo (RF-03/RF-06/RF-07).
--      NO se incluye aquí: exige el generador nuevo y una corrida en seco previa.
```

**E3 está deliberadamente ausente.** Para las compras con garantía (`warranty_months`
no nulo, hoy 27 filas) el calendario PIT no existe todavía. Las 5 509 compras sin
`warranty_months` **no entran** en el ciclo: sin duración de garantía no hay
ventana sobre la que programar revisiones ni preaviso, y no se inventa una.

### 4.4 Postcomprobaciones

```sql
-- V1 · Cero ciclos con base divergente
SELECT count(*) FROM commercial_cycles c JOIN purchases p ON p.id = c.purchase_id
WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL
  AND c.start_date IS DISTINCT FROM p.purchase_date;                       -- 0

-- V2 · Cero automatizaciones heredadas tomables por el scheduler
SELECT count(*) FROM automations
WHERE deleted_at IS NULL AND status IN ('PENDING','SCHEDULED','EXECUTING','ERROR')
  AND stage_name IN ('Seguimiento postventa (Mes 6)','Seguimiento postventa (Mes 12)');
                                                                            -- 0

-- V3 · Ninguna automatización programada en el pasado sin ejecutar
SELECT count(*) FROM automations
WHERE deleted_at IS NULL AND status IN ('SCHEDULED','ERROR')
  AND scheduled_date <= now();                                             -- 0
```

### 4.5 Reversión

```sql
-- R1 · Restaurar el calendario heredado desde el respaldo
UPDATE automations a SET status = b.status
FROM backup_tcf_automations b
WHERE a.id = b.id AND a.deleted_at IS NULL AND a.status = 'CANCELLED';

-- R2 · Restaurar la base previa de los ciclos
UPDATE commercial_cycles c SET start_date = b.start_date_previo
FROM backup_tcf_cycles b WHERE c.id = b.id;

DROP TABLE backup_tcf_automations;
DROP TABLE backup_tcf_cycles;
```

---

## 5. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| E2 cancela 8 417 automatizaciones que el cliente esperaba recibir | **Alta** | Requiere aprobación humana explícita. Los textos nunca se enviaron (`OUTBOUND_SEND_ENABLED=DENIED` en toda la ventana), así que no haydamage de comunicación previa que revertir. |
| E1 cambia `start_date` de 12 ciclos y re-deriva sus lecturas de rango | Media | E1 es idempotente y reversible con R2. |
| E3 sin cobertura: 27 compras con garantía quedan sin hitos PIT | Media | Es exactamente lo que bloquea el paso siguiente; no se simula con plazos inventados. |
| 5 509 compras sin `warranty_months` sin ciclo | Baja | Correcto según PIT: sin garantía no hay revisiones ni preaviso. Requiere que el ERP provea la duración. |
| Las 8 104 `EXECUTED` no se revierten | — | Intencionado. Un envío realizado es un hecho, no un registro de estado. |

---

## 6. Requisito que sigue bloqueado

**RF-04 / RF-05 — contacto inicial de captura de placa y solicitud de reseña.**
El PIT describe la acción y el contenido esperado, pero no fija desplazamiento
temporal. Por la decisión aprobada #3 ("los plazos no respaldados por el PIT se
descartan"), **no se ha implementado ninguna automatización para ellas**, ni se
ha inventado un plazo sustituto. Además siguen abiertas, de forma independiente:

- **P0.6** — plantillas de placa no aprobadas con el proveedor.
- **P1.3** — formato de la placa sin definir.

Hasta que las tres se resuelvan, RF-04/RF-05 no es implementable, y su
implementación no bloquearía el resto del bloque T-C.