#!/usr/bin/env bash
# Spielt eine Sicherung von backup.sh in eine LEERE Datenbank ein.
# Aufruf: bash betrieb/restore.sh <datei>   Einstellungen: gemeinsam.sh (Ziel ist DB_NAME).
# Exit-Codes: 1 Aufruf, Datei oder Schlüssel (auch: nicht entschlüsselbar), 2 Ziel-Datenbank nicht leer, sonst der Exit von psql.
# BACKUP_SCHLUESSEL  Datei mit der privaten age-Identität; nötig für *.sql.age. Eine Klartext-Sicherung wird bei gesetztem
#                    Schlüssel mit Warnung eingespielt (Altbestand).
# Nur eigene Sicherungen einspielen: eine SQL-Datei kann psql-Metabefehle enthalten und ist ausführbarer Code.
set -euo pipefail

# shellcheck source=betrieb/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

if [ "$#" -ne 1 ]; then
  fehler "Aufruf: bash betrieb/restore.sh <sicherungsdatei>"
  exit 1
fi
datei="${1-}"
if [ ! -f "$datei" ] || [ ! -r "$datei" ]; then
  fehler "Sicherungsdatei fehlt oder ist nicht lesbar: $datei"
  exit 1
fi
if [ ! -s "$datei" ]; then
  fehler "Sicherungsdatei ist leer: $datei"
  exit 1
fi

# Format an der ersten Zeile erkennen. Eine verschlüsselte Sicherung wird vor dem Einspielen einmal vollständig entschlüsselt
# (Prüflauf), damit eine abgeschnittene oder manipulierte Datei nie einen Teil in die Datenbank schreibt.
verschluesselt=0
erste=""
IFS= read -r erste < "$datei" || true
if [ "$erste" = "age-encryption.org/v1" ]; then
  verschluesselt=1
  if ! command -v age >/dev/null 2>&1; then
    fehler "Sicherung ist verschlüsselt, aber age ist nicht installiert: $datei"
    exit 1
  fi
  if [ -z "${BACKUP_SCHLUESSEL-}" ] || [ ! -f "$BACKUP_SCHLUESSEL" ] || [ ! -r "$BACKUP_SCHLUESSEL" ]; then
    fehler "Sicherung ist verschlüsselt, BACKUP_SCHLUESSEL fehlt oder ist nicht lesbar (${BACKUP_SCHLUESSEL-nicht gesetzt}): $datei"
    exit 1
  fi
  if ! age -d -i "$BACKUP_SCHLUESSEL" "$datei" > /dev/null 2>&1; then
    fehler "Sicherung nicht entschlüsselbar (falscher Schlüssel oder beschädigt), nichts eingespielt: $datei"
    exit 1
  fi
elif [ -n "${BACKUP_SCHLUESSEL-}" ]; then
  fehler "WARNUNG: Sicherung ist unverschlüsselt: $datei"
fi

# Leer heißt: kein Schema außer public und den Systemschemata, und keine Relation. Der DB-Name steht nie im SQL-Text.
# Indizes (relkind i) fehlen bewusst: sie kommen nie ohne Tabelle vor. Fremdtabellen (f) sind ungetestet (brauchen eine FDW-Erweiterung).
sql="select nspname from pg_namespace where nspname not in ('public', 'pg_catalog', 'information_schema') and nspname not like 'pg\_%'
union
select distinct n.nspname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f') and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\_toast%'
order by 1"
# shellcheck disable=SC2086
gefunden="$($DB_EXEC psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c "$sql" | tr -d '\r')"
if [ -n "$gefunden" ]; then
  fehler "Ziel-Datenbank $DB_NAME ist nicht leer (gefundene Schemata: $(echo "$gefunden" | tr '\n' ' ')); nichts eingespielt."
  exit 2
fi

if [ "$verschluesselt" = 1 ]; then
  # shellcheck disable=SC2086
  age -d -i "$BACKUP_SCHLUESSEL" "$datei" | $DB_EXEC psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --single-transaction -q > /dev/null
else
  # shellcheck disable=SC2086
  $DB_EXEC psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --single-transaction -q < "$datei" > /dev/null
fi
fehler "Sicherung eingespielt in $DB_NAME: $datei"
