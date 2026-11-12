# Speaker-Tooling

Ein modulares Werkzeug für Speakerinnen und Autorinnen: Konferenzen und Call for Papers im Blick behalten, Talks und Einreichungen verwalten, Artikel und LinkedIn-Beiträge planen, Inhalte über Kanäle hinweg wiederverwenden.

## Module

| Modul | Inhalt |
|---|---|
| Konferenz-Radar | Konferenzen und CfPs, Watchlist, Fristen, Änderungserkennung, iCal-Export (MVP) |
| Speaker-Mappe | Talks, Auftritte, Einreichungen, Abstracts und Bios auf Deutsch und Englisch |
| Publikationen | Artikel-CfPs und Artikel-Pipeline mit Fristen |
| LinkedIn-Plan | Redaktionsplan, Kennzahlen aus dem offiziellen Export |
| Marken-Cockpit | Ziele und Meilensteine über alle Module |

## Stand

Das Repo ist frisch angelegt. Der Harness (Agenten-Regeln, Gates, Ticket-Ablauf) kommt aus der [Self-Improving Agent Harness and Factory](https://github.com/fluffels/self-improving-agent-harness-and-factory); Regeln für Agenten stehen in [AGENTS.md](AGENTS.md). Das Walking Skeleton wächst: das Backend (Spring Boot, PostgreSQL) läuft, das Frontend (Angular) zeigt den Text aus der Datenbank.

### Lokal starten

```bash
cp .env.example .env        # POSTGRES_PASSWORD eintragen (Pflicht), übrige Werte haben Defaults
docker compose up --build   # Datenbank, Backend und Frontend
curl http://127.0.0.1:8080/api/begruessung
# Startseite im Browser: http://127.0.0.1:8081
```

Datenbank sichern und zurückspielen: `bash betrieb/backup.sh`, `bash betrieb/restore.sh <datei>` ([docs/betrieb.md](docs/betrieb.md)).

Das Backend liefert den Text aus der Datenbank (`{"text": …}`); `GET /actuator/health` meldet 503 `DOWN`, wenn die Datenbank fehlt. Tests: `./mvnw verify` im Ordner `backend` (braucht Docker für Testcontainers). Frontend-Tests: `npx ng test --watch=false` im Ordner `frontend`. Details: [docs/module/app.md](docs/module/app.md), [docs/module/frontend.md](docs/module/frontend.md).

## Lizenz

Source-available, alle Rechte vorbehalten, siehe [LICENSE](LICENSE).
