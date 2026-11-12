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
docker compose up --build       # Datenbank, Backend und Frontend (Port 8081, siehe frontend.md)
curl http://127.0.0.1:8080/api/begruessung
docker compose exec db psql -U speakertooling -d speakertooling -c "update app.begruessung set text = 'Neu' where id = 1"
docker compose stop db          # danach: GET /actuator/health liefert 503 {"status":"DOWN"}
```

## Tests

`./mvnw verify` im Ordner `backend` (JaCoCo-Bericht unter `backend/app/target/site/jacoco`). Integrationstests mit Testcontainers (`*IntegrationTest`, Surefire) decken den Lesepfad und den Datenbank-Ausfall ab; sie brauchen eine laufende Docker-Engine. Gezielt: `node scripts/gate-befehl.mjs testGezielt <java-datei>`. Der Job `Produkt-CI` hängt per `needs` von allen Produkt-Jobs ab und ist Required Check im Ruleset `main-schutz`: ein roter Backend-Test blockiert den Merge. Dependabot (Maven in `/backend`, Docker, Compose) und der CodeQL-Job `java-kotlin` bewachen die Lieferkette des Backends; der Job „Backend-Abhängigkeiten (Maven-Submission, Dependency Review)“ stellt den transitiven Maven-Baum in den Dependency-Graph und macht `Produkt-CI` bei einem Advisory ab high rot, die Basis-Images stehen per `@sha256`-Digest in `backend/Dockerfile` und `compose.yaml` (Wächter `tools/produkt-struktur.mjs`, lokal `node --test tools/produkt-struktur.test.mjs tools/produkt-graph.test.mjs && node tools/produkt-struktur.mjs`; die Advisory-Auswertung steht in `tools/produkt-graph.mjs`).

Befehle in `.factory/projekt.json`: `befehle.coverage` ruft `node tools/mvn.mjs -B verify` (Maven Wrapper in `backend`) und danach `ng test --coverage` im Frontend, `befehle.testGezielt` ruft `node tools/test-gezielt.mjs`. Das Skript normalisiert Pfade gegen die Repo-Wurzel (repo-relativ, mit `./`, absolut oder mit Backslashes) und verteilt nach Präfix an einen Läufer; heute gibt es nur `backend/<modul>/src/{main,test}/java/…` (Maven), jeder andere Pfad (auch `frontend/` und alles außerhalb der Wurzel) endet mit Exit 2 und Meldung. Ein Muster ohne Treffer bleibt grün, das volle `./mvnw verify` fängt das. Vitest für `frontend/` wäre der nächste Eintrag der Verteiltabelle in `tools/test-gezielt.mjs`.

**Diff-Coverage des Produkts:** Der Job `Backend (Maven verify)` fährt nach `./mvnw verify` den Frontend-Lauf `ng test --coverage` (lcov unter `frontend/coverage/frontend/lcov.info`) und dann `npm run check:diffcoverage` mit `FACTORY_DIFF_BASE`. Das Gate schneidet die geänderten Zeilen von `struktur.quelle` gegen die Berichte aus `coverage.berichte` (JaCoCo je Modul, Frontend-lcov) und bewertet sie je Schicht laut `scripts/layers.cjs`: Auffang `domaene` mit Floor 90 % (alles Java und Angular außer dem Einstieg), `SpeakerToolingApplication` als `einstieg` ohne Floor. Eine geänderte, ungetestete Zeile macht den Job rot; ein Ausweg ist nur die Commit-Zeile `ST-Diffcov-Override: #<nr> <warum>` mit Ticket (ein fehlender Bericht ist ein Messfehler und lässt sich nicht per Override durchlassen). Der Harness-Job in `ci.yml` misst nur die Vitest-Werkzeuge (`tools/`, `scripts/layers.cjs`, Schwellen 89/87).

## Offen

Flyway läuft heute einmal global (Schema `app`, eine Versionsfolge). Ob jedes Fachmodul eine eigene Flyway-Instanz mit eigenem Schema bekommt (ADR 0002), entscheidet das erste Fachmodul; ebenso die ArchUnit-Schichtregeln je Modul. Die Schicht-Definition `scripts/layers.cjs` kennt heute nur Einstieg und Auffang; ein neues Maven-Modul trägt seine Quellwurzel dort ein (der Wächter-Test `test/tools/schichten.test.ts` schlägt sonst an), die Schichten je Fachmodul legt das erste Fachmodul zusammen mit den ArchUnit-Regeln fest.
