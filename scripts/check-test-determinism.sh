#!/usr/bin/env bash
# Verifica que la suite de la API NO depende del día en que se ejecuta ni de
# la zona horaria del proceso.
#
# Por qué existe: un fixture con una fecha absoluta (por ejemplo
# `holidays: ['2026-10-05']`) solo coincide mientras la semana de la prueba
# contenga esa fecha. El fallo lo produce el reloj, no el test, así que no se
# detecta en la revisión del diff ni en una ejecución normal.
#
# La comprobación ejecuta la suite con el reloj desplazado varios años y con
# zonas horarias distintas (incluidas dos con horario de verano, que es donde
# la aritmética en hora local se desvía). Si algún resultado cambia, el
# defecto está en las pruebas.
#
# Uso:  scripts/check-test-determinism.sh
# Salida: 0 si la suite es determinista, 1 en caso contrario.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
SETUP="$API_DIR/test/shifted-clock.setup.cjs"

# Desplazamientos en días: pasado, presente y futuro, con saltos que cruzan
# años bisiestos y cambios de horario de verano.
SHIFTS=(0 45 200 400 800 -60 -400 1000)
# Zonas horarias: UTC, la zona de negocio (America/Bogota) y dos con DST.
ZONES=(UTC America/Bogota Europe/Madrid Australia/Lord_Howe)

if [[ ! -f "$SETUP" ]]; then
  echo "FALLO: no se encuentra el setup de reloj desplazado: $SETUP" >&2
  exit 1
fi

cd "$API_DIR" || exit 1

fail=0

run_case() {
  local label="$1" shift="$2" tz="$3"
  local output
  output="$(TZ="$tz" SHIFT_DAYS="$shift" npx jest --setupFilesAfterEnv="$SETUP" 2>&1)"
  local summary
  summary="$(printf '%s\n' "$output" | grep -E '^Tests:' || true)"
  if [[ -z "$summary" ]]; then
    echo "  ✗ $label -> la suite no terminó correctamente"
    printf '%s\n' "$output" | tail -30
    fail=1
    return
  fi
  if printf '%s\n' "$summary" | grep -qE '[0-9]+ failed'; then
    echo "  ✗ $label -> $summary"
    printf '%s\n' "$output" | grep -E '●' | sort -u | head -10
    fail=1
  else
    echo "  ✓ $label -> $summary"
  fi
}

echo "== Determinismo temporal de la suite de la API =="
for shift in "${SHIFTS[@]}"; do
  run_case "reloj desplazado ${shift}d (TZ=UTC)" "$shift" "UTC"
done
for zone in "${ZONES[@]}"; do
  run_case "zona horaria ${zone}" "0" "$zone"
done

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "FALLO: la suite depende de la fecha o de la zona horaria del proceso."
  exit 1
fi

echo
echo "OK: la suite de la API es independiente de la fecha y de la zona horaria."
exit 0
