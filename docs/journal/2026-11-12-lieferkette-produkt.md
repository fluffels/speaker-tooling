# 2026-11-12: Lieferkette des Produkts bewachen

## Ziel

Backend (Maven), Frontend (npm) und Docker-Images sind wie der Harness durch Dependabot, CodeQL und Audit bewacht (#11, Teil von #1).

## Modell

- **Dependabot** (`.github/dependabot.yml`, Projekt-Einträge am Ende, die Datei ist eine Vorlage und wird vom Sync nie überschrieben): `maven` in `/backend` (Parent-POM, Modul `app` hängt über `<modules>` daran), `npm` in `/frontend`, `docker` für beide Dockerfiles, `docker-compose` für `compose.yaml`. Alle wöchentlich montags mit Cooldown 7 Tage; Security-Updates sind vom Cooldown ausgenommen.
- **Gruppen:** Frontend `frontend-angular` (Angular-Familie samt vitest, weil `@angular/build` vitest per Peer bindet) vor `frontend-minor-patch`; Backend `maven-minor-patch`, Majors kommen einzeln.
- **Bewusst ignoriert:** Docker-Majors (Java- und Node-Major sind Stack-Entscheidungen, ADR 0001, `.nvmrc`), `postgres`-Major in der Compose-Datei (das Datenverzeichnis wäre inkompatibel), TypeScript-Major und -Minor im Frontend (der Bereich folgt Angular per `ng update`).
- **CodeQL:** `codeql.sprachen` in `.factory/projekt.json` enthält `java-kotlin`; `.github/workflows/codeql.yml` ist per `node scripts/projektwerte.mjs --write` erzeugt, der Build-Modus bleibt `none`.
- **Audit:** neuer Job `Frontend-Audit (npm audit)` in `produkt-ci.yml` fährt `npm audit --audit-level=high` auf `frontend/package-lock.json` und steht in `needs` von `Produkt-CI`. Der Name ist absichtlich nicht „Security-Audit (npm audit)“: das ist der Required Check aus `ci.yml` für das Root-Lockfile.

## Beleg

PR #25:

- **AK3 (Frontend-Audit), Probe:** Commit `466cc2d` trägt `lodash@4.17.20` (high-Advisory) als devDependency in `frontend/package.json` und `frontend/package-lock.json` ein. `Frontend-Audit (npm audit)` endet rot ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43192109178/job/131093754069)), `Produkt-CI` ebenfalls rot und nennt im Log `backend: success`, `frontend: success`, `frontend-audit: failure` ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43192109178/job/131094141739)). Der Required Check `Security-Audit (npm audit)` bleibt grün, weil er nur das Root-Lockfile auditiert. Der Revert `4d94afc` macht `Frontend-Audit (npm audit)` und `Produkt-CI` wieder grün ([Frontend-Audit](https://github.com/fluffels/speaker-tooling/actions/runs/43192549804/job/131095245431), [Produkt-CI](https://github.com/fluffels/speaker-tooling/actions/runs/43192549804/job/131095646145)).
- **AK2 (CodeQL):** Der PR-Lauf zeigt den Job `CodeQL-Analyse (java-kotlin)` mit success ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43192109260/job/131093755746)); das Log nennt „Java was extracted with build-mode set to 'none'“. `gh api 'repos/fluffels/speaker-tooling/code-scanning/analyses?ref=refs/pull/25/merge'` enthält die Kategorie `/language:java-kotlin`, auf `main` gab es vorher nur `/language:javascript-typescript`, `/language:actions` und `zizmor`.
- **AK1 (Dependabot):** Dependabot liest die Konfiguration nur vom Default-Branch, der Beleg der Läufe steht deshalb als Kommentar am gemergten PR.

## Learning

- Dependency Review blieb bei der Probe grün, der `npm audit` des neuen Jobs fing dieselbe Advisory als high. Vermutete Ursache (nicht nachgeprüft): `dependency-review.yml` setzt kein `fail-on-scopes`, der Default der Action prüft nur `runtime`, die Probe lag in den devDependencies. Beide Gates ergänzen sich, keines ersetzt das andere.
- Die Lieferketten-Lücken jenseits von Dependabot (transitive Maven-Abhängigkeiten, Digest-Pins) stehen in #24.

## Offen

- Transitive Maven-Abhängigkeiten stehen nicht im Dependency-Graph, Basis-Images sind nicht per Digest gepinnt (festgehalten in #24).
