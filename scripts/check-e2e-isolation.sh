#!/usr/bin/env bash
# PIT-16 · comprobación repetible del AISLAMIENTO de la base de pruebas E2E.
#
# Objetivo: demostrar que desde la configuración de test es IMPOSIBLE leer o
# escribir en producción, y que la base de test sí es utilizable.
#
# No modifica nada: solo consulta catálogo e intenta lecturas que deben fallar.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_E2E="$REPO/apps/api/.env.e2e"
PROD_DB=automatizeit
TEST_DB=automatizeit_e2e
TEST_ROLE=automatizeit_e2e
ENVFILE=$(mktemp)
chmod 600 "$ENVFILE"
trap 'rm -f "$ENVFILE"' EXIT

fail=0
ok()   { printf '  [OK]   %s\n' "$1"; }
bad()  { printf '  [FAIL] %s\n' "$1"; fail=1; }
info() { printf '  [--]   %s\n' "$1"; }

echo "=== 1. la configuración de test apunta a la base aislada ==="
if [[ ! -f "$ENV_E2E" ]]; then
  bad "$ENV_E2E no existe: no hay configuración de test aislada"
else
  URL=$(grep -E '^DATABASE_URL=' "$ENV_E2E" | tail -1)
  DBNAME=$(echo "$URL" | sed -E 's#.*/([A-Za-z0-9_]+)$#\1#')
  ROLENAME=$(echo "$URL" | sed -E 's#^.*://([^:]+):.*$#\1#')
  if [[ "$DBNAME" == "$TEST_DB" && "$ROLENAME" == "$TEST_ROLE" ]]; then
    ok "DATABASE_URL -> base='${DBNAME}' rol='${ROLENAME}'"
  else
    bad "DATABASE_URL inesperada: base='${DBNAME}' rol='${ROLENAME}'"
  fi
  if [[ "$DBNAME" == "$PROD_DB" ]]; then
    bad "la configuración de test apunta a producción"
  else
    ok "no apunta a producción ('${PROD_DB}')"
  fi
fi

echo "=== 2. permisos del rol de test en PRODUCCIÓN (catálogo) ==="
catq() { docker exec -i automatizeit-postgres psql -X -qAt -U automatizeit -d "$1" -f -; }
A=$(catq "$PROD_DB" <<SQL
SELECT has_schema_privilege('${TEST_ROLE}','public','USAGE')::text
       || ' ' || has_table_privilege('${TEST_ROLE}','public.customers','SELECT')::text
       || ' ' || has_table_privilege('${TEST_ROLE}','public.customers','INSERT')::text
       || ' ' || (SELECT count(*)::text FROM information_schema.role_table_grants
                  WHERE grantee='${TEST_ROLE}' AND table_catalog='${PROD_DB}');
SQL
)
if [[ "$A" == "false false false 0" ]]; then
  ok "sin USAGE de esquema, sin SELECT, sin INSERT, 0 grants de tabla"
else
  bad "privilegios inesperados en producción: '$A'"
fi

echo "=== 3. intento REAL de lectura/escritura en producción (rol de test) ==="
PW=$(grep -E '^DATABASE_URL=' "$ENV_E2E" | sed -E 's#^.*://[^:]+:([^@]+)@.*$#\1#')
printf 'PGPASSWORD=%s\n' "$PW" > "$ENVFILE"
attempt() {
  # El error es el RESULTADO ESPERADO: no debe abortar el script bajo `set -e`.
  docker exec -i --env-file "$ENVFILE" automatizeit-postgres \
    psql -X -qAt -U "$TEST_ROLE" -d "$PROD_DB" -c "$1" 2>&1 | head -1 || true
}
for Q in \
  "SELECT count(*) FROM customers" \
  "SELECT count(*) FROM purchases" \
  "INSERT INTO organizations (id,uuid,name,slug,updated_at) VALUES ('iso','iso','iso','iso',now())"; do
  OUT=$(attempt "$Q")
  if [[ "$OUT" == ERROR:* ]]; then
    ok "bloqueado: ${Q:0:44} -> ${OUT:0:60}"
  else
    bad "LEÍDO/ESCRITO en producción: ${Q:0:44} -> ${OUT:0:60}"
  fi
done

echo "=== 4. control: la base de test SÍ es utilizable con ese mismo rol ==="
CTRL=$(docker exec -i --env-file "$ENVFILE" automatizeit-postgres \
  psql -X -qAt -U "$TEST_ROLE" -d "$TEST_DB" \
  -c "SELECT current_database()||' rows_customers='||(SELECT count(*) FROM customers);" 2>&1 | head -1 || true)
if [[ "$CTRL" =~ ^${TEST_DB}\ rows_customers=[0-9]+$ ]]; then
  ok "conecta y consulta en ${TEST_DB}: ${CTRL} (usabilidad, no vaciado)"
else
  bad "control fallido: ${CTRL}"
fi

echo "=== 5. la base aislada: esquema correcto y SIN datos de producción ==="
S=$(catq "$TEST_DB" <<'SQL'
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')::text
       || ' ' || (SELECT count(*) FROM pg_indexes WHERE schemaname='public')::text;
SQL
)
if [[ "$S" == "29 146" ]]; then
  ok "29 tablas · 146 índices (sin deriva de esquema)"
else
  bad "estado de esquema inesperado: '$S' (esperado '29 146')"
fi

# Los suites E2E limpian en beforeAll, así que después de una ejecución la base
# NO queda vacía (organizaciones y auditorías residuales de las propias
# fixtures). El recuento de filas era por tanto un falso indicador de
# aislamiento —daba un falso negativo— y se sustituye por la comprobación
# directa de la propiedad que sí importa: que aquí NO exista ningún
# identificador de producción. El vaciado se sigue reportando, pero como
# higiene de la base de pruebas y no como criterio de seguridad.
R=$(catq "$TEST_DB" <<'SQL'
SELECT 'orgs='||(SELECT count(*) FROM organizations)
       || ' customers='||(SELECT count(*) FROM customers)
       || ' purchases='||(SELECT count(*) FROM purchases)
       || ' messages='||(SELECT count(*) FROM messages)
       || ' audits='||(SELECT count(*) FROM audits)
       || ' audits_orgNULL='||(SELECT count(*) FROM audits WHERE organization_id IS NULL);
SQL
)
info "fixtures residuales de las suites (higiene, no es un fallo): ${R}"

# Propiedad de seguridad: NINGÚN uuid de la base de test existe en producción.
# Se contrasta la base pequeña (test) contra la grande (producción), para no
# materializar volúmenes de datos de producción fuera de su base.
OVERLAP=0
for TABLE in organizations customers purchases messages; do
  IDS=$(printf 'SELECT quote_literal(uuid::text) FROM %s;' "$TABLE" | catq "$TEST_DB" | paste -sd, -)
  if [[ -z "${IDS// }" ]]; then
    continue
  fi
  HITS=$(printf 'SELECT count(*) FROM %s WHERE uuid::text IN (%s);' "$TABLE" "$IDS" | catq "$PROD_DB")
  if [[ ! "$HITS" =~ ^[0-9]+$ ]]; then
    bad "no se pudo contrastar ${TABLE} contra producción: '${HITS:0:60}'"
    continue
  fi
  OVERLAP=$((OVERLAP + HITS))
done
if [[ "$OVERLAP" -eq 0 ]]; then
  ok "0 identificadores de la base de test presentes en producción (organizations/customers/purchases/messages)"
else
  bad "HAY ${OVERLAP} identificadores de producción dentro de la base de test"
fi

echo
if [[ $fail -eq 0 ]]; then
  echo "AISLAMIENTO E2E VERIFICADO"
else
  echo "AISLAMIENTO E2E NO VERIFICADO"
fi
exit $fail
