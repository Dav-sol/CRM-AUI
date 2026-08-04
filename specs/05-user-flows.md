# Flujos de Usuario

## Introducción

Este documento describe la interacción de los usuarios con Automatize It Platform.

Cada flujo representa una secuencia de acciones que permiten cumplir un objetivo de negocio.

Los flujos aquí definidos servirán como base para el diseño de la interfaz, el desarrollo del backend y las pruebas funcionales.

---

# Actores

## Administrador

Responsable de la configuración general de la plataforma.

Puede:

- Administrar usuarios.
- Configurar automatizaciones.
- Importar información.
- Consultar reportes.
- Configurar campañas.

---

## Asesor Comercial

Responsable del seguimiento de clientes.

Puede:

- Consultar clientes.
- Responder conversaciones.
- Enviar mensajes manuales.
- Registrar notas.

---

## Gerente

Responsable del seguimiento del negocio.

Puede:

- Consultar indicadores.
- Revisar campañas.
- Analizar resultados.

---

# Flujo 01 — Inicio de Sesión

## Objetivo

Permitir el acceso seguro a la plataforma.

### Flujo

1. Usuario ingresa correo.
2. Usuario ingresa contraseña.
3. El sistema valida credenciales.
4. Se determina el rol del usuario.
5. Se redirecciona al Dashboard.

### Resultado

Usuario autenticado.

---

# Flujo 02 — Importación de Clientes

## Objetivo

Actualizar el directorio de clientes.

### Flujo

1. Ir al módulo Importador.
2. Seleccionar "Clientes".
3. Seleccionar archivo Excel.
4. El sistema valida columnas.
5. Se muestra vista previa.
6. El usuario confirma.
7. Se importan los registros.
8. Se genera resumen.

### Resultado

Clientes creados y actualizados.

---

# Flujo 03 — Importación de Ventas

## Objetivo

Actualizar el historial de compras.

### Flujo

1. Seleccionar "Ventas".
2. Cargar archivo.
3. Validar estructura.
4. Detectar duplicados.
5. Relacionar cada compra con codcli.
6. Registrar compras.
7. Iniciar ciclos comerciales.
8. Crear automatizaciones.

### Resultado

Compras registradas.

---

# Flujo 04 — Consulta de Cliente

## Objetivo

Visualizar toda la información comercial de un cliente.

### Flujo

1. Buscar cliente.
2. Abrir ficha.
3. Visualizar:

- Información general.
- Historial de compras.
- Automatizaciones.
- Conversaciones.
- Campañas.

### Resultado

Vista 360° del cliente.

---

# Flujo 05 — Ejecución Automática

## Objetivo

Enviar campañas programadas.

### Flujo

1. El Scheduler revisa automatizaciones pendientes.
2. Verifica horario comercial.
3. Verifica estado del cliente.
4. Verifica conversación activa.
5. Si cumple reglas:
   - Envía mensaje.
6. Registra resultado.
7. Actualiza estado.

### Resultado

Automatización ejecutada.

---

# Flujo 06 — Recepción de Mensajes

## Objetivo

Gestionar respuestas del cliente.

### Flujo

1. Cliente responde WhatsApp.
2. Se identifica el cliente.
3. Se registra el mensaje.
4. Se abre conversación si no existe.
5. Se asigna asesor.
6. Se notifica.

### Resultado

Conversación disponible para atención.

---

# Flujo 07 — Atención Comercial

## Objetivo

Dar continuidad a la conversación.

### Flujo

1. Asesor abre conversación.
2. Lee historial.
3. Responde.
4. Agrega notas.
5. Cambia estado.
6. Finaliza conversación.

### Resultado

Seguimiento registrado.

---

# Flujo 08 — Creación de Campaña

## Objetivo

Crear campañas comerciales.

### Flujo

1. Abrir módulo Campañas.
2. Crear campaña.
3. Definir nombre.
4. Seleccionar plantilla.
5. Definir segmento.
6. Definir fecha.
7. Guardar.

### Resultado

Campaña disponible.

---

# Flujo 09 — Dashboard

## Objetivo

Consultar indicadores.

### Flujo

Usuario accede al Dashboard.

Visualiza:

- Clientes.
- Compras.
- Automatizaciones.
- Conversaciones.
- Campañas.
- Indicadores.

Puede navegar hacia cualquier módulo.

---

# Flujo 10 — Administración de Usuarios

## Objetivo

Gestionar accesos.

### Flujo

1. Abrir Usuarios.
2. Crear usuario.
3. Asignar rol.
4. Definir permisos.
5. Guardar.

### Resultado

Usuario habilitado.

---

# Flujo 11 — Configuración

## Objetivo

Administrar parámetros del sistema.

### Flujo

Administrador configura:

- Empresa.
- Horarios.
- WhatsApp.
- Plantillas.
- Parámetros.
- Campañas.

### Resultado

Configuración actualizada.

---

# Flujo 12 — Reportes

## Objetivo

Analizar la operación.

### Flujo

1. Abrir Reportes.
2. Seleccionar reporte.
3. Aplicar filtros.
4. Visualizar resultados.
5. Exportar PDF o Excel.

### Resultado

Reporte generado.

---

# Estados Globales

## Cliente

- Activo
- Inactivo

---

## Compra

- Registrada
- Cancelada

---

## Automatización

- Pendiente
- Programada
- Pausada
- Ejecutada
- Cancelada
- Error

---

## Conversación

- Abierta
- Cerrada
- Archivada

---

## Campaña

- Borrador
- Programada
- Activa
- Finalizada
- Cancelada

---

# Principios UX

Todos los flujos deberán cumplir los siguientes principios:

- Máximo tres clics para completar una tarea frecuente.
- Validación antes de ejecutar acciones críticas.
- Confirmación visual después de cada operación.
- Posibilidad de cancelar acciones antes de su ejecución.
- Navegación consistente entre módulos.
- Indicadores claros del estado de cada proceso.
- Retroalimentación inmediata ante errores o acciones exitosas.