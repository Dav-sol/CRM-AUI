# Reglas de Negocio

## Introducción

Este documento define las reglas de negocio que gobiernan el funcionamiento de Automatize It Platform.

Las reglas aquí descritas representan el comportamiento esperado del sistema y tienen prioridad sobre cualquier decisión técnica de implementación.

---

# Filosofía del Producto

Automatize It Platform no reemplaza el ERP del cliente.

Su propósito es transformar la información existente en acciones comerciales automatizadas que mejoren la relación con los clientes y aumenten la recompra.

El ERP continúa siendo la fuente oficial de información.

Automatize It Platform consume dicha información, la organiza y ejecuta automatizaciones inteligentes.

---

# Reglas Generales

## RG-001

Toda la información debe provenir del ERP o de procesos autorizados por el administrador.

---

## RG-002

Ningún proceso del sistema puede modificar información dentro del ERP.

La comunicación es unidireccional:

ERP → Automatize It Platform

---

## RG-003

Toda acción relevante deberá registrarse en Auditoría.

---

# Clientes

## CL-001

Cada cliente será identificado mediante el campo **codcli**.

Este identificador es único.

---

## CL-002

No pueden existir dos clientes con el mismo codcli.

---

## CL-003

Si durante una importación un cliente ya existe:

- Se actualizan sus datos.
- No se crea un nuevo registro.

---

## CL-004

Un cliente puede realizar múltiples compras.

---

## CL-005

Un cliente puede tener múltiples conversaciones.

---

## CL-006

Si el cliente no posee número telefónico válido:

- No podrá ingresar a campañas automáticas.
- Aparecerá en el reporte "Clientes pendientes de contacto".

---

# Compras

## CP-001

Toda compra pertenece a un único cliente.

---

## CP-002

Una compra inicia un nuevo ciclo comercial.

---

## CP-003

Una compra puede generar múltiples automatizaciones.

---

## CP-004

Una compra nunca debe eliminarse.

Solo podrá cambiar de estado.

---

## CP-005

Una compra será considerada duplicada cuando coincidan:

- Número de factura
- Cliente
- Producto
- Fecha

En este caso no deberá importarse nuevamente.

---

# Importación

## IM-001

La importación de clientes debe ejecutarse antes de importar ventas.

---

## IM-002

El sistema validará la estructura del archivo antes de procesarlo.

---

## IM-003

Los errores encontrados deberán mostrarse antes de confirmar la importación.

---

## IM-004

Toda importación generará un registro histórico.

---

## IM-005

Importar un mismo archivo dos veces no debe generar registros duplicados.

---

## IM-006

Si una fila contiene errores:

- Debe registrarse.
- No debe detener la importación completa.

---

# Automatizaciones

## AU-001

Toda compra genera automáticamente:

- Seguimiento de 3 días.
- Recordatorio de 6 meses.
- Recordatorio de 12 meses.

---

## AU-002

Las automatizaciones permanecerán en estado:

- Pendiente
- Programada
- Ejecutada
- Cancelada
- Error

---

## AU-003

Si un cliente realiza una nueva compra antes de finalizar el ciclo anterior:

Todas las automatizaciones pendientes del ciclo anterior deberán cancelarse.

Posteriormente se iniciará un nuevo ciclo basado en la compra más reciente.

---

## AU-004

Una automatización ejecutada nunca podrá volver a ejecutarse.

---

## AU-005

Las automatizaciones solo podrán ejecutarse sobre clientes activos.

---

## AU-006

Antes de ejecutar una automatización, el sistema deberá verificar si el cliente tiene una conversación activa con un asesor.

Si existe una conversación en estado **Abierta**, la automatización no será enviada.

Su estado cambiará a:

- Pausada

El sistema registrará el motivo de la pausa y notificará al asesor responsable que existe una automatización pendiente para ese cliente.

---

## AU-007

Cuando una conversación cambie a estado **Cerrada**, el sistema evaluará nuevamente las automatizaciones pausadas.

Si la automatización continúa siendo válida según las reglas de negocio, volverá a estado **Pendiente** para su ejecución.

Si ya no aplica (por ejemplo, porque el cliente realizó una nueva compra o la campaña expiró), deberá marcarse como **Cancelada**.

---

## AU-008

Las automatizaciones nunca tendrán prioridad sobre una conversación humana.

La atención realizada por un asesor siempre prevalecerá sobre cualquier proceso automático.

## AU-009

Las automatizaciones únicamente podrán ejecutarse dentro del horario comercial configurado por la empresa.

Si una automatización está programada fuera de dicho horario, permanecerá en estado Pendiente hasta la siguiente ventana disponible.

## AU-010

Un cliente no podrá recibir más de una automatización dentro del período de tiempo definido por la empresa.

Si existen múltiples automatizaciones programadas para el mismo intervalo, el sistema deberá aplicar la prioridad definida en las campañas o reagendar los envíos.

## AU-011

Antes de enviar cualquier mensaje automático, el sistema deberá verificar que dicha automatización no haya sido ejecutada previamente.

Ningún mensaje automático podrá enviarse más de una vez para la misma automatización.

# Campañas

## CA-001

Las campañas utilizan plantillas previamente configuradas.

---

## CA-002

Las campañas no modifican información de clientes ni compras.

Solo generan mensajes.

---

## CA-003

Una campaña podrá segmentarse utilizando:

- Ciudad
- Fecha de compra
- Producto
- Estado del cliente

---

# Conversaciones

## CO-001

Toda conversación pertenece a un único cliente.

---

## CO-002

Una conversación puede contener múltiples mensajes.

---

## CO-003

Las conversaciones nunca serán eliminadas.

Solo podrán cambiar de estado:

- Abierta
- Cerrada
- Archivada

---

## CO-004

Todos los mensajes enviados y recibidos deberán conservarse para consulta histórica.

---

# Auditoría

## AD-001

Toda acción realizada por un usuario deberá registrarse.

---

## AD-002

Se registrarán como mínimo:

- Usuario
- Fecha
- Hora
- Acción
- Módulo afectado

---

## AD-003

Las importaciones deberán conservar su historial.

---

# Restricciones

El sistema NO administra:

- Inventario
- Facturación
- Contabilidad
- Compras
- Proveedores
- Vehículos

Estas funciones permanecen bajo responsabilidad del ERP.

---

# Casos Especiales


## Cliente cambia de número telefónico

Durante una nueva importación:

- Se actualizará el número.
- Se conservará el historial del cliente.

---

## Cliente realiza múltiples compras

Cada compra genera un nuevo ciclo de automatización.

Solo permanecerán activas las automatizaciones correspondientes a la compra más reciente.

---

## Cliente eliminado en el ERP

El cliente permanecerá en Automatize It Platform como registro histórico.

No se eliminarán compras, conversaciones ni auditoría.

Su estado cambiará a:

INACTIVO.

---

# Principios del Sistema

Antes de desarrollar cualquier funcionalidad deberán respetarse los siguientes principios:

1. El ERP es la fuente oficial de información.
2. Nunca duplicar registros.
3. Nunca perder historial.
4. Toda compra genera oportunidades comerciales.
5. Toda automatización debe ser trazable.
6. Toda acción importante debe auditarse.
7. La simplicidad tiene prioridad sobre la complejidad.
8. El sistema debe ser escalable y modular.