# 2026-11-04: Repo anlegen

## Ziel

Das Repo mit dem Harness der Fabrik (Tag `v0.8.0`, per `factory:sync`) aufsetzen und `npm run verify` so grün wie möglich machen. Dazu bekommt `docs/` die Grundstruktur des Projekt-Brains.

## Modell

Opus im Hauptchat für Planung und Entscheidungen, Sonnet für die Fleißarbeit (Seiten anlegen, Gates fahren).

## Rückschlag

Ein frisch synchronisiertes Repo besteht `verify` nicht:

- Übernommene Skills und Agenten verlinken auf Fabrik-Doku, die der Sync nicht mitliefert. `check:docdrift` meldet tote Links.
- `check:size` bricht bei einem fehlenden Quellordner mit Stacktrace ab, statt ihn zu überspringen.
- Zusätzlich fehlten Befehlsübersicht und Index, die `check:docdrift` erwartet.

## Learning

- Nach dem Sync zuerst `verify` fahren und die Befunde nach Ursache sortieren: eigene Doku fehlt, Fabrik-Dateien mit toten Links, Gates ohne Quellordner.
- Fabrik-Dateien werden im Projekt nicht repariert; die Ursachen gehören als Befund an die Fabrik.
