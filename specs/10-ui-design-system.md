# 10 - UI Design System

> Versión: 1.0
>
> Estado: Aprobado
>
> Objetivo:
>
> Definir las reglas visuales, patrones de interacción y componentes reutilizables de Automatize It para garantizar una experiencia consistente, moderna y escalable.

---

# 1. Filosofía del Diseño

Automatize It no pretende parecer un ERP tradicional.

La plataforma debe transmitir:

- simplicidad
- confianza
- velocidad
- automatización
- inteligencia

El usuario debe sentir que el sistema trabaja por él.

La interfaz prioriza:

- información importante
- acciones rápidas
- pocos clics
- claridad visual

No se diseñará pensando en mostrar muchas opciones, sino en ayudar a tomar decisiones.

---

# 2. Principios

## Menos es más

Cada pantalla debe contener únicamente la información necesaria.

---

## Una acción principal

Cada vista tendrá una acción primaria claramente identificable.

---

## Todo debe ser escaneable

El usuario debe entender una pantalla en menos de 10 segundos.

---

## Datos primero

Las tablas y dashboards son protagonistas.

La decoración es secundaria.

---

## Consistencia

Un mismo componente nunca cambia de comportamiento entre módulos.

---

# 3. Inspiración

Productos de referencia:

- Linear
- Stripe Dashboard
- Vercel
- Supabase
- Notion
- Clerk
- HubSpot (solo UX)
- Attio CRM

---

# 4. Identidad Visual

Estilo:

Minimalista

Mucho espacio en blanco

Sombras suaves

Bordes redondeados

Interfaz limpia

Jerarquía mediante tipografía

No mediante colores excesivos

---

# 5. Paleta

## Primario

Verde Lima (identidad Automatize It)

Uso:

Botones principales

KPIs positivos

Indicadores activos

Progreso

---

## Secundario

Grises neutros

Fondos

Tarjetas

Sidebar

Tablas

---

## Estados

Éxito

Verde

Advertencia

Amarillo

Error

Rojo

Información

Azul

---

# 6. Tipografía

Fuente:

Inter

Pesos:

400

500

600

700

Nunca usar más de cuatro tamaños diferentes por pantalla.

---

# 7. Espaciado

Sistema basado en múltiplos de 8

4

8

16

24

32

40

48

64

---

# 8. Grid

Desktop

12 columnas

Tablet

8 columnas

Mobile

4 columnas

---

# 9. Layout General

Sidebar izquierda

Header superior

Contenido central

Panel lateral opcional

Nunca usar ventanas flotantes innecesarias.

---

# 10. Sidebar

Contendrá únicamente módulos principales.

Dashboard

Clientes

Compras

Campañas

Automatizaciones

Conversaciones

Reportes

Configuración

El menú será colapsable.

---

# 11. Header

Debe incluir:

Buscador

Organización activa

Notificaciones

Usuario

Acciones rápidas

---

# 12. Cards

Las tarjetas serán el componente base del sistema.

Usos:

KPIs

Resúmenes

Clientes

Compras

Automatizaciones

---

# 13. Botones

Tipos:

Primary

Secondary

Outline

Ghost

Danger

Loading

Icon Button

FAB (solo si es necesario)

---

# 14. Formularios

Todos los formularios utilizarán:

React Hook Form

Zod

Mensajes inline

Validación inmediata

Nunca usar modales enormes.

---

# 15. Inputs

Text

Textarea

Select

Combobox

Autocomplete

Phone

Currency

Date

File Upload

Search

Tags

---

# 16. Tablas

Las tablas son el componente principal del sistema.

Todas tendrán:

Ordenamiento

Filtros

Paginación

Búsqueda

Columnas configurables

Exportar

Importar

Acciones rápidas

Selección múltiple

---

# 17. Dashboard

Debe responder cuatro preguntas.

¿Qué pasó hoy?

¿Qué requiere atención?

¿Qué campañas vienen?

¿Qué clientes necesitan seguimiento?

---

# 18. KPIs

Ejemplos

Clientes

Compras

Mensajes enviados

Conversaciones activas

Automatizaciones ejecutadas

Recompras

Ingresos recuperados

---

# 19. Timeline

El perfil del cliente tendrá un Timeline cronológico.

Compra registrada

Mensaje enviado

Respuesta recibida

Nueva compra

Campaña

Nota

Todo en una sola línea temporal.

---

# 20. Estados Vacíos

Nunca dejar una pantalla vacía.

Mostrar:

Ilustración

Descripción

Acción recomendada

---

# 21. Loading

Skeletons

Nunca spinners largos.

---

# 22. Notificaciones

Toast

Confirmación

Advertencia

Error

Información

---

# 23. Modales

Solo para acciones rápidas.

No formularios largos.

---

# 24. Drawers

Se utilizarán para:

Editar cliente

Editar compra

Ver automatización

Ver conversación

---

# 25. Responsive

Desktop primero.

Tablet optimizado.

Mobile funcional.

---

# 26. Accesibilidad

Contraste AA

Navegación por teclado

Focus visible

ARIA Labels

---

# 27. Iconografía

Lucide Icons

No mezclar librerías.

---

# 28. Animaciones

Sutiles.

150-250 ms.

Nunca animaciones innecesarias.

---

# 29. Componentes Base

Button

Card

Badge

Alert

Avatar

Breadcrumb

Calendar

Checkbox

Combobox

Command

Data Table

Date Picker

Dialog

Drawer

Dropdown

Empty State

Input

Loading

Pagination

Popover

Progress

Select

Separator

Sheet

Skeleton

Switch

Tabs

Table

Tag

Textarea

Toast

Tooltip

---

# 30. Librerías

UI

shadcn/ui

CSS

TailwindCSS

Tablas

TanStack Table

Formularios

React Hook Form

Validaciones

Zod

Gráficos

Recharts

Iconos

Lucide

Fechas

date-fns

Animaciones

Framer Motion

---

# 31. Reglas de UX

Una acción principal por pantalla.

No más de tres niveles de navegación.

Evitar ventanas emergentes.

Las acciones peligrosas requieren confirmación.

Todo proceso largo debe informar progreso.

Toda tabla debe permitir búsqueda.

Toda entidad debe tener historial.

Todo cambio importante debe quedar auditado.

---

# 32. Objetivo Final

Automatize It debe sentirse como un producto SaaS moderno.

El usuario debe poder aprender a utilizar la plataforma sin capacitación formal.

La interfaz debe transmitir simplicidad, confianza y velocidad.