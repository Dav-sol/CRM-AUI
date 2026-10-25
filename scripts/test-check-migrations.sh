#!/usr/bin/env bash
# Pruebas de la guarda de migraciones con casos SINTETICOS.
#
# Todo ocurre en un repositorio temporal aislado: no se toca el repositorio de
# trabajo ni se accede a la base de datos. La guarda se ejecuta con
# --manifest-only (sin git y sin BD) y después con git, sobre un repositorio
# desechable.
#
# Uso: scripts/test-check-migrations.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/scripts/check-migrations.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  ✓ $label"
    pass=$((pass + 1))
  else
    echo "  ✗ $label (esperado: $expected, obtenido: $actual)"
    fail=$((fail + 1))
  fi
}

# Construye un repositorio temporal con dos migraciones aprobadas.
make_repo() {
  local dir="$1"
  mkdir -p "$dir/apps/api/prisma/migrations/20260101000000_uno" \
           "$dir/apps/api/prisma/migrations/20260102000000_dos" \
           "$dir/scripts"
  printf 'SELECT 1;\n' > "$dir/apps/api/prisma/migrations/20260101000000_uno/migration.sql"
  printf 'SELECT 2;\n' > "$dir/apps/api/prisma/migrations/20260102000000_dos/migration.sql"
  cp "$GUARD" "$dir/scripts/check-migrations.sh"
  {
    echo "# manifiesto de prueba"
    ( cd "$dir/apps/api/prisma/migrations" && sha256sum 20260101000000_uno/migration.sql 20260102000000_dos/migration.sql )
  } > "$dir/apps/api/prisma/migrations/MIGRATIONS.sha256"
  ( cd "$dir" && git init -q . && git config user.email t@t && git config user.name t \
    && git add -A && git commit -qm init )
}

echo "== Guarda de migraciones: casos sintéticos (repo temporal, sin BD) =="

# 1. Todo conforme: el manifiesto esta versionado y las migraciones tambien.
R="$TMP/ok"; make_repo "$R"
out="$(cd "$R" && ./scripts/check-migrations.sh --manifest-only 2>&1)"; rc=$?
check "repo conforme: sale con 0" "0" "$rc"
check "repo conforme: menciona OK" "yes" "$(grep -qc 'OK:' <<<"$out" >/dev/null && echo yes || echo no)"

# 2. Migracion en disco que NO esta en el manifiesto.
R="$TMP/unapproved"; make_repo "$R"
mkdir -p "$R/apps/api/prisma/migrations/20260103000000_tres"
printf 'SELECT 3;\n' > "$R/apps/api/prisma/migrations/20260103000000_tres/migration.sql"
out="$(cd "$R" && ./scripts/check-migrations.sh --manifest-only 2>&1)"; rc=$?
check "migracion no aprobada: sale con 1" "1" "$rc"
check "migracion no aprobada: la nombra" "yes" "$(grep -q '20260103000000_tres' <<<"$out" && echo yes || echo no)"

# 3. Migracion aprobada cuyo contenido cambio.
R="$TMP/modified"; make_repo "$R"
printf 'SELECT 999; -- cambiado\n' > "$R/apps/api/prisma/migrations/20260102000000_dos/migration.sql"
out="$(cd "$R" && ./scripts/check-migrations.sh --manifest-only 2>&1)"; rc=$?
check "migracion modificada: sale con 1" "1" "$rc"
check "migracion modificada: la nombra" "yes" "$(grep -q '20260102000000_dos' <<<"$out" && echo yes || echo no)"

# 4. Migracion aprobada que desaparece del disco.
R="$TMP/missing"; make_repo "$R"
rm -rf "$R/apps/api/prisma/migrations/20260102000000_dos"
out="$(cd "$R" && ./scripts/check-migrations.sh --manifest-only 2>&1)"; rc=$?
check "migracion ausente: sale con 1" "1" "$rc"
check "migracion ausente: la nombra" "yes" "$(grep -q '20260102000000_dos' <<<"$out" && echo yes || echo no)"

# 5. Sin manifiesto.
R="$TMP/nomanifest"; make_repo "$R"
rm -f "$R/apps/api/prisma/migrations/MIGRATIONS.sha256"
out="$(cd "$R" && ./scripts/check-migrations.sh --manifest-only 2>&1)"; rc=$?
check "sin manifiesto: sale con 1" "1" "$rc"

# 6. Comprobacion de git: migracion sin versionar.
R="$TMP/untracked"; make_repo "$R"
mkdir -p "$R/apps/api/prisma/migrations/20260104000000_cuatro"
printf 'SELECT 4;\n' > "$R/apps/api/prisma/migrations/20260104000000_cuatro/migration.sql"
( cd "$R" && git add -A && git commit -qm "nueva migracion" )
# Versionada en git pero NO en el manifiesto: debe fallar por el manifiesto.
out="$(cd "$R" && ./scripts/check-migrations.sh 2>&1)"; rc=$?
check "migracion versionada pero no aprobada: sale con 1" "1" "$rc"

# 7. Comprobacion de git: manifiesto sin versionar.
R="$TMP/manifest-untracked"; make_repo "$R"
( cd "$R" && git rm -q --cached apps/api/prisma/migrations/MIGRATIONS.sha256 )
out="$(cd "$R" && ./scripts/check-migrations.sh 2>&1)"; rc=$?
check "manifiesto sin versionar: sale con 1" "1" "$rc"
check "manifiesto sin versionar: lo dice" "yes" "$(grep -q 'MIGRATIONS.sha256 no est' <<<"$out" && echo yes || echo no)"

echo
echo "  casos correctos: $pass   fallidos: $fail"
if [[ "$fail" -ne 0 ]]; then
  echo "FALLO: la guarda de migraciones no se comporta como se espera."
  exit 1
fi
echo "OK: la guarda de migraciones se comporta correctamente en los casos sinteticos."
exit 0
