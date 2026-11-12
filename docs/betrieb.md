# Betrieb: Sicherung und Wiederherstellung der Datenbank

Zwei Bash-Skripte unter `betrieb/` sichern die PostgreSQL-Datenbank und spielen eine Sicherung in eine leere Datenbank zurück. Sie laufen unter macOS (`/bin/bash` 3.2) und Linux (beides in der CI belegt) und sind Git-Bash-kompatibel geschrieben (nicht belegt, kein Windows-Host, siehe [Journal](journal/2026-11-12-backup-restore.md#compose-restore-auf-macos)). Relative Pfade (Sicherungsdatei, `BACKUP_DIR`) gelten ab der Repo-Wurzel, die Skripte wechseln dorthin.

## Sicherung

```bash
docker compose up -d --wait db    # POSTGRES_PASSWORD gesetzt (.env)
bash betrieb/backup.sh            # gibt nur den Pfad aus, z. B. backups/speakertooling-20261112-101500.sql
```

`backup.sh` ruft `pg_dump --format=plain --no-owner --no-privileges` auf und schreibt nach `backups/` (Ordner ist in `.gitignore`, Datei Modus 600). Die Datei entsteht erst als `*.unvollstaendig` und wird nur bei Erfolg umbenannt; eine vorhandene Datei wird nie überschrieben.

Ist der **Schutz aktiv** (siehe [Verschlüsselung einrichten](#verschlüsselung-einrichten)), läuft der Dump durch `age` und die Datei heißt `*.sql.age`; Klartext berührt die Platte nie. Ohne Schutz entsteht wie bisher Klartext-SQL (`*.sql`), und `backup.sh` warnt auf stderr („WARNUNG: Sicherung ist unverschlüsselt“).

## Wiederherstellung

```bash
bash betrieb/restore.sh backups/<datei>
BACKUP_SCHLUESSEL=<pfad-zur-schluesseldatei> bash betrieb/restore.sh backups/<datei>.sql.age   # verschlüsselte Sicherung
```

`restore.sh` erkennt das Format an der ersten Zeile. Eine verschlüsselte Sicherung braucht `BACKUP_SCHLUESSEL` (Exit 1, wenn er fehlt, unlesbar oder falsch ist, oder die Datei beschädigt oder abgeschnitten ist). Sie wird vor dem Einspielen einmal vollständig entschlüsselt (Prüflauf), erst danach fließt der Klartext in `psql`; so schreibt eine abgeschnittene Datei nie einen Teil in die Datenbank. Eine passphrasegeschützte Schlüsseldatei fragt `age` deshalb zweimal. Eine Klartext-Sicherung (Altbestand) wird bei gesetztem `BACKUP_SCHLUESSEL` mit Warnung eingespielt. Bekannte Grenze: erkannt wird nur der binäre `age`-Kopf; eine mit `age -a` armierte Datei oder eine Klartextdatei namens `*.sql.age` läuft als Klartext.

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
| `BACKUP_EMPFAENGER` | Datei mit öffentlichen `age`-Schlüsseln (nur `backup.sh`); gesetzt macht sie den Schutz aktiv | `$BACKUP_DIR/empfaenger.txt` |
| `BACKUP_SCHLUESSEL` | Datei mit der privaten `age`-Identität (nur `restore.sh`), nötig für `*.sql.age` | nicht gesetzt |

`.env` wird nicht gelesen; abweichende Werte in der Shell setzen. Exit-Codes: 1 Aufruf, Sicherungsdatei (fehlt, nicht lesbar, leer, nicht entschlüsselbar; die Meldung nennt den Pfad) oder, bei aktivem Schutz, eine abgelehnte unverschlüsselte Sicherung bzw. ein Fehler in `pg_dump` oder `age` (dann Exit 1 statt des Tool-Exits), 2 Ziel nicht leer, sonst der Exit von `psql` bzw. `pg_dump`. Achtung: `psql` meldet auch einen Verbindungsfehler (etwa eine nicht vorhandene Datenbank) mit Exit 2; unterscheiden lässt er sich nur an der Meldung. Lokale Client-Werkzeuge müssen Major 18 sein, weil `pg_dump` 18 eine `\restrict`-Zeile schreibt, die ältere `psql` nicht kennen.

## Verschlüsselung einrichten

Begriffe: **Empfängerdatei** enthält die öffentlichen `age`-Schlüssel (beliebig kopierbar), **Schlüsseldatei** die private Identität (geheim). **Schutz aktiv** heißt: `BACKUP_EMPFAENGER` ist gesetzt, oder `$BACKUP_DIR/empfaenger.txt` existiert, oder in `BACKUP_DIR` liegt schon eine `*.sql.age`. Die Wahl von `age` steht in [ADR 0003](adr/0003-sicherung-verschluesselung.md).

```bash
brew install age                                   # oder: sudo apt-get install age
age-keygen -o ~/.config/speaker-tooling/sicherung.key       # private Schlüsseldatei, außerhalb von Repo und backups/
age-keygen -y ~/.config/speaker-tooling/sicherung.key > backups/empfaenger.txt   # öffentlicher Schlüssel
bash betrieb/backup.sh                             # ab jetzt *.sql.age
```

- Ist der Schutz aktiv, **lehnt `backup.sh` eine unverschlüsselte Sicherung ab** (Exit 1, Meldung „unverschlüsselte Sicherung abgelehnt“, keine Datei): `age` fehlt, die Empfängerdatei fehlt oder ist ungültig, oder `age` schlägt fehl (der Fehler mitten im Strom meldet „Sicherung fehlgeschlagen“, Exit 1, ebenfalls ohne Datei). Es fällt nie auf Klartext zurück. Eine leer gesetzte `BACKUP_EMPFAENGER` zählt als gesetzt: ohne Standard-Empfängerdatei lehnt `backup.sh` ab, mit ihr wird die Standarddatei benutzt. Wer das auch für einen frischen oder geleerten Ordner will, setzt `BACKUP_EMPFAENGER` fest (zum Beispiel in der Shell-Konfiguration).
- Schlüsselablage: die private Schlüsseldatei nie in `backups/` oder im Repo, sondern im Passwortmanager und zusätzlich offline. Einen zweiten Empfänger (Notfallschlüssel) trägst du als weitere Zeile in die Empfängerdatei ein. **Geht der Schlüssel verloren, sind alle verschlüsselten Sicherungen unlesbar.**
- `age` authentifiziert keinen Absender: wer die Empfängerdatei kennt, kann eine gültige Sicherung bauen. Es bleibt bei „nur eigene Sicherungen einspielen“.

## Aufbewahrung und Löschen

Die Löschregel (nur dokumentiert, nicht automatisiert):

- Eine Sicherung liegt **höchstens 30 Tage**. Damit ist ein gelöschter Kontakt nach 30 Tagen aus allen Sicherungen verschwunden, außer aus der einen aufbewahrten geprüften (nächste Regel).
- Die jüngste Sicherung mit bestandenem Probe-Restore bleibt immer liegen, auch wenn sie älter ist.
- Klartext-Sicherungen aus der Zeit vor dem Schutz löschst du, sobald die erste verschlüsselte Sicherung einen Probe-Restore bestanden hat.
- Kopien außer Haus (externe Platte, Cloud) gelten genauso und gehen nur verschlüsselt raus.

```bash
find backups \( -name '*.sql' -o -name '*.sql.age' \) -mtime +30            # erst ansehen
find backups \( -name '*.sql' -o -name '*.sql.age' \) -mtime +30 -delete    # dann löschen; empfaenger.txt ist ausgenommen
```

Ist die jüngste geprüfte Sicherung älter als 30 Tage, nimm sie vor dem `-delete` aus, zum Beispiel mit `! -name <datei>` direkt vor `-delete` (`find` wertet von links nach rechts, hinter `-delete` ist es zu spät); der Befehl allein kennt diese Regel nicht.

`rm` überschreibt auf SSD und APFS nicht sicher; gelöschte Reste schützt nur die Verschlüsselung.

## Sicherheit

- Eine Sicherung enthält künftig personenbezogene Daten (Kontakte, Honorare). Mit aktivem Schutz ist sie im Ruhezustand verschlüsselt; ohne Schutz ist sie Klartext, wird mit Warnung ausgegeben und gehört vor dem ersten Speichern solcher Daten eingerichtet. Sie bleibt lokal und ist nie ein CI-Artefakt; die CI nutzt nur synthetische Daten und Wegwerf-Schlüssel.
- Nur eigene Sicherungen einspielen: eine SQL-Datei kann `psql`-Metabefehle enthalten und ist ausführbarer Code.
- Außerhalb des Schutzziels: wer Schreibzugriff auf dein Home-Verzeichnis hat, kann die Empfängerdatei austauschen.

## Test

`bash betrieb/test-rundlauf.sh` (Voraussetzung: `age` und `age-keygen` installiert) legt eigene Datenbanken (`st_rundlauf_*`) an, sichert, spielt zurück, vergleicht Zeilen und Sequenz und prüft die Negativfälle (auch die Ablehnung einer unverschlüsselten Sicherung bei aktivem Schutz, den Prüflauf und die Warnung); die echte Datenbank bleibt unberührt. Die Produkt-CI fährt ihn im Job `betrieb-linux` (Compose-Datenbank, `age` aus apt, dazu `shellcheck`) und im Job `betrieb-macos` (Homebrew `postgresql@18` und `age`, `DB_EXEC=`, geprüft mit `/bin/bash` 3.2).
