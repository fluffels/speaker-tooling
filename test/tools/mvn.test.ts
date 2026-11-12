import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND, mvnStarten } from "../../tools/mvn.mjs";

type SpawnErgebnis = { status: number | null; error?: Error };

/** Test-Attrappe für `spawnSync`: liefert nur die Felder, die `mvnStarten` liest. */
function attrappe(ergebnis: SpawnErgebnis) {
  return vi.fn((..._args: unknown[]) => ergebnis) as unknown as typeof spawnSync & ReturnType<typeof vi.fn>;
}

afterEach(() => vi.restoreAllMocks());

describe("mvnStarten", () => {
  it("nutzt die echte Plattform und den Ordner backend der Repo-Wurzel, wenn nichts injiziert wird", () => {
    expect(BACKEND).toBe(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend"));
    const spawn = attrappe({ status: 0 });
    expect(mvnStarten(["-v"], { spawn })).toBe(0);
    const windows = process.platform === "win32";
    expect(spawn).toHaveBeenCalledWith(windows ? "mvnw.cmd" : "./mvnw", ["-v"], { cwd: join(BACKEND), stdio: "inherit", shell: windows });
  });

  it("startet unter Linux ./mvnw im Backend-Ordner ohne Shell und gibt den Status zurück", () => {
    const spawn = attrappe({ status: 3 });
    expect(mvnStarten(["-B", "verify"], { spawn, plattform: "linux" })).toBe(3);
    expect(spawn).toHaveBeenCalledWith("./mvnw", ["-B", "verify"], { cwd: BACKEND, stdio: "inherit", shell: false });
  });

  it("startet unter Windows mvnw.cmd mit Shell", () => {
    const spawn = attrappe({ status: 0 });
    expect(mvnStarten(["test"], { spawn, plattform: "win32" })).toBe(0);
    expect(spawn).toHaveBeenCalledWith("mvnw.cmd", ["test"], { cwd: BACKEND, stdio: "inherit", shell: true });
  });

  it("meldet einen Startfehler mit Exit 1 und Meldung", () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spawn = attrappe({ status: null, error: new Error("ENOENT") });
    expect(mvnStarten([], { spawn, plattform: "linux" })).toBe(1);
    expect(String(fehler.mock.calls[0]?.[0])).toContain("ENOENT");
  });

  it("wertet einen fehlenden Status (Signal-Abbruch) als Exit 1", () => {
    expect(mvnStarten([], { spawn: attrappe({ status: null }), plattform: "linux" })).toBe(1);
  });
});
