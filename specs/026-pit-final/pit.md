# PIT-BDC-POSTVENTA-001
## Plan de Implementación de Trabajo — Automatización de Posventa
**Proyecto:** Automatize IT Platform  
**Cliente piloto:** Baterías del Caribe (BDC)  
**Versión:** 0.1 — Base de implementación controlada  
**Estado:** Especificación funcional consolidada; auditoría técnica T0 pendiente de ejecución/verificación  
**Prioridad:** Entrega funcional demostrable, con alcance congelado  
**Sistema de mensajería:** Pancake  
**Fecha de elaboración:** 10 de octubre de 2026  
**Responsable funcional y técnico:** David  
**Metodología:** PIT + Spec-Driven Development

---

# 1. Propósito

Implementar y verificar un sistema de posventa que administre automáticamente el ciclo de cada compra de batería, desde la recepción de la venta del ERP hasta el cierre de la campaña de garantía y la transición a retención comercial.

El sistema debe programar contactos, aplicar las reglas de elegibilidad, evitar duplicados, respetar las restricciones de frecuencia y horario, gestionar respuestas de los clientes y mantener evidencia auditable de cada etapa.

La entrega no se considerará completa porque el código compile o porque una automatización aparezca como programada. Debe demostrarse el recorrido funcional de extremo a extremo y el comportamiento de sus principales reglas de bloqueo.

## 1.1 Resultado de negocio esperado

- Reducir el trabajo manual de seguimiento de posventa.
- Ofrecer revisiones de garantía de manera sistemática.
- Obtener la placa para asociar el seguimiento al vehículo correcto.
- Solicitar reseñas de Google después de la captura válida de placa.
- Activar la retención comercial al vencer la garantía.
- Evitar la saturación de los clientes con mensajes automáticos.
- Mantener trazabilidad de compras, vehículos, campañas, mensajes y resultados.

## 1.2 Resultado técnico esperado

Un flujo demostrable:

**Importación ERP → validación → compra/ciclo → programación → evaluación de reglas → envío mediante Pancake → recepción de respuesta → actualización del registro → siguiente etapa.**

El sistema debe ser idempotente, auditable y recuperable ante fallos.

---

# 2. Estado y autoridad documental

Este PIT organiza las decisiones funcionales y técnicas. No reemplaza la especificación funcional principal del proyecto, identificada previamente como `spec-025`, ni autoriza por sí mismo cambios operativos.

Orden de autoridad:

1. Decisiones funcionales aprobadas por el negocio.
2. Especificación funcional principal vigente y sus anexos aprobados.
3. Este PIT y su matriz de trazabilidad.
4. Diseño técnico aprobado.
5. Implementación, pruebas y evidencias.

Si el código existente contradice una regla aprobada, no se debe asumir que el código tiene razón. Se documenta la discrepancia, se determina su impacto y se corrige mediante una tarea autorizada.

Toda modificación de requisitos debe registrar: identificador, motivo, responsable, impacto, pruebas afectadas y aprobación.

## 2.1 Control de cambios

Registro de decisiones funcionales y requisitos modificados. Este control no autoriza por sí mismo ninguna operación: la autorización se rige por §13.

| Fecha | ID | Cambio | Motivo | Responsable | Impacto | Pruebas afectadas | Aprobación |
|---|---|---|---|---|---|---|---|
| 2026-10-10 | **D-1** | **Resuelta.** La fecha base del ciclo es la **fecha de compra registrada en el ERP**. No se sustituye por la fecha de instalación. | La auditoría T0 detectó que el requisito y la implementación existing divergían sobre la fecha base; la divergencia no podía resolverse por intuición | David (responsable funcional y técnico), conforme a RF-02 | Define el anclaje de RF-02, RF-03, RF-07 y RNF-07. **No implementa ni habilita nada** | T1.2, T1.3, T5.2 y las pruebas de calendario | Aprobada como decisión funcional. **No autoriza implementación, migración, backfill ni acción en producción** |
| 2026-10-10 | **P1.8** | **Definida.** El vencimiento se calcula **sumando meses calendario** a la fecha base. Se conserva el día del mes cuando existe en el mes de destino; si no existe, se ajusta al **último día válido de ese mes** | P1.8 («regla exacta de vencimiento en fin de mes») estaba abierta y bloqueaba el criterio de RF-02 «casos de fin de mes documentados y probados» | David (responsable funcional y técnico) | Cierra la ambigüedad de cálculo de RF-02 y fija el comportamiento de fin de mes | T1.2 y pruebas de límites de calendario | Aprobada como decisión funcional. **No autoriza implementación** |

**Alcance de la regla de P1.8.** Casos que define:

- 31 de enero + 1 mes → 28 de febrero en año común; → 29 de febrero en año bisiesto.
- 30 de enero + 1 mes → 28 o 29 de febrero, según corresponda.

Esta regla se define únicamente para el **cálculo hacia adelante** previsto en este PIT (vencimiento y revisiones hacia meses posteriores). No se documenta ni se aprueba un cálculo inverso; cualquier necesidad de resta de meses sería una decisión nueva.

**Nota de vigencia.** Las decisiones D-1 y P1.8 resuelven la ambigüedad funcional, no la implementación. El código actual sigue calculado desde la fecha de instalación y con multiplicador de días; esa discrepancia se mantiene registrada como brecha hasta que una tarea autorizada la corrija.

# 3. Alcance

## 3.1 Incluido

- Importación de compras desde el ERP.
- Validación de datos obligatorios y registro de errores de importación.
- Ciclos de garantía vinculados a compras y vehículos.
- Duraciones de garantía de 12, 15, 18 y 24 meses.
- Contacto inicial para capturar la placa.
- Validación y asociación de placas.
- Solicitud de reseña de Google después de una placa válida.
- Revisiones durante la garantía en los meses 2, 4, 6, 8, 10, 12, etc.
- Transición automática a una campaña independiente de retención.
- Secuencia de retención aprobada.
- Control global de frecuencia de mensajes automáticos.
- Horarios por tipo de campaña y reprogramación.
- Bajas de automatizaciones, pausas, reanudaciones y recuperación.
- Gestión de respuestas y estados de mensajería.
- Integración con Pancake.
- Pruebas, observabilidad, demostración y evidencia de aceptación.

## 3.2 Fuera de alcance sin aprobación adicional

- Migrar el sistema a WACRM.
- Reescribir la arquitectura general o realizar refactors no indispensables.
- Reemplazar Pancake como proveedor de mensajería.
- Incorporar campañas de marketing no descritas aquí.
- Enviar mensajes reales durante la auditoría.
- Ejecutar backfills históricos, migraciones o modificaciones de producción sin autorización explícita.
- Construir dashboards, aplicaciones móviles o analítica avanzada que no sean necesarias para demostrar el flujo principal.

## 3.3 Regla de alcance

Ante un hallazgo adicional, no se amplía automáticamente el trabajo. Se clasifica como:

- Bloqueante para la entrega.
- Necesario, pero separable.
- Mejora posterior.

Solo los bloqueantes necesarios para cumplir los criterios de aceptación entran en el alcance inmediato.

---

# 4. Requisitos funcionales

## RF-01. Ingreso de compras

El sistema recibe registros procedentes del ERP y valida los datos requeridos antes de incorporarlos al lifecycle.

Como mínimo, verificar:

- Identificador de compra o instalación.
- Identificador del cliente.
- Teléfono/WhatsApp utilizable.
- Fecha de compra registrada en el ERP.
- Referencia o producto.
- Duración de garantía válida.
- Organización a la que pertenece el registro.
- Información de vehículo disponible, incluida la placa cuando exista.

**Regla:** si falta cualquiera de los tres datos críticos identificados por el negocio —teléfono, fecha de compra o duración de garantía—, la fila no ingresa al lifecycle.

La ausencia de duración no se resuelve con un valor predeterminado. Se rechaza la fila y se registra el motivo en `failed_sync_logs`.

La referencia del producto debe verificarse según el contrato real de importación. Si también es obligatoria y falta, se aplica el mismo tratamiento de rechazo.

**Criterios de aceptación**

- Una fila válida genera o actualiza el registro según las reglas de idempotencia.
- Una fila inválida no genera automatizaciones.
- Cada rechazo registra un motivo legible, la referencia de origen disponible y la fecha del intento.
- Reprocesar una fila corregida no crea compras o ciclos duplicados.

## RF-02. Inicio y duración de garantía

La fecha base es la fecha de compra registrada en el ERP, no la fecha de instalación. Esta regla queda **confirmada por la decisión D-1** (§2.1, 2026-10-10): la cláusula de excepción prevista en versiones anteriores de este requisito queda cerrada y la fecha de instalación no puede sustituir a la de compra.

Duraciones admitidas:

- 12 meses.
- 15 meses.
- 18 meses.
- 24 meses.

La duración debe provenir del catálogo o de un campo validado de la fuente de datos. El sistema no debe inferirla a partir del nombre comercial sin una regla aprobada.

El cálculo del vencimiento debe estar centralizado y ser determinista. **El vencimiento se obtiene sumando meses calendario a la fecha base, conforme a la decisión P1.8 (§2.1, 2026-10-10): se conserva el día del mes cuando existe en el mes de destino y, si no existe, se ajusta al último día válido de ese mes.** Esta regla sustituye a la necesidad de definir, de forma abierta, cómo se manejan las compras realizadas el 29, 30 o 31 de un mes.

**Criterios de aceptación**

- El mismo registro siempre produce la misma fecha de vencimiento.
- Los casos de fin de mes tienen resultados documentados y probados conforme a la regla de P1.8.
- La fecha de compra no se sustituye por la fecha de instalación.
- Una garantía inválida bloquea la programación.

## RF-03. Campaña de garantía

Cada compra elegible genera un ciclo identificable de garantía.

Durante la vigencia se programan revisiones cada dos meses desde la fecha base —la fecha de compra registrada en el ERP, conforme a D-1 y RF-02—: meses 2, 4, 6, 8, 10, 12, 14, etc., hasta el vencimiento, sin programar revisiones fuera de la garantía.

El contacto inicial de captura de placa es una etapa diferenciada y no sustituye las revisiones posteriores.

La campaña tiene, como mínimo, estados equivalentes a:

- ACTIVE.
- EXPIRING, cuando corresponda según la regla de anticipación aprobada.
- COMPLETED/CLOSED, al terminar la vigencia y cerrarse correctamente la campaña.

Los nombres definitivos deben alinearse con el modelo de datos existente, sin duplicar estados que ya cumplan la misma función.

## RF-04. Contacto inicial y captura de placa

El primer mensaje tiene como objetivo solicitar la placa del vehículo y explicar que es necesaria para activar las revisiones gratuitas de garantía.

Plantilla funcional:

> ¡Hola, {{1}}! ⭐ Esperamos que tu vehículo esté funcionando al 100% con tu nueva batería {{2}}. Para activar tus revisiones gratis de garantía, por favor responde a este mensaje escribiendo la PLACA de tu carro.

La plantilla final, sus variables y su aprobación deben comprobarse en Pancake/WhatsApp antes de un envío real.

### Procesamiento de la respuesta

1. Recibir el evento de respuesta mediante la integración disponible.
2. Identificar la conversación, el cliente y la compra/ciclo candidatos.
3. Normalizar el texto y validar el formato colombiano de placa.
4. Determinar si el ciclo al que corresponde la respuesta puede identificarse sin ambigüedad.
5. Si la placa es válida y la asociación es inequívoca, guardar la placa en el registro correcto.
6. Registrar la evidencia de captura y continuar con la solicitud de reseña.
7. Si la respuesta no es válida o la asociación es ambigua, conservar el evento y dejarlo pendiente de resolución; no modificar otro vehículo por aproximación.

La expresión regular no debe ser el único mecanismo de validación: debe contemplar los formatos de placa admitidos por el negocio y evitar aceptar cualquier texto que coincida accidentalmente.

### Ausencia de respuesta

Si el cliente no responde, no se envía un recordatorio adicional de captura de placa. La etapa queda pendiente o expirada según una política de estados aprobada. No se debe inventar una fecha límite.

## RF-05. Solicitud de reseña de Google

La solicitud de reseña se envía únicamente después de capturar una placa válida y asociarla al ciclo correcto.

Mensaje funcional:

> ¿Nos regalas un minuto dejando una reseña en Google? Nos ayudas un montón a que más conductores nos encuentren.

Debe incluir el CTA aprobado para la reseña.

La solicitud no se dispara solo porque hayan transcurrido 48 horas desde la compra. La condición principal es la captura válida de placa; además, se debe respetar el horario permitido, la frecuencia global y las políticas de WhatsApp.

Si la placa se recibe fuera de la ventana permitida, la solicitud se programa para la siguiente ventana elegible. Si no hay placa válida, no se envía la reseña automáticamente.

## RF-06. Vencimiento y transición a retención

La campaña de garantía termina en la fecha de vencimiento calculada.

En la transición, el sistema debe:

1. Marcar la campaña de garantía como finalizada.
2. Cancelar o invalidar las etapas de garantía pendientes que ya no correspondan.
3. Evitar que las etapas canceladas vuelvan a ejecutarse.
4. Crear o activar la campaña de retención correspondiente.
5. Programar sus impactos comerciales.
6. Registrar las operaciones de transición y su resultado.

La transición debe ser atómica cuando el diseño de persistencia lo permita; de lo contrario, debe ser recuperable e idempotente. No puede dejar al cliente sin ambas campañas ni activo en dos campañas incompatibles.

### Secuencia aprobada de retención

- Primer impacto: +60 días desde el vencimiento.
- Segundo impacto: +90 días desde el vencimiento.
- Tercer impacto: +6 meses desde el vencimiento.
- Cuarto impacto: +12 meses desde el vencimiento.
- Quinto impacto: +18 meses desde el vencimiento.

La secuencia es específica, no una cadencia fija cada dos meses. El punto de referencia para cada fecha es el vencimiento original de garantía, no la fecha en que se envió el impacto anterior.

El contenido final de cada plantilla comercial y sus condiciones específicas deben documentarse antes de habilitar los envíos correspondientes.

## RF-07. Vencimiento próximo

Se requiere una etapa previa al vencimiento, 30 días antes de la fecha de vencimiento, con la ventana:

- Martes o miércoles.
- De 9:30 a. m. a 11:00 a. m.

Debe comprobarse que la regla se aplica correctamente a todas las duraciones admitidas y que no se programa una etapa después de la expiración.

## RF-08. Control global de frecuencia

Independientemente de la cantidad de vehículos, baterías, ciclos o campañas que tenga un cliente, se permite como máximo un mensaje automático saliente cada 15 días calendario por número de WhatsApp.

El control debe ser global entre campañas, no local a cada ciclo.

Antes de enviar un mensaje automático, el sistema debe evaluar:

- Historial de mensajes automáticos salientes del número.
- Fecha/hora de los mensajes relevantes.
- Estado de la automatización.
- Elegibilidad de la campaña.
- Ventana horaria y festivos.
- Estado de exclusión del cliente.
- Ausencia de una ejecución duplicada.

Si no cumple, debe reprogramar el impacto, conservando su identidad e idempotencia.

Debe definirse y probarse qué estados cuentan para el límite: como mínimo, el sistema debe impedir duplicar un envío ya aceptado por el proveedor y no debe considerar un fallo definitivo como un envío exitoso sin evidencia.

El cómputo debe usar una zona horaria de negocio explícita —Colombia— y evitar diferencias entre UTC, el reloj del servidor y el calendario comercial.

## RF-09. Horarios por tipo de mensaje

### Solicitud de reseña

- Ventana principal: 11:30 a. m.–1:30 p. m.
- Ventana secundaria: 6:30–8:00 p. m.
- Si las 48 horas se cumplen un domingo, la propuesta operativa indica mover el envío al lunes a las 11:30 a. m.

Esta regla de domingo se aplica al evento de reseña únicamente y debe respetar la condición de captura válida de placa.

### Revisiones durante la garantía

- Sábados: 8:30–10:30 a. m.
- Martes o jueves: 4:00–5:30 p. m.

### Vencimiento próximo

- Martes o miércoles: 9:30–11:00 a. m.
- Fecha objetivo: 30 días antes del vencimiento.

### Garantía vencida / retención

- Jueves: 5:30–7:00 p. m.
- Viernes: 2:00–4:00 p. m.

### Reprogramación

Si el impacto coincide con una hora no permitida, un festivo o un día no válido para su tipo de campaña, se reprograma para la siguiente ventana válida de ese tipo.

El algoritmo debe respetar simultáneamente el calendario de la campaña y el límite global de frecuencia.

Los horarios se seleccionan dentro de la ventana correspondiente. Los minutos irregulares solicitados por el negocio son una preferencia de distribución, no un mecanismo para evadir controles de WhatsApp ni una garantía de mayor tasa de lectura.

Antes de implementar, se deben inspeccionar las reglas horarias actuales, el calendario de festivos y cualquier restricción técnica del proveedor.

## RF-10. Exclusión voluntaria

Cuando el cliente solicita no recibir recordatorios de mantenimiento:

1. Cancelar o invalidar las automatizaciones de mantenimiento y seguimiento automático cubiertas por la solicitud.
2. Aplicar la etiqueta `NO_SEGUIMIENTO`.
3. Evitar que tareas ya en cola se envíen posteriormente.
4. Registrar la solicitud, su fecha y su origen.
5. Conservar la trazabilidad de los registros cancelados.

El negocio permite que un asesor realice contactos manuales, pero esto no autoriza a ignorar las restricciones legales, las políticas de Meta/WhatsApp, las plantillas exigidas o una solicitud de oposición más amplia que también cubra esos contactos.

La semántica exacta de `NO_SEGUIMIENTO` debe distinguir una baja de automatizaciones de una prohibición general de contacto, si el sistema soporta ambos casos.

## RF-11. Mensajes manuales

Los mensajes manuales de asesores no están sujetos al límite interno de un mensaje automático cada 15 días.

El asesor puede iniciar un contacto cuando las reglas y permisos aplicables del canal lo permitan. La implementación debe distinguir:

- Mensaje manual.
- Mensaje automático.
- Mensaje de plantilla.
- Respuesta dentro de una ventana de atención permitida.

Los mensajes manuales deben seguir quedando registrados y no pueden utilizarse para eludir restricciones legales o del proveedor.

## RF-12. Pausa y reanudación

Al pausar un ciclo:

- No se eliminan las fechas originales.
- Se impide la ejecución de etapas que deban permanecer suspendidas.
- Se conserva la identidad de cada etapa pendiente.

Al reanudar:

- Se evalúan las fechas originales.
- Se identifican etapas vencidas.
- Se recalculan los próximos envíos conforme a la política aprobada.
- Se aplican nuevamente todas las reglas de elegibilidad.
- No se duplican etapas ejecutadas.

## RF-13. Recuperación después de una caída

Cuando el sistema vuelve a operar, identifica las etapas vencidas.

Solo puede procesarlas si siguen siendo elegibles, no han sido ejecutadas ni duplicadas, la campaña continúa activa y se cumplen las reglas de frecuencia, horario, exclusión y canal.

No se permite un envío masivo de recuperación que ignore las restricciones de contacto.

## RF-14. Nueva compra y múltiples vehículos

Cada nueva compra representa un nuevo ciclo potencial, pero debe resolverse la identidad del vehículo.

Regla del negocio:

- Si llega una nueva instalación para un número de WhatsApp que ya tiene un ciclo activo y ninguno de los dos registros tiene placa para desempatar, se asume un reemplazo absoluto.
- La campaña anterior debe cerrarse y su historial conservarse.
- La nueva compra inicia su propia campaña de garantía.
- Cuando las placas permiten distinguir vehículos, el sistema debe mantener ciclos independientes para vehículos diferentes.

La captura de placa en el primer contacto busca reducir la incertidumbre futura.

Antes de ejecutar el reemplazo, la implementación debe definir transaccionalmente qué sucede con las automatizaciones pendientes de la campaña anterior, qué estado de cierre se utiliza y cómo se preserva la trazabilidad.

La regla de reemplazo es una decisión de negocio explícita, pero su aplicación automática debe ser auditable porque una placa ausente también puede corresponder a un cliente con varios vehículos.

## RF-15. Resultados y estados

Cada etapa debe distinguir, al menos, entre:

- Programada.
- En proceso, si aplica.
- Enviada/aceptada por proveedor.
- Entregada, cuando exista confirmación del proveedor.
- Fallida.
- Reprogramada.
- Cancelada.
- Respuesta pendiente.
- Resultado registrado, cuando corresponda.

Estos estados son conceptuales; se deben mapear a los estados reales del modelo de datos, evitando crear duplicados semánticos.

La respuesta del cliente, la revisión realizada y la intención de recompra son resultados de negocio distintos del estado técnico de envío.

La captura de resultado —y quién la registra— queda pendiente de definición con el negocio. Hasta entonces, no se debe afirmar que el sistema registra una revisión o intención comercial solo porque envió un mensaje.

---

# 5. Requisitos no funcionales

## RNF-01. Idempotencia

Reprocesar un evento, una compra o una etapa no puede crear envíos ni ciclos duplicados.

## RNF-02. Trazabilidad

Cada etapa debe poder vincularse con:

- Compra de origen.
- Cliente y, cuando aplique, vehículo.
- Campaña.
- Regla de elegibilidad.
- Fecha planificada y fecha efectiva.
- Mensaje o identificador del proveedor.
- Estado final.
- Motivo de bloqueo, fallo o cancelación.

## RNF-03. Seguridad

Los secretos de Pancake, credenciales y datos de clientes no deben aparecer en logs, prompts ni reportes de diagnóstico.

## RNF-04. Recuperación

Un fallo temporal no debe eliminar silenciosamente etapas ni generar envíos duplicados al reintentarse.

## RNF-05. Observabilidad

Debe poder distinguirse una automatización programada de un envío real confirmado por el proveedor.

## RNF-06. Compatibilidad

La implementación debe seguir el stack y las convenciones del repositorio existente. No se cambia de framework, proveedor o arquitectura por conveniencia.

## RNF-07. Zona horaria

Las fechas comerciales se interpretan según `America/Bogota`, con persistencia consistente y conversiones explícitas.

---

# 6. Diseño técnico a verificar antes de aprobar

No se presume que estas capacidades ya estén correctamente implementadas. T0 debe determinar su estado real.

1. Importador del ERP y validación de filas.
2. Modelos de compra, cliente, vehículo, garantía y ciclo.
3. Generador de automatizaciones y etapas futuras.
4. Motor de elegibilidad y reglas G1–G8.
5. Persistencia de mensajes y relación con cliente/conversación.
6. Adaptador de mensajería de Pancake.
7. Webhooks entrantes y asociación de respuestas.
8. Scheduler y reintentos.
9. Persistencia de estados, eventos y auditoría.
10. Configuración horaria y calendario de festivos.
11. Pruebas unitarias, de integración y end-to-end.
12. Migraciones necesarias y diferencias entre esquema, base de datos y artefacto desplegado.

**Decisión arquitectónica:** conservar Pancake como proveedor de mensajería y mantener las reglas de negocio dentro de Automatize IT Platform. El dominio de posventa no debe quedar acoplado innecesariamente al formato de los webhooks del proveedor.

---

# 7. Plan de ejecución por fases

## Fase 0 — T0: Auditoría de solo lectura

**Objetivo:** saber exactamente qué existe, qué funciona y qué falta.

Tareas:

- T0.1 Inspeccionar estado de Git y cambios locales.
- T0.2 Localizar especificación principal y reglas G1–G8.
- T0.3 Mapear modelos y relaciones de compra, cliente, ciclo, automatización y mensaje.
- T0.4 Verificar generación de calendario y fechas de garantía.
- T0.5 Revisar frecuencia, ventanas, festivos, exclusión y recuperación.
- T0.6 Revisar importador y registros `failed_sync_logs`.
- T0.7 Verificar la asociación histórica de mensajes con clientes.
- T0.8 Inspeccionar integración y configuración de Pancake.
- T0.9 Identificar migraciones pendientes y diferencias entre código, base de datos y artefacto desplegado.
- T0.10 Producir matriz de brechas con evidencia.

**Entregable:** informe T0, sin cambios en el sistema.

**Criterio de salida:** cada requisito crítico está marcado como implementado y verificado, parcialmente implementado, ausente o no verificable.

## Fase 1 — T1: Modelo de dominio y calendario

- T1.1 Documentar el modelo actual y sus límites.
- T1.2 Definir el cálculo de vencimiento y los casos de fin de mes.
- T1.3 Definir generación de revisiones bimensuales.
- T1.4 Definir la secuencia de retención desde el vencimiento original.
- T1.5 Definir cierre de campaña y cancelación de etapas pendientes.
- T1.6 Probar idempotencia de generación de etapas.

**Entregable:** diseño de calendario y pruebas deterministas.

**Criterio de salida:** las fechas calculadas son reproducibles y no generan etapas fuera de la campaña.

## Fase 2 — T2: Integridad de datos y relación cliente-mensaje

- T2.1 Validar los campos obligatorios del importador.
- T2.2 Verificar rechazo y auditoría de filas inválidas.
- T2.3 Verificar relación de mensajes salientes con el cliente.
- T2.4 Analizar el historial sin cliente asociado.
- T2.5 Proponer, con evidencia, cualquier backfill necesario.

**Restricción:** el análisis es de solo lectura. Un backfill necesita autorización explícita antes de ejecutarse.

**Criterio de salida:** las reglas de frecuencia pueden identificar el historial de mensajes pertinente, o existe una tarea correctiva aprobada y documentada.

## Fase 3 — T3: Captura de placa y solicitud de reseña

- T3.1 Verificar la plantilla inicial y sus variables.
- T3.2 Verificar el webhook de respuestas de Pancake.
- T3.3 Implementar validación de placas según formatos aprobados.
- T3.4 Asociar la respuesta al ciclo correcto.
- T3.5 Manejar respuestas inválidas y ambiguas.
- T3.6 Enviar la solicitud de reseña únicamente después de una captura válida.
- T3.7 Aplicar horarios y frecuencia global.

**Criterio de salida:** una respuesta válida activa el siguiente paso una sola vez; una respuesta inválida o ambigua no modifica un ciclo incorrecto.

## Fase 4 — T4: Transición de garantía a retención

- T4.1 Verificar fecha exacta de vencimiento.
- T4.2 Finalizar la campaña de garantía.
- T4.3 Invalidar etapas pendientes de garantía.
- T4.4 Activar la campaña de retención.
- T4.5 Programar +60d, +90d, +6m, +12m y +18m.
- T4.6 Evitar transiciones duplicadas.

**Criterio de salida:** una transición produce una sola campaña de retención y no deja recordatorios de garantía elegibles después del vencimiento.

## Fase 5 — T5: Reglas globales y excepciones

- T5.1 Implementar/verificar el límite de 15 días por número y canal.
- T5.2 Verificar ventanas horarias por campaña.
- T5.3 Verificar festivos y reprogramación.
- T5.4 Verificar `NO_SEGUIMIENTO`.
- T5.5 Verificar pausa y reanudación.
- T5.6 Verificar recuperación de etapas vencidas.
- T5.7 Verificar múltiples compras, reemplazo y múltiples vehículos.
- T5.8 Verificar manejo de fallos y reintentos.

**Criterio de salida:** todas las reglas críticas tienen pruebas positivas y negativas.

## Fase 6 — T6: Integración con Pancake

- T6.1 Verificar la cuenta y `page_id` configurados.
- T6.2 Consultar conversaciones, mensajes y plantillas usando operaciones de lectura.
- T6.3 Verificar formatos de webhook y autenticación.
- T6.4 Verificar mapeo de estados del proveedor.
- T6.5 Verificar límites de llamadas y reintentos.
- T6.6 Preparar una prueba controlada.

No se ejecuta un envío real hasta contar con aprobación explícita.

**Criterio de salida:** existe evidencia de conexión, plantillas, asociación de respuestas y comportamiento de estados; la evidencia distingue simulación de actividad real.

## Fase 7 — T7: Validación integral

- T7.1 Ejecutar pruebas unitarias.
- T7.2 Ejecutar pruebas de integración en entorno aislado.
- T7.3 Ejecutar pruebas de calendario y reglas.
- T7.4 Ejecutar pruebas de recuperación e idempotencia.
- T7.5 Demostrar el flujo en sandbox.
- T7.6 Documentar resultados, limitaciones y fallos.
- T7.7 Solicitar aprobación para una prueba real controlada, si procede.

**Criterio de salida:** el recorrido completo cumple los criterios de aceptación y el negocio puede observar evidencia verificable de cada etapa.

## Fase 8 — T8: Preparación de entrega

- T8.1 Revisar cambios y diffs.
- T8.2 Ejecutar pruebas, lint, typecheck y build aplicables.
- T8.3 Separar cambios por alcance funcional.
- T8.4 Documentar migraciones y orden de despliegue.
- T8.5 Preparar procedimiento de despliegue y reversión.
- T8.6 Solicitar aprobación explícita antes de commit, push, migración, deploy, reinicio o envío real, según corresponda.

**Criterio de salida:** paquete de entrega reproducible, pruebas registradas y riesgos conocidos aceptados por el responsable.

---

# 8. Matriz de trazabilidad

Esta matriz se amplía con el estado real observado en la auditoría T0. **Las columnas de requisito, tarea y evidencia de aceptación son las originales y no se han alterado.** Las columnas añadidas registran el estado observado; **ninguna sustituye al requisito ni a su criterio de aceptación.**

Etiquetas de evidencia:

- `[VERIFICADO EN T0]` — comprobado directamente en la sesión T0; la referencia apunta a `t0-audit.md` y a archivo:línea o consulta. No es una verificación nueva realizada al actualizar esta matriz.
- `[EVIDENCIA HISTÓRICA]` — reportado por una auditoría anterior (AUTO-SAFETY-002…008), no reconfirmado en T0.
- `[CONFLICTO]` — el código o la base de datos contradice el requisito.
- `[NO VERIFICADO]` — sin evidencia suficiente; no se infiere cumplimiento.
- `[REQUIERE APROBACIÓN]` — decisión o autorización humana pendiente.

Dimensiones diferenciadas: **implementado** no significa probado; **probado** no significa aceptado; **aceptado** no significa autorizado para producción.

| ID | Requisito | Tarea principal | Evidencia de aceptación | Estado de implementación | Estado de pruebas | Evidencia observada | Brecha | Acción correctiva | Aceptación humana | Autorización de producción |
|---|---|---|---|---|---|---|---|---|---|---|
| RF-01 | Validación de compra | T2 | Pruebas de fila válida e inválida | Ausente de la regla de rechazo `[VERIFICADO EN T0]` | No probado (suite no ejecutada en T0) | `imports.processor.ts:434,449` persiste `warrantyMonths ?? undefined` sin rechazar; `:484` cae a `product.warrantyMonths`; `imports.parser.ts:73` declara la instalación como columna opcional. BD `READ ONLY`: `purchases.warranty_months` NULL en 5 510/5 537. `information_schema.tables` → `failed_sync_logs` = 0 filas. `t0-audit.md` §3.1 RF-01, §6.2 B7/B9 | La fila no se rechaza cuando falta un dato crítico y no existe registro de rechazos | C-01 → T2.1/T2.2 | No aceptado | No autorizado |
| RF-02 | Garantía y vencimiento | T1 | Tabla de fechas esperadas y pruebas de límites | Parcial `[CONFLICTO]` | No probado | `lifecycle.rules.ts:62-70` `warrantyEnd(installationDate, …)` → `addDays(installationDate, Math.round(months * 30.4375))`, con el comentario "contado desde la INSTALACIÓN, no desde la venta". `imports.processor.ts:490` calcula `warrantyExpiresAt` con `addMonths(purchaseDate, …)`: dos bases y dos métodos en el mismo sistema. `t0-audit.md` §3.1 RF-02, §6.2 B6 | Base de fecha, método de cálculo (días, no meses de calendario) y ausencia de regla de fin de mes incumplen tres criterios del PIT | C-02 → T1.2 — D-1 y P1.8 **resueltas** (§2.1); la brecha persiste hasta que exista una tarea autorizada de implementación | No aceptado | No autorizado |
| RF-03 | Revisiones bimensuales | T1 | Calendario completo por duración | Ausente | No probado | `automations.service.ts:334-338` programa exactamente tres hitos: `addDays(installationDate,3)`, `addMonths(…,6)`, `addMonths(…,12)`. `lifecycle-milestones.ts` no genera revisiones bimensuales. BD: 8 529 filas `status='SCHEDULED'` con `scheduled_date > now()`. `t0-audit.md` §3.1 RF-03, §6.2 B4 | El calendario programado no es el del PIT: 3 hitos en lugar de revisiones en meses 2, 4, 6, 8… | C-03 → T1.3 — D-1 **resuelta** (§2.1) fija el anclaje; la implementación sigue ausente | No aceptado | No autorizado |
| RF-04 | Captura de placa | T3 | Respuesta válida, inválida y ambigua | Ausente | No probado (no existe suite) | Búsqueda de `plate` y `placa` en `schema.prisma` = 21 coincidencias, todas dentro de identificadores de plantilla (`template`, `templateD3`, `templateD180`, `templateD365`); sin columna de placa en `Customer`, `Vehicle` ni `CommercialCycle`. `lifecycle-milestones.ts:181` `MilestoneTemplateSource = 'PENDING_DECISION'`. `t0-audit.md` §3.1 RF-04, §6.2 B8 | No existe almacenamiento, validación ni webhook de placa en ninguna capa | C-04 → T3.1–T3.5 — **[REQUIERE APROBACIÓN] P1.3, P0.6** | No aceptado | No autorizado |
| RF-05 | Reseña posterior a placa | T3 | Prueba que demuestra el orden obligatorio | Ausente (depende de RF-04) | No probado | `t0-audit.md` §3.1 RF-05. BD: existe `stage_name` "Día +2 — Reseña Google", lo que indica programación por fecha y no por orden de captura | La condición principal del PIT —captura válida de placa— no puede ser cierta porque RF-04 no existe | C-05 → T3.6 — bloqueado por C-04 | No aceptado | No autorizado |
| RF-06 | Transición a retención | T4 | Una transición y cinco etapas únicas | Ausente | No probado | `lifecycle-milestones.ts:140-155` genera `PRE_EXPIRY` (−30d), `POST_EXPIRY_60` (+60d) y `POST_EXPIRY_90` (+90d); no existen +6m, +12m ni +18m. BD `READ ONLY`: `commercial_cycles.end_date` NULL en 5 528/5 528; `termination_reason` NULL en 5 528/5 528; `status` distinto presente: solo `ACTIVE`. `t0-audit.md` §3.1 RF-06, §6.2 B5 | La transición nunca se ha ejecutado y faltan tres de los cinco impactos de la secuencia aprobada | C-06 → T4.1–T4.6 — bloqueado por C-02; **[REQUIERE APROBACIÓN] P1.7** | No aceptado | No autorizado |
| RF-07 | Vencimiento próximo | T1/T5 | Fecha objetivo y ventana correcta | Parcial | No probado | Fecha objetivo presente: `lifecycle-milestones.ts:140-146` `PRE_EXPIRY` a `end − PRE_EXPIRY_OFFSET_DAYS`; etapa `Vencimiento −30 días` en BD. Ventana ausente: `eligibility.service.ts:43-51` define ventanas semanales genéricas 08:00–19:30 (lun–vie) y 08:30–18:00 (sáb). `t0-audit.md` §3.1 RF-07, §6.2 B12 | La fecha objetivo existe; la ventana martes/miércoles 9:30–11:00 del PIT no | C-07 → T5.2 — bloqueado por C-09 | No aceptado | No autorizado |
| RF-08 | Límite de frecuencia | T5 | Dos campañas concurrentes sin doble envío | Parcial, inoperante en datos reales `[CONFLICTO]` | Parcialmente probado: existen `lifecycle.rules.spec.ts` y `eligibility.service.spec.ts`, no ejecutados en T0 | Motor implementado: `lifecycle.rules.ts:167-181` `AUTOMATIC_FREQUENCY_DAYS = 15`, `automaticFrequencyBlocks()`; `eligibility.service.ts:296-318` consulta el último automático por `customerId`. BD `READ ONLY`: `messages.customer_id` NULL en 8 163/8 163; `count(DISTINCT customer_id)` = 0. `t0-audit.md` §3.1 RF-08, §6.2 B3 | La puerta G3 nunca bloquea: sin `customer_id` la consulta no devuelve filas y `automaticFrequencyBlocks(null, now)` devuelve `false`. Las pruebas pasan con datos que la BD no contiene | C-08 → T2.5 — **[REQUIERE APROBACIÓN] D-2**, bloqueado por C-17 | No aceptado | No autorizado |
| RF-09 | Ventanas horarias | T5 | Pruebas por tipo de campaña y festivo | Ausente | Parcialmente probado: existe `eligibility.service.spec.ts`, no ejecutado en T0 | `eligibility.service.ts:43-51` ventanas semanales genéricas; `:62-70` `SUNDAY_0200_EXCEPTION` (domingo 02:00 → lunes 12:15), regla distinta de la del PIT; `:90` acepta `holidays` como parámetro. `t0-audit.md` §3.1 RF-09, §6.2 B12 | Ninguna de las cuatro ventanas por tipo de campaña del PIT existe | C-09 → T5.2/T5.3 — **[REQUIERE APROBACIÓN] P1.4** | No aceptado | No autorizado |
| RF-10 | Exclusión voluntaria | T5 | Etapas canceladas y bloqueos posteriores | Parcial | No probado | `Customer.noContactAt` y puerta G2 en `eligibility.service.ts:212-225` (`blockedBy:'G2'`, `reason:'cliente con no-contact'`); `whatsapp.service.ts:1490-1508` registra `customer.opt_out`. BD: `commercial_cycles.maintenance_opt_out_at` NULL en 5 528/5 528. La etiqueta `NO_SEGUIMIENTO` no aparece en el código. `t0-audit.md` §3.1 RF-10, §6.2 B9 | El bloqueo existe y es funcional; faltan la etiqueta, la cancelación de automatizaciones en cola y la distinción baja/prohibición general | C-10 → T5.4 — **[REQUIERE APROBACIÓN] P1.6** | No aceptado | No autorizado |
| RF-11 | Mensajes manuales | T5/T6 | Diferenciación manual/automático y controles del canal | Implementado (parcial) | No probado contra el proveedor | `whatsapp.service.ts:788` crea con `type: MessageType.MANUAL`; `:76` `REPLY_ORIGIN_WINDOW_MS = 7 días`; `:534-545` el sandbox tiene prioridad sobre el proveedor. `[EVIDENCIA HISTÓRICA]` AUTO-SAFETY-004 verificó tres superficies de red con guard de seguridad. `t0-audit.md` §3.1 RF-11 | Los tipos se distinguen y se registran; el mapeo de estados del proveedor no está verificado | C-11 → T5.1 | No aceptado | No autorizado |
| RF-12 | Pausa/reanudación | T5 | Fechas originales y ausencia de duplicados | Parcial | No probado | `lifecycle.service.ts:85-93` pausa con `lifecyclePausedAt` y `pauseReason` (motivo obligatorio). BD: `lifecycle_paused_at` NULL en 5 528/5 528. No se localizó lógica de reanudación con recálculo en `lifecycle.service.ts`. `t0-audit.md` §3.1 RF-12 | La pausa es auditable; la reanudación con recálculo y no duplicación no está implementada | C-12 → T5.5 | No aceptado | No autorizado |
| RF-13 | Recuperación | T5 | Procesamiento seguro de vencidos | No verificado | No probado | `t0-audit.md` §3.1 RF-13 y §4 Fase 5: no se localizó el procedimiento de recuperación post-caída; el comportamiento tras inactividad no fue ejercido porque la auditoría prohíbe reiniciar servicios | Sin evidencia de que la recuperación respete frecuencia, horario y exclusión | C-13 → T5.6 | No aceptado | No autorizado |
| RF-14 | Reemplazo/multivehículo | T4/T5 | Pruebas de placas iguales, distintas y ausentes | Ausente | No probado | No se encontró implementación de reemplazo automático. `lifecycle.rules.ts:203-234` define `TERMINATION_REASONS` con `BATTERY_REPLACED` y `DEFECTIVE_PRODUCT_REPLACED` y `kind:'FINISH'`: son razones de terminación, no una regla de reemplazo. BD: `termination_reason` NULL en 5 528/5 528. `t0-audit.md` §3.1 RF-14 | Una segunda compra para el mismo número no cierra el ciclo anterior: ambos ciclos quedan `ACTIVE` | C-14 → T5.7 — bloqueado por C-04; **[REQUIERE APROBACIÓN] P1.5** | No aceptado | No autorizado |
| RF-15 | Estados y resultados | T3/T6 | Estados persistidos y evidencia del proveedor | Parcial | No probado contra el proveedor | `MessageStatus` (`schema.prisma:1034-1040`) = `QUEUED, SENT, DELIVERED, READ, FAILED`; `whatsapp.service.ts:1207-1234` transiciones con `providerMessageId`; `:546` marca `simulated: true` con `reason: 'sandbox'`. `t0-audit.md` §3.1 RF-15, §6.2 B10 | Cinco de los nueve estados del PIT; falta `CANCELLED`, que RF-06 y RF-10 necesitan para observar la cancelación | C-15 → T3/T6 — **[REQUIERE APROBACIÓN] migración** | No aceptado | No autorizado |
| RNF-01 | Idempotencia | T1–T6 | Reprocesamiento sin duplicados | Parcial | No probado | `imports.processor.ts:213-220` captura `PrismaClientKnownRequestError` código `P2002` como vía de idempotencia. BD: 5 537 compras → 5 528 ciclos; 16 820 automatizaciones sobre 5 531 compras distintas. `t0-audit.md` §3.2 RNF-01 | La protección existe a nivel de restricción única; no hay prueba de reprocesamiento completo ni cobertura de etapas y eventos | C-16 → T1.6 | No aceptado | No autorizado |
| RNF-02 | Trazabilidad | T2/T6 | Relación compra → ciclo → mensaje → resultado | Ausente `[CONFLICTO]` | No probado | `schema.prisma:568` `customerId String? @map("customer_id")`, nullable y nunca poblado. BD `READ ONLY`: `messages.customer_id` NULL en 8 163/8 163; `count(DISTINCT customer_id)` = 0. `t0-audit.md` §3.2 RNF-02, §6.2 B3 | La relación cliente↔mensaje no existe en los datos; ancla RF-08, RF-10, RF-14 y el criterio de §14.14 | C-17 → T2.5 — **[REQUIERE APROBACIÓN] D-2** | No aceptado | No autorizado |
| RNF-03 | Seguridad | T6/T8 | Ausencia de secretos en logs y artefactos | Parcial `[EVIDENCIA HISTÓRICA]` | No probado | `[EVIDENCIA HISTÓRICA]` AUTO-SAFETY-002/003: política fail-closed con cuatro variables de entorno declaradas en `environment:` de `docker-compose.yml` y `ENV OUTBOUND_SEND_ENABLED=DENIED` en el Dockerfile. `[VERIFICADO EN T0]` el contenedor expone `OUTBOUND_SEND_ENABLED`, `OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS`, `OUTBOUND_SEND_ALLOWED_CHANNELS` y `OUTBOUND_SEND_UNTIL`, y el código no las imprime en logs. `t0-audit.md` §3.2 RNF-03 | El código cumple; la higiene del repositorio tiene un archivo sin versionar (`opencode.json`) con rutas de un entorno ajeno | C-18 → T6/T8 | No aceptado | No autorizado |
| RNF-04 | Recuperación | T5 | Prueba de reintento y recuperación | Parcial `[EVIDENCIA HISTÓRICA]` | No probado | `[EVIDENCIA HISTÓRICA]` AUTO-SAFETY-002: `SendBlockedError` se maneja con handler propio que guarda `EXECUTING→SCHEDULED` sin incrementar `retryCount`, con `MessageStatus.FAILED` y `failureReason`. `[NO VERIFICADO]` el comportamiento ante fallo real del proveedor: la auditoría prohíbe provocar un envío. `t0-audit.md` §3.2 RNF-04 | La política de no consumir reintentos está implementada; el fallo real del proveedor no está verificado | C-19 → T5.8 — **[REQUIERE APROBACIÓN] D-3** | No aceptado | No autorizado |
| RNF-05 | Observabilidad | T6 | Diferencia entre simulado, aceptado y entregado | Implementado (parcial) | No probado contra el proveedor | `MessageStatus` distingue `QUEUED/SENT/DELIVERED/READ/FAILED`; `whatsapp.service.ts:1207-1234` procesa callbacks con `providerMessageId`; `:546` marca las simulaciones. `[NO VERIFICADO]` el mapeo real de estados devueltos por Pancake: la auditoría no puede llamar al proveedor. `t0-audit.md` §3.2 RNF-05 | Los estados técnicos existen; el mapeo contra el proveedor no puede afirmarse | C-20 → T6.4 — **[REQUIERE APROBACIÓN] P0.3** | No aceptado | No autorizado |
| RNF-06 | Compatibilidad | Sin tarea asignada en la matriz original | Sin evidencia de aceptación en la matriz original | Implementado | No probado | Stack y arquitectura del repositorio: NestJS, Prisma, PostgreSQL, Next.js, conforme a `AGENTS.md` §Architecture; no se observa migración de framework, proveedor ni arquitectura. `t0-audit.md` §3.2 RNF-06 | Ninguna | No aplica | No aceptado | No autorizado |
| RNF-07 | Zona horaria | Sin tarea asignada en la matriz original | Sin evidencia de aceptación en la matriz original | Parcial `[CONFLICTO]` | No probado | `configuration.ts:158` y `env.validation.ts:105` definen `SMS_TIMEZONE`/`DEFAULT_TIMEZONE = 'America/Bogota'`. Pero `automations.service.ts:244-252` usa `getUTCDate`/`setUTCMonth`/`Date.UTC` e `imports.processor.ts:19-22` usa `getMonth`/`setMonth` (hora local del proceso) sin clamp. `t0-audit.md` §3.2 RNF-07 | El valor por defecto está declarado, pero los cálculos operan en UTC o en hora local del servidor, no en `America/Bogota` | C-22 → T1.2 — depende de C-02; D-1 **resuelta** (§2.1), la conversión a `America/Bogota` sigue pendiente | No aceptado | No autorizado |

**Hallazgo de trazabilidad.** La matriz original trazaba 20 requisitos: los 15 de §4 y solo RNF-01…RNF-05. **RNF-06 y RNF-07, definidos en §5, nunca fueron trazados.** Se incorporan ahora con el texto de su requisito y sin tarea asignada, porque el PIT no les asigna una. Asignarles tarea es una decisión de planificación que corresponde al responsable.

**Estado de las dimensiones a fecha de esta actualización.** Ningún requisito alcanza "aceptado por el responsable" ni "autorizado para producción". Las tareas correctivas C-01…C-22 son propuestas derivadas de `t0-audit.md` §8.3 y no están autorizadas para ejecutarse.

**Actualización 2026-10-10 — decisiones D-1 y P1.8 resueltas (§2.1).** Consecuencias sobre esta matriz:

- **RF-02, RF-03 y RNF-07** dejan de estar bloqueadas por decisión de negocio. Su brecha de implementación **se mantiene sin cambio**: el código sigue calculando desde la fecha de instalación y con multiplicador de días.
- Resolver una decisión funcional **no cambia el estado de ninguna dimensión**: RF-02 continúa *Parcial `[CONFLICTO]`*, *No probado*, *No aceptado*, *No autorizado*.
- C-02, C-03 y C-22 **no están autorizadas para ejecutarse**. Su ejecución requiere una autorización separada conforme a §13.
- Siguen pendientes y bloqueantes: D-2, D-3, D-4, P0.3, P0.6, P1.3, P1.4, P1.5, P1.6 y P1.7.

---

# 9. Plan de pruebas mínimo

## Caso de prueba CP-01: compra válida

**Dado** un registro ERP completo y una duración admitida,  
**cuando** se procesa la compra,  
**entonces** se crea o actualiza un solo ciclo y sus etapas se generan con las fechas correctas.

## CP-02: duración de garantía ausente

**Dado** un registro sin duración de garantía,  
**cuando** se procesa,  
**entonces** se rechaza, se registra el motivo y no se crean automatizaciones.

## CP-03: calendario bimensual

**Dado** una compra con garantía de 12, 15, 18 o 24 meses,  
**cuando** se genera su calendario,  
**entonces** existen las revisiones bimensuales aplicables y ninguna posterior al vencimiento.

## CP-04: placa válida

**Dado** un ciclo que espera la placa,  
**cuando** el cliente responde con una placa válida y asociable sin ambigüedad,  
**entonces** se actualiza el vehículo correcto y se habilita la solicitud de reseña una sola vez.

## CP-05: placa inválida o ambigua

**Dado** un mensaje que no permite asociar una placa válida con certeza,  
**cuando** se procesa,  
**entonces** no se modifica otro ciclo y se conserva evidencia para resolverlo.

## CP-06: orden de mensajes

**Dado** un ciclo sin placa,  
**cuando** llega la hora programada,  
**entonces** no se envía la solicitud de reseña. Tras una placa válida, la solicitud se programa respetando todas las restricciones.

## CP-07: frecuencia global

**Dado** dos campañas elegibles para el mismo número,  
**cuando** una ha generado un mensaje automático dentro de los últimos 15 días calendario,  
**entonces** la otra no envía otro mensaje y se reprograma.

## CP-08: baja

**Dado** un cliente marcado `NO_SEGUIMIENTO`,  
**cuando** llega una etapa automática pendiente,  
**entonces** no se envía y queda una razón auditable de bloqueo/cancelación.

## CP-09: transición de vencimiento

**Dado** una campaña que alcanza el vencimiento,  
**cuando** corre el proceso de transición,  
**entonces** la campaña de garantía se cierra y se crea una sola campaña de retención con su secuencia aprobada.

## CP-10: nueva compra con placa ausente

**Dado** un cliente con ciclo activo y una nueva compra sin placa en ambos registros,  
**cuando** se procesa la nueva compra,  
**entonces** se aplica la regla aprobada de reemplazo, se cierra el ciclo anterior conservando historial y se inicia el nuevo ciclo sin dejar automatizaciones antiguas elegibles.

## CP-11: varios vehículos identificados

**Dado** un cliente con placas distintas,  
**cuando** se registra otra compra,  
**entonces** los ciclos de vehículos distintos permanecen separados.

## CP-12: recuperación

**Dado** un sistema que estuvo inactivo,  
**cuando** vuelve a procesar las etapas vencidas,  
**entonces** solo ejecuta etapas todavía elegibles, sin duplicar mensajes ni ignorar la frecuencia.

## CP-13: envío fallido

**Dado** un error del proveedor,  
**cuando** se registra el fallo,  
**entonces** queda evidencia suficiente para determinar si corresponde reintentar y el reintento no genera duplicados.

## CP-14: estado del proveedor

**Dado** un mensaje enviado mediante Pancake,  
**cuando** se consulta su estado,  
**entonces** el sistema distingue entre programado, aceptado por el proveedor, entregado y fallido según la evidencia disponible.

---

# 10. Bloqueantes y decisiones pendientes

Los siguientes puntos no deben resolverse por intuición.

## P0 — Bloqueantes técnicos

1. Confirmar cómo se identifica al cliente y se asocia el historial de mensajes.
2. Confirmar el comportamiento real del scheduler y su ejecución en el entorno objetivo.
3. Verificar la integración real con Pancake y la recepción de respuestas.
4. Verificar que el límite global de 15 días funciona con todas las campañas.
5. Verificar la transición de garantía a retención sin duplicados.
6. Confirmar que las plantillas necesarias existen y están aprobadas para el canal.
7. Confirmar la integridad de la fecha base, garantía y datos de contacto. *(La regla de la fecha base está definida por D-1 y P1.8, §2.1; la verificación de integridad en los datos sigue pendiente.)*

## P1 — Definiciones funcionales pendientes

1. Estados y responsables para registrar el resultado de la revisión, respuesta e intención de recompra.
2. Fecha límite y estado de un ciclo que nunca recibe la placa.
3. Formatos de placa admitidos y proceso de corrección de respuestas inválidas.
4. Política exacta de festivos y selección de la siguiente ventana elegible.
5. Política de cierre y reapertura si una compra nueva se interpreta como reemplazo.
6. Semántica de la etiqueta `NO_SEGUIMIENTO` respecto a contactos manuales y exclusiones más amplias.
7. Contenido y plantilla final de cada impacto de retención.
8. ~~Regla exacta de vencimiento en fin de mes.~~ **RESUELTA 2026-10-10 — P1.8.** La aritmética de meses calendario y el ajuste al último día válido del mes de destino están definidos en §2.1.

## P2 — Mejoras posteriores

- Dashboard operativo de errores y etapas pendientes.
- Reportes de conversión de campañas.
- Análisis de tasa de respuesta y reseñas.
- Herramientas para resolver placas ambiguas.
- Alertas operativas y reportes de salud del scheduler.

---

# 11. Gestión de riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Historial de mensajes sin cliente asociado | El límite de frecuencia puede ignorar mensajes anteriores | Auditar asociaciones y aprobar una corrección antes de escribir datos |
| Scheduler o artefacto desplegado desactualizado | La lógica probada no coincide con la ejecutada | Comparar código, build, despliegue y estado del entorno |
| Pancake no verificado de extremo a extremo | Mensajes o respuestas no se procesan correctamente | Validar API, plantillas, webhooks y estados sin envío real inicial |
| Placa asociada al ciclo equivocado | Seguimiento incorrecto de vehículo | Validación, resolución de ambigüedad y auditoría |
| Fechas o zonas horarias inconsistentes | Envíos en fechas/horas incorrectas | Cómputo determinista con zona horaria de negocio explícita |
| Fallos en transición entre campañas | Etapas perdidas o duplicadas | Transición idempotente, pruebas y reconciliación |
| Cambios locales mezclados | Pérdida o despliegue accidental de cambios ajenos | Inspección de Git y staging selectivo por hunk |
| Alcance creciente | Retraso de entrega | Congelar alcance y separar mejoras |
| Prueba real no autorizada | Contacto accidental con clientes | Sandbox por defecto y autorización explícita para pruebas reales |

---

# 12. Reglas de trabajo para OpenCode

## 12.1 Flujo obligatorio

Para cada tarea:

1. Leer el contexto y los archivos afectados.
2. Formular un objetivo pequeño y verificable.
3. Inspeccionar la implementación actual antes de cambiarla.
4. Proponer el plan mínimo.
5. Implementar solo la tarea autorizada.
6. Ejecutar pruebas específicas.
7. Ejecutar las verificaciones pertinentes de tipo, lint y build.
8. Corregir fallos introducidos por el cambio.
9. Revisar el diff completo.
10. Informar qué se modificó, qué se probó y qué permanece pendiente.
11. Esperar autorización para operaciones sensibles.

## 12.2 Restricciones

- No realizar refactors no necesarios.
- No eliminar cambios locales de otros trabajos.
- No usar `git stash` como mecanismo automático de aislamiento.
- No realizar commits o push sin autorización.
- No ejecutar migraciones ni backfills sin autorización.
- No desplegar ni reiniciar servicios sin autorización.
- No enviar mensajes reales sin autorización.
- No declarar un envío exitoso basándose en un identificador sintético o una simulación.
- No declarar que una prueba pasó si no se ejecutó.
- No ocultar fallos preexistentes: separarlos de los introducidos por la tarea.

## 12.3 Formato de reporte al finalizar cada tarea

- **Tarea/ID:**
- **Resultado:** completada / parcial / bloqueada.
- **Archivos modificados:**
- **Cambios realizados:**
- **Pruebas ejecutadas y resultados:**
- **Verificaciones no ejecutadas y motivo:**
- **Riesgos o regresiones:**
- **Evidencia:**
- **Autorización necesaria para continuar:**
- **Siguiente tarea recomendada:**

---

# 13. Política de autorización

Este documento no autoriza operaciones de escritura.

Requieren autorización explícita y separada, según corresponda:

- Backfill o actualización masiva de datos.
- Migración de base de datos.
- Envío real de WhatsApp.
- Pausa o cancelación de ciclos reales.
- Cambio de configuración compartida.
- Reinicio de servicios.
- Despliegue.
- Commit y push.
- Procesamiento de producción que pueda crear o enviar automatizaciones.

Las pruebas que escriben en una base de datos compartida no se consideran pruebas aisladas.

---

# 14. Criterios de aceptación de la entrega

La entrega se acepta únicamente si:

1. Una compra válida genera un ciclo único.
2. Las filas incompletas se rechazan y quedan auditadas.
3. Las fechas de garantía se calculan desde la fecha de compra del ERP.
4. Se genera el calendario bimensual correcto.
5. El primer mensaje solicita la placa.
6. La placa se valida y se asocia al ciclo correcto.
7. La solicitud de reseña solo se habilita después de una placa válida.
8. La frecuencia global impide mensajes automáticos excesivos entre campañas.
9. Las ventanas horarias y festivos se respetan.
10. `NO_SEGUIMIENTO` bloquea las automatizaciones aplicables.
11. Pausas, recuperación y reintentos no generan duplicados.
12. La transición a retención cierra las etapas de garantía y programa la secuencia aprobada.
13. Las nuevas compras respetan las reglas de reemplazo y separación de vehículos.
14. Los estados de envío se corresponden con evidencia real del proveedor.
15. Las pruebas críticas tienen resultados registrados.
16. Existe una demostración end-to-end reproducible.
17. Los riesgos residuales y limitaciones se comunican antes de aceptar la entrega.

---

# 15. Cadena de trazabilidad

Toda funcionalidad debe poder seguirse en ambas direcciones:

**Requisito → Historia/Caso de uso → Diseño → Tarea → Implementación → Prueba → Evidencia → Aceptación.**

Cada tarea debe referenciar los requisitos que implementa. Cada prueba debe identificar qué requisito valida. Un requisito sin implementación se marca pendiente; una implementación sin prueba no se declara verificada.

---

# 16. Próximo paso inmediato

Ejecutar exclusivamente **T0 — Auditoría de solo lectura**.

No implementar el calendario, modificar datos, ejecutar migraciones, enviar mensajes, desplegar ni reiniciar servicios durante T0.

La auditoría debe devolver una tabla con:

- ID del requisito.
- Estado real: verificado, parcial, ausente o no verificable.
- Evidencia concreta.
- Archivo, línea, consulta o comportamiento observado.
- Brecha.
- Riesgo.
- Tarea correctiva propuesta.
- Dependencias y autorización requerida.

Después de revisar el informe T0, se divide la implementación en tareas pequeñas y se priorizan los bloqueantes del recorrido demostrable.

**Definición de éxito:** no terminar todas las tareas posibles; terminar las necesarias para una entrega demostrable, correcta, auditable y sin cambios no autorizados.