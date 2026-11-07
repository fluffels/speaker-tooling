# Befehle

Kern: [docs/referenz/befehle.md](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.9.0/docs/referenz/befehle.md)

> On-demand-Referenz: jedes Skript aus `package.json` mit einem Halbsatz, wofür es da ist. Wann ein Gate grün sein muss, steht nur in [AGENTS.md](../../AGENTS.md). Diese Datei ist ein `CORE_DOCS`-Eintrag von `check:docdrift`: Fehlt hier ein Skript, wird das Gate rot.

## Erste Minute

```bash
npm run setup   # einmalig: Node-Check, Skill-Zeiger, npm install, Git-Hooks
npm run verify  # alle schnellen Gates auf einmal
```

## Alle Skripte

| Befehl | Wofür |
|---|---|
| `npm run setup` | Einmal-Einrichtung des Arbeitsplatzes |
| `npm run skills:sync` | Skill-Zeiger unter `.claude/skills/` aus `.agents/skills/` erzeugen oder prüfen |
| `npm run verify` | alle schnellen Gates in einer Kette, das Kommando vor jedem PR |
| `npm run verify:changed` | Lint und Tests nur für den geänderten Ausschnitt, kein Gate |
| `npm run verify:kompakt` | dieselbe Kette wie `verify`, kompakt berichtet, für Agenten |
| `npm run verify:full` | `verify` plus Coverage und Diff-Coverage vor dem Push |
| `npm test` | Vitest-Tests der Harness-Werkzeuge |
| `npm run test:watch` | Vitest im Watch-Modus beim Entwickeln |
| `npm run test:coverage` | Tests mit Coverage-Schwellen |
| `npm run typecheck` | TypeScript im `strict`-Modus ohne Ausgabe |
| `npm run lint` | ESLint ohne Warnungen |
| `npm run lint:prune` | veraltete Lint-Unterdrückungen entfernen |
| `npm run lint:suppress` | Lint-Baseline für bestehende Verstöße neu aufbauen |
| `npm run check:size` | Dateigröße gegen das Zeilen-Budget |
| `npm run check:contextsize` | Zeichen-Budget jeder `AGENTS.md` |
| `npm run check:anysuppress` | Ratchet auf begründete `any`-Ausnahmen |
| `npm run check:docdrift` | dokumentierte Kommandos, Doku-Links und Anker stimmen |
| `npm run check:factorylinks` | Links ins Fabrik-Repo stehen auf dem Sync-Tag |
| `npm run check:docmap` | jede Quelldatei ist in einem Tiefendoc abgedeckt |
| `npm run check:docgen` | generierte Doku-Abschnitte stimmen mit dem Repo überein |
| `npm run docs:gen` | generierte Doku-Abschnitte neu schreiben |
| `npm run check:internalrefs` | keine internen Bezüge und lokalen Pfade im öffentlichen Repo |
| `npm run check:factorydrift` | übernommene Fabrik-Dateien sind unverändert |
| `npm run factory:sync` | Fabrik-Dateien aus einem Tag der Fabrik übernehmen |
| `npm run check:steuerbytes` | keine Steuerbytes in Textdateien |
| `npm run check:lockfile` | Lockfile passt zur `package.json` |
| `npm run check:diffsize` | Größe des Änderungsausschnitts gegen die Merge-Base |
| `npm run check:diffcoverage` | Coverage der geänderten Zeilen |
| `npm run check:doctickets` | Doku führt keine als offen gelisteten Punkte, die längst erledigt sind |
