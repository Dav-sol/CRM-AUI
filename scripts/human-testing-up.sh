#!/usr/bin/env bash
#
# Human testing / demo stack: infraestructura + API + frontend en un comando.
#
# Uso:
#   scripts/human-testing-up.sh up      [opciones]   (comando por defecto)
#   scripts/human-testing-up.sh status
#   scripts/human-testing-up.sh pause                # pausa envíos automáticos armados
#   scripts/human-testing-up.sh down     [--all]     # --all baja también postgres/redis
#   scripts/human-testing-up.sh logs     api|web
#
# Opciones de `up`:
#   --seed       Crea la organización demo + admin y siembra los datos de demo.
#                ADVERTENCIA: restablece los datos de esa organización.
#   --pancake    Enruta los envíos de WhatsApp por Pancake (real). Requiere --seed
#                la primera vez (necesita el id de la organización demo).
#   --sandbox    Simula los envíos de WhatsApp (sin coste, sin mensajes reales).
#   --live       NO pausa las automatizaciones armadas tras --seed (por defecto
#                se pausan: el scheduler las enviaría solas en <=60 s).
#   --lan        Imprime las URLs (frontend/API) con la IP de red local para
#                abrir el stack desde otro equipo. El frontend ya escucha en
#                0.0.0.0 en cualquier modo, así que esto solo cambia las URLs.
#   --dev        Arranca el API con pnpm (watch) en vez de Docker.
#   --rebuild    Reconstruye la imagen del API y el build del frontend.
#   --no-web     No arranca el frontend.
#
# Salidas: /tmp/human-testing/*.log y *.pid
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infrastructure/docker/docker-compose.yml"
DOCKER_ENV="$REPO_ROOT/infrastructure/docker/.env"        # interpolación de compose (gitignored)
ROUTING_ENV="$REPO_ROOT/infrastructure/docker/.env.extra" # env_file del API (gitignored)
API_ENV="$REPO_ROOT/apps/api/.env"                        # fuente de credenciales locales
WEB_DIR="$REPO_ROOT/apps/web"
RUN_DIR="${HUMAN_TESTING_RUN_DIR:-/tmp/human-testing}"
PNPM="corepack pnpm"
API_PORT=3002
WEB_PORT=3003
PG_CONTAINER="automatizeit-postgres"
DEMO_SLUG="baterias-del-caribe"
DEMO_EMAIL="admin@bateriasdelcaribe.com"
PANCAKE_KEYS=(
  PANCAKE_API_TOKEN PANCAKE_BOTCAKE_API_TOKEN PANCAKE_PAGE_ID
  PANCAKE_TEMPLATE_ID PANCAKE_API_BASE_URL PANCAKE_TEMPLATES_API_URL
  PANCAKE_SENDER_ID PANCAKE_TIMEOUT_MS PANCAKE_MIN_INTERVAL_MS
  PANCAKE_RETRY_ON_AMBIGUOUS PANCAKE_RESOLVE_CONVERSATION_ID
)

[[ -t 1 ]] && C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_RED=$'\e[31m' C_BOLD=$'\e[1m' C_OFF=$'\e[0m' || C_GREEN='' C_YELLOW='' C_RED='' C_BOLD='' C_OFF=''

log() { printf '%s\n' "$*"; }
ok() { printf '  %s✓%s %s\n' "$C_GREEN" "$C_OFF" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$C_YELLOW" "$C_OFF" "$*" >&2; }
die() { printf '  %s✗%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }
step() { printf '\n%s%s%s\n' "$C_BOLD" "$*" "$C_OFF"; }

# ---------------------------------------------------------------------------
# argumentos
# ---------------------------------------------------------------------------
CMD="up"
case "${1:-}" in
  up | down | status | pause | logs) CMD="$1" && shift ;;
esac

SEED=0 ROUTE="" LIVE=0 LAN=0 DEV=0 REBUILD=0 NOWEB=0 ALL=0 LOG_TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed) SEED=1 ;;
    --pancake) [[ -n "$ROUTE" && "$ROUTE" != "pancake" ]] && die "--pancake y --sandbox son excluyentes"; ROUTE="pancake" ;;
    --sandbox) [[ -n "$ROUTE" && "$ROUTE" != "sandbox" ]] && die "--pancake y --sandbox son excluyentes"; ROUTE="sandbox" ;;
    --live) LIVE=1 ;;
    --lan) LAN=1 ;;
    --dev) DEV=1 ;;
    --rebuild) REBUILD=1 ;;
    --no-web) NOWEB=1 ;;
    --all) ALL=1 ;;
    api | web) LOG_TARGET="$1" ;;
    -h | --help)
      awk 'NR > 1 && /^set -euo pipefail/{exit} NR > 1 {sub(/^# ?/, ""); print}' \
        "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "opción desconocida: $1 (usa --help)" ;;
  esac
  shift
done

DB_USER="automatizeit"
DB_NAME="automatizeit"
DEMO_PASSWORD=$(grep -oP "DEMO_PASSWORD = '\K[^']+" "$REPO_ROOT/apps/api/prisma/seed-demo.ts" 2>/dev/null || true)
LAN_IP=""
API_BASE="http://127.0.0.1:$API_PORT"
WEB_BASE="http://127.0.0.1:$WEB_PORT"

# ---------------------------------------------------------------------------
# utilidades
# ---------------------------------------------------------------------------
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

env_get() { # file key -> value (vacío si no existe)
  [[ -f "$1" ]] || return 0
  # `|| true` is required: pipefail + set -e would otherwise abort the script
  # every time an optional key is absent.
  grep -E "^$2=" "$1" | head -1 | cut -d= -f2- || true
}

upsert_env() { # file key value
  local file=$1 key=$2 value=$3
  if grep -q "^$key=" "$file" 2>/dev/null; then
    sed -i "s|^$key=.*|$key=$value|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

http_code() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "$1" 2>/dev/null || true)
  printf '%s' "${code:-000}"
}

wait_http() { # url timeout_s
  local url=$1 timeout=${2:-60} start code
  start=$(date +%s)
  while true; do
    code=$(http_code "$url")
    case "$code" in 200 | 301 | 302 | 307) return 0 ;; esac
    (( $(date +%s) - start >= timeout )) && return 1
    sleep 1
  done
}

port_busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

lan_address() {
  ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' ||
    hostname -I 2>/dev/null | awk '{print $1}' || true
}

psql_exec() {
  docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null
}

demo_org_id() { psql_exec "select id from organizations where slug='$DEMO_SLUG' and deleted_at is null limit 1"; }

count_due_automations() {
  psql_exec "select count(*) from automations a join organizations o on o.id=a.organization_id
             where o.slug='$DEMO_SLUG' and a.deleted_at is null
               and a.status in ('SCHEDULED','ERROR') and a.channel='WHATSAPP_CLIENTS'
               and a.scheduled_date <= now();" | tr -d '[:space:]'
}

stop_pid() { # pidfile
  local file=$1 pid
  [[ -f "$file" ]] || return 0
  pid=$(cat "$file" 2>/dev/null || true)
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

start_bg() { # name command
  local name=$1 command=$2 log_file="$RUN_DIR/$1.log" pid_file="$RUN_DIR/$1.pid"
  stop_pid "$pid_file"
  : >"$log_file"
  setsid bash -c "$command" >>"$log_file" 2>&1 &
  echo $! >"$pid_file"
}

alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null; }

# ---------------------------------------------------------------------------
# preflight y configuración
# ---------------------------------------------------------------------------
preflight() {
  command -v docker >/dev/null || die "docker no está instalado"
  docker info >/dev/null 2>&1 || die "el demonio de Docker no responde"
  docker compose version >/dev/null 2>&1 || die "falta el plugin docker compose"
  command -v curl >/dev/null || die "falta curl"
  [[ -f "$COMPOSE_FILE" ]] || die "no encuentro $COMPOSE_FILE"
}

ensure_docker_env() {
  # infrastructure/docker/.env es obligatorio para postgres/redis/api (los
  # `${VAR:?}` del compose fallan con mensaje legible si falta).
  if [[ -f "$DOCKER_ENV" ]]; then return 0; fi
  [[ -f "$API_ENV" ]] || die "faltan DOS cosas: infrastructure/docker/.env y apps/api/.env.
  1) cp apps/api/.env.example apps/api/.env   y completa los valores
  2) cp infrastructure/docker/.env.example infrastructure/docker/.env  y completa los valores"
  warn "no existe infrastructure/docker/.env: lo genero a partir de apps/api/.env"
  local db_url db_pass value
  db_url=$(env_get "$API_ENV" DATABASE_URL)
  db_pass=$(printf '%s' "$db_url" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
  [[ -n "$db_pass" && "$db_pass" != "$db_url" ]] || die "no pude leer la contraseña de DATABASE_URL en apps/api/.env"
  if [[ "$db_pass" == *%* ]]; then
    warn "la contraseña de DATABASE_URL contiene caracteres URL-encoded (%)"
  fi
  {
    printf '# Generado por scripts/human-testing-up.sh a partir de apps/api/.env.\n'
    printf '# GITIGNORED, no commitear. Ver infrastructure/docker/.env.example.\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$db_pass"
    printf 'CORS_ORIGIN=%s\n' "$WEB_BASE"
    for key in JWT_SECRET JWT_REFRESH_SECRET WHATSAPP_API_TOKEN WHATSAPP_PHONE_NUMBER_ID \
      WHATSAPP_WEBHOOK_VERIFY_TOKEN WHATSAPP_WEBHOOK_SECRET WHATSAPP_DEFAULT_ORGANIZATION_ID; do
      value=$(env_get "$API_ENV" "$key")
      [[ -n "$value" ]] || {
        rm -f "$DOCKER_ENV"
        die "apps/api/.env no define $key (sin ese valor el stack no arranca). Completa apps/api/.env"
      }
      printf '%s=%s\n' "$key" "$value"
    done
  } >"$DOCKER_ENV"
  chmod 600 "$DOCKER_ENV"
  ok "generado infrastructure/docker/.env (permisos 600)"
}

resolve_lan() {
  if [[ $LAN == 1 ]]; then
    LAN_IP=$(lan_address)
    [[ -n "$LAN_IP" ]] || die "no pude detectar la IP de red local"
    WEB_BASE="http://$LAN_IP:$WEB_PORT"
    API_BASE="http://$LAN_IP:$API_PORT"
    CORS_ORIGIN="$WEB_BASE"
  else
    CORS_ORIGIN="$WEB_BASE"
  fi
  # NEXT_PUBLIC_API_URL vacío: buildReportUrl() (apps/web/src/lib/api.ts) queda
  # con una ruta relativa /api/v1/reports/… y el rewrite de next.config.ts la
  # resuelve en el servidor. Así los reportes funcionan desde cualquier host
  # (localhost, LAN, Tailscale) sin depender de que CORS_ORIGIN sea UN origen.
  PUBLIC_API_URL=""
}

apply_cors() {
  if [[ $DEV == 1 ]]; then
    export CORS_ORIGIN
  else
    # compose lee CORS_ORIGIN solo de shell/.env, así que hay que fijarlo ahí.
    upsert_env "$DOCKER_ENV" CORS_ORIGIN "$CORS_ORIGIN"
  fi
}

# --- ruta de envío (Pancake / sandbox / Meta directo) -----------------------
# The routing file is rewritten from scratch whenever a routing flag is given
# (so pancake and sandbox can never accumulate), and left untouched otherwise.
# Never write an empty value: Joi rejects "" for optional string keys.
write_routing() {
  local org_id tmp="$ROUTING_ENV.tmp.$$"
  mkdir -p "$(dirname "$ROUTING_ENV")"

  # Demo over plain http: a Secure refresh cookie is rejected by several
  # browsers outside localhost (and always outside it in --lan), which would
  # kill the session after ACCESS_TOKEN_TTL. Applies to this script only.
  ensure_cookie_flag() {
    [[ -f "$ROUTING_ENV" ]] || printf '# Generado por scripts/human-testing-up.sh (gitignored, 600).\n' >"$ROUTING_ENV"
    upsert_env "$ROUTING_ENV" COOKIE_SECURE false
    chmod 600 "$ROUTING_ENV"
  }

  if [[ -z "$ROUTE" ]]; then
    # Sin flags: conservo la ruta existente y solo garantizo el cookie de la demo.
    ensure_cookie_flag
    return 0
  fi

  org_id=$(demo_org_id) || org_id=""
  [[ -n "$org_id" ]] || die "no existe la organización demo: ejecuta primero 'up --seed'"

  {
    printf '# Generado por scripts/human-testing-up.sh (gitignored, 600).\n'
    printf '# Solo llega al API por env_file de docker-compose.yml.\n'
    printf 'COOKIE_SECURE=false\n'
  } >"$tmp"

  if [[ "$ROUTE" == "pancake" ]]; then
    [[ -f "$API_ENV" ]] || die "falta apps/api/.env (origen de los tokens Pancake)"
    local key value
    for key in "${PANCAKE_KEYS[@]}"; do
      value=$(env_get "$API_ENV" "$key")
      if [[ -n "$value" ]]; then
        printf '%s=%s\n' "$key" "$value" >>"$tmp"
      fi
    done
    [[ -n "$(env_get "$API_ENV" PANCAKE_API_TOKEN)" ]] ||
      die "PANCAKE_API_TOKEN no está en apps/api/.env"
    printf 'PANCAKE_ORGANIZATION_ID=%s\n' "$org_id" >>"$tmp"
  else
    printf 'WHATSAPP_SANDBOX_ORGANIZATION_IDS=%s\n' "$org_id" >>"$tmp"
  fi

  mv "$tmp" "$ROUTING_ENV"
  chmod 600 "$ROUTING_ENV"
}

current_route() {
  if [[ ! -f "$ROUTING_ENV" ]]; then echo "meta"; return; fi
  if grep -q '^PANCAKE_ORGANIZATION_ID=.' "$ROUTING_ENV" 2>/dev/null; then echo "pancake"
  elif grep -q '^WHATSAPP_SANDBOX_ORGANIZATION_IDS=.' "$ROUTING_ENV" 2>/dev/null; then echo "sandbox"
  else echo "meta"; fi
}

route_label() {
  case "$1" in
    pancake) echo "Pancake (API real, org demo) — wallet ${C_YELLOW}waba_1999667${C_OFF}" ;;
    sandbox) echo "SIMULADO (sandbox: no envía mensajes reales)" ;;
    *) echo "Meta directo (WHATSAPP_API_TOKEN)" ;;
  esac
}

# --- infraestructura -------------------------------------------------------
infra_up() {
  step "Infraestructura (postgres + redis)"
  if [[ ! -f "$DOCKER_ENV" ]]; then ensure_docker_env; fi
  compose up -d postgres redis >/dev/null
  local tries=0
  until [[ "$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null)" == "healthy" ]]; do
    tries=$((tries + 1))
    [[ $tries -ge 30 ]] && die "postgres no quedó healthy (mira: docker logs $PG_CONTAINER)"
    sleep 2
  done
  ok "postgres healthy (127.0.0.1:5433) · redis healthy (127.0.0.1:6380)"
}

ensure_migrated() {
  if [[ $DEV == 1 ]]; then
    (cd "$REPO_ROOT" && $PNPM --filter api exec prisma migrate deploy) >/dev/null ||
      die "prisma migrate deploy falló"
  else
    compose run --rm migrate >/dev/null || die "prisma migrate deploy falló (contenedor migrate)"
  fi
  ok "migraciones aplicadas (32 esperadas)"
}

seed_demo() {
  step "Datos de demo"
  [[ -f "$API_ENV" ]] || die "falta apps/api/.env (lo necesita prisma/tsx). cp apps/api/.env.example apps/api/.env"
  ensure_migrated
  (cd "$REPO_ROOT" && $PNPM --filter api exec tsx prisma/seed-demo-org.ts) ||
    die "falló seed-demo-org.ts"
  # El catálogo es requisito: seed-demo.ts selecciona los productos por
  # warrantyMonths y si el bucket sale vacío la compra se crea sin producto.
  (cd "$REPO_ROOT" && $PNPM --filter api exec tsx prisma/seed-products.ts) ||
    die "falló seed-products.ts"
  (cd "$REPO_ROOT" && $PNPM --filter api exec tsx prisma/seed-demo.ts) ||
    die "falló seed-demo.ts"
  if [[ $LIVE == 0 ]]; then
    pause_automations " (tras --seed)"
  else
    warn "--live: dejo armadas las automatizaciones del seed (disparo automático)"
  fi
}

pause_automations() {
  local org_id count
  org_id=$(demo_org_id || true)
  [[ -n "$org_id" ]] || die "no existe la organización demo (ejecuta 'up --seed')"
  count=$(psql_exec "update automations set status='PAUSED', updated_at=now()
                     where organization_id='$org_id' and status in ('SCHEDULED','ERROR')
                     and deleted_at is null returning 1;" | grep -c 1 || true)
  count=${count:-0}
  if [[ "$count" -gt 0 ]]; then ok "pausadas $count automatización(es)$1"
  else ok "ninguna automatización armada para pausar$1"; fi
}

# --- API -------------------------------------------------------------------
api_image() { docker image inspect "docker-api:latest" >/dev/null 2>&1; }

api_up_docker() {
  step "API (Docker, arranque de producción)"
  ensure_docker_env
  apply_cors
  if ! api_image || [[ $REBUILD == 1 ]]; then
    log "   construyendo imagen del API (la primera vez tarda varios minutos)…"
    compose build api >"$RUN_DIR/api-build.log" 2>&1 || {
      tail -30 "$RUN_DIR/api-build.log" >&2
      die "falló el build de la imagen del API (log completo en $RUN_DIR/api-build.log)"
    }
  fi
  compose up -d api >/dev/null || die "docker compose up api falló"
  log "   esperando healthy en $API_BASE/api/v1/health …"
  wait_http "$API_BASE/api/v1/health" 120 || {
    docker logs --tail 40 automatizeit-api >&2 || true
    die "el API no respondió en 120 s (últimas líneas de log arriba)"
  }
  verify_container_env
  ok "API en marcha (contenedor automatizeit-api, migrate ejecutado antes)"
}

# env_file is resolved by compose at `up` time: prove the routing actually made
# it into the container instead of assuming it.
verify_container_env() {
  [[ -f "$ROUTING_ENV" ]] || return 0
  local key value in_container environ
  environ=$(docker exec automatizeit-api sh -c 'tr "\0" "\n" < /proc/1/environ' 2>/dev/null || true)
  [[ -n "$environ" ]] || die "no pude leer el entorno del contenedor automatizeit-api"
  while IFS='=' read -r key value; do
    case "$key" in
      PANCAKE_ORGANIZATION_ID | WHATSAPP_SANDBOX_ORGANIZATION_IDS) ;;
      *) continue ;;
    esac
    [[ -n "$value" ]] || continue
    in_container=$(printf '%s\n' "$environ" | grep -c "^$key=" || true)
    [[ "${in_container:-0}" -ge 1 ]] ||
      die "$key no llegó al contenedor (¿el compose no recreó el API?). Prueba: $0 down && $0 up"
    ok "$key presente en el contenedor"
  done <"$ROUTING_ENV"
}

api_up_dev() {
  step "API (pnpm start:dev)"
  ensure_docker_env
  apply_cors
  ensure_migrated
  if alive "$RUN_DIR/api.pid"; then
    stop_pid "$RUN_DIR/api.pid"
    log "   API de una sesión anterior detenido"
  fi
  if port_busy "$API_PORT"; then
    ss -ltnp 2>/dev/null | grep ":$API_PORT " | sed 's/^/   /' >&2 || true
    die "el puerto $API_PORT ya está en uso por otro proceso"
  fi
  start_bg api "cd '$REPO_ROOT' && set -a && [ -f '$ROUTING_ENV' ] && . '$ROUTING_ENV'; set +a && export CORS_ORIGIN='$CORS_ORIGIN' && exec $PNPM --filter api start:dev"
  log "   esperando healthy en $API_BASE/api/v1/health …"
  if ! wait_http "$API_BASE/api/v1/health" 120; then
    tail -30 "$RUN_DIR/api.log" >&2 || true
    die "el API no respondió en 120 s (últimas líneas en $RUN_DIR/api.log)"
  fi
  ok "API en marcha (dev, log en $RUN_DIR/api.log)"
}

# --- frontend --------------------------------------------------------------
web_build_needed() {
  [[ ! -f "$WEB_DIR/.next/BUILD_ID" ]] && return 0
  [[ $REBUILD == 1 ]] && return 0
  local built
  built=$(cat "$RUN_DIR/web-build-public-url" 2>/dev/null || echo "__sin-build-del-script__")
  [[ "$built" != "$PUBLIC_API_URL" ]]
}

web_up() {
  step "Frontend (Next.js en el puerto $WEB_PORT)"
  # Idempotencia: si el frontend es nuestro, se reinicia; si es de otro
  # proceso, se avisa con el propietario en vez de pisarlo.
  if alive "$RUN_DIR/web.pid"; then
    stop_pid "$RUN_DIR/web.pid"
    log "   frontend de una sesión anterior detenido"
  fi
  if port_busy "$WEB_PORT"; then
    ss -ltnp 2>/dev/null | grep ":$WEB_PORT " | sed 's/^/   /' >&2 || true
    die "el puerto $WEB_PORT ya está en uso por otro proceso"
  fi
  if web_build_needed; then
    log "   next build (NEXT_PUBLIC_API_URL vacío → reportes vía proxy de Next)…"
    (cd "$REPO_ROOT" && NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" $PNPM --filter web build) \
      >"$RUN_DIR/web-build.log" 2>&1 || {
      tail -30 "$RUN_DIR/web-build.log" >&2
      die "falló next build (log completo en $RUN_DIR/web-build.log)"
    }
    echo "$PUBLIC_API_URL" >"$RUN_DIR/web-build-public-url"
    ok "build del frontend completado"
  else
    ok "build del frontend reutilizado (usa --rebuild para forzar)"
  fi
  # 0.0.0.0 es el propio default de `next start`: el frontend tiene que abrirse
  # desde localhost, la LAN y Tailscale sin cambiar de build. No abre puertos en
  # el firewall (postgres/redis siguen en loopback, el API ya publica 3002).
  start_bg web "cd '$REPO_ROOT' && exec $PNPM --filter web exec next start -p $WEB_PORT -H 0.0.0.0"
  log "   esperando $WEB_BASE/ …"
  wait_http "$WEB_BASE/" 90 || {
    tail -30 "$RUN_DIR/web.log" >&2 || true
    die "el frontend no respondió en 90 s (log en $RUN_DIR/web.log)"
  }
  ok "frontend en marcha ($WEB_BASE)"
}

# --- verificaciones --------------------------------------------------------
verify() {
  step "Verificación"
  local code proxy_code
  code=$(http_code "$API_BASE/api/v1/health")
  [[ "$code" == "200" ]] || die "health del API directo → HTTP $code"
  ok "health API directo → 200"

  proxy_code=$(http_code "$WEB_BASE/api/v1/health")
  [[ "$proxy_code" == "200" ]] || die "health vía proxy de Next → HTTP $proxy_code (¿CORS_ORIGIN=$CORS_ORIGIN?)"
  ok "health vía proxy del frontend → 200"

  if [[ -n "$(demo_org_id)" ]]; then
    local code_login
    [[ -n "$DEMO_PASSWORD" ]] ||
      die "no pude leer DEMO_PASSWORD de apps/api/prisma/seed-demo.ts"
    code_login=$(curl -s -o "$RUN_DIR/login.json" -w '%{http_code}' --max-time 10 \
      -X POST "$WEB_BASE/api/v1/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")
    if [[ "$code_login" == "200" || "$code_login" == "201" ]]; then
      ok "login de demo ($DEMO_EMAIL) → HTTP $code_login"
    else
      warn "login de demo → HTTP $code_login (revisa $RUN_DIR/login.json y $RUN_DIR/api.log)"
    fi
  fi
}

# --- resumen ---------------------------------------------------------------
summary() {
  local route due
  route=$(current_route)
  due=$(count_due_automations 2>/dev/null || true)
  due=${due:-?}
  printf '\n%s%sLISTO PARA HUMAN TESTING%s\n' "$C_BOLD" "$C_GREEN" "$C_OFF"
  printf '  Frontend   %s\n' "$WEB_BASE"
  printf '  API        %s/api/v1   (health: %s/api/v1/health)\n' "$API_BASE" "$API_BASE"
  if [[ -n "$(demo_org_id 2>/dev/null || true)" ]]; then
    printf '  Login      %s / %s\n' "$DEMO_EMAIL" "$DEMO_PASSWORD"
    printf '  Organiza.  %s\n' "$DEMO_SLUG"
  fi
  printf '  API mode   %s\n' "$([[ $DEV == 1 ]] && echo 'pnpm start:dev (watch)' || echo 'Docker (producción)')"
  printf '  Envíos     %b\n' "$(route_label "$route")"
  printf '  CORS       %s\n' "$CORS_ORIGIN"
  if [[ -f "$ROUTING_ENV" ]] && grep -q '^COOKIE_SECURE=false' "$ROUTING_ENV"; then
    printf '  Sesión     COOKIE_SECURE=false (demo por http)\n'
  fi
  printf '  Logs       %s/*.log\n' "$RUN_DIR"

  if [[ "$route" == "pancake" ]]; then
    printf '\n  %sRuta Pancake ACTIVA:%s los envíos reales usan el wallet waba_1999667.\n' "$C_YELLOW" "$C_OFF"
    printf '  Con el wallet vacío el envío falla con "Wallet not enough money" (esperado\n'
    printf '  hasta que tu cliente lo recargue); después del recargo, reenvía y valida success:true.\n'
  fi
  if [[ "$due" != "0" && "$due" != "?" ]]; then
    printf '\n  %s⚠ %s automatización(es) ARMADAS%s con fecha pasada: el scheduler (60 s)\n' "$C_YELLOW" "$due" "$C_OFF"
    printf '  las enviará solas (<=60 s) por la ruta activa. Para evitarlo: scripts/human-testing-up.sh pause\n'
  fi
  if [[ $LAN == 1 ]]; then
    printf '\n  %sModo LAN:%s abre %s desde el otro equipo.\n' "$C_YELLOW" "$C_OFF" "$WEB_BASE"
    printf '  Si no abre, revisa el firewall: sudo ufw status\n'
  fi
  printf '\n  Comandos: status · pause · logs api|web · down [--all]\n'
}

# ---------------------------------------------------------------------------
# comandos
# ---------------------------------------------------------------------------
cmd_up() {
  preflight
  mkdir -p "$RUN_DIR" && chmod 700 "$RUN_DIR"
  resolve_lan
  log "${C_BOLD}Human testing stack${C_OFF}  (repo: $REPO_ROOT)"

  infra_up

  if [[ $SEED == 1 ]]; then seed_demo; fi

  step "Ruta de envío"
  write_routing
  local route; route=$(current_route)
  ok "ruta: $(route_label "$route")"

  step "Migraciones"
  if [[ $SEED == 0 ]]; then
    # sin --seed las migraciones las aplica el propio arranque del API
    ok "las aplica el servicio migrate al arrancar el API"
  else
    ok "ya aplicadas en el paso de datos de demo"
  fi

  if [[ $DEV == 1 ]]; then api_up_dev; else api_up_docker; fi

  if [[ $NOWEB == 1 ]]; then
    step "Frontend omitido (--no-web)"
  else
    web_up
    verify
  fi

  summary
}

cmd_down() {
  preflight
  log "Deteniendo…"
  if alive "$RUN_DIR/web.pid" || [[ -f "$RUN_DIR/web.pid" ]]; then
    stop_pid "$RUN_DIR/web.pid"; ok "frontend detenido"
  fi
  if alive "$RUN_DIR/api.pid" || [[ -f "$RUN_DIR/api.pid" ]]; then
    stop_pid "$RUN_DIR/api.pid"; ok "API (dev) detenido"
  fi
  compose stop api >/dev/null 2>&1 && ok "contenedor automatizeit-api detenido" || true
  if [[ $ALL == 1 ]]; then
    compose stop postgres redis >/dev/null 2>&1 && ok "postgres y redis detenidos (volúmenes intactos)" || true
  else
    ok "postgres y redis se mantienen (usa --all para bajarlos)"
  fi
  log "Datos conservados. Vuelve con: scripts/human-testing-up.sh up"
}

cmd_status() {
  preflight
  printf '%sEstado del stack%s\n\n' "$C_BOLD" "$C_OFF"
  docker ps --filter "name=automatizeit" --format '  {{.Names}}  {{.Status}}' || true

  local code
  code=$(http_code "$API_BASE/api/v1/health")
  printf '  API (directo)        %s\n' "$([[ "$code" == 200 ]] && echo "OK ($code)" || echo "NO RESPONDE ($code)")"
  code=$(http_code "$WEB_BASE/api/v1/health")
  printf '  API (vía frontend)   %s\n' "$([[ "$code" == 200 ]] && echo "OK ($code)" || echo "NO RESPONDE ($code)")"
  code=$(http_code "$WEB_BASE/")
  printf '  Frontend             %s\n' "$([[ "$code" =~ ^(200|30[1278])$ ]] && echo "OK ($code)" || echo "NO RESPONDE ($code)")"
  printf '  API mode             %s\n' "$(alive "$RUN_DIR/api.pid" && echo 'pnpm dev (pid activo)' || echo 'Docker')"
  printf '  Ruta de envíos       %s\n' "$(route_label "$(current_route)")"
  local due; due=$(count_due_automations 2>/dev/null || true); due=${due:-?}
  printf '  Automatiz. armadas   %s\n' "$due"
}

cmd_logs() {
  local target=${LOG_TARGET:-}
  [[ -n "$target" ]] || die "indica qué log: scripts/human-testing-up.sh logs api|web"
  local file="$RUN_DIR/$target.log"
  [[ -f "$file" ]] || die "no existe $file"
  if [[ "$target" == "api" && ! -f "$RUN_DIR/api.pid" ]]; then
    docker logs -f --tail 100 automatizeit-api
  else
    tail -f "$file"
  fi
}

case "$CMD" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  pause) preflight; pause_automations "" ;;
esac
