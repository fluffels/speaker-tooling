#!/usr/bin/env bash
# Rundlauf-Test für backup.sh und restore.sh. Nutzt nur eigene, kurzlebige Datenbanken (st_rundlauf_*), nie die echte.
# Aufruf: bash betrieb/test-rundlauf.sh  (Voraussetzung: DB erreichbar wie in gemeinsam.sh, z. B. docker compose up -d --wait db;
# lokal ohne Container: DB_EXEC= und passende PG*-Variablen; age und age-keygen müssen installiert sein, Abschnitt 5 verlangt sie).
# bash-3.2-kompatibel (macOS /bin/bash).
set -uo pipefail
unset BACKUP_EMPFAENGER BACKUP_SCHLUESSEL BACKUP_DIR  # eine Shell-Konfiguration darf den Test nicht in den Schutz-Modus ziehen

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
KRYPT="st_rundlauf_krypt_$SUFFIX"
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
  loeschen "$KRYPT"
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
pruefe_enthaelt "Backup ohne Schutz warnt: unverschlüsselt" "unverschlüsselt" "$(cat "$TMP/backup.err")"
if [ -s "$DATEI" ]; then ok "Sicherung existiert und ist nicht leer"; else nok "Sicherung fehlt oder ist leer: [$DATEI]"; fi
if [ -n "$(find "$DATEI" -perm 600 2>/dev/null)" ]; then ok "Sicherung hat Modus 600"; else nok "Sicherung hat nicht Modus 600"; fi
anlegen "$ZIEL"
if restore "$ZIEL" "$DATEI" >"$TMP/restore.out" 2>&1; then RC=0; else RC=$?; fi
pruefe_gleich "Restore in leere DB Exit 0" 0 "$RC"
case "$(cat "$TMP/restore.out")" in *WARNUNG*) nok "Klartext-Restore ohne Schlüssel warnt nicht" ;; *) ok "Klartext-Restore ohne Schlüssel warnt nicht" ;; esac
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

# 5. Verschlüsselung (age): Wegwerf-Schlüssel nur im Temp-Ordner
if ! command -v age >/dev/null 2>&1 || ! command -v age-keygen >/dev/null 2>&1; then
  echo "FEHLER: age und age-keygen sind Voraussetzung (brew install age bzw. apt install age)"; exit 1
fi
age-keygen -o "$TMP/schluessel.txt" 2>/dev/null
age-keygen -y "$TMP/schluessel.txt" > "$TMP/empfaenger.txt"
age-keygen -o "$TMP/fremd.txt" 2>/dev/null
dateien() { find "$1" -type f | wc -l | tr -d ' '; }

# 5a. Schutz aktiv über BACKUP_EMPFAENGER
K1="$TMP/k1"
KDATEI="$(BACKUP_DIR="$K1" BACKUP_EMPFAENGER="$TMP/empfaenger.txt" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" 2>"$TMP/e")"; RC=$?
pruefe_gleich "Verschlüsselt: Backup Exit 0" 0 "$RC"
case "$KDATEI" in *.sql.age) ok "Verschlüsselt: Datei endet auf .sql.age" ;; *) nok "Verschlüsselt: falsche Endung [$KDATEI]" ;; esac
if [ -n "$(find "$KDATEI" -perm 600 2>/dev/null)" ]; then ok "Verschlüsselt: Modus 600"; else nok "Verschlüsselt: nicht Modus 600"; fi
pruefe_gleich "Verschlüsselt: erste Zeile ist der age-Kopf" "age-encryption.org/v1" "$(head -n 1 "$KDATEI")"
if grep -a -q -e "PostgreSQL database dump" -e "Größe" "$KDATEI"; then nok "Verschlüsselt: Klartext in der Sicherung gefunden"; else ok "Verschlüsselt: kein Klartext in der Sicherung"; fi
pruefe_enthaelt "Verschlüsselt: Meldung sagt mit age verschlüsselt" "mit age verschlüsselt" "$(cat "$TMP/e")"
case "$(cat "$TMP/e")" in *WARNUNG*) nok "Verschlüsselt: Meldung enthält eine Warnung" ;; *) ok "Verschlüsselt: keine Warnung" ;; esac
pruefe_gleich "Verschlüsselt: nur die Sicherung liegt im Ordner" 1 "$(dateien "$K1")"

# 5b. Schutz aktiv über die Standard-Empfängerdatei, ohne Variable
K2="$TMP/k2"; mkdir -p "$K2"; cp "$TMP/empfaenger.txt" "$K2/empfaenger.txt"
KDATEI2="$(BACKUP_DIR="$K2" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" 2>/dev/null)"; RC=$?
pruefe_gleich "Standard-Empfängerdatei: Backup Exit 0" 0 "$RC"
case "$KDATEI2" in *.sql.age) ok "Standard-Empfängerdatei: Datei endet auf .sql.age" ;; *) nok "Standard-Empfängerdatei: falsche Endung [$KDATEI2]" ;; esac

# 5c. Rundlauf verschlüsselt
anlegen "$KRYPT"
if BACKUP_SCHLUESSEL="$TMP/schluessel.txt" restore "$KRYPT" "$KDATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Verschlüsselter Rundlauf: Restore Exit 0" 0 "$RC"
pruefe_gleich "Verschlüsselter Rundlauf: Zeilen gleich Quelle" "$(sql "$QUELLE" "$ABFRAGE")" "$(sql "$KRYPT" "$ABFRAGE")"
pruefe_gleich "Verschlüsselter Rundlauf: Sequenzwert gleich Quelle" "$(sql "$QUELLE" "$SEQ")" "$(sql "$KRYPT" "$SEQ")"

# 5d. Negativfall backup.sh bei aktivem Schutz: abgelehnt, nichts bleibt liegen
ablehnung() { # ablehnung <name> <ordner> <grund> [Umgebung ...]
  name="$1"; ordner="$2"; grund="$3"; shift 3
  if env "$@" BACKUP_DIR="$ordner" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
  pruefe_gleich "$name: Exit 1" 1 "$RC"
  pruefe_enthaelt "$name: Meldung" "unverschlüsselte Sicherung abgelehnt" "$(cat "$TMP/e")"
  pruefe_enthaelt "$name: Grund" "$grund" "$(cat "$TMP/e")"
}
ablehnung "Empfängerdatei fehlt" "$TMP/n1" "Empfängerdatei fehlt oder ist nicht lesbar" "BACKUP_EMPFAENGER=$TMP/gibt-es-nicht.txt"
pruefe_gleich "Empfängerdatei fehlt: nichts bleibt liegen" 0 "$(dateien "$TMP/n1")"
echo "kein-schluessel" > "$TMP/kaputt.txt"
ablehnung "Empfängerdatei ungültig" "$TMP/n2" "Empfängerdatei ist ungültig" "BACKUP_EMPFAENGER=$TMP/kaputt.txt"
pruefe_gleich "Empfängerdatei ungültig: nichts bleibt liegen" 0 "$(dateien "$TMP/n2")"
mkdir -p "$TMP/stub"; printf '#!/bin/sh\nexit 1\n' > "$TMP/stub/age"; chmod +x "$TMP/stub/age"
ablehnung "age schlägt fehl" "$TMP/n3" "Empfängerdatei ist ungültig" "BACKUP_EMPFAENGER=$TMP/empfaenger.txt" "PATH=$TMP/stub:$PATH"
pruefe_gleich "age schlägt fehl: nichts bleibt liegen" 0 "$(dateien "$TMP/n3")"
mkdir -p "$TMP/n4"; : > "$TMP/n4/alt.sql.age"
ablehnung "Empfängerdatei gelöscht, .sql.age liegt da" "$TMP/n4" "Empfängerdatei fehlt oder ist nicht lesbar"
ablehnung "BACKUP_EMPFAENGER leer gesetzt" "$TMP/n4b" "Empfängerdatei fehlt oder ist nicht lesbar" "BACKUP_EMPFAENGER="
pruefe_gleich "BACKUP_EMPFAENGER leer gesetzt: nichts bleibt liegen" 0 "$(dateien "$TMP/n4b")"
pruefe_gleich "Empfängerdatei gelöscht: nur die alte Datei bleibt" 1 "$(dateien "$TMP/n4")"
mkdir -p "$TMP/minbin"
for werkzeug in dirname date mkdir mv rm cat; do ln -sf "$(command -v $werkzeug)" "$TMP/minbin/$werkzeug"; done
if PATH="$TMP/minbin" DB_EXEC=echo BACKUP_EMPFAENGER="$TMP/empfaenger.txt" BACKUP_DIR="$TMP/n5" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "age nicht installiert: Exit 1" 1 "$RC"
pruefe_enthaelt "age nicht installiert: Meldung" "unverschlüsselte Sicherung abgelehnt" "$(cat "$TMP/e")"
pruefe_enthaelt "age nicht installiert: Grund" "age ist nicht installiert" "$(cat "$TMP/e")"
pruefe_gleich "age nicht installiert: nichts bleibt liegen" 0 "$(dateien "$TMP/n5")"

# Fehler mitten im Strom: pg_dump bricht nach Teilausgabe ab, bzw. age scheitert erst bei Daten (die Vorprüfung besteht).
printf '#!/bin/sh\necho "-- teil"\nexit 1\n' > "$TMP/stub/teildump.sh"; chmod +x "$TMP/stub/teildump.sh"
if DB_EXEC="$TMP/stub/teildump.sh" BACKUP_EMPFAENGER="$TMP/empfaenger.txt" BACKUP_DIR="$TMP/n7" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "pg_dump bricht nach Teilausgabe ab: Exit 1" 1 "$RC"
pruefe_enthaelt "pg_dump bricht nach Teilausgabe ab: Meldung" "pg_dump 1" "$(cat "$TMP/e")"
pruefe_gleich "pg_dump bricht nach Teilausgabe ab: nichts bleibt liegen" 0 "$(dateien "$TMP/n7")"
mkdir -p "$TMP/stub2"; printf '#!/bin/sh\nif IFS= read -r x; then cat >/dev/null; exit 1; fi\nexit 0\n' > "$TMP/stub2/age"; chmod +x "$TMP/stub2/age"
if PATH="$TMP/stub2:$PATH" BACKUP_EMPFAENGER="$TMP/empfaenger.txt" BACKUP_DIR="$TMP/n8" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "age scheitert im Strom: Exit 1" 1 "$RC"
pruefe_enthaelt "age scheitert im Strom: Meldung" "age 1" "$(cat "$TMP/e")"
pruefe_gleich "age scheitert im Strom: nichts bleibt liegen" 0 "$(dateien "$TMP/n8")"

# 5e. Leerer Dump bei aktivem Schutz
if DB_EXEC=true BACKUP_EMPFAENGER="$TMP/empfaenger.txt" BACKUP_DIR="$TMP/n6" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Leerer Dump verschlüsselt: Exit 1" 1 "$RC"
pruefe_enthaelt "Leerer Dump verschlüsselt: Meldung" "Sicherung ist leer, verworfen" "$(cat "$TMP/e")"
pruefe_gleich "Leerer Dump verschlüsselt: nichts bleibt liegen" 0 "$(dateien "$TMP/n6")"
if DB_EXEC=false BACKUP_EMPFAENGER="$TMP/empfaenger.txt" BACKUP_DIR="$TMP/n6" "$BASH" "$WURZEL/betrieb/backup.sh" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Fehlschlagender pg_dump verschlüsselt: Exit 1" 1 "$RC"
pruefe_enthaelt "Fehlschlagender pg_dump verschlüsselt: Meldung" "Sicherung fehlgeschlagen (pg_dump 1" "$(cat "$TMP/e")"
case "$(cat "$TMP/e")" in *"leer"*) nok "Fehlschlagender pg_dump verschlüsselt: falsche Diagnose leer" ;; *) ok "Fehlschlagender pg_dump verschlüsselt: nicht als leer gemeldet" ;; esac
pruefe_gleich "Fehlschlagender pg_dump verschlüsselt: nichts bleibt liegen" 0 "$(dateien "$TMP/n6")"

# 5f. Restore-Negativfälle: das Ziel bleibt leer (Schema app fehlt)
ZIEL_LEER="select count(*) from pg_namespace where nspname = 'app'"
loeschen "$KRYPT"; anlegen "$KRYPT"
if env -u BACKUP_SCHLUESSEL DB_NAME="$KRYPT" "$BASH" "$WURZEL/betrieb/restore.sh" "$KDATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore ohne Schlüssel: Exit 1" 1 "$RC"
pruefe_enthaelt "Restore ohne Schlüssel: Meldung nennt den Pfad" "$KDATEI" "$(cat "$TMP/e")"
pruefe_gleich "Restore ohne Schlüssel: Ziel bleibt leer" 0 "$(sql "$KRYPT" "$ZIEL_LEER")"
if BACKUP_SCHLUESSEL="$TMP/fremd.txt" restore "$KRYPT" "$KDATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore mit falschem Schlüssel: Exit 1" 1 "$RC"
pruefe_enthaelt "Restore mit falschem Schlüssel: Meldung" "nicht entschlüsselbar" "$(cat "$TMP/e")"
pruefe_gleich "Restore mit falschem Schlüssel: Ziel bleibt leer" 0 "$(sql "$KRYPT" "$ZIEL_LEER")"

# Restore-Guards: age fehlt, Schlüsseldatei fehlt
loeschen "$KRYPT"; anlegen "$KRYPT"
if PATH="$TMP/minbin" DB_EXEC=true DB_NAME="$KRYPT" BACKUP_SCHLUESSEL="$TMP/schluessel.txt" "$BASH" "$WURZEL/betrieb/restore.sh" "$KDATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore ohne installiertes age: Exit 1" 1 "$RC"
pruefe_enthaelt "Restore ohne installiertes age: Meldung" "age ist nicht installiert" "$(cat "$TMP/e")"
if BACKUP_SCHLUESSEL="$TMP/gibt-es-nicht.txt" restore "$KRYPT" "$KDATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Restore mit fehlender Schlüsseldatei: Exit 1" 1 "$RC"
pruefe_enthaelt "Restore mit fehlender Schlüsseldatei: Meldung nennt den Pfad" "$TMP/gibt-es-nicht.txt" "$(cat "$TMP/e")"
pruefe_gleich "Restore mit fehlender Schlüsseldatei: Ziel bleibt leer" 0 "$(sql "$KRYPT" "$ZIEL_LEER")"

# Abgeschnittene Sicherung: größer als ein age-Block (64 KiB), damit ohne Prüflauf schon Teile bei psql ankämen.
sql_stdin "$QUELLE" <<'SQL'
create table app.gross (id int, fuell text);
insert into app.gross select g, repeat('x', 100) from generate_series(1, 2000) g;
SQL
GROSS="$(BACKUP_DIR="$TMP/k3" BACKUP_EMPFAENGER="$TMP/empfaenger.txt" DB_NAME="$QUELLE" "$BASH" "$WURZEL/betrieb/backup.sh" 2>/dev/null)"
GROESSE="$(wc -c < "$GROSS" | tr -d ' ')"
if [ "$GROESSE" -gt 131072 ]; then ok "Große Sicherung hat mehr als zwei age-Blöcke"; else nok "Große Sicherung zu klein: $GROESSE"; fi
head -c $((GROESSE - 100)) "$GROSS" > "$TMP/abgeschnitten.sql.age"
if BACKUP_SCHLUESSEL="$TMP/schluessel.txt" restore "$KRYPT" "$TMP/abgeschnitten.sql.age" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Abgeschnittene Sicherung: Exit 1" 1 "$RC"
pruefe_gleich "Abgeschnittene Sicherung: Ziel bleibt leer" 0 "$(sql "$KRYPT" "$ZIEL_LEER")"
if BACKUP_SCHLUESSEL="$TMP/schluessel.txt" restore "$KRYPT" "$GROSS" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Große vollständige Sicherung: Restore Exit 0" 0 "$RC"
pruefe_gleich "Große vollständige Sicherung: 2000 Zeilen" 2000 "$(sql "$KRYPT" "select count(*) from app.gross")"

# 5g. Warnfall: Klartext-Sicherung bei gesetztem Schlüssel wird mit Warnung eingespielt
loeschen "$KRYPT"; anlegen "$KRYPT"
if BACKUP_SCHLUESSEL="$TMP/schluessel.txt" restore "$KRYPT" "$DATEI" >"$TMP/o" 2>"$TMP/e"; then RC=0; else RC=$?; fi
pruefe_gleich "Klartext-Sicherung bei gesetztem Schlüssel: Restore Exit 0" 0 "$RC"
pruefe_enthaelt "Klartext-Sicherung bei gesetztem Schlüssel: Warnung" "unverschlüsselt" "$(cat "$TMP/e")"
pruefe_gleich "Klartext-Sicherung bei gesetztem Schlüssel: Zeilen eingespielt" 4 "$(sql "$KRYPT" "select count(*) from app.notiz")"

if [ "$FEHLER" -eq 0 ]; then echo "Rundlauf-Test bestanden"; exit 0; fi
echo "Rundlauf-Test: $FEHLER Fehler"
exit 1
