# Business Context

## Objetivo

Automatize It Platform centraliza información comercial y de postventa y permite ejecutar automatizaciones, campañas y conversaciones sobre esa información.

## Módulos

### Dashboard

Presenta el estado general de la operación.

Indicadores previstos:

- clientes nuevos;
- compras del mes;
- próximas campañas;
- mensajes pendientes;
- conversaciones abiertas;
- actividad del sistema.

### Clientes

Centraliza información del cliente.

Funcionalidades:

- crear;
- editar;
- buscar;
- estado;
- contacto;
- historial de compras;
- historial de conversaciones.

Regla:

El cliente se identifica mediante `codcli`.

No deben existir clientes duplicados según la regla de identidad definida por el negocio.

### Compras

Registra las compras realizadas por clientes.

Información prevista:

- fecha;
- producto;
- cantidad;
- valor;
- factura;
- estado.

Reglas:

- cada compra pertenece a un cliente;
- una compra puede generar múltiples automatizaciones.

### Importador

Importa información proveniente del ERP.

Funciones:

- importar clientes;
- importar ventas;
- validar archivos;
- detectar errores;
- vista previa;
- confirmación;
- registro histórico.

Regla:

La importación no elimina información.

Debe crear o actualizar registros de forma controlada e idempotente.

### Automatizaciones

Permite programar acciones automáticas.

Casos previstos:

- día 3;
- mes 6;
- mes 12;
- recordatorios;
- recompra;
- campañas manuales.

Estados:

- Pendiente
- Programada
- Ejecutada
- Cancelada
- Error

### Campañas

Administra campañas comerciales.

Funciones:

- crear campaña;
- plantillas;
- segmentación;
- programación;
- estadísticas.

Segmentos previstos:

- clientes nuevos;
- clientes frecuentes;
- clientes inactivos;
- clientes pendientes de recompra.

### Conversaciones

Centraliza conversaciones de WhatsApp.

Funciones:

- bandeja;
- chats;
- historial;
- asignación;
- etiquetas;
- notas;
- respuestas rápidas.

Canales previstos:

- WhatsApp Clientes;
- WhatsApp Redes Sociales.

### Reportes

Indicadores para gerencia.

Exportaciones previstas:

- PDF;
- Excel.

### Usuarios

Administración de acceso.

Roles funcionales previstos:

- Administrador;
- Gerente;
- Asesor;
- Operador.

PENDIENTE:

Definir el mapeo exacto entre estos roles funcionales y `RoleType` técnico.

### Configuración

Configuración de:

- empresa;
- WhatsApp;
- horarios;
- campañas;
- plantillas;
- parámetros.

### Auditoría

Registrar:

- inicio de sesión;
- importaciones;
- mensajes;
- cambios;
- errores;
- configuraciones.

## Principios de negocio

- simplicidad;
- escalabilidad;
- modularidad;
- bajo acoplamiento;
- alta cohesión;
- experiencia consistente;
- diseño responsive.

## Regla importante

Las reglas anteriores representan el contrato funcional disponible actualmente.

No agregar reglas de negocio no documentadas sin una decisión explícita.
