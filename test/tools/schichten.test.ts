import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateByLayer } from "../../scripts/check-diffcoverage.mjs";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

type Modell = { quellwurzeln: string[]; endungen: string[] };
const layers = require(join(WURZEL, "scripts", "layers.cjs")) as {
  LAYERS: { PRESENTATION: string; APPLICATION: string; ENTRY: string; DOMAIN: string };
  layerOf: (datei: string) => string;
  SCHICHT_MODELL: Modell;
};
const { LAYERS, layerOf, SCHICHT_MODELL } = layers;

const projekt = JSON.parse(readFileSync(join(WURZEL, ".factory", "projekt.json"), "utf8")) as { struktur: { quelle: string[]; endungen: string[] } };
const config = JSON.parse(readFileSync(join(WURZEL, "scripts", "docs-gen", "config.json"), "utf8")) as { schichten?: { layers?: string } };

const JAVA = "backend/app/src/main/java/io/github/fluffels/speakertooling/";
const MODULE = readdirSync(join(WURZEL, "backend"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(WURZEL, "backend", e.name, "src", "main", "java")))
  .map((e) => e.name);

/** Alle Dateien unter `ordner` (POSIX-Pfade relativ zur Repo-Wurzel). */
function dateienUnter(ordner: string): string[] {
  return readdirSync(join(WURZEL, ordner), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? dateienUnter(posix.join(ordner, e.name)) : [posix.join(ordner, e.name)]));
}

describe("Schicht-Definition scripts/layers.cjs", () => {
  it("steht in der Config unter schichten.layers (Vertrag von check:diffcoverage)", () => {
    expect(config.schichten?.layers).toBe("scripts/layers.cjs");
  });

  it("nennt die vier Schicht-IDs der Floors", () => {
    expect(Object.values(LAYERS).sort()).toEqual(["anwendung", "domaene", "einstieg", "praesentation"]);
  });

  it("trägt jedes Maven-Modul mit Java-Quellen als Quellwurzel ein", () => {
    expect(MODULE.length).toBeGreaterThan(0);
    for (const modul of MODULE) {
      const basis = posix.join("backend", modul, "src", "main", "java", "io", "github", "fluffels", "speakertooling") + "/";
      expect(existsSync(join(WURZEL, basis)), `${basis} fehlt auf der Platte`).toBe(true);
      expect(SCHICHT_MODELL.quellwurzeln, `Modul ${modul}: Quellwurzel in scripts/layers.cjs ergänzen`).toContain(basis);
    }
  });

  it("deckt jede Nicht-Backend-Quellwurzel aus struktur.quelle ab und führt dieselben Endungen", () => {
    for (const quelle of projekt.struktur.quelle.filter((q) => !q.startsWith("backend/"))) {
      expect(SCHICHT_MODELL.quellwurzeln).toContain(`${quelle}/`);
    }
    expect(SCHICHT_MODELL.endungen).toEqual(projekt.struktur.endungen);
  });

  it("klassifiziert SpeakerToolingApplication als Einstieg", () => {
    expect(layerOf(`${JAVA}SpeakerToolingApplication.java`)).toBe(LAYERS.ENTRY);
  });

  it("klassifiziert Fachcode in Java und Angular als Auffang (Domäne), auch unter ähnlichem Namen", () => {
    expect(layerOf(`${JAVA}begruessung/BegruessungLeser.java`)).toBe(LAYERS.DOMAIN);
    expect(layerOf("frontend/src/app/begruessung/begruessung.ts")).toBe(LAYERS.DOMAIN);
    expect(layerOf(`${JAVA}begruessung/SpeakerToolingApplication.java`)).toBe(LAYERS.DOMAIN);
    expect(layerOf(`${JAVA}SpeakerToolingApplicationTest.java`)).toBe(LAYERS.DOMAIN);
  });

  it("liefert für jede reale Quelldatei eine bekannte Schicht", () => {
    const erlaubt = new Set(Object.values(LAYERS));
    const dateien = SCHICHT_MODELL.quellwurzeln.flatMap((w) => dateienUnter(w.replace(/\/$/, "")));
    expect(dateien.length).toBeGreaterThan(0);
    for (const datei of dateien) expect(erlaubt.has(layerOf(datei)), datei).toBe(true);
  });
});

describe("Negativfall: eine geänderte Java-Zeile ohne Test macht die Diff-Coverage rot", () => {
  const datei = `${JAVA}begruessung/BegruessungLeser.java`;
  const geaendert = new Map([[datei, new Set([10])]]);

  it("bewertet eine ungetestete Zeile (0 Treffer) als unter dem Domäne-Floor", () => {
    const lcov = new Map([[datei, new Map([[10, 0]])]]);
    const urteil = evaluateByLayer(geaendert, lcov) as { below: string[]; missing: string[] };
    expect(urteil.below).toEqual([LAYERS.DOMAIN]);
    expect(urteil.missing).toEqual([]);
  });

  it("lässt dieselbe Zeile mit Treffer grün", () => {
    const lcov = new Map([[datei, new Map([[10, 3]])]]);
    expect((evaluateByLayer(geaendert, lcov) as { below: string[] }).below).toEqual([]);
  });

  it("wertet eine ungetestete Zeile im Einstieg nur als Bericht (kein Floor)", () => {
    const einstieg = `${JAVA}SpeakerToolingApplication.java`;
    const lcov = new Map([[einstieg, new Map([[10, 0]])]]);
    expect((evaluateByLayer(new Map([[einstieg, new Set([10])]]), lcov) as { below: string[] }).below).toEqual([]);
  });
});
