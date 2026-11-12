import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, pruefeGraph, wartenNoetig } from "../../tools/produkt-graph.mjs";

const eintrag = (extra = {}) => ({
  manifest: "backend/app/pom.xml",
  name: "org.example:lib",
  version: "1.0",
  change_type: "added",
  scope: "runtime",
  vulnerabilities: [{ severity: "high", advisory_ghsa_id: "GHSA-1" }],
  ...extra,
});

it("neue Runtime-Abhängigkeit mit high oder critical ist ein Fund mit Manifest, Name, Version und ID", () => {
  expect(pruefeGraph([eintrag()])).toEqual(["backend/app/pom.xml: org.example:lib@1.0: GHSA-1"]);
  expect(pruefeGraph([eintrag({ vulnerabilities: [{ severity: "critical", advisory_ghsa_id: "GHSA-2" }] })]).length).toBe(1);
});

it("nur Advisories ab high werden gelistet, niedrigere fallen aus der Liste", () => {
  const v = [
    { severity: "low", advisory_ghsa_id: "GHSA-L" },
    { severity: "moderate", advisory_ghsa_id: "GHSA-M" },
    { severity: "high", advisory_ghsa_id: "GHSA-H" },
    { severity: "critical", advisory_ghsa_id: "GHSA-C" },
  ];
  expect(pruefeGraph([eintrag({ vulnerabilities: v })])).toEqual(["backend/app/pom.xml: org.example:lib@1.0: GHSA-H, GHSA-C"]);
});

it("moderate und low allein sind kein Fund", () => {
  const v = [{ severity: "moderate", advisory_ghsa_id: "GHSA-M" }, { severity: "low", advisory_ghsa_id: "GHSA-L" }];
  expect(pruefeGraph([eintrag({ vulnerabilities: v })])).toEqual([]);
});

it("Entwicklungs-Scope, entfernte und unbekannt-scopige Einträge sind kein Fund", () => {
  expect(pruefeGraph([eintrag({ scope: "development" })])).toEqual([]);
  expect(pruefeGraph([eintrag({ change_type: "removed" })])).toEqual([]);
  expect(pruefeGraph([eintrag({ scope: "unknown" })])).toEqual([]);
});

it("Einträge ohne oder mit leeren Advisories und eine leere Liste sind kein Fund", () => {
  expect(pruefeGraph([eintrag({ vulnerabilities: [] })])).toEqual([]);
  expect(pruefeGraph([eintrag({ vulnerabilities: undefined })])).toEqual([]);
  expect(pruefeGraph([])).toEqual([]);
});

it("mehrere Funde stehen je in einer Zeile", () => {
  expect(pruefeGraph([eintrag(), eintrag({ name: "org.example:zwei" })]).length).toBe(2);
});

function mitDatei(inhalt: string, fn: (pfad: string, ausgabe: string[]) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "produkt-graph-"));
  const pfad = join(dir, "graph.json");
  writeFileSync(pfad, inhalt);
  const alt = [console.log, console.error];
  const ausgabe: string[] = [];
  console.log = console.error = (m: string) => void ausgabe.push(m);
  try { fn(pfad, ausgabe); } finally { [console.log, console.error] = alt; rmSync(dir, { recursive: true, force: true }); }
}

it("CLI: Exit 1 mit Fund in der Ausgabe, Exit 0 ohne Fund", () => {
  mitDatei(JSON.stringify([eintrag()]), (pfad, ausgabe) => {
    expect(main(pfad)).toBe(1);
    expect(ausgabe.some((z) => z.includes("GHSA-1"))).toBeTruthy();
  });
  mitDatei("[]", (pfad) => expect(main(pfad)).toBe(0));
});

const SKRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "produkt-graph.mjs");
// Der Workflow wertet nur den Exit-Code des Prozesses aus: die Verdrahtung am Dateiende muss ihn setzen.
function prozess(args: string[], inhalt: string): number | null {
  const dir = mkdtempSync(join(tmpdir(), "produkt-graph-prozess-"));
  try {
    const datei = join(dir, "eingabe.txt");
    writeFileSync(datei, inhalt);
    try {
      execFileSync(process.execPath, [SKRIPT, ...args, datei], { stdio: "ignore" });
      return 0;
    } catch (e) {
      return (e as { status: number | null }).status;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it("main: API-Fehlerobjekt (keine Liste) ist Exit 1 ohne Ausnahme", () => {
  mitDatei('{"message":"Not Found"}', (pfad) => expect(main(pfad)).toBe(1));
});

it("Prozess: Fund ist Exit 1, sauber Exit 0", () => {
  expect(prozess([], JSON.stringify([eintrag()]))).toBe(1);
  expect(prozess([], "[]")).toBe(0);
});

it("Prozess: API-Fehlerobjekt, leere und kaputte Datei sind fail-closed (Exit 1)", () => {
  expect(prozess([], '{"message":"Not Found"}')).toBe(1);
  expect(prozess([], "")).toBe(1);
  expect(prozess([], "kein json")).toBe(1);
});

it("Warten: pom.xml und .mvn/ auch in Unterordnern lösen es aus, andere Dateien nicht", () => {
  expect(wartenNoetig(["backend/pom.xml"])).toBe(true);
  expect(wartenNoetig(["pom.xml"])).toBe(true);
  expect(wartenNoetig(["backend/app/pom.xml"])).toBe(true);
  expect(wartenNoetig(["backend/.mvn/wrapper/maven-wrapper.properties"])).toBe(true);
  expect(wartenNoetig([".mvn/maven.config"])).toBe(true);
  expect(wartenNoetig(["frontend/package.json", "docs/x.md", "backend/app/src/Main.java"])).toBe(false);
  expect(wartenNoetig(["xpom.xml", "backend/foo.mvn/x"])).toBe(false);
  // rechte Grenzen und Punkt-Escape: Nachbarn von pom.xml und .mvn/ lösen nichts aus
  expect(wartenNoetig(["backend/pom.xml.orig", "pom.xml.versionsBackup", "backend/pomXxml"])).toBe(false);
  expect(wartenNoetig(["backend/.mvnrc", ".mvnx/a", "backend/xmvn/a", "backend/Xmvn/a"])).toBe(false);
  expect(wartenNoetig([])).toBe(false);
});

it("Prozess --warten: Exit 0 bei Treffer, 1 ohne", () => {
  expect(prozess(["--warten"], "docs/a.md\nbackend/.mvn/wrapper/maven-wrapper.properties\n")).toBe(0);
  expect(prozess(["--warten"], "docs/a.md\nfrontend/package.json\n")).toBe(1);
});
