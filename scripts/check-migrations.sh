#!/bin/sh
# Guarda de migraciones: verifica, ANTES de aplicar nada, que las migraciones
# que se van a aplicar están revisadas y que el repositorio y la base de datos
# describen el mismo esquema.
#
# Por qué existe: `prisma migrate deploy` aplica TODO lo que encuentra en el
# directorio de migraciones, sin preguntar. `.dockerignore` no excluye
# `apps/api/prisma/migrations/`, de modo que una carpeta de migración sin
# versionar —o modificada— llegaba al contenedor de producción y se aplicaba
# sola en el siguiente `docker compose up`, sin revisión, sin versionado y
# sin vuelta atrás.
#
# La guarda NO resuelve la deriva: la detecta y falla. Tampoco da por buena
# una migración solo por estar en el disco: hace falta que figure en el
# manifiesto `MIGRATIONS.sha256` con su sha256 exacto.
#
# Comprobaciones:
#   A. Manifesto: toda migración en disco figura en el manifiesto con el
#      sha256 exacto de su `migration.sql` (y al revés: todo lo aprobado
#      existe).
#   B. Git (solo en el host): el manifiesto y las carpetas de migración están
#      versionados, y su contenido no tiene cambios sin commitear.
#   C. Base de datos (solo lectura): ninguna migración aplicada tiene un
#      checksum distinto al del archivo, y ninguna aplicada falta en disco.
#
# ESCRITO EN POSIX sh A PROPÓSITO: la imagen de producción (`node:24-slim`)
# usa `dash` como `/bin/sh`, y el compose invoca este script con `sh`.
#
# Uso:
#   scripts/check-migrations.sh                 # A + B + C
#   scripts/check-migrations.sh --no-database   # A + B (no toca la BD)
#   scripts/check-migrations.sh --allow-pending # no falla por migraciones pendientes
#   scripts/check-migrations.sh --manifest-only # solo A (sin git ni BD)
#
# Salida: 0 si todo está conforme, 1 si hay deriva o migraciones no aprobadas.
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
# La imagen de producción monta este script fuera del arbol del repositorio
# (el contexto de build solo copia `apps/api`), asi que la ruta de la API se
# puede fijar con `API_DIR` (por defecto, sibling de `scripts/`).
API_DIR=${API_DIR:-"$ROOT/apps/api"}
MIGRATIONS_DIR="$API_DIR/prisma/migrations"
MANIFEST="$MIGRATIONS_DIR/MIGRATIONS.sha256"

check_database=1
allow_pending=0
manifest_only=0
for arg in "$@"; do
  case "$arg" in
    --no-database) check_database=0 ;;
    --allow-pending) allow_pending=1 ;;
    --manifest-only) manifest_only=1; check_database=0 ;;
    -h|--help) sed -n '2,35p' "$0"; exit 0 ;;
    *) echo "opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

status=0
note() { echo "  $1"; }

# ---------------------------------------------------------------------------
# A. Manifiesto de migraciones aprobadas
# ---------------------------------------------------------------------------
echo "== A. Manifiesto de migraciones aprobadas =="
if [ ! -f "$MANIFEST" ]; then
  echo "FALLO: no existe el manifiesto $MANIFEST" >&2
  exit 1
fi

# Entradas del manifiesto: "<ruta relativa>" (una por linea, en un fichero
# temporal, para no depender de tuberias con subshell).
approved_list=$(mktemp)
on_disk_list=$(mktemp)
trap 'rm -f "$approved_list" "$on_disk_list"' EXIT INT TERM

grep -vE '^[[:space:]]*(#|$)' "$MANIFEST" | awk '{print $2}' | sed 's|/migration\.sql$||' | sort > "$approved_list"
find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -name migration.sql -printf '%h\n' \
  | sed "s|^$MIGRATIONS_DIR/||" | sort > "$on_disk_list"

approved_count=$(wc -l < "$approved_list" | tr -d ' ')
on_disk_count=$(wc -l < "$on_disk_list" | tr -d ' ')

while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  if ! grep -qxF "$dir" "$approved_list"; then
    echo "FALLO: migración en disco NO aprobada (no figura en MIGRATIONS.sha256): $dir" >&2
    echo "        'prisma migrate deploy' la aplicaría igualmente. Revísala," >&2
    echo "        versiona la carpeta completa en Git y añade su sha256 al manifiesto." >&2
    status=1
  fi
done < "$on_disk_list"

while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  if [ ! -d "$MIGRATIONS_DIR/$dir" ]; then
    echo "FALLO: migración aprobada pero ausente del disco: $dir" >&2
    status=1
  fi
done < "$approved_list"

# sha256 exacto de cada archivo aprobado.
while read -r sum rel; do
  case "$sum" in ''|\#*) continue ;; esac
  file="$MIGRATIONS_DIR/$rel"
  [ -f "$file" ] || continue
  actual=$(sha256sum "$file" | cut -d' ' -f1)
  if [ "$actual" != "$sum" ]; then
    echo "FALLO: migración aprobada con contenido distinto al del manifiesto: $rel" >&2
    echo "        manifiesto=$sum" >&2
    echo "        archivo   =$actual" >&2
    status=1
  fi
done < "$MANIFEST"

if [ "$status" -eq 0 ]; then
  note "OK: $on_disk_count migración(es) en disco, todas aprobadas y con el sha256 esperado."
else
  note "Hay migraciones no aprobadas o con contenido distinto del aprobado."
fi

# ---------------------------------------------------------------------------
# B. Git (solo en el host; la imagen de producción no lleva git)
# ---------------------------------------------------------------------------
if [ "$manifest_only" -eq 0 ]; then
  echo
  echo "== B. Versionado en Git =="
  if ! command -v git >/dev/null 2>&1; then
    note "git no disponible: se omite la comprobación de versionado."
  elif ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    note "no es un repositorio Git: se omite la comprobación de versionado."
  else
    if ! git -C "$ROOT" ls-files --error-unmatch "$MIGRATIONS_DIR/MIGRATIONS.sha256" >/dev/null 2>&1; then
      echo "FALLO: el manifiesto MIGRATIONS.sha256 no está versionado en Git." >&2
      status=1
    fi
    untracked=$(git -C "$ROOT" ls-files --others --exclude-standard -- "$MIGRATIONS_DIR" | grep -E '/migration\.sql$' || true)
    if [ -n "$untracked" ]; then
      echo "FALLO: hay migraciones sin versionar en Git:" >&2
      printf '        %s\n' $untracked >&2
      status=1
    fi
    modified=$(git -C "$ROOT" diff --name-only -- "$MIGRATIONS_DIR" | grep -E '/migration\.sql$' || true)
    if [ -n "$modified" ]; then
      echo "FALLO: hay migraciones versionadas con cambios sin commitear:" >&2
      printf '        %s\n' $modified >&2
      status=1
    fi
    if [ "$status" -eq 0 ]; then
      note "OK: el manifiesto y todas las migraciones están versionados y sin cambios pendientes."
    else
      note "Hay migraciones sin versionar, sin commitear o sin manifiesto versionado."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# C. Deriva con la base de datos (solo lectura)
# ---------------------------------------------------------------------------
if [ "$check_database" -eq 1 ]; then
  echo
  echo "== C. Deriva con la base de datos (solo lectura) =="
  if [ "$allow_pending" -eq 1 ]; then
    (cd "$API_DIR" && node prisma/check-migration-drift.mjs --allow-pending)
  else
    (cd "$API_DIR" && node prisma/check-migration-drift.mjs)
  fi
  if [ $? -ne 0 ]; then
    status=1
  else
    note "OK: sin deriva entre el repositorio y la base de datos."
  fi
fi

echo
if [ "$status" -ne 0 ]; then
  echo "FALLO: la guarda de migraciones no se cumple. NO se aplica ninguna migración."
  exit 1
fi
echo "OK: la guarda de migraciones se cumple."
exit 0
