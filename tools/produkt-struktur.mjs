#!/usr/bin/env node
// Struktur-Wächter des Produkts (#24): (1) jedes Basis-Image in Dockerfiles und Compose-Dateien ist per Digest gepinnt
// (`<tag>@sha256:<64 hex>`), damit ein neu gepushter Tag das gebaute Image nicht verändert; Dependabot pflegt den Digest.
// (2) Jeder Job in .github/workflows/produkt-ci.yml außer dem Aggregator `produkt-ci` steht in dessen `needs`
// (der Aggregator wertet nur `toJSON(needs)` aus, ein Job außerhalb von `needs` würde den Merge nicht blockieren).
// Exit 0 sauber, 1 bei Funden (Format `pfad:zeile: Meldung`) oder wenn keine Docker-/Compose-Datei gefunden wird.
// Grenzen, nicht erfasst: `docker run` in Workflow-Steps, Image-Literale in Java (Testcontainers), Images in anderen
// Workflow-Feldern (`container:`, `services:`), Compose-Dienste über `extends` oder `include`, Dateien außerhalb der geschlossenen
// Musterliste (`Dockerfile.dev`, `Containerfile`, `compose.override.yaml`; nur ein Fund von null Dateien schlägt fail-closed an).
// Der Wächter schützt sich nicht selbst: wer `struktur` aus `needs` streicht, nimmt ihn aus dem Merge-Block.
// Lokal: `node --test tools/produkt-struktur.test.mjs tools/produkt-graph.test.mjs && node tools/produkt-struktur.mjs` (`testGezielt` kennt nur Java-Pfade).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LineCounter, parseDocument } from "yaml";

const DIGEST = /@sha256:[0-9a-f]{64}$/;
const ZEILE_FROM = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i;

export function pruefeDockerfile(text, pfad) {
  const funde = [];
  const stages = new Set();
  text.split(/\r?\n/).forEach((zeile, i) => {
    const m = ZEILE_FROM.exec(zeile);
    if (!m) return;
    const [, ref, name] = m;
    const ausnahme = ref.toLowerCase() === "scratch" || stages.has(ref.toLowerCase());
    if (name) stages.add(name.toLowerCase());
    if (ausnahme || DIGEST.test(ref)) return;
    funde.push(`${pfad}:${i + 1}: FROM ${ref} ist nicht per @sha256-Digest gepinnt`);
  });
  return funde;
}

export function pruefeCompose(text, pfad) {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  const dienste = doc.get("services", true);
  const funde = [];
  for (const paar of dienste?.items ?? []) {
    const image = paar.value?.get?.("image", true);
    if (!image) continue;
    const ref = String(image.value);
    if (DIGEST.test(ref)) continue;
    const zeile = lc.linePos(image.range[0]).line;
    funde.push(`${pfad}:${zeile}: Dienst ${paar.key.value} nutzt ${ref} ohne @sha256-Digest`);
  }
  return funde;
}

export function pruefeNeeds(text, aggregator = "produkt-ci") {
  const jobs = parseDocument(text).get("jobs")?.toJSON?.() ?? {};
  const rest = Object.keys(jobs).filter((k) => k !== aggregator);
  if (!(aggregator in jobs)) return [`Job ${aggregator} fehlt in jobs`];
  const needs = jobs[aggregator]?.needs;
  if (needs === undefined) return [`Job ${aggregator} hat kein needs`];
  const eintraege = Array.isArray(needs) ? needs : [needs];
  return rest.filter((k) => !eintraege.includes(k)).map((k) => `Job ${k} fehlt in needs von ${aggregator}`);
}

// Git-Pathspec ohne :(glob): `*` passt auch über `/`, `**/x` verlangt aber einen Ordner, darum Wurzel-Muster extra.
const MUSTER = [
  "Dockerfile", "**/Dockerfile", "*.Dockerfile",
  "compose.y*ml", "**/compose.y*ml", "docker-compose.y*ml", "**/docker-compose.y*ml",
];
const CI = ".github/workflows/produkt-ci.yml";

export function main(wurzel = ".") {
  const dateien = execFileSync("git", ["ls-files", "--", ...MUSTER], { cwd: wurzel, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const funde = [];
  if (dateien.length === 0) funde.push("keine Dockerfile- oder Compose-Datei gefunden (Muster geändert?)");
  for (const d of dateien) {
    const text = readFileSync(`${wurzel}/${d}`, "utf8");
    funde.push(...(/(^|\/)Dockerfile$|\.Dockerfile$/.test(d) ? pruefeDockerfile(text, d) : pruefeCompose(text, d)));
  }
  funde.push(...pruefeNeeds(readFileSync(`${wurzel}/${CI}`, "utf8")).map((f) => `${CI}: ${f}`));
  funde.forEach((f) => console.error(`✖ ${f}`));
  if (funde.length === 0) console.log(`✔ Produkt-Struktur: ${dateien.length} Docker-Dateien gepinnt, needs vollständig`);
  return funde.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
