# Anlaufstellen: der Index des Projekt-Brains

Kern: [docs/referenz/anlaufstellen.md](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.11.0/docs/referenz/anlaufstellen.md)

> Das Projekt-Brain ist `docs/` (Prinzipien: ADR 0015 der Fabrik), diese Seite der Index. Erst hier die eine passende Seite wählen, dann mit dem `Read`-Werkzeug lesen, große Seiten abschnittsweise. Harte Regeln stehen nur in [AGENTS.md](../../AGENTS.md); hier steht nur, wo etwas liegt und wann man es liest. Laufender Stand (offene Arbeit) gehört in Issues und Board, nicht hierher.

## Regeln und Einstieg

| Seite | Wann lesen |
|---|---|
| [AGENTS.md](../../AGENTS.md) | vor jeder Arbeit, maßgeblich bei Konflikten |
| [README.md](../../README.md) | um Zweck, Module und Stand des Produkts zu verstehen |
| [Befehle](befehle.md) | wenn du ein Skript aus `package.json` nachschlägst |

## Module (Tiefendoku)

| Seite | Wann lesen |
|---|---|
| [Modul app](../module/app.md) | bevor du am Backend arbeitest: Deployable, Datenbankschema `app`, Betrieb mit `docker compose`, Tests mit `./mvnw verify`, Boot-4-Fallen |
| [Betrieb](../betrieb.md) | bevor du die Datenbank sicherst oder zurückspielst: `betrieb/backup.sh`, `betrieb/restore.sh`, leere Datenbank herstellen, Probe-Restore |
| [Modul frontend](../module/frontend.md) | bevor du an der Angular-App arbeitest: Zustände, nginx-Proxy auf das Backend, Betrieb mit `docker compose`, Tests mit `ng test` |

## Entscheidungen (ADRs, historisch)

| Seite | Wann lesen |
|---|---|
| [0001 Stack](../adr/0001-stack.md) | bevor eine Technikwahl (Java, Spring, Flyway, Angular, Testwerkzeuge) neu diskutiert wird |
| [0002 Modulschnitt](../adr/0002-modulschnitt.md) | bevor ein Modul geschnitten, ein Fremdschlüssel oder eine Kopplung zwischen Modulen gebaut wird |

## Journal

| Seite | Wann lesen |
|---|---|
| [2026-11-04 Repo anlegen](../journal/2026-11-04-repo-anlegen.md) | um zu verstehen, warum ein frisch synchronisiertes Repo `verify` nicht besteht |
| [2026-11-12 Produkt-CI als Required Check](../journal/2026-11-12-produkt-ci-required-check.md) | um zu verstehen, wie der Merge-Block durch Backend- und Frontend-Tests belegt wurde |
| [2026-11-12 Backup und Restore](../journal/2026-11-12-backup-restore.md) | um zu verstehen, wie Sicherung und Wiederherstellung der Datenbank gebaut und belegt wurden und was noch offen ist |
| [2026-11-12 Lieferkette des Produkts](../journal/2026-11-12-lieferkette-produkt.md) | um zu verstehen, wie Dependabot, CodeQL (Java) und Frontend-Audit das Produkt bewachen und belegt wurden |

## Von der Fabrik übernommen

| Seite | Wann lesen |
|---|---|
| [Entscheidungsprotokoll](../factory/entscheidungsprotokoll.md) | wenn ein Agent strittige Review-Blocker selbst entscheidet |
| [Codex-Einstieg](../codex/einstieg.md) | wenn ein Lauf mit Codex statt Claude Code gestartet wird |
