#!/usr/bin/env node
// Advisory-Prüfung des Dependency-Graph-Vergleichs (#24): liest die JSON-Antwort von
// `GET /repos/<repo>/dependency-graph/compare/<base>...<head>` und meldet jede NEU hinzugefügte Runtime-Abhängigkeit mit einem
// Advisory ab high. Gleicher Scope (runtime) und gleiche Schwelle (high) wie der Kern-Check dependency-review.yml.
// Aufruf: `node tools/produkt-graph.mjs <graph.json>`; Exit 0 sauber, 1 bei Funden, kaputter oder keine Liste enthaltender Eingabe (fail-closed).
// `node tools/produkt-graph.mjs --warten <dateien.txt>`: Exit 0, wenn die geänderten Dateien (je Zeile ein Pfad) die Maven-Auflösung berühren und der
// Workflow auf den Snapshot warten soll (`pom.xml`, `.mvn/`, auch in Unterordnern), sonst 1. Grenzen: Einträge mit `scope: unknown`
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

export function wartenNoetig(pfade) {
  return pfade.some((p) => /(^|\/)pom\.xml$|(^|\/)\.mvn\//.test(p));
}

export function main(pfad) {
  const daten = JSON.parse(readFileSync(pfad, "utf8"));
  if (!Array.isArray(daten)) {
    console.error("✖ Graph-Antwort ist keine Liste (API-Fehler?)");
    return 1;
  }
  const funde = pruefeGraph(daten);
  if (funde.length === 0) {
    console.log("✔ Keine neue Runtime-Abhängigkeit mit Advisory ab high");
    return 0;
  }
  console.error("✖ Neue Runtime-Abhängigkeiten mit Advisory ab high:");
  funde.forEach((f) => console.error(`  ${f}`));
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [a, b] = process.argv.slice(2);
  process.exitCode = a === "--warten" ? (wartenNoetig(readFileSync(b, "utf8").split("\n").filter(Boolean)) ? 0 : 1) : main(a);
}
