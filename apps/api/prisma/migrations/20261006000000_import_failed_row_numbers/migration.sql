-- Alcance completo del retry, separado de la muestra para UI.
--
-- `errors.rows` está capado a ERROR_SAMPLE_LIMIT (100) para no inflar el JSON
-- que consume la interfaz. El retry de un job PARTIAL reprocesaba solo esas
-- filas guardadas, de modo que un import con más de 100 errores perdía en
-- silencio todas las filas fallidas a partir de la 101.
--
-- Este campo guarda TODOS los números de fila fallidos (validación y
-- persistencia) y es la única fuente de verdad del alcance del retry.
-- Aditiva, con default vacío: los jobs anteriores quedan con [] y el retry
-- los rechaza de forma explícita en vez de reprocesar una muestra parcial.
ALTER TABLE "imports"
  ADD COLUMN "failed_row_numbers" INTEGER[] NOT NULL DEFAULT '{}';
