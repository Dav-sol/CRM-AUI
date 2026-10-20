-- Tarea 1 (transporte únicamente): persistir la respuesta a botones
-- interactivos de Meta (`interactive.button_reply`) en el mensaje entrante.
--
-- Las tres columnas son opcionales y solo se rellenan cuando el webhook trae
-- un `button_reply` reconocido. Ninguna decisión de negocio se deriva de
-- ellas en esta tarea: el lifecycle las interpretará después.
-- Aditiva, sin backfill: los mensajes existentes quedan en NULL.
ALTER TABLE "messages"
  ADD COLUMN "button_id" TEXT,
  ADD COLUMN "button_title" TEXT,
  ADD COLUMN "in_reply_to_provider_id" TEXT;
