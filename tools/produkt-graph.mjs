#!/usr/bin/env node
// Advisory-Prüfung des Dependency-Graph-Vergleichs (#24): liest die JSON-Antwort von
// `GET /repos/<repo>/dependency-graph/compare/<base>...<head>` und meldet jede NEU hinzugefügte Runtime-Abhängigkeit mit einem
// Advisory ab high. Gleicher Scope (runtime) und gleiche Schwelle (high) wie der Kern-Check dependency-review.yml.
// Aufruf: `node tools/produkt-graph.mjs <graph.json>`; Exit 0 sauber, 1 bei Funden. Grenzen: Einträge mit `scope: unknown`
// und Änderungen am Version-Bereich (`removed` plus `added` desselben Pakets zählen als neuer Eintrag) werden nicht gesondert behandelt.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCHWELLE = new Set(["high", "critical"]);

export function pruefeGraph(changes) {
  return changes
    .filter((c) => c.change_type === "added" && c.scope === "runtime")
    .map((c) => ({ c, ids: (c.vulnerabilities ?? []).filter((v) => SCHWELLE.has(v.severity)).map((v) => v.advisory_ghsa_id) }))
    .filter(({ ids }) => ids.length > 0)
    .map(({ c, ids }) => `${c.manifest}: ${c.name}@${c.version}: ${ids.join(", ")}`);
}

export function main(pfad) {
  const funde = pruefeGraph(JSON.parse(readFileSync(pfad, "utf8")));
  if (funde.length === 0) {
    console.log("✔ Keine neue Runtime-Abhängigkeit mit Advisory ab high");
    return 0;
  }
  console.error("✖ Neue Runtime-Abhängigkeiten mit Advisory ab high:");
  funde.forEach((f) => console.error(`  ${f}`));
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv[2]);
