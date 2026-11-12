#!/usr/bin/env bash
# Rundlauf-Test für backup.sh und restore.sh. Nutzt nur eigene, kurzlebige Datenbanken (st_rundlauf_*), nie die echte.
# Aufruf: bash betrieb/test-rundlauf.sh  (Voraussetzung: DB erreichbar wie in gemeinsam.sh, z. B. docker compose up -d --wait db;
# lokal ohne Container: DB_EXEC= und passende PG*-Variablen). bash-3.2-kompatibel (macOS /bin/bash).
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=betrieb/gemeinsam.sh
. "$WURZEL/betrieb/gemeinsam.sh"
export PGCLIENTENCODING=UTF8

FEHLER=0
SUFFIX="$$"
QUELLE="st_rundlauf_quelle_$SUFFIX"
ZIEL="st_rundlauf_ziel_$SUFFIX"
VOLL="st_rundlauf_voll_$SUFFIX"
ART="st_rundlauf_art_$SUFFIX"
KAPUTT="st_rundlauf_kaputt_$SUFFIX"
BACKUPS_NEU=0
if [ ! -d "$WURZEL/backups" ]; then BACKUPS_NEU=1; fi
TMP="$(mktemp -d "${TMPDIR:-/tmp}/rundlauf.XXXXXX")"

ok() { echo "OK: $1"; }
nok() { echo "FEHLER: $1"; FEHLER=$((FEHLER + 1)); }
pruefe_gleich() { if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 (erwartet: [$2], erhalten: [$3])"; fi; }
pruefe_enthaelt() { case "$3" in *"$2"*) ok "$1" ;; *) nok "$1 (erwartet enthält: [$2], erhalten: [$3])" ;; esac; }

# shellcheck disable=SC2086
sql() { # sql <db> <anweisung>: gibt die Zeilen aus
  $DB_EXEC psql -U "$DB_USER" -d "$1" -At -v ON_ERROR_STOP=1 -c "$2" | tr -d '\r'
}
# shellcheck disable=SC2086
sql_stdin() { $DB_EXEC psql -U "$DB_USER" -d "$1" -q -v ON_ERROR_STOP=1 | tr -d '\r'; }
# shellcheck disable=SC2086
anlegen() { $DB_EXEC createdb -U "$DB_USER" "$1"; }
# shellcheck disable=SC2086
loeschen() { $DB_EXEC dropdb -U "$DB_USER" --if-exists --force "$1" >/dev/null 2>&1; }

# shellcheck disable=SC2329  # läuft über trap EXIT
aufraeumen() {
  loeschen "$QUELLE"
  loeschen "$ZIEL"
  loeschen "$VOLL"
  loeschen "$ART"
  loeschen "$KAPUTT"
  rm -rf "$TMP"
  [ -n "${STANDARD_DATEI-}" ] && rm -f "$STANDARD_DATEI"
  if [ "$BACKUPS_NEU" = 1 ]; then rmdir "$WURZEL/backups" 2>/dev/null; fi
  return 0
}
trap aufraeumen EXIT

backup() { BACKUP_DIR="$TMP" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh"; }
restore() { # restore <ziel-db> <datei>
  DB_NAME="$1" "$BASH" "$WURZEL/betrieb/restore.sh" "$2"
}

# 1. Rundlauf
anlegen "$QUELLE" || { echo "FEHLER: Datenbank nicht erreichbar"; exit 1; }
sql_stdin "$QUELLE" <<'SQL'
create schema app;
create table app.notiz (id serial primary key, text text);
insert into app.notiz (text) values ('Größe "fett"'), (E'zwei\nZeilen'), (NULL), ('it''s');
SQL
DATEI="$(backup 2>"$TMP/backup.err")"; RC=$?
pruefe_gleich "Backup Exit 0" 0 "$RC"
if [ -s "$DATEI" ]; then ok "Sicherung existiert und ist nicht leer"; else nok "Sicherung fehlt oder ist leer: [$DATEI]"; fi
if [ -n "$(find "$DATEI" -perm 600 2>/dev/null)" ]; then ok "Sicherung hat Modus 600"; else nok "Sicherung hat nicht Modus 600"; fi
anlegen "$ZIEL"
if restore "$ZIEL" "$DATEI" >"$TMP/restore.out" 2>&1; then RC=0; else RC=$?; fi
pruefe_gleich "Restore in leere DB Exit 0" 0 "$RC"
ABFRAGE="select id, coalesce(text, '<NULL>') from app.notiz order by id"
pruefe_gleich "Zeilen gleich Quelle" "$(sql "$QUELLE" "$ABFRAGE")" "$(sql "$ZIEL" "$ABFRAGE")"
pruefe_gleich "Zeilenzahl 4" 4 "$(sql "$ZIEL" "select count(*) from app.notiz")"
SEQ="select last_value from app.notiz_id_seq"
pruefe_gleich "Sequenzwert gleich Quelle" "$(sql "$QUELLE" "$SEQ")" "$(sql "$ZIEL" "$SEQ")"

# 2. Standardablage
SA="$(DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" 2>/dev/null)"; RC=$?
STANDARD_DATEI="$SA"
pruefe_gleich "Backup ohne BACKUP_DIR Exit 0" 0 "$RC"
case "$SA" in "$WURZEL"/backups/*) ok "Standardablage unter backups/" ;; *) nok "Standardablage falsch: [$SA]" ;; esac
if git -C "$WURZEL" rev-parse --git-dir >/dev/null 2>&1; then
  if git -C "$WURZEL" check-ignore -q "$SA"; then ok "backups/ ist ignoriert"; else nok "backups/ ist nicht in .gitignore"; fi
fi
rm -f "$SA"

# 3. Negativfall: Ziel nicht leer
if restore "$ZIEL" "$DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore auf befülltes Ziel: Exit 2" 2 "$RC"
pruefe_enthaelt "Meldung nennt nicht leer" "Ziel-Datenbank $ZIEL ist nicht leer" "$(cat "$TMP/e")"
pruefe_enthaelt "Meldung nennt das gefundene Schema" "gefundene Schemata: app" "$(cat "$TMP/e")"

# Jede Relationsart außerhalb der Systemschemata macht die Ziel-Datenbank nicht leer.
for art in "view|create view public.v as select 1" "sequence|create sequence public.s" "matview|create materialized view public.m as select 1" "partitioniert|create table public.p (id int) partition by range (id)"; do
  name="${art%%|*}"; stmt="${art#*|}"
  loeschen "$ART"; anlegen "$ART"
  echo "$stmt;" | sql_stdin "$ART"
  if restore "$ART" "$DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
  pruefe_gleich "Ziel mit Relationsart $name ist nicht leer: Exit 2" 2 "$RC"
done

# Kaputte Sicherung: Fehler mittendrin, es bleibt nichts zurück (eine Transaktion, ON_ERROR_STOP).
KAPUTTE_DATEI="$TMP/kaputt.sql"
cp "$DATEI" "$KAPUTTE_DATEI"; echo "select 1/0;" >> "$KAPUTTE_DATEI"
loeschen "$KAPUTT"; anlegen "$KAPUTT"
if restore "$KAPUTT" "$KAPUTTE_DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
if [ "$RC" -ne 0 ]; then ok "Kaputte Sicherung: Exit ungleich 0"; else nok "Kaputte Sicherung: Exit war 0"; fi
pruefe_gleich "Kaputte Sicherung: Ziel bleibt leer (Schema app fehlt)" 0 "$(sql "$KAPUTT" "select count(*) from pg_namespace where nspname = 'app'")"

# backup.sh: Fehlerzweige
LEERDIR="$TMP/leerbackup"
if DB_EXEC=true BACKUP_DIR="$LEERDIR" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Leerer Dump: Exit 1" 1 "$RC"
pruefe_enthaelt "Leerer Dump: Meldung" "Sicherung ist leer, verworfen: $LEERDIR/" "$(cat "$TMP/e")"
pruefe_gleich "Leerer Dump: nichts bleibt liegen" 0 "$(find "$LEERDIR" -type f | wc -l | tr -d ' ')"
if DB_EXEC=false BACKUP_DIR="$LEERDIR" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
if [ "$RC" -ne 0 ]; then ok "Fehlschlagender pg_dump: Exit ungleich 0"; else nok "Fehlschlagender pg_dump: Exit war 0"; fi
pruefe_gleich "Fehlschlagender pg_dump: nichts bleibt liegen" 0 "$(find "$LEERDIR" -type f | wc -l | tr -d ' ')"
mkdir -p "$TMP/bin"
printf '#!/bin/sh\necho 20260101-000000\n' > "$TMP/bin/date"; chmod +x "$TMP/bin/date"
VORHANDEN="$LEERDIR/${QUELLE}-20260101-000000.sql"
echo "alt" > "$VORHANDEN"
if PATH="$TMP/bin:$PATH" DB_EXEC=echo DB_NAME="$QUELLE" BACKUP_DIR="$LEERDIR" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Vorhandene Sicherungsdatei: Exit 1" 1 "$RC"
pruefe_enthaelt "Vorhandene Sicherungsdatei: Meldung nennt Pfad" "existiert schon, nichts überschrieben: $VORHANDEN" "$(cat "$TMP/e")"
pruefe_gleich "Vorhandene Sicherungsdatei unverändert" "alt" "$(cat "$VORHANDEN")"
pruefe_gleich "Vorhandene Sicherungsdatei: keine unvollständige Datei" 1 "$(find "$LEERDIR" -type f | wc -l | tr -d ' ')"
pruefe_gleich "Ziel unverändert (4 Zeilen)" 4 "$(sql "$ZIEL" "select count(*) from app.notiz")"

anlegen "$VOLL"
sql_stdin "$VOLL" <<'SQL'
create table public.marker (id int);
insert into public.marker values (1);
SQL
if restore "$VOLL" "$DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore auf DB mit public-Tabelle: Exit 2" 2 "$RC"
pruefe_gleich "Schema app wurde nicht angelegt" 0 "$(sql "$VOLL" "select count(*) from pg_namespace where nspname = 'app'")"
pruefe_gleich "marker unverändert" 1 "$(sql "$VOLL" "select count(*) from public.marker")"
sql_stdin "$VOLL" <<'SQL'
drop table public.marker;
create schema extra;
SQL
if restore "$VOLL" "$DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore auf DB mit leerem Schema extra: Exit 2" 2 "$RC"
pruefe_gleich "Schema app fehlt weiter" 0 "$(sql "$VOLL" "select count(*) from pg_namespace where nspname = 'app'")"

# 4. Negativfall: Datei
FEHLT="$TMP/gibt-es-nicht.sql"
if restore "$ZIEL" "$FEHLT" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Fehlende Datei: Exit 1" 1 "$RC"
pruefe_enthaelt "Meldung nennt den Pfad der fehlenden Datei" "$FEHLT" "$(cat "$TMP/e")"
GESPERRT="$TMP/gesperrt.sql"
cp "$DATEI" "$GESPERRT"; chmod 000 "$GESPERRT"
if [ -r "$GESPERRT" ]; then
  echo "OK: unlesbare Datei übersprungen (Datei bleibt lesbar, z. B. root oder NTFS)"
else
  if restore "$ZIEL" "$GESPERRT" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
  pruefe_gleich "Unlesbare Datei: Exit 1" 1 "$RC"
  pruefe_enthaelt "Meldung nennt den Pfad der unlesbaren Datei" "$GESPERRT" "$(cat "$TMP/e")"
fi
chmod 600 "$GESPERRT"
LEER="$TMP/leer.sql"; : > "$LEER"
if restore "$ZIEL" "$LEER" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Leere Datei: Exit 1" 1 "$RC"
pruefe_enthaelt "Meldung nennt den Pfad der leeren Datei" "$LEER" "$(cat "$TMP/e")"
if DB_NAME="$ZIEL" "$BASH" "$WURZEL/betrieb/restore.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Ohne Argument: Exit 1" 1 "$RC"
pruefe_enthaelt "Ohne Argument: Aufrufhilfe" "Aufruf: bash betrieb/restore.sh" "$(cat "$TMP/e")"
if DB_NAME="$ZIEL" "$BASH" "$WURZEL/betrieb/restore.sh" "$DATEI" "$DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Zwei Argumente: Exit 1" 1 "$RC"
if restore "$ZIEL" "$TMP" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Verzeichnis statt Datei: Exit 1" 1 "$RC"
pruefe_enthaelt "Verzeichnis statt Datei: Meldung nennt den Pfad" "$TMP" "$(cat "$TMP/e")"

if [ "$FEHLER" -eq 0 ]; then echo "Rundlauf-Test bestanden"; exit 0; fi
echo "Rundlauf-Test: $FEHLER Fehler"
exit 1
