# Modul `app`: Deployable (Walking Skeleton)

> Tiefendoku zum Maven-Modul `backend/app` (Ring Projekt). Stack und Modulschnitt: [ADR 0001](../adr/0001-stack.md), [ADR 0002](../adr/0002-modulschnitt.md).

## Zweck

`app` ist das einzige Spring-Boot-Deployable. Es bündelt künftig die Fachmodule (je ein Maven-Modul, ADR 0002) und liefert heute nur das Walking Skeleton: ein Text aus PostgreSQL geht über REST an den Aufrufer. Es enthält keine Domänenlogik, nur Adapter.

## Quellordner

Jedes Java-Paket nennt einen Backtick-Pfad (Gate `check:docmap`):

- `backend/app/src/main/java`: Quellwurzel des Moduls.
- `backend/app/src/main/java/io/github/fluffels/speakertooling`: Basis-Paket mit `SpeakerToolingApplication` (Spring-Boot-Start).
- `backend/app/src/main/java/io/github/fluffels/speakertooling/begruessung`: Begrüßung lesen und ausliefern.

## Ports und Adapter

- Eingang: REST-Adapter `BegruessungController`, `GET /api/begruessung` liefert `{"text": …}`.
- Ausgang: Persistenz-Adapter `BegruessungLeser` (`JdbcClient`) liest `select text from app.begruessung where id = 1`, ohne Cache; ein per `psql` geänderter Text erscheint beim nächsten Aufruf.

## Datenbank

Schema `app`, Migrationen unter `backend/app/src/main/resources/db/migration/app` (Flyway, Boot-Autokonfiguration). `V1__begruessung.sql` legt die einzeilige Tabelle `app.begruessung` an und ist nach dem Merge unveränderlich (Flyway-Checksumme); Änderungen kommen als `V2`. Image und Major: `postgres:18`, in `compose.yaml` und im Test (`PostgresTestcontainer`) gleich; ein Major-Wechsel bricht bestehende Volumes.

## Konfiguration

Nur über Umgebungsvariablen, Vorlage `.env.example` (ohne Werte). `POSTGRES_PASSWORD` hat keinen Default: fehlt sie, bricht `docker compose up` mit einer Meldung ab, die die Variable nennt. `DB_CONNECTION_TIMEOUT_MS` (Standard 3000) begrenzt das Warten auf die Datenbank.

Fehlerseiten und Health geben nichts preis: `spring.web.error.include-stacktrace` und `include-message` stehen auf `never`, `management.endpoint.health.show-details` auf `never`, die Probe-Gruppen (`liveness`/`readiness`) sind aus. Boot 4 liest die Fehler-Properties unter `spring.web.error.*`, `server.error.*` wirkt nicht.

## Betrieb

```bash
cp .env.example .env            # POSTGRES_PASSWORD eintragen
docker compose up --build       # Datenbank und Backend
curl http://127.0.0.1:8080/api/begruessung
docker compose exec db psql -U speakertooling -d speakertooling -c "update app.begruessung set text = 'Neu' where id = 1"
docker compose stop db          # danach: GET /actuator/health liefert 503 {"status":"DOWN"}
```

## Tests

`./mvnw verify` im Ordner `backend` (JaCoCo-Bericht unter `backend/app/target/site/jacoco`). Integrationstests mit Testcontainers (`*IntegrationTest`, Surefire) decken den Lesepfad und den Datenbank-Ausfall ab; sie brauchen eine laufende Docker-Engine. Gezielt: `node scripts/gate-befehl.mjs testGezielt <java-datei>`.

Befehle in `.factory/projekt.json`: `befehle.coverage` ruft `node tools/mvn.mjs -B verify` (Maven Wrapper in `backend`), `befehle.testGezielt` ruft `node tools/test-gezielt.mjs` und nimmt nur repo-relative Pfade `backend/<modul>/src/{main,test}/java/…`; ein Muster ohne Treffer bleibt grün, das volle `./mvnw verify` fängt das.

## Offen

Flyway läuft heute einmal global (Schema `app`, eine Versionsfolge). Ob jedes Fachmodul eine eigene Flyway-Instanz mit eigenem Schema bekommt (ADR 0002), entscheidet das erste Fachmodul; ebenso die ArchUnit-Schichtregeln je Modul.
