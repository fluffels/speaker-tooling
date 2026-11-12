# 2026-11-12: Lieferkette des Produkts bewachen

## Ziel

Backend (Maven), Frontend (npm) und Docker-Images sind wie der Harness durch Dependabot, CodeQL und Audit bewacht (#11, Teil von #1).

## Modell

- **Dependabot** (`.github/dependabot.yml`, Projekt-Einträge am Ende, die Datei ist eine Vorlage und wird vom Sync nie überschrieben): `maven` in `/backend` (Parent-POM, Modul `app` hängt über `<modules>` daran), `npm` in `/frontend`, `docker` für beide Dockerfiles, `docker-compose` für `compose.yaml`. Alle wöchentlich montags mit Cooldown 7 Tage; Security-Updates sind vom Cooldown ausgenommen.
- **Gruppen:** Frontend `frontend-angular` (Angular-Familie samt vitest, weil `@angular/build` vitest per Peer bindet) vor `frontend-minor-patch`; Backend `maven-minor-patch`, Majors kommen einzeln.
- **Bewusst ignoriert:** Docker-Majors (Java- und Node-Major sind Stack-Entscheidungen, ADR 0001, `.nvmrc`), `postgres`-Major in der Compose-Datei (das Datenverzeichnis wäre inkompatibel), TypeScript-Major und -Minor im Frontend (der Bereich folgt Angular per `ng update`).
- **CodeQL:** `codeql.sprachen` in `.factory/projekt.json` enthält `java-kotlin`; `.github/workflows/codeql.yml` ist per `node scripts/projektwerte.mjs --write` erzeugt, der Build-Modus bleibt `none`.
- **Audit:** neuer Job `Frontend-Audit (npm audit)` in `produkt-ci.yml` fährt `npm audit --audit-level=high` auf `frontend/package-lock.json` und steht in `needs` von `Produkt-CI`. Der Name ist absichtlich nicht „Security-Audit (npm audit)“: das ist der Required Check aus `ci.yml` für das Root-Lockfile.

## Offen

- Transitive Maven-Abhängigkeiten stehen nicht im Dependency-Graph, Basis-Images sind nicht per Digest gepinnt (festgehalten in #24).
