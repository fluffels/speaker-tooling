# 2026-11-12: Transitive Maven-Abhängigkeiten und Digest-Pins

## Ziel

Die Lieferkette des Produkts hat keine Lücken jenseits von Dependabot: transitive Maven-Abhängigkeiten stehen im Dependency-Graph, Basis-Images sind unveränderlich referenziert (#24, Folge aus #11).

## Modell

- **Maven-Submission:** Job `backend-abhaengigkeiten` in `produkt-ci.yml` fährt `advanced-security/maven-dependency-submission-action` (SHA-gepinnt) auf `backend/` und lädt den aufgelösten Baum als Snapshot hoch. Danach prüft `actions/dependency-review-action` (nur auf PRs, Bedingung am Step) mit `fail-on-severity: high` und `retry-on-snapshot-warnings: true`, weil der Snapshot kurz nach dem Upload erst verfügbar wird. Ein Job statt zwei: ein Review-Job wäre auf `push` skipped und färbte den Aggregator `Produkt-CI` auf `main` rot.
- **Rechte:** `contents: write` nur an diesem Job (Snapshot-API). Fork-PRs haben nur ein Lese-Token, die Submission scheitert und `Produkt-CI` wird rot (bewusst fail-closed). Folge, als Entscheidung: Fork-PRs sind nur mit Bypass mergbar, weil der Required Check an einem Schreib-Token hängt; das Risiko eines Schreib-Tokens im Fork-Lauf wäre größer. Bekannte Grenze: das Token kann auch Tags, Releases und Nicht-`main`-Branches beschreiben (das Ruleset schützt nur `main`); kein Workflow startet auf Tags oder Releases, und Pushes mit `GITHUB_TOKEN` lösen keine CI aus. Die Submission-Action reicht das Token vermutlich auch an das `mvnw` des PRs weiter.
- **Digest-Pins:** alle fünf Basis-Images (`eclipse-temurin` jdk und jre, `node`, `nginx-unprivileged`, `postgres`) stehen als `<tag>@sha256:<Index-Digest>`; der Tag bleibt zur Lesbarkeit und für Dependabot, der den Digest unter demselben Tag auffrischt (Cooldown 7 Tage gilt auch dafür).
- **Wächter:** `tools/produkt-struktur.mjs` (Job `struktur`) macht `Produkt-CI` rot, wenn eine `FROM`-Zeile oder ein Compose-Image ohne Digest dasteht, und wenn ein Job in `produkt-ci.yml` nicht in `needs` des Aggregators steht (die Invariante stand seit #9 nur als Kommentar).
- **Kern-Check:** `dependency-review.yml` (Kern, nur upstream änderbar) läuft ohne Retry parallel und kann den Snapshot verpassen; belastbar ist der Produkt-Job.

## Beleg

- Wächter-Rot-Beleg vor dem Pinnen: fünf Funde (`backend/Dockerfile:2` und `:12`, `frontend/Dockerfile:2` und `:9`, `compose.yaml:5`), nach dem Pinnen Exit 0.
- Digest-Beobachtung: `docker pull postgres:17@sha256:<Digest von 18>` und `postgres --version` ergibt 18.6, der Digest entscheidet, nicht der Tag. `docker compose build` baut beide Images mit den Pins.
- Proben im PR und Nach-Merge-Belege: siehe PR #32.

## Offen

- `PostgresTestcontainer.java` nennt `postgres:…` als Literal (Testwerkzeug, nicht ausgeliefert): bewusst ungepinnt, Dependabot sieht es nicht.
- `produkt-ci.yml` baut die Docker-Images nicht; Dependabot-PRs zu Docker und Compose sind grün, ohne dass das Image gebaut wurde (festgehalten in #14).
