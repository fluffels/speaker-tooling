# Modell-Routing im Harness (#910, #1065)

Anker-Stub: Der Text dieser Seite steht im Factory-Repo; hier stehen nur die Überschriften, auf die der Kern verlinkt. Kern: [docs/model-routing.md](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.11.0/docs/model-routing.md)

## 1. Phasen-Matrix

Kern: [docs/model-routing.md#1-phasen-matrix](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.11.0/docs/model-routing.md#1-phasen-matrix)

### Messen

Kern: [docs/model-routing.md#messen](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.11.0/docs/model-routing.md#messen)

### Umsetzer-Kontext

Kern: [docs/model-routing.md#umsetzer-kontext](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.11.0/docs/model-routing.md#umsetzer-kontext)

#### Phasen-Schnitt: Vertrag, A/B-Regel, Messrezept

Kern: [docs/model-routing.md#phasen-schnitt-vertrag-ab-regel-messrezept](https://github.com/fluffels/self-improving-agent-harness-and-factory/blob/v0.11.0/docs/model-routing.md#phasen-schnitt-vertrag-ab-regel-messrezept)

## Cache-TTL je Subagent-Rolle (Projekt)

Der Kern-Agent `st-umsetzer` trägt `experimental.cacheTtl: 1h` im Frontmatter (aus dem Factory-Tag v0.11.0). Regel und Messung des Quell-Repos stehen im Abschnitt „Cache-TTL je Subagent-Rolle“ der Kern-Seite (Link oben).

| Rolle | TTL | Herkunft |
| --- | --- | --- |
| `st-umsetzer` | 1h | Messung des Factory-Quell-Repos (33 Läufe, Netto 1,28 $ zugunsten 1h), hier übernommen |

Entscheidung: Kern-Wert übernommen, weil die Preisverhältnisse und das Warte-Muster (Umsetzer wartet auf Lenses) gleich sind und dieses Projekt noch keine eigenen Läufe für eine Gegenrechnung hat. Eigene Gegenrechnung mit `node scripts/kontext-treiber.mjs --ttl --agent st-umsetzer` ab 10 eigenen Läufen; fällt das Netto dann unter 0, den Schlüssel aus dem Frontmatter entfernen und die Zeile streichen.
