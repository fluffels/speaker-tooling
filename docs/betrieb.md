# Betrieb: Sicherung und Wiederherstellung der Datenbank

Zwei Bash-Skripte unter `betrieb/` sichern die PostgreSQL-Datenbank und spielen eine Sicherung in eine leere Datenbank zurück. Sie laufen unter macOS (`/bin/bash` 3.2) und Linux (beides in der CI belegt) und sind Git-Bash-kompatibel geschrieben (nicht belegt, kein Windows-Host, siehe [Journal](journal/2026-11-12-backup-restore.md#compose-restore-auf-macos)). Relative Pfade (Sicherungsdatei, `BACKUP_DIR`) gelten ab der Repo-Wurzel, die Skripte wechseln dorthin.

## Sicherung

```bash
docker compose up -d --wait db    # POSTGRES_PASSWORD gesetzt (.env)
bash betrieb/backup.sh            # gibt nur den Pfad aus, z. B. backups/speakertooling-20261112-101500.sql
```

`backup.sh` ruft `pg_dump --format=plain --no-owner --no-privileges` auf und schreibt nach `backups/` (Ordner ist in `.gitignore`, Datei Modus 600). Die Datei entsteht erst als `*.unvollstaendig` und wird nur bei Erfolg umbenannt; eine vorhandene Datei wird nie überschrieben.

## Wiederherstellung

```bash
bash betrieb/restore.sh backups/<datei>
```

Das Ziel (`DB_NAME`) muss leer sein: kein Schema außer `public` und den Systemschemata, keine Relation. Sonst bricht `restore.sh` mit Exit-Code 2 und der Meldung „Ziel-Datenbank … ist nicht leer“ ab und spielt nichts ein. Das Einspielen läuft in einer Transaktion (`psql -v ON_ERROR_STOP=1 --single-transaction`): ein Fehler lässt die Datenbank unverändert.

Eine vom Backend schon gestartete Datenbank ist nicht leer (Flyway legt das Schema `app` an). So stellst du eine leere Datenbank her:

1. Sicherung ziehen (`bash betrieb/backup.sh`) und prüfen, dass die Datei da und nicht leer ist.
2. Backend stoppen: `docker compose stop backend`.
3. `docker compose exec -T db dropdb -U speakertooling speakertooling`, dann `docker compose exec -T db createdb -U speakertooling speakertooling`.
4. `bash betrieb/restore.sh backups/<datei>`.
5. Backend starten: `docker compose start backend`.

## Probe-Restore ohne Zerstörung

```bash
docker compose up -d --wait db
bash betrieb/test-rundlauf.sh                      # Rundlauf mit eigenen Test-Datenbanken
bash betrieb/backup.sh                             # Pfad merken
docker compose exec -T db createdb -U speakertooling speakertooling_probe
DB_NAME=speakertooling_probe bash betrieb/restore.sh backups/<datei>
docker compose exec -T db psql -U speakertooling -d speakertooling_probe -c "select * from app.begruessung"   # Schema app gibt es, wenn das Backend einmal lief
DB_NAME=speakertooling_probe bash betrieb/restore.sh backups/<datei>   # Negativfall: Exit 2, „… ist nicht leer“ (sobald die Sicherung Tabellen enthielt, also nach einem Backend-Lauf)
bash betrieb/restore.sh backups/gibt-es-nicht.sql                      # Negativfall: Meldung mit Pfad, Exit 1
docker compose exec -T db dropdb -U speakertooling speakertooling_probe
```

## Variablen und Exit-Codes

| Variable | Bedeutung | Standard |
|---|---|---|
| `DB_EXEC` | Präfix für die PostgreSQL-Werkzeuge; leer gesetzt (`DB_EXEC=`) laufen lokale Client-Werkzeuge (`psql`, `pg_dump`) mit den üblichen `PG*`-Variablen | `docker compose exec -T db` |
| `DB_NAME` | Datenbank | `POSTGRES_DB`, sonst `speakertooling` |
| `DB_USER` | Benutzer | `POSTGRES_USER`, sonst `speakertooling` |
| `BACKUP_DIR` | Ordner der Sicherungen (nur `backup.sh`) | `backups/` im Repo |

`.env` wird nicht gelesen; abweichende Werte in der Shell setzen. Exit-Codes: 1 Aufruf oder Sicherungsdatei (fehlt, nicht lesbar, leer; die Meldung nennt den Pfad), 2 Ziel nicht leer, sonst der Exit von `psql` bzw. `pg_dump`. Achtung: `psql` meldet auch einen Verbindungsfehler (etwa eine nicht vorhandene Datenbank) mit Exit 2; unterscheiden lässt er sich nur an der Meldung. Lokale Client-Werkzeuge müssen Major 18 sein, weil `pg_dump` 18 eine `\restrict`-Zeile schreibt, die ältere `psql` nicht kennen.

## Sicherheit

- Eine Sicherung ist Klartext und enthält künftig personenbezogene Daten (Kontakte, Honorare). Sie bleibt lokal, ist unverschlüsselt und kein CI-Artefakt; alte Sicherungen löschst du selbst.
- Nur eigene Sicherungen einspielen: eine SQL-Datei kann `psql`-Metabefehle enthalten und ist ausführbarer Code.
- Verschlüsselung und Aufbewahrung sind noch offen und stehen als Folgearbeit an (Ticket #33).

## Test

`bash betrieb/test-rundlauf.sh` legt eigene Datenbanken (`st_rundlauf_*`) an, sichert, spielt zurück, vergleicht Zeilen und Sequenz und prüft die Negativfälle; die echte Datenbank bleibt unberührt. Die Produkt-CI fährt ihn im Job `betrieb-linux` (Compose-Datenbank, dazu `shellcheck`) und im Job `betrieb-macos` (Homebrew `postgresql@18`, `DB_EXEC=`, geprüft mit `/bin/bash` 3.2).
