#!/usr/bin/env bash
# Sichert die Datenbank (pg_dump --format=plain) nach backups/ (nicht versioniert): mit age verschlüsselt (*.sql.age),
# sobald der Schutz aktiv ist, sonst als Klartext-SQL mit Warnung.
# Aufruf: bash betrieb/backup.sh   Ausgabe auf stdout: nur der Pfad der Sicherung. Einstellungen: gemeinsam.sh.
# BACKUP_DIR         Zielordner, Standard <Repo>/backups.
# BACKUP_EMPFAENGER  Datei mit öffentlichen age-Schlüsseln; gesetzt macht sie den Schutz aktiv. Standard $BACKUP_DIR/empfaenger.txt.
# Schutz aktiv: BACKUP_EMPFAENGER gesetzt, ODER die Standard-Empfängerdatei existiert, ODER in BACKUP_DIR liegt schon eine *.sql.age.
# Ist der Schutz aktiv, lehnt das Skript ab (Exit 1, keine Datei), statt Klartext zu schreiben; auch ein leer gesetztes BACKUP_EMPFAENGER zählt als gesetzt (ohne Standard-Empfängerdatei wird abgelehnt).
set -euo pipefail
umask 077

# shellcheck source=betrieb/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

BACKUP_DIR="${BACKUP_DIR:-$WURZEL/backups}"
mkdir -p "$BACKUP_DIR"

schutz=0
if [ -n "${BACKUP_EMPFAENGER+x}" ] || [ -e "$BACKUP_DIR/empfaenger.txt" ]; then schutz=1; fi
for alt in "$BACKUP_DIR"/*.sql.age; do
  if [ -e "$alt" ]; then schutz=1; fi
done
BACKUP_EMPFAENGER="${BACKUP_EMPFAENGER:-$BACKUP_DIR/empfaenger.txt}"

abgelehnt() {
  fehler "Schutz aktiv, unverschlüsselte Sicherung abgelehnt: $1"
  exit 1
}
if [ "$schutz" = 1 ]; then
  command -v age >/dev/null 2>&1 || abgelehnt "age ist nicht installiert (docs/betrieb.md, Abschnitt Verschlüsselung)"
  if [ ! -f "$BACKUP_EMPFAENGER" ] || [ ! -r "$BACKUP_EMPFAENGER" ]; then
    abgelehnt "Empfängerdatei fehlt oder ist nicht lesbar: $BACKUP_EMPFAENGER"
  fi
  age -R "$BACKUP_EMPFAENGER" </dev/null >/dev/null 2>&1 || abgelehnt "Empfängerdatei ist ungültig: $BACKUP_EMPFAENGER"
  endung=".sql.age"
else
  endung=".sql"
fi

datei="$BACKUP_DIR/${DB_NAME}-$(date +%Y%m%d-%H%M%S)$endung"
if [ -e "$datei" ]; then
  fehler "Sicherungsdatei existiert schon, nichts überschrieben: $datei"
  exit 1
fi

tmp="$datei.unvollstaendig"
trap 'rm -f "$tmp"' EXIT
if [ "$schutz" = 1 ]; then
  # Klartext berührt die Platte nie. Die Leer-Prüfung läuft im Strom (das Chiffrat ist wegen des Kopfs nie leer).
  set +e
  # shellcheck disable=SC2086
  $DB_EXEC pg_dump -U "$DB_USER" -d "$DB_NAME" --format=plain --no-owner --no-privileges \
    | { IFS= read -r zeile || exit 3; printf '%s\n' "$zeile"; cat; } \
    | age -R "$BACKUP_EMPFAENGER" > "$tmp"
  st=("${PIPESTATUS[@]}")
  set -e
  if [ "${st[1]}" -eq 3 ] && [ "${st[0]}" -eq 0 ]; then
    fehler "Sicherung ist leer, verworfen: $datei"
    exit 1
  fi
  if [ "${st[0]}" -ne 0 ] || [ "${st[1]}" -ne 0 ] || [ "${st[2]}" -ne 0 ]; then
    fehler "Sicherung fehlgeschlagen (pg_dump ${st[0]}, Strom ${st[1]}, age ${st[2]}), verworfen: $datei"
    exit 1
  fi
else
  # shellcheck disable=SC2086
  $DB_EXEC pg_dump -U "$DB_USER" -d "$DB_NAME" --format=plain --no-owner --no-privileges > "$tmp"
  if [ ! -s "$tmp" ]; then
    fehler "Sicherung ist leer, verworfen: $datei"
    exit 1
  fi
fi
mv "$tmp" "$datei"
if [ "$schutz" = 1 ]; then
  fehler "Sicherung geschrieben (mit age verschlüsselt, nur eigene Daten, nicht weitergeben)."
else
  fehler "WARNUNG: Sicherung ist unverschlüsselt (Schutz nicht aktiv); vor personenbezogenen Daten einrichten: docs/betrieb.md, Abschnitt Verschlüsselung."
fi
echo "$datei"
