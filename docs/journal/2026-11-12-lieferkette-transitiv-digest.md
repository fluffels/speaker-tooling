# 2026-11-12: Transitive Maven-Abhängigkeiten und Digest-Pins

## Ziel

Die Lieferkette des Produkts hat keine Lücken jenseits von Dependabot: transitive Maven-Abhängigkeiten stehen im Dependency-Graph, Basis-Images sind unveränderlich referenziert (#24, Folge aus #11).

## Modell

- **Maven-Submission:** Job `backend-abhaengigkeiten` in `produkt-ci.yml` fährt `advanced-security/maven-dependency-submission-action` (SHA-gepinnt) auf `backend/` und lädt den aufgelösten Baum als Snapshot hoch. Danach prüft ein eigener Schritt (nur auf PRs, Bedingung am Step) den Compare des Dependency-Graphs: er wartet bis 120 s auf den asynchron verarbeiteten Snapshot (nur wenn der PR eine `pom.xml` ändert) und schlägt bei neuen Runtime-Einträgen mit Advisory ab high fehl (Scope und Schwelle wie der Kern-Check). Entscheidung: eigener Schritt statt `actions/dependency-review-action`, weil die Action den Maven-Snapshot nachweislich nicht sieht (Beleg unten, Learning). Ein Job statt zwei: ein Review-Job wäre auf `push` skipped und färbte den Aggregator `Produkt-CI` auf `main` rot.
- **Rechte:** `contents: write` nur an diesem Job (Snapshot-API). Fork-PRs haben nur ein Lese-Token, die Submission scheitert und `Produkt-CI` wird rot (bewusst fail-closed). Folge, als Entscheidung: Fork-PRs sind nur mit Bypass mergbar, weil der Required Check an einem Schreib-Token hängt; das Risiko eines Schreib-Tokens im Fork-Lauf wäre größer. Bekannte Grenze: das Token kann auch Tags, Releases und Nicht-`main`-Branches beschreiben (das Ruleset schützt nur `main`); kein Workflow startet auf Tags oder Releases, und Pushes mit `GITHUB_TOKEN` lösen keine CI aus. Die Submission-Action reicht das Token vermutlich auch an das `mvnw` des PRs weiter.
- **Digest-Pins:** alle fünf Basis-Images (`eclipse-temurin` jdk und jre, `node`, `nginx-unprivileged`, `postgres`) stehen als `<tag>@sha256:<Index-Digest>`; der Tag bleibt zur Lesbarkeit und für Dependabot, der den Digest unter demselben Tag auffrischt (Cooldown 7 Tage gilt auch dafür).
- **Wächter:** `tools/produkt-struktur.mjs` (Job `struktur`) macht `Produkt-CI` rot, wenn eine `FROM`-Zeile oder ein Compose-Image ohne Digest dasteht, und wenn ein Job in `produkt-ci.yml` nicht in `needs` des Aggregators steht (die Invariante stand seit #9 nur als Kommentar).
- **Kern-Check:** `dependency-review.yml` (Kern, nur upstream änderbar) läuft ohne Retry parallel und kann den Snapshot verpassen; belastbar ist der Produkt-Job.

## Beleg

- Wächter-Rot-Beleg vor dem Pinnen: fünf Funde (`backend/Dockerfile:2` und `:12`, `frontend/Dockerfile:2` und `:9`, `compose.yaml:5`), nach dem Pinnen Exit 0.
- Digest-Beobachtung: `docker pull postgres:17@sha256:<Digest von 18>` und `postgres --version` ergibt 18.6, der Digest entscheidet, nicht der Tag. `docker compose build` baut beide Images mit den Pins.
- **AK (a), Probe:** Commit `93df2d4` setzt `<tomcat.version>11.0.2</tomcat.version>` (nur transitiv über den Starter; CVE-2025-24813). `Backend-Abhängigkeiten` endet rot und nennt `tomcat-embed-core@11.0.2` mit den Advisories ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43205276924/job/131138773396)), `Produkt-CI` ebenfalls rot ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43205276924/job/131139364385)). Die Compare-API zeigt `backend/app/pom.xml` mit 119 Einträgen samt Versionen: `org.apache.tomcat.embed:tomcat-embed-core@11.0.2`, `tools.jackson.core:jackson-databind@3.1.7`, `com.fasterxml.jackson.core:jackson-annotations@2.21`.
- **AK (b), Probe:** Commit `5463908` entpinnt `postgres` in `compose.yaml`: `Produkt-Struktur (Digest-Pins, needs)` endet rot ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43205564231/job/131139712871)), `Produkt-CI` rot ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43205564231/job/131140208655)).
- **Revert:** `Backend-Abhängigkeiten`, `Produkt-Struktur` und `Produkt-CI` sind wieder grün ([Backend-Abhängigkeiten](https://github.com/fluffels/speaker-tooling/actions/runs/43205814231/job/131140560264), [Produkt-CI](https://github.com/fluffels/speaker-tooling/actions/runs/43205814231/job/131140964674)).
- Nach-Merge-Belege (SBOM, Dependabot-Läufe) stehen als Kommentar am PR #32.

## Learning

- `actions/dependency-review-action` ruft die Compare-API mit `per_page=5` auf. Die API pagt dann nach Manifest und liefert ohne Link-Header nur das erste: im Probelauf listete die Action nur `.github/workflows/produkt-ci.yml`, die Tomcat-Probe blieb grün ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43203522745)). Nachgestellt: `gh api '…/compare/<base>...<head>?per_page=5'` liefert 2 Einträge, ohne `per_page` 121 samt `backend/app/pom.xml`. `retry-on-snapshot-warnings` hilft dagegen nicht. Dasselbe gilt für den Kern-Check `dependency-review.yml` (festgehalten als Kern-Befund).
- Die Submission-Action führt `mvnw` mit `cwd=directory` aus: ein relatives `directory: backend` sucht `backend/backend/mvnw` (Lauf 43203008303), darum der absolute Pfad.
- Der eigene Schritt ist an die Compare-API ohne Paging gebunden; sehr große Diffs könnten dort abgeschnitten werden (nicht gemessen).

## Offen

- `PostgresTestcontainer.java` nennt `postgres:…` als Literal (Testwerkzeug, nicht ausgeliefert): bewusst ungepinnt, Dependabot sieht es nicht.
- `produkt-ci.yml` baut die Docker-Images nicht; Dependabot-PRs zu Docker und Compose sind grün, ohne dass das Image gebaut wurde (festgehalten in #14).
