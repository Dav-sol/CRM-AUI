#!/usr/bin/env bash
# Arranca el frontend en modo desarrollo para DaveCloud.
#
# Uso: scripts/web-dev.sh [puerto]
#
# Se ejecuta desligado de la terminal (setsid) para que sobreviva al cierre
# de la sesión. Los orígenes de desarrollo se declaran aquí porque Next.js
# bloquea por defecto los recursos de `/_next` cuando la petición llega desde
# un origen que no reconoce; sin esto, abrir la app por la IP de Tailscale
# devuelve 403 en el CSS y el JS y la página sale en blanco.

set -euo pipefail

PORT="${1:-3003}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/automatizeit-web-dev"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/web-$PORT.log"

# Orígenes permitidos en desarrollo: loopback y la IP de Tailscale del host.
ALLOWED="localhost,127.0.0.1,$(hostname -I 2>/dev/null | awk '{print $1}')"
# El valor de Next espera el host; se añaden también las formas con esquema.
export NEXT_ALLOWED_DEV_ORIGINS="$ALLOWED"

echo "==> puerto:    $PORT"
echo "==> orígenes: $NEXT_ALLOWED_DEV_ORIGINS"
echo "==> log:      $LOG"

cd "$ROOT"
# WEB_DEV_LOG=stdout envía la salida a stdout en lugar de al archivo, para que
# systemd la capture en el journal. El valor por defecto (file) no cambia: el
# uso manual sigue escribiendo en $LOG.
if [ "${WEB_DEV_LOG:-file}" = "stdout" ]; then
  exec corepack pnpm --filter web exec next dev -p "$PORT" -H 0.0.0.0
fi
exec corepack pnpm --filter web exec next dev -p "$PORT" -H 0.0.0.0 >"$LOG" 2>&1