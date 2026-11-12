#!/usr/bin/env bash
# Sichert die Datenbank als Klartext-SQL (pg_dump --format=plain) nach backups/ (nicht versioniert).
# Aufruf: bash betrieb/backup.sh   Ausgabe auf stdout: nur der Pfad der Sicherung. Einstellungen: gemeinsam.sh.
# BACKUP_DIR  Zielordner, Standard <Repo>/backups.
set -euo pipefail
umask 077

# shellcheck source=betrieb/gemeinsam.sh
. "$(dirname "${BASH_SOURCE[0]}")/gemeinsam.sh"

BACKUP_DIR="${BACKUP_DIR:-$WURZEL/backups}"
mkdir -p "$BACKUP_DIR"
datei="$BACKUP_DIR/${DB_NAME}-$(date +%Y%m%d-%H%M%S).sql"
if [ -e "$datei" ]; then
  fehler "Sicherungsdatei existiert schon, nichts überschrieben: $datei"
  exit 1
fi

tmp="$datei.unvollstaendig"
trap 'rm -f "$tmp"' EXIT
# shellcheck disable=SC2086
$DB_EXEC pg_dump -U "$DB_USER" -d "$DB_NAME" --format=plain --no-owner --no-privileges > "$tmp"
if [ ! -s "$tmp" ]; then
  fehler "Sicherung ist leer, verworfen: $datei"
  exit 1
fi
mv "$tmp" "$datei"
fehler "Sicherung geschrieben (Klartext, nur eigene Daten, nicht weitergeben)."
echo "$datei"
