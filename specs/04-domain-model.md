# Modelo de Dominio

## Introducción

El Modelo de Dominio define los conceptos fundamentales de Automatize It Platform.

Su propósito es establecer un lenguaje común entre el negocio, el equipo de desarrollo y la documentación técnica.

Todas las decisiones de arquitectura, desarrollo e implementación deberán utilizar las definiciones descritas en este documento.

---

# Dominio Principal

Automatize It Platform pertenece al dominio de la automatización comercial y la fidelización de clientes.

El sistema no administra procesos operativos del negocio.

Su responsabilidad comienza cuando una venta ha sido registrada en el ERP.

A partir de ese momento, Automatize It gestiona el ciclo de relacionamiento con el cliente.

---

# Entidades del Dominio

## Cliente

### Definición

Persona o empresa registrada en el ERP que realiza una o más compras y puede recibir comunicaciones comerciales.

### Identificador

codcli

### Responsabilidades

- Mantener información de contacto.
- Recibir campañas.
- Mantener historial.
- Mantener conversaciones.
- Mantener compras.

---

## Compra

### Definición

Registro de una venta realizada dentro del ERP.

Representa el inicio de un nuevo ciclo comercial.

### Responsabilidades

- Asociarse a un cliente.
- Generar automatizaciones.
- Mantener historial.

---

## Producto

### Definición

Artículo vendido por la empresa.

Para la primera implementación el foco principal son las baterías.

### Responsabilidades

- Identificar la referencia vendida.
- Permitir segmentaciones.
- Servir como criterio para campañas.

---

## Ciclo Comercial

### Definición

Conjunto de automatizaciones generadas a partir de una compra.

### Estados

Activo

Finalizado

Cancelado

---

## Automatización

### Definición

Acción programada que será ejecutada automáticamente en una fecha determinada.

### Ejemplos

Seguimiento 3 días

Garantía 6 meses

Recordatorio 12 meses

Campañas especiales

---

## Campaña

### Definición

Configuración reutilizable que define una estrategia de comunicación.

Una campaña puede generar miles de automatizaciones.

---

## Conversación

### Definición

Interacción entre un cliente y la empresa mediante un canal de comunicación.

Actualmente:

WhatsApp Clientes

WhatsApp Redes Sociales

En futuras versiones:

Facebook

Instagram

Correo

SMS

---

## Mensaje

### Definición

Unidad mínima de comunicación enviada o recibida.

Puede ser:

Automático

Manual

Entrante

Saliente

---

## Importación

### Definición

Proceso mediante el cual Automatize It sincroniza información proveniente del ERP.

La importación nunca modifica información dentro del ERP.

---

## Usuario

### Definición

Persona autorizada para utilizar la plataforma.

Roles iniciales:

Administrador

Gerente

Asesor

Operador

---

# Relaciones del Dominio

Cliente

↓

Compras

↓

Ciclo Comercial

↓

Automatizaciones

↓

Mensajes

↓

Conversaciones

---

# Agregados

## Agregado Cliente

Cliente

Compras

Conversaciones

Mensajes

---

## Agregado Campaña

Campaña

Automatizaciones

---

## Agregado Importación

Importación

Clientes Procesados

Compras Procesadas

Errores

---

# Eventos del Dominio

Los eventos representan hechos importantes dentro del sistema.

## Cliente Importado

Se crea o actualiza un cliente.

---

## Compra Registrada

Se registra una nueva compra.

---

## Ciclo Comercial Iniciado

Una compra genera un nuevo ciclo.

---

## Automatización Programada

El sistema agenda un envío.

---

## Mensaje Enviado

WhatsApp confirma el envío.

---

## Mensaje Recibido

El cliente responde.

---

## Conversación Abierta

Existe interacción humana.

---

## Conversación Cerrada

El asesor finaliza la atención.

---

## Nueva Compra Detectada

El cliente vuelve a comprar.

Las automatizaciones anteriores podrán cancelarse según las reglas de negocio.

---

# Invariantes

Las siguientes condiciones siempre deben cumplirse.

Un Cliente debe tener un codcli único.

Toda Compra pertenece a un Cliente.

Toda Automatización pertenece a una Compra.

Toda Conversación pertenece a un Cliente.

Todo Mensaje pertenece a una Conversación.

Una Compra inicia un único Ciclo Comercial.

Solo un Ciclo Comercial puede estar Activo para una misma línea de seguimiento.

---

# Límites del Dominio

Automatize It NO administra:

- Facturación.
- Inventario.
- Contabilidad.
- Compras.
- Vehículos.
- Nómina.
- Proveedores.

Estos procesos pertenecen exclusivamente al ERP.

---

# Lenguaje Ubicuo

Cliente

Compra

Producto

Ciclo Comercial

Automatización

Campaña

Conversación

Mensaje

Importación

Usuario

Dashboard

Seguimiento

Recompra

Plantilla

Canal

ERP

Estos términos deberán utilizarse de manera consistente en la documentación, el código fuente, la base de datos y la interfaz de usuario.