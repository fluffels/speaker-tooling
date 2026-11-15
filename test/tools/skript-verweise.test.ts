// Scan-Wächter (ST-37): jeder Verweis auf eine Datei unter scripts/ muss auf eine versionierte Datei zeigen. Anlass: der Factory-Sync
// löscht abgelöste Kern-Dateien (etwa lens-arm-lib.mjs) nicht im Ziel; ein toter Import in einem PreToolUse-Hook bricht jeden Agent-Aufruf.
// Geschlossene Liste der geprüften Muster: (a) statische `import … from "./x"` / `"../x"` und Re-Exports in git ls-files 'scripts/**/*.mjs|cjs',
// (b) dynamisches `import("./x")` mit Literal in denselben Dateien, (c) `node scripts/<datei>.(mjs|cjs)` in package.json › scripts und
// .github/workflows/*.yml. Nicht geprüft: zur Laufzeit zusammengesetzte Pfade, `require`, Verweise aus Markdown oder anderen Ordnern.
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']+)\1/g;
const AUFRUF = /\bnode\s+(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|cjs))\b/g;

const zeilen = (text: string) => text.split("\n");
const zeileVon = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Funde `datei:zeile: Meldung` für relative Importe in `text` (Datei `pfad`); `vorhanden` sind alle versionierten Pfade. */
export function pruefeImporte(pfad: string, text: string, vorhanden: Set<string>): string[] {
  const funde: string[] = [];
  for (const m of text.matchAll(IMPORT)) {
    const ziel = posix.normalize(posix.join(posix.dirname(pfad), m[2]));
    if (!vorhanden.has(ziel)) funde.push(`${pfad}:${zeileVon(text, m.index ?? 0)}: Import ${m[2]} zeigt auf keine versionierte Datei (${ziel})`);
  }
  return funde;
}

/** Funde für `node scripts/<datei>`-Aufrufe in einem Text (Skript-String oder Workflow). */
export function pruefeAufrufe(pfad: string, text: string, vorhanden: Set<string>): string[] {
  const funde: string[] = [];
  for (const m of text.matchAll(AUFRUF)) {
    if (!vorhanden.has(m[1])) funde.push(`${pfad}:${zeileVon(text, m.index ?? 0)}: Aufruf ${m[1]} zeigt auf keine versionierte Datei`);
  }
  return funde;
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);

it("Fixture: Import auf fehlende Datei ist ein Fund, vorhandene und mit ../ aufgelöste nicht", () => {
  const vorhanden = new Set(["scripts/a.mjs", "scripts/lib/b.mjs"]);
  const text = [
    `import { x } from "./lens-arm-lib.mjs";`,
    `import { y } from "./a.mjs";`,
    `export * from '../a.mjs';`,
    `const z = await import("./lib/fehlt.mjs");`,
  ].join("\n");
  const f = pruefeImporte("scripts/lib/c.mjs", text, vorhanden);
  expect(f).toEqual([
    "scripts/lib/c.mjs:1: Import ./lens-arm-lib.mjs zeigt auf keine versionierte Datei (scripts/lib/lens-arm-lib.mjs)",
    "scripts/lib/c.mjs:2: Import ./a.mjs zeigt auf keine versionierte Datei (scripts/lib/a.mjs)",
    "scripts/lib/c.mjs:4: Import ./lib/fehlt.mjs zeigt auf keine versionierte Datei (scripts/lib/lib/fehlt.mjs)",
  ]);
  expect(pruefeImporte("scripts/c.mjs", `import { y } from "./a.mjs";\nimport("./lib/b.mjs");`, vorhanden)).toEqual([]);
  expect(pruefeImporte("scripts/c.mjs", `import "node:fs";\nimport x from "vitest";`, vorhanden)).toEqual([]);
});

it("Fixture: ../ mit einfachen Quotes, Re-Export und Seiteneffekt-Import auf fehlende Datei sind Funde", () => {
  const vorhanden = new Set(["scripts/a.mjs"]);
  expect(pruefeImporte("scripts/lib/c.mjs", `export { q } from '../fehlt.mjs';`, vorhanden).length).toBe(1);
  expect(pruefeImporte("scripts/lib/c.mjs", `import { q } from "../../scripts/a.mjs";`, vorhanden)).toEqual([]);
  expect(pruefeImporte("scripts/c.mjs", `import "./fehlt.mjs";`, vorhanden).length).toBe(1);
  expect(pruefeImporte("scripts/c.mjs", `import "./a.mjs";`, vorhanden)).toEqual([]);
});

it("Fixture: node scripts/<datei> auf fehlende Datei ist ein Fund", () => {
  const vorhanden = new Set(["scripts/da.mjs"]);
  expect(pruefeAufrufe("package.json", `"x": "node scripts/fehlt.mjs && node scripts/da.mjs"`, vorhanden).length).toBe(1);
  expect(pruefeAufrufe("ci.yml", "run: node scripts/da.mjs --x\n", vorhanden)).toEqual([]);
  // ohne node-Präfix kein Aufruf; Unterordner werden geprüft
  expect(pruefeAufrufe("README", "siehe scripts/fehlt.mjs", vorhanden)).toEqual([]);
  expect(pruefeAufrufe("ci.yml", "run: node scripts/docs-gen/fehlt.mjs", vorhanden).length).toBe(1);
  expect(pruefeAufrufe("ci.yml", "run: node scripts/docs-gen/da.mjs", new Set(["scripts/docs-gen/da.mjs"]))).toEqual([]);
  expect(zeilen(pruefeAufrufe("ci.yml", "a\nrun: node scripts/fehlt.cjs\n", vorhanden)[0])[0]).toMatch(/ci\.yml:2: /);
});

it("Repo: jeder Import und Aufruf unter scripts/ zeigt auf eine versionierte Datei", () => {
  const alle = git("ls-files");
  const vorhanden = new Set(alle);
  const funde: string[] = [];
  for (const d of alle.filter((p) => /^scripts\/.*\.(mjs|cjs)$/.test(p))) {
    funde.push(...pruefeImporte(d, readFileSync(d, "utf8"), vorhanden));
  }
  const aufrufer = ["package.json", ...alle.filter((p) => /^\.github\/workflows\/.*\.ya?ml$/.test(p))];
  for (const d of aufrufer) funde.push(...pruefeAufrufe(d, readFileSync(d, "utf8"), vorhanden));
  expect(funde).toEqual([]);
});
