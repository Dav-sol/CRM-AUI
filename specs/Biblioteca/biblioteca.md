# Biblioteca de Copy — Especificación

## 1. Propósito

Este documento define la biblioteca maestra de copy reutilizable para
comunicaciones postventa de la plataforma. Cada plantilla pertenece a una
intención comercial y puede reutilizarse en cualquier journey, campaña o
secuencia de seguimiento.

La biblioteca no está organizada por fechas ni por campañas, sino por
**objetivo comercial**, para que un usuario pueda buscar:

> "Quiero una plantilla de prevención con tono caribeño."

y encontrar exactamente lo que necesita sin revisar cien mensajes.

## 2. Alcance

- **150 piezas de copy** = 50 plantillas base × 3 variantes de tono.
- Organizadas en 6 categorías comerciales.
- Cada plantilla es compatible con el sistema actual de plantillas
  libres de Campañas v1 (`Campaign.template`, kit 019).
- Preparadas para migración futura a plantillas reales de Meta/WhatsApp
  (Módulo 10 Configuración, HG-2/HG-7).

## 3. Variables disponibles

Las siguientes variables están soportadas por el sistema
(`message-variables.ts`):

| Variable            | Descripción                        | Ejemplo                   |
|---------------------|------------------------------------|---------------------------|
| `{customerName}`    | Nombre del cliente                 | Carlos                    |
| `{productName}`     | Nombre del producto (batería)      | Willard Gold Plus 60D     |
| `{organizationName}`| Nombre de la organización/taller   | Baterías del Caribe       |
| `{brand}`           | Marca derivada del producto        | WILLARD                   |
| `{warrantyExpiresAt}`| Fecha de vencimiento de garantía  | 15 de marzo de 2027       |
| `{purchaseDate}`    | Fecha de compra                    | 15 de septiembre de 2025  |

**Mapeo a plantillas Meta (WhatsApp Business API):**

| Nuestro placeholder | Meta placeholder |
|---------------------|------------------|
| `{customerName}`    | `{{1}}`          |
| `{productName}`     | `{{2}}`          |
| `{organizationName}`| `{{3}}`          |
| `{brand}`           | `{{4}}`          |
| `{warrantyExpiresAt}`| `{{5}}`         |
| `{purchaseDate}`    | `{{6}}`          |

Cada plantilla en este documento usa el formato `{variable}`. Para
envío real por WhatsApp, se reemplaza por el formato Meta `{{N}}`.

## 4. Sistema de tono

### 4.1 Cercano profesional (predeterminado)

Tono cálido, confiable y profesional. Sirve para la mayoría de los
clientes y contextos. Es el tono por defecto de la marca.

**Reglas:**
- Saludo personalizado con nombre.
- Lenguaje claro, sin jerga técnica innecesaria.
- Empatía sin ser excesivamente informal.
- Emojis permitidos con moderación (1-2 por mensaje como máximo).
- Cierre siempre abierto, invita a la conversación.

### 4.2 Comercial caribeño (alta conversación)

Tono más directo, con expresiones del Caribe colombiano. Se usa para
mensajes de recompra, prevención y reactivación — contextos donde se
necesita generar urgencia o diferenciarse del ruido.

**Reglas:**
- Expresiones como "Ojo", "Ponte las pilas", "No te quedes varado".
- Tuteo natural, cercanía.
- Puede incluir emojis más expresivos (2-3 por mensaje).
- El objetivo es generar conversación, no cerrar venta.
- Mantener respeto; nunca ser agresivo ni grosero.

### 4.3 Caribe auténtico (opcional, configurable)

Tono coloquial del Caribe colombiano. Incluye expresiones regionales
como "nojoda",. **No es el tono por defecto.**

**Reglas:**
- Solo se activa cuando marketing lo selecciona conscientemente.
- Ideal para públicos específicos y campañas segmentadas.
- Puede usar más emojis (3-4 por mensaje).
- El copy debe sonar natural, no forzado.
- Nunca usar en comunicaciones de garantía o transaccionales
  formales.

**Configuración:** Este estilo se define como un campo seleccionable
en la plantilla, no como valor predeterminado. Marketing elige cuándo
aplicarlo.

## 5. Modelo de plantilla

Cada plantilla en la biblioteca guarda estos campos:

| Campo                | Descripción                                                  |
|----------------------|--------------------------------------------------------------|
| **ID**               | Identificador único con prefijo de categoría (ej: BW-001).   |
| **Nombre**           | Nombre descriptivo de la plantilla.                           |
| **Categoría**        | Intención comercial a la que pertenece.                       |
| **Ángulo psicológico**| El enfoque emocional del mensaje.                            |
| **Objetivo**         | Qué se busca lograr con este mensaje.                         |
| **Uso recomendado**  | Cuándo disparar esta plantilla (trigger/condición).           |
| **Variantes de tono**| 3 versiones: Cercano profesional, Comercial caribeño, Caribe auténtico. |

## 6. Ángulos psicológicos

Cada mensaje guarda un ángulo psicológico. Esto permite filtrar por
enfoque emocional, no solo por categoría.

| Ángulo        | Descripción                                             |
|---------------|---------------------------------------------------------|
| Tranquilidad  | Evitar problemas antes de que ocurran.                  |
| Confianza     | Acompañamiento durante la garantía.                     |
| Prevención    | Diagnóstico antes del fallo.                            |
| Recompra      | Renovar por necesidad real, no por presión.             |
| Fidelización  | Reseñas, relación a largo plazo, advocacy.              |
| Conversación  | Abrir diálogo, no cerrar una venta.                     |

## 7. Hooks aprobados de la marca

Estas frases son activos de copy protegidos. Se pueden mezclar con
distintos contextos, pero no se deben alterar.

- Ojo, no te quedes varado.
- Ponte las pilas con tiempo.
- No te quedes tirado.
- Antes de que falle, revísala.
- Sigue rodando tranquilo.
- Tu batería también merece seguimiento.

"Nojoda" se usa exclusivamente como modificador de estilo Caribe
auténtico, nunca como obligación.

## 8. Categorías comerciales

| #  | Categoría                | Prefijo | Cantidad | Total (×3 tonos) |
|----|--------------------------|---------|----------|-------------------|
| 1  | Bienvenida y postventa   | BW      | 8        | 24                |
| 2  | Satisfacción y reseñas   | PS/GR   | 6        | 18                |
| 3  | Garantía y revisiones    | WG      | 10       | 30                |
| 4  | Prevención D-60 / D-30   | PV      | 8        | 24                |
| 5  | Recompra y renovación    | RP      | 12       | 36                |
| 6  | Reactivación             | RC      | 6        | 18                |
|    | **Total**                |         | **50**   | **150**           |

## 9. Métricas futuras

La biblioteca no debe quedarse estática. Cada plantilla debe terminar
teniendo estadísticas. La arquitectura debe estar preparada para
aprender cuál funciona mejor.

Métricas a implementar en versiones futuras:

- **Entregados** — cuántos se enviaron.
- **Leídos** — si el proveedor lo permite.
- **Respondidos** — cuántos generaron respuesta.
- **Conversación iniciada** — cuántos abrieron un chat.
- **Cotización** — cuántos derivaron en una cotización.
- **Compra** — cuántos resultaron en venta.
- **Ingresos** — ingreso atribuible.
- **Costo** — costo por envío.
- **ROI** — retorno de inversión.

## 10. Reglas de uso

1. **Seleccionar el tono antes del contenido.** El tono define el
   estilo, no al revés.
2. **No enviar la misma plantilla dos veces sin间隔.** Cada cliente
   debe recibir cada plantilla como máximo una vez por ciclo.
3. **Respetar la lógica de disparo.** Si una plantilla dice
   "solamente si previamente tuvo interacción positiva", se respeta.
4. **No combinar ángulos opuestos.** Un mensaje de prevención no
   debe incluir un CTA de recompra agresiva.
5. **Los hooks son compartidos.** Se pueden usar en cualquier
   categoría, no pertenecen a una sola plantilla.
6. **El estilo Caribe auténtico es opt-in.** Nunca se activa por
   defecto.

---

# Plantillas

---

## Categoría 1: Bienvenida y postventa

**Objetivo:** Generar confianza inmediata después de la compra. No
vender; acompañar.

**Trigger típico:** Registro de compra o activación de garantía.

---

### BW-001 · Bienvenida cálida

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Generar confianza, no vender.                                |
| **Uso recomendado**| Inmediatamente después del registro de compra.               |

#### Tono: Cercano profesional

Hola, {customerName}. Gracias por confiar en {organizationName}.

Tu batería {productName} ya quedó registrada con su garantía y
estaremos acompañándote durante todo su ciclo de vida.

Si necesitas cualquier orientación, escríbenos por aquí.

#### Tono: Comercial caribeño

¡{customerName}! Bienvenido a la familia {organizationName}.

Tu batería {productName} quedó registrada y ya tiene su garantía
activa. Estaremos contigo durante todo el camino.

¿Dudas? Escríbenos, que aquí estamos para ayudarte.

#### Tono: Caribe auténtico

¡{customerName}! Qué alegría tenerte con nosotros.

Tu batería {productName} ya está registrada en {organizationName}
con toda su garantía. Parcero, aquí te acompañamos durante todo
el ciclo de vida de esa batería.

Cuando necesites, nos encuentras por aquí.

---

### BW-002 · Registro de garantía confirmado

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Confirmar que la garantía está activa y explicar alcance.    |
| **Uso recomendado**| Dentro de las primeras 24 horas tras la compra.              |

#### Tono: Cercano profesional

Hola, {customerName}. Tu garantía de {productName} ya está activa
en {organizationName}.

Te recomendamos guardar este mensaje como referencia. Si en algún
momento necesitas hacer un reclamo de garantía, escríbenos por aquí
y te guiamos con gusto.

#### Tono: Comercial caribeño

{customerName}, tu garantía de {productName} ya quedó activa con
nosotros.

Guárdalo como respaldo. Si algo sale, no te preocupes: escríbenos
y te ayudamos a resolverlo sin rodeos.

#### Tono: Caribe auténtico

{customerName}, ya quedó. La garantía de tu {productName} está
activa en {organizationName}.

Guarda este mensaje por si acaso. Si algo pasa, nos escribes y te
echamos la mano sin vueltas.

---

### BW-003 · Primera semana

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Abrir diálogo en la primera semana.                          |
| **Uso recomendado**| 7 días después de la compra.                                 |

#### Tono: Cercano profesional

Hola, {customerName}. Ya va una semana con tu batería {productName}.

¿Todo está funcionando bien? Si tienes alguna duda o quieres
saber más sobre el cuidado de tu batería, escríbenos.

#### Tono: Comercial caribeño

{customerName}, ya cumpliste una semana con tu {productName}.

¿Qué tal ha ido todo? Si necesitas algo o tienes alguna pregunta,
aquí estamos para echarte la mano.

#### Tono: Caribe auténtico

{customerName}, una semana ya con la {productName} puesta. ¿Qué
tal se siente? Si necesitas cualquier cosa o tienes una duda, nos
escribes y te ayudamos.

---

### BW-004 · Bienvenida con datos de contacto

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Informar canales de soporte y generar confianza.             |
| **Uso recomendado**| Registro de compra, junto con BW-001.                        |

#### Tono: Cercano profesional

Hola, {customerName}. Gracias por adquirir tu {productName} en
{organizationName}.

Para cualquier consulta sobre tu batería o su garantía, puedes
escribirnos por este canal. Estaremos atentos.

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya está en buenas manos con
{organizationName}.

¿Necesitas algo? Escríbenos por aquí y te respondemos rápido.

#### Tono: Caribe auténtico

{customerName}, bienvenido. Tu {productName} ya está registrada
en {organizationName}.

Si necesitas algo, nos escribes por aquí y te atendemos al toque.

---

### BW-005 · Tip de cuidado postventa

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Educar sobre cuidado básico de la batería.                   |
| **Uso recomendado**| 3-5 días después de la compra.                               |

#### Tono: Cercano profesional

Hola, {customerName}. Un consejo para el cuidado de tu
{productName}:

Evita dejar el vehículo sin arrancar por más de 15 días seguidos.
Esto ayuda a mantener la batería en buen estado por más tiempo.

Si tienes más preguntas, estamos aquí.

#### Tono: Comercial caribeño

{customerName}, ojo con esto: si vas a dejar el carro parado
mucho tiempo, arráncalo de vez en cuando para que la batería
{productName} se mantenga cargada.

Un detalle sencillo que te puede ahorrar dolores de cabeza.

#### Tono: Caribe auténtico

{customerName}, par tipito: no dejes el carro parado mucho rato
sin arrancarlo. Tu {productName} necesita que la cargues de vez
en cuando para que no se te baje.

Si tienes más dudas, nos escribes.

---

### BW-006 · Confirmación de instalación

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Confirmar que la batería fue instalada correctamente.        |
| **Uso recomendado**| Si el taller reporta la instalación en el sistema.           |

#### Tono: Cercano profesional

Hola, {customerName}. Tu batería {productName} ya fue instalada
en {organizationName} y está lista para funcionar.

Si en algún momento notas algo inusual con el sistema eléctrico de
tu vehículo, no dudes en escribirnos.

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya quedó montada y funcionando.

Si ves algo raro con el carro, nos escribes de una y te ayudamos
a revisar qué está pasando.

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya quedó puesta en
{organizationName}. Todo bien, todo correcto.

Si algo se ve raro con el carro, nosavis y revisamos.

---

### BW-007 · Bienvenida a cliente recurrente

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Fidelización                                                 |
| **Objetivo**       | Reconocer que es un cliente que vuelve.                      |
| **Uso recomendado**| Segunda compra o más.                                        |

#### Tono: Cercano profesional

Hola, {customerName}. Nuevamente contigo en {organizationName}.

Gracias por confiar en nosotros otra vez. Tu nueva batería
{productName} ya está registrada con su garantía.

Seguimos aquí para lo que necesites.

#### Tono: Comercial caribeño

{customerName}, de vuelta con nosotros. Eso nos gusta.

Tu {productName} ya quedó registrada. Ya sabes que aquí estamos
para lo que necesites, ¿no?

#### Tono: Caribe auténtico

{customerName}, otra vez por aquí. Bienvenido de nuevo.

Tu {productName} ya está registrada en {organizationName}. Parcero,
ya sabes que aquí te atendemos como en casa.

---

### BW-008 · Bienvenida con resumen de garantía

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Bienvenida y postventa                                       |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Dar un resumen claro de la garantía y próximos pasos.        |
| **Uso recomendado**| Registro de compra, como resumen ejecutivo.                  |

#### Tono: Cercano profesional

Hola, {customerName}. Resumen de tu garantía:

Tu batería {productName} tiene garantía hasta {warrantyExpiresAt}.
Durante ese período, si necesitas una revisión o un reclamo,
escríbenos por aquí y te atendemos.

Te acompañamos durante todo el proceso.

#### Tono: Comercial caribeño

{customerName}, tu {productName} tiene garantía hasta
{warrantyExpiresAt}. Anótalo.

Si necesitas algo durante ese tiempo, nos escribes y te ayudamos
sin problemas.

#### Tono: Caribe auténtico

{customerName}, ojo: tu {productName} tiene garantía hasta
{warrantyExpiresAT}. Guárdalo por si acaso.

Si necesitas algo, nos escribes y te echamos la mano.

---

## Categoría 2: Satisfacción y reseñas

**Objetivo:** Medir satisfacción, obtener reseñas y construir prueba
social. Solo se envían si la experiencia fue positiva.

**Trigger típico:** Después de una interacción positiva confirmada, o
como sondeo de satisfacción.

---

### PS-001 · ¿Todo va bien?

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Satisfacción                                                 |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Sondear satisfacción sin presionar.                          |
| **Uso recomendado**| 3 días después de la compra o servicio.                      |

#### Tono: Cercano profesional

Hola, {customerName}. Solo queríamos saber cómo te ha ido con tu
batería {productName}.

¿Todo está funcionando correctamente?

Tu opinión nos ayuda muchísimo y estamos atentos si necesitas
cualquier cosa.

#### Tono: Comercial caribeño

{customerName}, ¿cómo va todo con la {productName}?

¿Funcionando bien? Si tienes alguna duda o algo no te convence,
escríbenos. Aquí estamos para ayudarte.

#### Tono: Caribe auténtico

{customerName}, ¿qué tal la {productName}? ¿Todo bien?

Si algo no te cuadra o tienes una duda, nos escribés y te
ayudamos al toque.

---

### PS-002 · Satisfacción después de una revisión

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Satisfacción                                                 |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Confirmar que la revisión fue satisfactoria.                 |
| **Uso recomendado**| 1-2 días después de una revisión en taller.                  |

#### Tono: Cercano profesional

Hola, {customerName}. Esperamos que la revisión de tu
{productName} haya sido de tu agrado en {organizationName}.

Si tienes alguna pregunta sobre lo que se hizo, escríbenos.

#### Tono: Comercial caribeño

{customerName}, ¿qué tal la revisión de tu {productName} en
{organizationName}? ¿Quedaste satisfecho?

Si necesitas que te expliquemos algo, nos escribes.

#### Tono: Caribe auténtico

{customerName}, ¿cómo te fue con la revisión de la {productName}
en {organizationName}? ¿Todo bien?

Si tienes alguna duda, nos escribes y te la aclaramos.

---

### PS-003 · Satisfacción a los 30 días

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Satisfacción                                                 |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Medir satisfacción un mes después.                           |
| **Uso recomendado**| 30 días después de la compra.                                |

#### Tono: Cercano profesional

Hola, {customerName}. Ya van 30 días con tu batería {productName}.

¿Cómo ha ido la experiencia? Si tienes alguna duda o quieres
saber más sobre el cuidado de tu batería, escríbenos.

#### Tono: Comercial caribeño

{customerName}, un mes con la {productName}. ¿Qué tal?

Si necesitas algo o tienes alguna pregunta, aquí estamos para
ayudarte.

#### Tono: Caribe auténtico

{customerName}, un mes ya con la {productName}. ¿Cómo va todo?

Si necesitas cualquier cosa, nos escribes y te atendemos.

---

### GR-001 · Solicitud de reseña Google

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reseñas                                                      |
| **Ángulo**         | Fidelización                                                 |
| **Objetivo**       | Obtener reseña en Google.                                    |
| **Uso recomendado**| Solo si previamente tuvo interacción positiva o nunca
|                    | recibió esta solicitud.                                      |

#### Tono: Cercano profesional

Hola, {customerName}. Si quedaste satisfecho con nuestro servicio,
¿nos regalarías un minuto dejando una reseña en Google?

Eso ayuda muchísimo a que más personas encuentren un negocio
confiable como el nuestro.

¡Muchas gracias por tu apoyo!

#### Tono: Comercial caribeño

{customerName}, si te gustó el servicio, ¿nos dejas una reseña en
Google? Un minutito y nos ayudas un montón.

Así más personas nos encuentran y confían en nosotros. ¡Gracias!

#### Tono: Caribe auténtico

{customerName}, si quedaste contento con el servicio, ¿nos regalas
una reseñita en Google? Solo un minutico y nos ayudás bastante.

¡Mil gracias, parce!

---

### GR-002 · Seguimiento de reseña (si no respondió)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reseñas                                                      |
| **Ángulo**         | Fidelización                                                 |
| **Objetivo**       | Recordar amablemente la solicitud de reseña.                 |
| **Uso recomendado**| 7 días después de GR-001 sin respuesta. Máx. 1 vez.         |

#### Tono: Cercano profesional

Hola, {customerName}. Solo un recordatorio amable: si tienes un
momento, nos encantaría que nos dejaras una reseña en Google.

Tu opinión nos ayuda a mejorar y a que más personas nos conozcan.

¡Gracias por tu tiempo!

#### Tono: Comercial caribeño

{customerName}, ¿te acuerdas? Te habíamos pedido si nos podías
dejar una reseña en Google.

Si tienes un momentico, nos ayudarías un montón. ¡Gracias!

#### Tono: Caribe auténtico

{customerName}, par al recordatorio: si tienes un ratito y te
animas a dejarnos una reseña en Google, nos ayudaría un montón.

¡Gracias, parce!

---

### GR-003 · Agradecimiento por reseña

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reseñas                                                      |
| **Ángulo**         | Fidelización                                                 |
| **Objetivo**       | Agradecer la reseña y reforzar la relación.                  |
| **Uso recomendado**| Detectar que dejó reseña (futuro: webhook de Google).        |

#### Tono: Cercano profesional

Hola, {customerName}. ¡Muchas gracias por dejarnos tu reseña en
Google!

Tu opinión es muy valiosa para nosotros. Seguimos aquí para lo
que necesites.

#### Tono: Comercial caribeño

{customerName}, ¡gracias por la reseña! Eso nos motiva a seguir
dando lo mejor.

Aquí estamos para lo que necesites.

#### Tono: Caribe auténtico

{customerName}, ¡mil gracias por la reseña! Eso nos llena de
energía para seguir adelante.

Si necesitas algo, aquí estamos.

---

## Categoría 3: Garantía y revisiones

**Objetivo:** Acompañar al cliente durante el ciclo de garantía,
recordar revisiones y mantener la relación activa.

**Trigger típico:** Fechas clave del ciclo de vida de la garantía.

---

### WG-001 · Revisión preventiva (mitad de garantía)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Recordar la revisión preventiva a mitad de garantía.         |
| **Uso recomendado**| Cuando la batería llega a la mitad del período de garantía.  |

#### Tono: Cercano profesional

Hola, {customerName}. Tu batería {productName} ya llegó
aproximadamente a la mitad de su período de garantía.

Te recomendamos realizar la revisión preventiva en el taller
autorizado del fabricante para conservar el seguimiento adecuado
de la garantía y verificar el estado del sistema eléctrico.

Si necesitas orientación sobre dónde realizarla, con gusto te
ayudamos.

#### Tono: Comercial caribeño

{customerName}, ojo: tu {productName} ya va por la mitad de su
garantía.

Es buen momento para hacerle una revisión preventiva en el taller
autorizado del fabricante. Así conservas la garantía y verificas
que todo esté marchando bien.

¿Necesitas que te orientemos? Escríbenos.

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya va por la mitad de la
garantía. Parcero, es buen momento para llevarla a revisión al
taller autorizado del fabricante.

Así te asegurás de que todo esté bien y conservas la garantía.

Si necesitas ayuda con eso, nos escribes.

---

### WG-002 · Confirmación de revisión completada

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Confirmar que la revisión se realizó y dar tranquilidad.     |
| **Uso recomendado**| Después de que el taller reporta la revisión.                |

#### Tono: Cercano profesional

Hola, {customerName}. Tu revisión de {productName} fue completada
exitosamente.

Tu batería está en buen estado y la garantía continúa vigente.

Si tienes alguna pregunta, escríbenos.

#### Tono: Comercial caribeño

{customerName}, tu revisión de {productName} quedó lista. Todo en
orden, garantía vigente.

Si necesitas algo, nos escribes.

#### Tono: Caribe auténtico

{customerName}, la revisión de tu {productName} quedó hecha. Todo
bien, garantía corriendo.

Si tienes alguna duda, nos escribes y te ayudamos.

---

### WG-003 · Recordatorio de garantía activa

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Reforzar que la garantía sigue vigente y están disponibles.  |
| **Uso recomendado**| Mensual, durante la vigencia de la garantía.                 |

#### Tono: Cercano profesional

Hola, {customerName}. Solo para recordarte que tu garantía de
{productName} sigue vigente hasta {warrantyExpiresAt}.

Si en algún momento necesitas una revisión o tienes alguna duda,
escríbenos por aquí.

#### Tono: Comercial caribeño

{customerName}, tu garantía de {productName} sigue corriendo hasta
{warrantyExpiresAt}. Todo tranquilo por aquí.

Si necesitas algo, nos escribes.

#### Tono: Caribe auténtico

{customerName}, la garantía de tu {productName} sigue activa hasta
{warrantyExpiresAt}. Tranquilo.

Si necesitas cualquier cosa, aquí estamos.

---

### WG-004 · Orientación sobre taller autorizado

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Guiar al cliente hacia el taller autorizado del fabricante.  |
| **Uso recomendado**| Cuando el cliente pregunta dónde hacer la revisión.          |

#### Tono: Cercano profesional

Hola, {customerName}. Para la revisión de tu {productName}, te
recomendamos acudir al taller autorizado del fabricante.

Ellos cuentan con las herramientas y el personal calificado para
mantener tu garantía vigente.

Si necesitas información de los talleres autorizados, con gusto te
la proporcionamos.

#### Tono: Comercial caribeño

{customerName}, si vas a hacer la revisión de tu {productName},
ve al taller autorizado del fabricante. Ellos son los indicados
para mantener tu garantía.

¿Necesitas que te digamos cuál queda más cerca? Escríbenos.

#### Tono: Caribe auténtico

{customerName}, para la revisión de tu {productName}, el taller
autorizado del fabricante es el que va. Ellos saben de eso y
mantienen tu garantía.

Si necesitas saber cuál queda más cerca, nos escribes.

---

### WG-005 · Garantía próxima a vencer (90 días)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Alertar que la garantía vence en 90 días.                    |
| **Uso recomendado**| 90 días antes del vencimiento de garantía.                   |

#### Tono: Cercano profesional

Hola, {customerName}. Tu garantía de {productName} vence el
{warrantyExpiresAt}.

Te recomendamos aprovechar este tiempo para realizar cualquier
revisión pendiente y asegurarte de que todo esté en orden.

Si necesitas agendar una revisión, escríbenos.

#### Tono: Comercial caribeño

{customerName}, ojo: tu garantía de {productName} vence el
{warrantyExpiresAt}. Quedan 90 días.

Es buen momento para hacerle una revisión antes de que se venza.
¿Agendamos algo?

#### Tono: Caribe auténtico

{customerName}, la garantía de tu {productName} vence el
{warrantyExpiresAt}. Ya casi se cumple el tiempo.

Si quieres aprovecharla, es buen momento para hacer una revisión.
¿Qué dices?

---

### WG-006 · Garantía próxima a vencer (30 días)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Alertar que la garantía vence en 30 días.                    |
| **Uso recomendado**| 30 días antes del vencimiento de garantía.                   |

#### Tono: Cercano profesional

Hola, {customerName}. Tu garantía de {productName} vence el
{warrantyExpiresAT}.

Si no has realizado la revisión, este es un buen momento para
hacerlo. Después de esa fecha, cualquier servicio será por tu
cuenta.

¿Necesitas agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, tu garantía de {productName} vence el
{warrantyExpiresAt}. Queda un mes.

Si no has ido a revisarla, ya es hora. Después de esa fecha, los
servicios serán por tu cuenta.

¿Agendamos la revisión?

#### Tono: Caribe auténtico

{customerName}, la garantía de tu {productName} se acaba el
{warrantyExpiresAt}. Ya quedó un mes.

Si no la has revisado, es buen momento. Después de esa fecha, todo
es por tu cuenta.

¿Qué dices, agendamos?

---

### WG-007 · Garantía vencida — primer contacto

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Informar que la garantía venció y abrir la puerta a revisión.|
| **Uso recomendado**| 7 días después del vencimiento de garantía.                  |

#### Tono: Cercano profesional

Hola, {customerName}. La garantía de tu {productName} ya venció
el {warrantyExpiresAt}.

A partir de ahora, cualquier servicio será por tu cuenta. Si
deseas, podemos hacer un diagnóstico del estado actual de tu
batería para que tomes la mejor decisión.

¿Te gustaría agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, tu garantía de {productName} ya se venció el
{warrantyExpiresAT}.

Si quieres, ven y revisamos el estado de la batería para
recomendarte la mejor opción. Sin compromiso.

#### Tono: Caribe auténtico

{customerName}, la garantía de tu {productName} ya pasó el
{warrantyExpiresAT}.

Si quieres, ven y revisamos cómo está la batería para que sepas
qué hacer. Sin compromiso.

---

### WG-008 · Seguimiento post-garantía

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Mantener contacto después de la garantía sin vender.         |
| **Uso recomendado**| 30 días después del vencimiento, si no respondió WG-007.     |

#### Tono: Cercano profesional

Hola, {customerName}. Esperamos que tu {productName} siga
funcionando bien.

Si en algún momento necesitas una revisión o tienes alguna duda
sobre el estado de tu batería, escríbenos por aquí.

#### Tono: Comercial caribeño

{customerName}, ¿cómo va todo con la {productName}? Si necesitas
que le echemos un ojo, aquí estamos.

Sin compromiso, cuando quieras.

#### Tono: Caribe auténtico

{customerName}, ¿qué tal la {productName}? Si necesitas que le
echemos un vistazo, aquí estamos.

Cuando quieras, sin presión.

---

### WG-009 · Cómo cuidar tu batería en garantía

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Educar sobre prácticas que preservan la garantía.            |
| **Uso recomendado**| Mensual, durante la garantía.                                |

#### Tono: Cercano profesional

Hola, {customerName}. Un recordatorio para el cuidado de tu
{productName} durante la garantía:

Evita descargas profundas. Si el carro no se va a usar por varios
días, desconecta el borne negativo o arráncalo periódicamente.

Esto ayuda a preservar la batería y mantiene tu garantía válida.

#### Tono: Comercial caribeño

{customerName}, ojo con esto: no dejes que la {productName} se
descargue completamente.

Si el carro va a estar parado mucho rato, arráncalo de vez en
cuando o desconecta la batería. Así mantienes la garantía y la
batería durando más.

#### Tono: Caribe auténtico

{customerName}, tip: no dejes que la {productName} se te
descargue a cero.

Si el carro va a estar sin usar, arráncalo de vez en cuando o le
sacas el borne negativo. Así cuidas la batería y la garantía.

---

### WG-010 · Resultado de diagnóstico

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Garantía                                                     |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Compartir resultados de diagnóstico y recomendar acción.     |
| **Uso recomendado**| Después de realizar diagnóstico solicitado por el cliente.    |

#### Tono: Cercano profesional

Hola, {customerName}. El diagnóstico de tu {productName} arrojó
los siguientes resultados: el estado de la batería es
{bateriaStatus}.

¿Te gustaría que te expliquemos las opciones disponibles?

Estamos aquí para ayudarte a tomar la mejor decisión.

#### Tono: Comercial caribeño

{customerName}, ya revisamos tu {productName}. El diagnóstico
muestra que la batería está {bateriaStatus}.

¿Quieres que te expliquemos qué opciones tenemos para ti?
Aquí estamos para ayudarte.

#### Tono: Caribe auténtico

{customerName}, ya le echaron un ojo a tu {productName}. La
batería está {bateriaStatus}.

¿Quieres que te cuáles son las opciones? Aquí estamos para
ayudarte a decidir.

---

## Categoría 4: Prevención D-60 / D-30

**Objetivo:** Generar urgencia antes del vencimiento de garantía
con tono más directo. Aquí la marca empieza a meter personalidad.

**Trigger típico:** 60 y 30 días antes del vencimiento de garantía.

---

### PV-001 · Ojo, no te quedes varado (D-60)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Generar urgencia preventiva a los 60 días.                   |
| **Uso recomendado**| 60 días antes del vencimiento de garantía.                   |

#### Tono: Cercano profesional

Hola, {customerName}. Tu batería {productName} está entrando en
la etapa final de su garantía.

Antes de que empiece a darte problemas, vale la pena hacerle un
diagnóstico y revisar voltaje, alternador y estado general.

Si quieres, agenda tu revisión con nosotros.

#### Tono: Comercial caribeño

Ojo, {customerName}. Tu {productName} ya está entrando en la
etapa final de su garantía.

Antes de que un día el carro te deje viendo estrellas en plena
calle, vale la pena hacerle un diagnóstico y revisar voltaje,
alternador y estado general.

Si quieres, agenda tu revisión con nosotros.

#### Tono: Caribe auténtico

¡{customerName}! Ojo, tu {productName} ya está entrando en la
etapa final de garantía.

Antes de que el carro te deje botado en la calle, vale la pena
revisarla. Voltaje, alternador, estado general.

¿Agendamos la revisión?

---

### PV-002 · Ponte las pilas con tiempo (D-30)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Generar urgencia a los 30 días con tono más directo.         |
| **Uso recomendado**| 30 días antes del vencimiento de garantía.                   |

#### Tono: Cercano profesional

Hola, {customerName}. A tu batería {productName} le queda
aproximadamente un mes de garantía.

Este es un buen momento para revisarla antes de que empiece a
darte problemas.

Ven a nuestras instalaciones y te ayudamos a evaluar el estado de
la batería y del sistema eléctrico.

#### Tono: Comercial caribeño

{customerName}, ponte las pilas con tiempo.

A tu {productName} le queda un mes de garantía y este es un buen
momento para revisarla antes de que empiece a darte problemas.

Ven a nuestras instalaciones y te ayudamos a evaluar el estado de
la batería y del sistema eléctrico.

#### Tono: Caribe auténtico

{customerName}, ponte las pilas. Tu {productName} ya casi cumple
su garantía.

Es buen momento para revisarla antes de que empiece a fallar. Ven
a nuestras instalaciones y la revisamos.

¿Qué dices?

---

### PV-003 · Diagnóstico preventivo (D-60, enfoque técnico)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Ofrecer diagnóstico técnico preventivo.                      |
| **Uso recomendado**| 60 días antes del vencimiento, para clientes técnicos.       |

#### Tono: Cercano profesional

Hola, {customerName}. Tu batería {productName} se acerca al final
de su garantía.

Te ofrecemos un diagnóstico preventivo donde revisamos voltaje de
reposo, carga del alternador y estado de los bornes.

¿Te gustaría agendarlo?

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya está por cumplir garantía.

Te ofrecemos un diagnóstico preventivo: revisamos voltaje,
alternador y bornes para que vayas tranquilo.

¿Agendamos?

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya va a cumplir garantía.

¿Quieres que le hagamos un diagnóstico preventivo? Revisamos
voltaje, alternador y bornes para que sigas tranquilo.

¿Qué dices?

---

### PV-004 · No esperes al fallo (D-60, enfoque tranquilidad)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Tranquilidad                                                 |
| **Objetivo**       | Ofrecer tranquilidad, no vender.                             |
| **Uso recomendado**| 60 días antes del vencimiento, tono suave.                   |

#### Tono: Cercano profesional

Hola, {customerName}. Tu batería {productName} está entrando en
la etapa final de su garantía.

Queremos que sigas tranquilo. Si quieres, puedes traerla para que
le hagamos un chequeo preventivo sin costo.

Estamos aquí para acompañarte.

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya va camino al final de su
garantía.

Tranquilo, que no es para asustarse. Si quieres, ven y le hacemos
un chequeo preventivo para que sigas rodando tranquilo.

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya va pa'l final de la garantía.

No te preocupes. Si quieres, ven y le echamos un chequeo
preventivo para que sigas tranquilo.

¿Qué dices?

---

### PV-005 · Revisión del sistema eléctrico (D-30)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Ampliar el foco al sistema eléctrico, no solo la batería.    |
| **Uso recomendado**| 30 días antes del vencimiento.                               |

#### Tono: Cercano profesional

Hola, {customerName}. Tu batería {productName} tiene un mes de
garantía.

Además de la batería, es importante revisar el sistema eléctrico
del vehículo: alternador, bornes y cableado.

Ven a nuestras instalaciones y te ayudamos a evaluar todo.

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya casi no tiene garantía.

Ojo: no es solo la batería. El alternador, los bornes y el
cableado también importan.

Ven y revisamos todo el sistema eléctrico para que sigas
tranquilo.

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya casi no tiene garantía.

No es solo la batería, parce. El alternador, los bornes y el
cableado también hay que revisarlos.

Ven y le echamos un ojo a todo el sistema eléctrico.

---

### PV-006 · Preventivo con hook (D-60)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Usar hook aprobado para generar acción.                      |
| **Uso recomendado**| 60 días antes del vencimiento, variante con hook.            |

#### Tono: Cercano profesional

Hola, {customerName}. Antes de que falle, revísala.

Tu batería {productName} está entrando en la etapa final de su
garantía. Un diagnóstico preventivo puede ahorrarte problemas.

¿Te gustaría agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, ojo: antes de que falle, revísala.

Tu {productName} ya está en la etapa final de garantía. Un
diagnóstico preventivo te puede ahorrar un susto.

¿Agendamos la revisión?

#### Tono: Caribe auténtico

{customerName}, antes de que te deje tirado, revísala.

Tu {productName} ya está por cumplir garantía. Un diagnóstico
preventivo te puede salvar el día.

¿Agendamos?

---

### PV-007 · Preventivo con hook (D-30)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Usar hook aprobado con urgencia de 30 días.                  |
| **Uso recomendado**| 30 días antes del vencimiento, variante con hook.            |

#### Tono: Cercano profesional

Hola, {customerName}. Ponte las pilas con tiempo.

Tu batería {productName} tiene un mes de garantía. Es buen
momento para revisarla antes de que empiece a fallar.

¿Te gustaría agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, ponte las pilas con tiempo.

Tu {productName} ya casi no tiene garantía. Revisala antes de que
empiece a darte problemas.

¿Agendamos?

#### Tono: Caribe auténtico

{customerName}, ponte las pilas.

Tu {productName} ya casi se acabó la garantía. Revísala antes de
que te deje varado.

¿Qué dices?

---

### PV-008 · Preventivo suave (D-60, sin presión)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Prevención                                                   |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Abrir diálogo preventivo sin presión.                        |
| **Uso recomendado**| 60 días antes, para clientes sensibles a la presión.         |

#### Tono: Cercano profesional

Hola, {customerName}. Solo queríamos recordarte que tu batería
{productName} está entrando en la etapa final de su garantía.

Si quieres, puedes aprovechar para hacerle un chequeo. No es
obligatorio, pero te da tranquilidad.

¿Te gustaría más información?

#### Tono: Comercial caribeño

{customerName}, tu {productName} va camino al final de la
garantía.

No es para asustarse, pero si quieres, puedes aprovechar para
hacerle un chequeo. Te da tranquilidad.

¿Te interesa?

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya va pa'l final de la garantía.

No es pa'asustarse, pero si quieres, puedes aprovechar para
revisarla. Te da tranquilidad.

¿Qué dices?

---

## Categoría 5: Recompra y renovación

**Objetivo:** Convertir la finalización de garantía en una oportunidad
de renovación. El copy vende tranquilidad, no descuento.

**Trigger típico:** Vencimiento de garantía o diagnóstico que indica
necesidad de reemplazo.

---

### RP-001 · No te quedes tirado

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Invitar a renovar sin presión agresiva.                      |
| **Uso recomendado**| 7-30 días después del vencimiento de garantía.               |

#### Tono: Cercano profesional

Hola, {customerName}. Te escribimos porque la garantía de tu
batería {productName} ya terminó y ahora entra en una etapa dondeviene estar pendiente de su rendimiento.

No te quedes tirado por esperar a que falle.

Si quieres, ven y revisamos el estado de la batería para
recomendarte la mejor opción según tu vehículo.

#### Tono: Comercial caribeño

{customerName}, no te quedes tirado.

La garantía de tu {productName} ya terminó y ahora conviene estar
pendiente de su rendimiento.

Ven y revisamos el estado de la batería para recomendarte la mejor
opción según tu vehículo.

#### Tono: Caribe auténtico

{customerName}, no esperes a que te deje tirado.

La garantía de tu {productName} ya pasó y vale la pena estar
pendiente de cómo va la batería.

Ven y la revisamos para recomendarte la mejor opción pa'tu carro.

---

### RP-002 · Nojoda, revisa esa batería

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Versión Caribe auténtico de la recompra.                     |
| **Uso recomendado**| Solo con estilo Caribe auténtico seleccionado.               |

#### Tono: Cercano profesional

Hola, {customerName}. La garantía de tu {productName} ya terminó.

Es buen momento para revisar el estado de la batería y
recomendarte la mejor opción. Sin compromiso.

¿Te gustaría agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, la garantía de tu {productName} ya terminó.

Ven y revisamos cómo está la batería para recomendarte la mejor
opción. Sin compromiso.

¿Agendamos?

#### Tono: Caribe auténtico

¡{customerName}! Nojoda, no esperes a que el carro te deje
botado.

Tu {productName} ya cumplió su ciclo de garantía y vale la pena
revisarla antes de que te sorprenda el día menos pensado.

Pásate por nuestras oficinas y te hacemos una evaluación para que
sigas rodando tranquilo.

---

### RP-003 · Renovación con diagnóstico incluido

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Tranquilidad                                                 |
| **Objetivo**       | Ofrecer diagnóstico como parte del proceso de renovación.    |
| **Uso recomendado**| 15-45 días después del vencimiento.                          |

#### Tono: Cercano profesional

Hola, {customerName}. La garantía de tu {productName} ya terminó.

Te ofrecemos un diagnóstico gratuito del estado de tu batería para
que tomes la mejor decisión. Sin compromiso de compra.

¿Te gustaría agendarlo?

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya no tiene garantía.

Te ofrecemos un diagnóstico gratuito para ver cómo está la batería
y recomendarte la mejor opción. Sin compromiso.

¿Agendamos?

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya pasó la garantía.

¿Quieres que le hagamos un diagnóstico gratuito? Así vemos cómo
está y te recomendamos la mejor opción. Sin compromiso.

¿Qué dices?

---

### RP-004 · Sigue rodando tranquilo

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Tranquilidad                                                 |
| **Objetivo**       | Reforzar que la renovación da tranquilidad.                  |
| **Uso recomendado**| 30-60 días después del vencimiento.                          |

#### Tono: Cercano profesional

Hola, {customerName}. Sigue rodando tranquilo.

Tu {productName} ya no tiene garantía, pero eso no significa que
tengas que esperar a que falle. Ven y revisamos su estado para
recomendarte la mejor opción.

#### Tono: Comercial caribeño

{customerName}, sigue rodando tranquilo.

Tu {productName} ya no tiene garantía, pero no esperes a que
falle. Ven y revisamos cómo está para recomendarte la mejor
opción.

#### Tono: Caribe auténtico

{customerName}, sigue tranquilo.

Tu {productName} ya no tiene garantía, pero no dejes que te agarre
por sorpresa. Ven y la revisamos para recomendarte la mejor opción.

---

### RP-005 · Recompra para cliente que ya pasó por revisión

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Convertir un diagnóstico en oportunidad de renovación.       |
| **Uso recomendado**| Después de un diagnóstico que indica batería al final de      |
|                    | su vida útil.                                                |

#### Tono: Cercano profesional

Hola, {customerName}. Como viste en el diagnóstico, tu
{productName} está llegando al final de su vida útil.

Es buen momento para considerar la renovación. Si quieres, te
ayudamos a elegir la mejor batería para tu vehículo.

¿Te gustaría conocer las opciones?

#### Tono: Comercial caribeño

{customerName}, como viste, tu {productName} ya está por dar su
último suspiro.

Es buen momento para renovar. Te ayudamos a elegir la mejor
batería para tu carro.

¿Quieres ver las opciones?

#### Tono: Caribe auténtico

{customerName}, como viste, tu {productName} ya va pa'l final.

Es buen momento para renovar. Te ayudamos a escoger la mejor
batería pa'tu carro.

¿Quieres ver las opciones?

---

### RP-006 · Renovación preventiva (batería en estado regular)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Recomendar renovación preventiva antes del fallo.            |
| **Uso recomendado**| Diagnóstico muestra estado regular, no crítico.              |

#### Tono: Cercano profesional

Hola, {customerName}. El diagnóstico de tu {productName} mostró
que la batería está en estado regular.

Aún no es crítica, pero es buen momento para planificar la
renovación y evitar inconvenientes.

¿Te gustaría conocer las opciones disponibles?

#### Tono: Comercial caribeño

{customerName}, tu {productName} está en estado regular.

Aún no es para asustarse, pero es buen momento para planificar la
renovación y no quedarte varado.

¿Quieres ver las opciones?

#### Tono: Caribe auténtico

{customerName}, tu {productName} está regular.

Aún no es pa'asustarse, pero es buen momento para renovar y no
quedarte tirado.

¿Quieres ver las opciones?

---

### RP-007 · Renovación con beneficio de garantía nueva

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Resaltar que la renovación incluye nueva garantía.           |
| **Uso recomendado**| Cualquier momento post-vencimiento.                          |

#### Tono: Cercano profesional

Hola, {customerName}. Al renovar tu {productName}, obtienes una
nueva garantía completa.

Es la mejor forma de seguir tranquilo con tu vehículo protegido.

¿Te gustaría conocer las opciones?

#### Tono: Comercial caribeño

{customerName}, si renuevas tu {productName}, la garantía vuelve
a empezar desde cero.

Eso es tranquilidad para ti y tu carro.

¿Quieres ver las opciones?

#### Tono: Caribe auténtico

{customerName}, si renuevas tu {productName}, la garantía se te
renueva por completo.

Tranquilidad pa'ti y pa'l carro.

¿Quieres ver las opciones?

---

### RP-008 · Renovación para cliente frecuente

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Fidelización                                                 |
| **Objetivo**       | Reconocer al cliente frecuente y ofrecer renovación.         |
| **Uso recomendado**| Tercera compra o más, post-vencimiento.                      |

#### Tono: Cercano profesional

Hola, {customerName}. Como cliente de confianza de
{organizationName}, queremos recordarte que la garantía de tu
{productName} ya terminó.

Si deseas renovar, tenemos opciones que se ajustan a tu vehículo.

¿Te gustaría conocerlas?

#### Tono: Comercial caribeño

{customerName}, ya eres de la casa. La garantía de tu
{productName} ya terminó.

Si quieres renovar, tenemos opciones pa'tu carro.

¿Quieres verlas?

#### Tono: Caribe auténtico

{customerName}, ya eres de los nuestros. La garantía de tu
{productName} ya pasó.

Si quieres renovar, tenemos opciones pa'tu carro.

¿Quieres verlas?

---

### RP-009 · Renovación con comparativa de opciones

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Presentar opciones de renovación.                            |
| **Uso recomendado**| Cuando el cliente muestra interés en renovar.                |

#### Tono: Cercano profesional

Hola, {customerName}. Tenemos varias opciones de baterías para tu
vehículo.

Cada una con diferentes características y precios. ¿Te gustaría
que te cuáles son para que elijas la que más se ajuste a ti?

#### Tono: Comercial caribeño

{customerName}, tenemos varias opciones de baterías pa'tu carro.

Diferentes precios y características. ¿Quieres que te cuáles son
pa'que elijas la que más te convenga?

#### Tono: Caribe auténtico

{customerName}, tenemos varias opciones de baterías pa'tu carro.

Precios y características variadas. ¿Quieres que te las cuente
pa'que escojas la que más te guste?

---

### RP-010 · Renovación con urgencia suave

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Generar urgencia sin ser agresivo.                           |
| **Uso recomendado**| 30-60 días post-vencimiento, primera vez que se insiste.     |

#### Tono: Cercano profesional

Hola, {customerName}. La garantía de tu {productName} ya terminó
y la batería puede empezar a perder rendimiento en cualquier
momento.

Es mejor renovar antes de que te dé una sorpresa.

¿Te gustaría agendar una revisión para ver las opciones?

#### Tono: Comercial caribeño

{customerName}, tu {productName} ya no tiene garantía y puede
empezar a fallar en cualquier momento.

Renueva antes de que te deje varado.

¿Agendamos una revisión para ver las opciones?

#### Tono: Caribe auténtico

{customerName}, tu {productName} ya no tiene garantía y puede
empezar a fallar cuando menos lo esperes.

Renueva antes de que te deje tirado.

¿Agendamos pa'ver las opciones?

---

### RP-011 · Renovación con descuento (opcional)

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Ofrecer incentivo de precio para renovación.                 |
| **Uso recomendado**| Solo si marketing autoriza el descuento activo.              |

#### Tono: Cercano profesional

Hola, {customerName}. Tenemos una oferta especial para ti.

Si renuevas tu {productName} antes del {fechaLimite}, obtienes un
10% de descuento.

¿Te gustaría conocer las opciones?

#### Tono: Comercial caribeño

{customerName}, tenemos algo especial para ti.

Si renuevas tu {productName} antes del {fechaLimite}, te damos un
10% de descuento.

¿Quieres ver las opciones?

#### Tono: Caribe auténtico

{customerName}, ojo con esto: si renuevas tu {productName} antes
del {fechaLimite}, te damos un 10% de descuento.

¿Quieres ver las opciones?

---

### RP-012 · Renovación recordatorio final

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Recompra                                                     |
| **Ángulo**         | Recompra                                                     |
| **Objetivo**       | Último recordatorio antes de dejar de contactar.             |
| **Uso recomendado**| 90 días post-vencimiento, si no ha renovado. Máx. 1 vez.    |

#### Tono: Cercano profesional

Hola, {customerName}. Este es nuestro último recordatorio sobre
la renovación de tu {productName}.

Si aún no lo has hecho, te recomendamos revisar el estado de la
batería antes de que empiece a fallar.

¿Te gustaría agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, este es el último recordatorio sobre tu
{productName}.

Si aún no lo has revisado, es buen momento antes de que falle.

¿Agendamos?

#### Tono: Caribe auténtico

{customerName}, este es el último recordatorio sobre tu
{productName}.

Si aún no la has revisado, hazlo antes de que te deje varado.

¿Qué dices?

---

## Categoría 6: Reactivación

**Objetivo:** Recuperar clientes que hace tiempo no interactúan con la
marca. No vender; recuperar la conversación.

**Trigger típico:** 90-180 días sin interacción.

---

### RC-001 · Hace rato no sabemos de ti

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reactivación                                                 |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Recuperar el contacto sin vender.                            |
| **Uso recomendado**| 90 días sin interacción.                                     |

#### Tono: Cercano profesional

Hola, {customerName}. Hace rato no sabemos de ti y quisimos
saludarte.

Queremos recordarte que seguimos disponibles para ayudarte con
baterías, diagnósticos y cualquier revisión que necesite tu
vehículo.

Cuando quieras, aquí estamos.

#### Tono: Comercial caribeño

{customerName}, hace rato no sabemos de ti. ¿Qué tal todo?

Solo queríamos saludarte y recordarte que aquí estamos para
ayudarte con lo que necesites.

Cuando quieras, nos escribes.

#### Tono: Caribe auténtico

{customerName}, hace rato no te vemos por aquí. ¿Cómo vas todo?

Solo saludarte y recordarte que aquí estamos pa'lo que necesites.

Cuando quieras, nos escribes.

---

### RC-002 · Saludo sin motivo

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reactivación                                                 |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Abrir diálogo sin ningún motivo específico.                  |
| **Uso recomendado**| 120 días sin interacción.                                    |

#### Tono: Cercano profesional

Hola, {customerName}. Solo un saludo para saber cómo estás.

Si en algún momento necesitas algo relacionado con tu vehículo o
batería, aquí estamos.

#### Tono: Comercial caribeño

{customerName}, ¿cómo vas? Solo un saludo por aquí.

Si necesitas algo, aquí estamos para ayudarte.

#### Tono: Caribe auténtico

{customerName}, ¿qué tal todo? Solo un saludo.

Si necesitas algo, aquí estamos.

---

### RC-003 · Reactivación con recordatorio de garantía

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reactivación                                                 |
| **Ángulo**         | Confianza                                                    |
| **Objetivo**       | Recordar la garantía como motivo de re-contacto.             |
| **Uso recomendado**| Cuando la garantía está por vencer y no ha habido contacto.  |

#### Tono: Cercano profesional

Hola, {customerName}. Queríamos recordarte que tu garantía de
{productName} vence el {warrantyExpiresAt}.

Si no has realizado la revisión preventiva, aún estás a tiempo.

¿Te gustaría agendar una revisión?

#### Tono: Comercial caribeño

{customerName}, tu garantía de {productName} vence el
{warrantyExpiresAt}.

Si no has ido a revisarla, aún puedes hacerlo.

¿Agendamos?

#### Tono: Caribe auténtico

{customerName}, la garantía de tu {productName} vence el
{warrantyExpiresAt}.

Si no la has revisado, aún estás a tiempo.

¿Qué dices?

---

### RC-004 · Reactivación post-servicio

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reactivación                                                 |
| **Ángulo**         | Fidelización                                                 |
| **Objetivo**       | Re-engancha después de un servicio pasado.                   |
| **Uso recomendado**| 120+ días después de un servicio registrado.                 |

#### Tono: Cercano profesional

Hola, {customerName}. Hace un tiempo nos visitaste en
{organizationName} para un servicio de tu {productName}.

Queríamos saber cómo ha ido todo desde entonces. Si necesitas algo,
aquí estamos.

#### Tono: Comercial caribeño

{customerName}, ya hace tiempo nos visitaste por tu {productName}.

¿Cómo ha ido todo desde entonces? Si necesitas algo, aquí
estamos.

#### Tono: Caribe auténtico

{customerName}, ya hace rato nos visitaste por tu {productName}.

¿Cómo va todo desde entonces? Si necesitas algo, aquí estamos.

---

### RC-005 · Reactivación con invitación a diagnóstico

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reactivación                                                 |
| **Ángulo**         | Prevención                                                   |
| **Objetivo**       | Ofrecer diagnóstico como gancho de reactivación.             |
| **Uso recomendado**| 90-180 días sin interacción.                                 |

#### Tono: Cercano profesional

Hola, {customerName}. Hace tiempo no sabemos de ti.

Si tu {productName} necesita un chequeo, te ofrecemos un
diagnóstico preventivo para que sigas tranquilo.

¿Te gustaría agendarlo?

#### Tono: Comercial caribeño

{customerName}, hace rato no te vemos.

Si tu {productName} necesita un chequeo, te ofrecemos un
diagnóstico preventivo para que sigas tranquilo.

¿Agendamos?

#### Tono: Caribe auténtico

{customerName}, hace tiempo no nos escribes.

Si tu {productName} necesita un chequeo, te ofrecemos un
diagnóstico preventivo pa'que sigas tranquilo.

¿Qué dices?

---

### RC-006 · Reactivación breve y directa

| Campo              | Valor                                                        |
|--------------------|--------------------------------------------------------------|
| **Categoría**      | Reactivación                                                 |
| **Ángulo**         | Conversación                                                 |
| **Objetivo**       | Mensaje corto que genere respuesta rápida.                   |
| **Uso recomendado**| 180+ días sin interacción, último intento.                   |

#### Tono: Cercano profesional

Hola, {customerName}. ¿Sigues necesitando servicios para tu
{productName}?

Si es así, aquí estamos. Si no, ¡todo bien! Solo queríamos
saber de ti.

#### Tono: Comercial caribeño

{customerName}, ¿todavía necesitas algo para tu {productName}?

Si sí, aquí estamos. Si no, ¡no hay problema! Solo saludarte.

#### Tono: Caribe auténtico

{customerName}, ¿sigues necesitando algo pa'tu {productName}?

Si sí, aquí estamos. Si no, ¡tranquilo! Solo era saludarte.

---

## Apéndice A: Mapa de plantillas por categoría y ángulo

| Categoría                | Tranquilidad | Confianza | Prevención | Recompra | Fidelización | Conversación |
|--------------------------|:------------:|:---------:|:----------:|:--------:|:------------:|:------------:|
| Bienvenida y postventa   |      -       |  BW-001   |  BW-005    |    -     |   BW-007     |  BW-003      |
|                          |              |  BW-002   |            |          |              |  BW-004      |
|                          |              |  BW-006   |            |          |              |              |
|                          |              |  BW-008   |            |          |              |              |
| Satisfacción y reseñas   |      -       |  PS-002   |     -      |    -     |   GR-001     |  PS-001      |
|                          |              |           |            |          |   GR-002     |  PS-003      |
|                          |              |           |            |          |   GR-003     |              |
| Garantía y revisiones    |      -       |  WG-002   |  WG-001    |  WG-007  |      -       |  WG-008      |
|                          |              |  WG-003   |  WG-005    |          |              |              |
|                          |              |  WG-004   |  WG-006    |          |              |              |
|                          |              |  WG-010   |  WG-009    |          |              |              |
| Prevención D-60/D-30     |  PV-004      |     -     |  PV-001    |    -     |      -       |  PV-008      |
|                          |  PV-008      |           |  PV-002    |          |              |              |
|                          |              |           |  PV-003    |          |              |              |
|                          |              |           |  PV-005    |          |              |              |
|                          |              |           |  PV-006    |          |              |              |
|                          |              |           |  PV-007    |          |              |              |
| Recompra y renovación    |  RP-003      |     -     |  RP-010    |  RP-001  |   RP-008     |      -       |
|                          |  RP-004      |           |  RP-006    |  RP-002  |              |              |
|                          |              |           |            |  RP-005  |              |              |
|                          |              |           |            |  RP-007  |              |              |
|                          |              |           |            |  RP-009  |              |              |
|                          |              |           |            |  RP-011  |              |              |
|                          |              |           |            |  RP-012  |              |              |
| Reactivación             |      -       |  RC-003   |  RC-005    |    -     |   RC-004     |  RC-001      |
|                          |              |           |            |          |              |  RC-002      |
|                          |              |           |            |          |              |  RC-006      |

## Apéndice B: Conteo total de plantillas

| Categoría                | Plantillas base | × 3 tonos | Total |
|--------------------------|:---------------:|:---------:|:-----:|
| Bienvenida y postventa   |        8        |     3     |  24   |
| Satisfacción y reseñas   |        6        |     3     |  18   |
| Garantía y revisiones    |       10        |     3     |  30   |
| Prevención D-60/D-30     |        8        |     3     |  24   |
| Recompra y renovación    |       12        |     3     |  36   |
| Reactivación             |        6        |     3     |  18   |
| **Total**                |      **50**     |  **3**    | **150**|

## Apéndice C: Notas de implementación

### Conversión a plantillas Meta

Para enviar estas plantillas por WhatsApp Business API, se debe:

1. Reemplazar `{variable}` por `{{N}}` (formato Meta).
2. Asignar categoría Meta: `UTILITY` para transaccionales
   (BW, WG, PS), `MARKETING` para comerciales (RP, RC, PV).
3. Enviar muestra con variables completas para aprobación de Meta.
4. Respetar el límite de 1024 caracteres por cuerpo de mensaje.

### Integración con Campañas v1

Las plantillas de este documento son **copy reutilizable**. En
Campañas v1, el usuario copia el texto y lo pega en
`Campaign.template`. Las variables se resuelven con
`renderTemplate()` al momento del envío.

### Integración con Secuencias de Seguimiento

Las plantillas se pueden usar como `FollowUpSequenceStage.template`.
El sistema genera un `Automation` por cada compra calificante con
el template resuelto.

### Integración futura con Módulo 10 Configuración

Cuando se implemente el módulo de configuración (HG-2/HG-7), las
150 plantillas de este documento se convierten en la semilla de la
entidad `Template`. Cada plantilla se almacena con:

- `id` (UUID)
- `name`
- `category` (CAMPAIGN | FOLLOW_UP | QUICK_REPLY)
- `tone` (PROFESSIONAL | CARIBE_COMMERCIAL | CARIBE_AUTHENTIC)
- `angle` (TRUST | PREVENTION | REPURCHASE | LOYALTY | CONVERSATION | CALM)
- `goal`
- `recommendedUse`
- `body` (texto con `{variable}`)
- `organizationId` (org-scoped)

### Configuración del estilo Caribe auténtico

El estilo Caribe auténtico se almacena como un campo de
configuración en la plantilla, no como un valor global. Marketing
selecciona conscientemente cuándo aplicarlo.

Campo de configuración:

```
tone: CARIBE_AUTHENTIC  // solo cuando marketing lo activa
```

Valor por defecto para todas las plantillas:

```
tone: PROFESSIONAL
```
