# 2026-11-12: Backup und Restore der Datenbank

## Ziel

`betrieb/backup.sh` sichert die Datenbank, `betrieb/restore.sh <datei>` spielt eine Sicherung in eine leere Datenbank ein; ein Rundlauf-Test läuft in der Produkt-CI auf Linux und macOS mit bash 3.2 (#10, Teil von #1). Anleitung: [Betrieb](../betrieb.md).

## Modell

- Format: `pg_dump --format=plain --no-owner --no-privileges`, Restore per `psql -v ON_ERROR_STOP=1 --single-transaction`.
- `DB_EXEC` wählt den Weg: Standard `docker compose exec -T db` (Compose-Datenbank), leer gesetzt lokale Client-Werkzeuge. So läuft derselbe Code in Compose, auf dem Mac und im macOS-Runner ohne Docker.
- Leer-Kriterium: kein Schema außer `public` und den Systemschemata, keine Relation. Ein gestartetes Backend legt per Flyway das Schema `app` an, danach ist die Datenbank nicht leer; deshalb der Weg „Backend stoppen, `dropdb`/`createdb`, Restore, Backend starten“.
- Test: `betrieb/test-rundlauf.sh` mit eigenen Datenbanken (`st_rundlauf_*`), Sonderzeichen, NULL, Sequenzwert, beide Negativfälle.

## Beleg

- Lokal (macOS, `/bin/bash` 3.2.57, Compose-Datenbank `postgres:18`): `bash betrieb/test-rundlauf.sh` und `/bin/bash betrieb/test-rundlauf.sh` enden mit „Rundlauf-Test bestanden“.
- Red-Green (je einzeln verfälscht, Test rot, zurückgesetzt, grün): Leer-Prüfung auf „immer leer“, Dateiprüfung, `--single-transaction`, Relationsarten, Argumentzahl `-ne 1`, `! -f`, Leer-Prüfung und Überschreibschutz in `backup.sh`. Die Test-Lens fand zuerst sieben überlebende Verfälschungen; die Fälle dazu (kaputte Sicherung, Relationsarten, zwei Argumente, Verzeichnis, leerer Dump, vorhandene Datei über einen `date`-Stub) stehen jetzt im Test.
- CI-Läufe der Jobs `betrieb-linux` und `betrieb-macos`: siehe PR (Link folgt mit dem Lauf).

## Git-Bash-Lauf

Offen: Der Restore der Compose-Datenbank in eine leere Datenbank unter Git Bash ist noch nicht durchgeführt (Git Bash gibt es nur unter Windows, kein CI-Runner mit Linux-Containern dort). Runbook: [Probe-Restore](../betrieb.md#probe-restore-ohne-zerstörung). Befehle und Ausgabe kommen hierher, sobald er gelaufen ist.

## Learning

- macOS-Runner haben eine neuere Homebrew-bash vorn im `PATH`; Unterskripte im Test deshalb über `"$BASH" <skript>` starten, nie über den Shebang, sonst prüft der Lauf nicht bash 3.2.
- `pg_dump` 18 schreibt `\restrict`; ein älteres `psql` (der Linux-Runner bringt 16) kann die Datei nicht lesen. Deshalb laufen beide Werkzeuge im selben Container bzw. beide aus Homebrew 18.
- Die Prüfung „leer“ darf den Datenbanknamen nie in den SQL-Text setzen; sie fragt nur den Katalog der verbundenen Datenbank.
