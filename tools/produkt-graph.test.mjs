import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, pruefeGraph } from "./produkt-graph.mjs";

const eintrag = (extra = {}) => ({
  manifest: "backend/app/pom.xml",
  name: "org.example:lib",
  version: "1.0",
  change_type: "added",
  scope: "runtime",
  vulnerabilities: [{ severity: "high", advisory_ghsa_id: "GHSA-1" }],
  ...extra,
});

test("neue Runtime-Abhängigkeit mit high oder critical ist ein Fund mit Manifest, Name, Version und ID", () => {
  assert.deepEqual(pruefeGraph([eintrag()]), ["backend/app/pom.xml: org.example:lib@1.0: GHSA-1"]);
  assert.equal(pruefeGraph([eintrag({ vulnerabilities: [{ severity: "critical", advisory_ghsa_id: "GHSA-2" }] })]).length, 1);
});

test("nur Advisories ab high werden gelistet, niedrigere fallen aus der Liste", () => {
  const v = [
    { severity: "low", advisory_ghsa_id: "GHSA-L" },
    { severity: "moderate", advisory_ghsa_id: "GHSA-M" },
    { severity: "high", advisory_ghsa_id: "GHSA-H" },
    { severity: "critical", advisory_ghsa_id: "GHSA-C" },
  ];
  assert.deepEqual(pruefeGraph([eintrag({ vulnerabilities: v })]), ["backend/app/pom.xml: org.example:lib@1.0: GHSA-H, GHSA-C"]);
});

test("moderate und low allein sind kein Fund", () => {
  const v = [{ severity: "moderate", advisory_ghsa_id: "GHSA-M" }, { severity: "low", advisory_ghsa_id: "GHSA-L" }];
  assert.deepEqual(pruefeGraph([eintrag({ vulnerabilities: v })]), []);
});

test("Entwicklungs-Scope, entfernte und unbekannt-scopige Einträge sind kein Fund", () => {
  assert.deepEqual(pruefeGraph([eintrag({ scope: "development" })]), []);
  assert.deepEqual(pruefeGraph([eintrag({ change_type: "removed" })]), []);
  assert.deepEqual(pruefeGraph([eintrag({ scope: "unknown" })]), []);
});

test("Einträge ohne oder mit leeren Advisories und eine leere Liste sind kein Fund", () => {
  assert.deepEqual(pruefeGraph([eintrag({ vulnerabilities: [] })]), []);
  assert.deepEqual(pruefeGraph([eintrag({ vulnerabilities: undefined })]), []);
  assert.deepEqual(pruefeGraph([]), []);
});

test("mehrere Funde stehen je in einer Zeile", () => {
  assert.equal(pruefeGraph([eintrag(), eintrag({ name: "org.example:zwei" })]).length, 2);
});

function mitDatei(inhalt, fn) {
  const dir = mkdtempSync(join(tmpdir(), "produkt-graph-"));
  const pfad = join(dir, "graph.json");
  writeFileSync(pfad, inhalt);
  const alt = [console.log, console.error];
  const ausgabe = [];
  console.log = console.error = (m) => ausgabe.push(m);
  try { return fn(pfad, ausgabe); } finally { [console.log, console.error] = alt; rmSync(dir, { recursive: true, force: true }); }
}

test("CLI: Exit 1 mit Fund in der Ausgabe, Exit 0 ohne Fund", () => {
  mitDatei(JSON.stringify([eintrag()]), (pfad, ausgabe) => {
    assert.equal(main(pfad), 1);
    assert.ok(ausgabe.some((z) => z.includes("GHSA-1")));
  });
  mitDatei("[]", (pfad) => assert.equal(main(pfad), 0));
});
