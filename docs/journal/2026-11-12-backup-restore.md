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
- CI-Läufe der Jobs `betrieb-linux` und `betrieb-macos`: siehe die Checks von PR #34 (`Betrieb (Backup/Restore, Linux)` mit shellcheck, `Betrieb (Backup/Restore, macOS, bash 3.2)` mit der Zeile der bash-Version).

## Compose-Restore auf macOS

AK 2 (angepasst: macOS statt Git Bash, es gibt keinen Windows-Host): Das Runbook aus [Betrieb](../betrieb.md#probe-restore-ohne-zerstörung) lief einmal auf macOS mit `/bin/bash` 3.2.57 gegen die Compose-Datenbank (`postgres:18`, Backend einmal gelaufen, Schema `app` vorhanden), danach der Weg „leere Datenbank herstellen“ für die Compose-Datenbank selbst. Der Text der Tabelle kam nach dem Restore unverändert zurück, das Backend lieferte ihn wieder aus.

```text
bash: 3.2.57(1)-release
$ /bin/bash betrieb/backup.sh
Sicherung geschrieben (Klartext, nur eigene Daten, nicht weitergeben).
<repo>/backups/speakertooling-20261112-122057.sql
[exit 0]
$ docker compose exec -T db createdb -U speakertooling speakertooling_probe
[exit 0]
$ env DB_NAME=speakertooling_probe /bin/bash betrieb/restore.sh backups/speakertooling-20261112-122057.sql
Sicherung eingespielt in speakertooling_probe: backups/speakertooling-20261112-122057.sql
[exit 0]
$ docker compose exec -T db psql -U speakertooling -d speakertooling_probe -c select * from app.begruessung
 id |         text          
----+-----------------------
  1 | Hallo Speaker-Tooling
(1 row)

[exit 0]
$ env DB_NAME=speakertooling_probe /bin/bash betrieb/restore.sh backups/speakertooling-20261112-122057.sql
Ziel-Datenbank speakertooling_probe ist nicht leer (gefundene Schemata: app ); nichts eingespielt.
[exit 2]
$ /bin/bash betrieb/restore.sh backups/gibt-es-nicht.sql
Sicherungsdatei fehlt oder ist nicht lesbar: backups/gibt-es-nicht.sql
[exit 1]
$ docker compose exec -T db dropdb -U speakertooling speakertooling_probe
[exit 0]
--- leere DB herstellen und Compose-DB zurückspielen ---
$ docker compose stop backend
 Container st-10-backend-1 Stopping 
 Container st-10-backend-1 Stopped 
[exit 0]
$ docker compose exec -T db dropdb -U speakertooling speakertooling
[exit 0]
$ docker compose exec -T db createdb -U speakertooling speakertooling
[exit 0]
$ /bin/bash betrieb/restore.sh backups/speakertooling-20261112-122057.sql
Sicherung eingespielt in speakertooling: backups/speakertooling-20261112-122057.sql
[exit 0]
$ docker compose exec -T db psql -U speakertooling -d speakertooling -c select * from app.begruessung
 id |         text          
----+-----------------------
  1 | Hallo Speaker-Tooling
(1 row)

[exit 0]
$ docker compose start backend
 Container st-10-db-1 Waiting 
 Container st-10-db-1 Healthy 
 Container st-10-backend-1 Starting 
 Container st-10-backend-1 Started 
[exit 0]
$ curl -s http://127.0.0.1:8090/api/begruessung
{"text":"Hallo Speaker-Tooling"}[exit 0]
```

Git Bash: nicht belegt, kein Windows-Host. Die Skripte sind Git-Bash-kompatibel geschrieben (bash 3.2, `tr -d '\r'`, keine Argumente mit führendem `/`), der Lauf unter Git Bash steht aus.

## Learning

- macOS-Runner haben eine neuere Homebrew-bash vorn im `PATH`; Unterskripte im Test deshalb über `"$BASH" <skript>` starten, nie über den Shebang, sonst prüft der Lauf nicht bash 3.2.
- `pg_dump` 18 schreibt `\restrict`; ein älteres `psql` (der Linux-Runner bringt 16) kann die Datei nicht lesen. Deshalb laufen beide Werkzeuge im selben Container bzw. beide aus Homebrew 18.
- Die Prüfung „leer“ darf den Datenbanknamen nie in den SQL-Text setzen; sie fragt nur den Katalog der verbundenen Datenbank.
