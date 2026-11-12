# Modul `frontend`: Angular-App (Walking Skeleton)

> Tiefendoku zur Angular-22-App in `frontend/` (Ring Projekt). Stack: [ADR 0001](../adr/0001-stack.md); das Backend steht in [Modul app](app.md).

## Zweck

Die App zeigt den Text, den das Backend aus der Datenbank liest. Sie ist ein Präsentations-Adapter ohne Domänenlogik: eine Komponente, ein HTTP-Aufruf, drei Zustände.

## Quellordner

Jeder Ordner mit TypeScript-Quellen nennt einen Backtick-Pfad (Gate `check:docmap`):

- `frontend/src/app`: Wurzel-Komponente `App` und Konfiguration (`app.config.ts`).
- `frontend/src/app/begruessung`: Komponente `Begruessung`, ruft `GET /api/begruessung` und zeigt das Ergebnis.

## Ports und Adapter

Die App nutzt den bestehenden REST-Port `GET /api/begruessung` des Backends, einen neuen Port gibt es nicht. In Compose liefert nginx die gebaute App aus und leitet `/api/` an `backend:8080` weiter (`frontend/nginx.conf`: Namensauflösung zur Laufzeit über den Docker-Resolver, damit ein neu gestartetes Backend wiedergefunden wird; ist es weg, antwortet nginx nach höchstens 3 s mit 502). Für `ng serve` leitet `frontend/proxy.conf.json` auf `127.0.0.1:8080` um.

## Zustände

- `laedt`: „Lädt …“, bis die Antwort da ist.
- `text`: der Text aus der Antwort.
- `fehler`: „Backend nicht erreichbar“ (`role="alert"`), bei HTTP-Fehler, Netzwerkfehler und bei einer Antwort ohne Textfeld; nie eine leere Seite.

## Betrieb

```bash
docker compose up --build         # Datenbank, Backend und Frontend
# Startseite: http://127.0.0.1:8081 (Port per FRONTEND_PORT in .env)
docker compose stop backend       # Seite zeigt nach Neuladen „Backend nicht erreichbar“
docker compose start backend      # nach Neuladen kommt der Text zurück
```

Entwickeln: `npm ci` und `npx ng serve` im Ordner `frontend` (mit laufendem Backend auf Port 8080).

## Tests

`npx ng test --watch=false` im Ordner `frontend` (mit `--coverage` zusätzlich der lcov-Bericht `frontend/coverage/frontend/lcov.info` für `check:diffcoverage`; Optionen in `angular.json` › `test`, gemessen werden `src/app/**/*.ts` ohne Specs; Bekannte Grenze: der Test-Bundler entfernt einen Export, den nichts importiert, die Diff-Coverage sieht solchen toten Code nicht; Vitest, Komponententests für Anzeige, Ladezustand und Fehlerfälle). Der Workflow `Produkt-CI` fährt im Job „Frontend (ng build, ng test)“ `ng build` und `ng test` auf jedem PR. Der Job `Produkt-CI` hängt per `needs` von allen Produkt-Jobs ab und ist Required Check im Ruleset `main-schutz`: ein roter Frontend-Test blockiert den Merge. Der Job „Frontend-Audit (npm audit)“ fährt `npm audit --audit-level=high` auf `frontend/package-lock.json` (inklusive Dev-Abhängigkeiten) und macht `Produkt-CI` bei einem high-Advisory rot; Dependabot hält das Frontend über `.github/dependabot.yml` aktuell.

## Offen

- Angular-ESLint kommt mit dem ersten Fachmodul; das Root-ESLint ignoriert `frontend/`, daher greift `check:anysuppress` dort erst damit.
- Browser-E2E (Playwright) in der CI.
