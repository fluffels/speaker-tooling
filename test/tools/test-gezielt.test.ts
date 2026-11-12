import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { cli, mavenArgumente, repoRelativ } from "../../tools/test-gezielt.mjs";

const WURZEL = resolve("/repo/wurzel");
const MAIN = "backend/app/src/main/java/io/github/fluffels/speakertooling/begruessung/BegruessungLeser.java";
const TEST = "backend/app/src/test/java/io/github/fluffels/speakertooling/begruessung/BegruessungIntegrationTest.java";
const PAKET = "io/github/fluffels/speakertooling/begruessung";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("repoRelativ", () => {
  it("lässt einen repo-relativen Pfad unverändert", () => {
    expect(repoRelativ(MAIN, WURZEL)).toBe(MAIN);
  });

  it("entfernt ein führendes ./", () => {
    expect(repoRelativ(`./${MAIN}`, WURZEL)).toBe(MAIN);
  });

  it("macht einen absoluten Pfad in der Wurzel repo-relativ", () => {
    expect(repoRelativ(resolve(WURZEL, MAIN), WURZEL)).toBe(MAIN);
  });

  it("wandelt Backslashes in Schrägstriche", () => {
    expect(repoRelativ(MAIN.replaceAll("/", "\\"), WURZEL)).toBe(MAIN);
  });

  it("lehnt einen absoluten Pfad außerhalb der Wurzel ab", () => {
    expect(repoRelativ(resolve("/anderswo/backend/app/Datei.java"), WURZEL)).toBeNull();
  });

  it("lehnt einen Pfad ab, der per .. aus der Wurzel führt", () => {
    expect(repoRelativ(`../${MAIN}`, WURZEL)).toBeNull();
    expect(repoRelativ("..", WURZEL)).toBeNull();
  });

  it("lehnt die Wurzel selbst und den leeren Pfad ab", () => {
    expect(repoRelativ("", WURZEL)).toBeNull();
    expect(repoRelativ(WURZEL, WURZEL)).toBeNull();
  });
});

describe("mavenArgumente", () => {
  it("leitet aus einer Main-Datei das Muster <paket>/*Test ab", () => {
    expect(mavenArgumente([MAIN])).toEqual(["-B", "-pl", "app", "-am", `-Dtest=${PAKET}/*Test`, "-Dsurefire.failIfNoSpecifiedTests=false", "test"]);
  });

  it("nimmt bei einer Testdatei genau diese Klasse", () => {
    expect(mavenArgumente([TEST])).toContain(`-Dtest=${PAKET}/BegruessungIntegrationTest`);
  });

  it("fasst zwei Module zu -pl a,b zusammen", () => {
    const args = mavenArgumente([MAIN, "backend/zweit/src/main/java/a/b/C.java"]);
    expect(args?.slice(1, 3)).toEqual(["-pl", "app,zweit"]);
    expect(args).toContain(`-Dtest=${PAKET}/*Test,a/b/*Test`);
  });

  it("liefert null für einen Pfad außerhalb des Schemas und für eine leere Liste", () => {
    expect(mavenArgumente(["frontend/src/app/app.ts"])).toBeNull();
    expect(mavenArgumente([MAIN, "README.md"])).toBeNull();
    expect(mavenArgumente([])).toBeNull();
  });
});

describe("cli", () => {
  it("reicht die Maven-Argumente an den Starter und gibt dessen Exit-Code zurück", () => {
    const starte = vi.fn(() => 7);
    expect(cli([`./${MAIN}`], { wurzel: WURZEL, starte })).toBe(7);
    expect(starte).toHaveBeenCalledWith(mavenArgumente([MAIN]));
  });

  it("akzeptiert einen absoluten Pfad in der Wurzel", () => {
    const starte = vi.fn(() => 0);
    expect(cli([resolve(WURZEL, TEST)], { wurzel: WURZEL, starte })).toBe(0);
    expect(starte).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ein Frontend-Pfad", ["frontend/src/app/app.ts"]],
    ["ein absoluter Pfad außerhalb der Wurzel", [resolve("/anderswo/backend/app/src/main/java/a/B.java")]],
    ["ein Pfad mit ..", [`../${MAIN}`]],
    ["eine leere Liste", []],
    ["eine gemischte Liste aus gültigem und ungültigem Pfad", [MAIN, "frontend/src/app/app.ts"]],
  ])("endet bei %s mit Exit 2 und Meldung, ohne Maven zu starten", (_name, argv) => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const starte = vi.fn(() => 0);
    expect(cli(argv, { wurzel: WURZEL, starte })).toBe(2);
    expect(starte).not.toHaveBeenCalled();
    expect(fehler).toHaveBeenCalledTimes(1);
    expect(String(fehler.mock.calls[0]?.[0])).toContain("backend/<modul>/src/{main,test}/java/");
  });
});
