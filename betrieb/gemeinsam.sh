# shellcheck shell=bash
# Gemeinsame Einstellungen für backup.sh, restore.sh und test-rundlauf.sh (wird mit `.` eingebunden, nicht ausgeführt).
# bash-3.2-kompatibel (macOS /bin/bash, Git Bash).
#
# DB_EXEC  Präfix, mit dem die PostgreSQL-Werkzeuge laufen. Standard: im Compose-Dienst db (`docker compose exec -T db`).
#          Leer gesetzt (DB_EXEC=): lokale Client-Werkzeuge (psql, pg_dump, createdb) mit den üblichen PG*-Variablen.
# DB_NAME  Datenbankname, Standard POSTGRES_DB, sonst speakertooling.
# DB_USER  Datenbankbenutzer, Standard POSTGRES_USER, sonst speakertooling.
# Die Datei .env wird nicht gelesen; für abweichende Werte die Variablen in der Shell setzen.

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WURZEL" || exit 1

DB_EXEC="${DB_EXEC-docker compose exec -T db}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-speakertooling}}"
DB_USER="${DB_USER:-${POSTGRES_USER:-speakertooling}}"

fehler() { echo "$*" >&2; }
