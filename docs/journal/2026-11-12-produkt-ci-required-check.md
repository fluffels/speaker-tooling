# 2026-11-12: Produkt-CI als Required Check

## Ziel

Die Produkt-CI blockiert den Merge, sobald Build oder Tests von Backend oder Frontend scheitern (#9, Teil von #1).

## Modell

Der Job `Produkt-CI` in `.github/workflows/produkt-ci.yml` hängt per `needs` von `backend` und `frontend` ab und läuft mit `if: always()`. Er liest `toJSON(needs)` über `env:` und ist nur grün, wenn die Liste nicht leer ist und jedes Ergebnis `success` lautet. `failure`, `cancelled` und `skipped` machen ihn rot. Der Kontext `Produkt-CI` steht seit PR #23 im Ruleset `main-schutz` und im Spiegel `.github/ruleset-main-schutz.json`.

Änderungsweg des Rulesets: `gh api -X PUT repos/fluffels/speaker-tooling/rulesets/26522425 --input <body>`. Der Body kam aus der GET-Antwort (`name`, `target`, `enforcement`, `conditions`, `bypass_actors`, `rules`) und unterschied sich vom Vorher-Stand nur um eine Zeile `"context": "Produkt-CI"`. Rückweg: den Vorher-Stand (GET vor dem PUT, gleicher Body ohne diese Zeile) per PUT zurückspielen. Vorher war kein anderer PR offen, der auf `produkt-ci.yml` hätte warten können.

## Beleg

PR #23, Negativprobe:

- Commit `78b1053` fügt `frontend/src/app/negativprobe.spec.ts` mit `expect(true).toBe(false)` hinzu. Der Job `Produkt-CI` meldet im Log `backend: success` und `frontend: failure` und endet rot ([Lauf](https://github.com/fluffels/speaker-tooling/actions/runs/43188622924/job/131082373319)).
- `gh pr checks 23 --required` zeigt `Produkt-CI fail`, daneben `Tests, Typecheck & Builds fail` (siehe Hinweis unten); `Backend (Maven verify)` blieb `pass`, `Frontend (ng build, ng test)` war `fail`.
- `gh pr view 23 --json mergeStateStatus` meldet `BLOCKED`, `mergeable` bleibt `MERGEABLE`.
- `gh pr merge 23 --squash` (nie `--auto` oder `--admin`) endete mit Exit 1: „Pull request fluffels/speaker-tooling#23 is not mergeable: the base branch policy prohibits the merge.“ Der PR blieb `OPEN`.
- Commit `0073a19` nimmt die Probe per `git revert` zurück. Danach ist `Produkt-CI` wieder `pass`, `Backend` und `Frontend` ebenfalls.

Vorher-Wert von `mergeStateStatus` vor dem Ruleset-PUT war `BLOCKED`, nicht `CLEAN`: `Tests, Typecheck & Builds` war schon vor der Probe rot, weil der Review- und Plan-Nachweis erst im letzten Commit steht. Die Probe belegt den Required Check deshalb über `gh pr checks --required` (`Produkt-CI fail` als Pflicht-Check) und den roten Einzelstatus von `Produkt-CI` selbst, nicht über `BLOCKED` allein.

## Learning

- Ein Sammel-Job mit `if: always()` und `needs` ist der stabile Required-Check-Name; einzelne Jobs können umbenannt werden, ohne das Ruleset anzufassen. Ein neuer Produkt-Job muss in `needs` eingetragen werden, sonst blockiert er den Merge nicht.
- Eine Negativprobe im PR eines Repos mit Nachweis-Gate ist nicht isoliert: das Nachweis-Gate hält den PR schon vorher auf `BLOCKED`. Den Pflicht-Check einzeln über `gh pr checks --required` belegen.
- Jeder Push vor dem Nachweis-Commit ist für `Tests, Typecheck & Builds` rot und zählt für den Festgefahren-Zähler (Schwelle 4). Vorarbeit lokal committen und gebündelt pushen.
- Die Required Checks im Ruleset haben keinen `integration_id`-Pin: ein gleichnamiger Status einer anderen App würde zählen. Als Befund an die Fabrik gemeldet.
