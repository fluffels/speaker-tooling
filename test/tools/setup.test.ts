import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { erfuellt, version } from "../../scripts/setup.mjs";

it("version liest Mindestangaben mit und ohne Präfix, unlesbar ist null", () => {
  expect(version(">=22.23.4")).toEqual([22, 23, 4]);
  expect(version("v22")).toEqual([22, 0, 0]);
  expect(version("abc")).toBeNull();
  expect(version(undefined)).toBeNull();
  // Präfix außerhalb der Grammatik ist unlesbar, kein stilles [22, 0, 0]
  expect(version("^22.0.0")).toBeNull();
  expect(version("~22")).toBeNull();
  expect(version("x22")).toBeNull();
});

it("erfuellt vergleicht major, minor, patch; unlesbar ist nein", () => {
  expect(erfuellt("22.23.4", ">=22.23.4")).toBe(true);
  expect(erfuellt("23.0.0", ">=22.23.4")).toBe(true);
  expect(erfuellt("22.23.3", ">=22.23.4")).toBe(false);
  expect(erfuellt("21.99.99", ">=22.23.4")).toBe(false);
  expect(erfuellt("22.23.4", undefined)).toBe(false);
  expect(erfuellt("abc", ">=22.23.4")).toBe(false);
});

// Fehlerpfade des Skripts in einem Temp-Ordner außerhalb jedes Repos: keine Seiteneffekte auf das echte Repo.
function lauf(engines: string) {
  const tmp = mkdtempSync(join(tmpdir(), "setup-test-"));
  try {
    mkdirSync(join(tmp, "scripts"));
    copyFileSync("scripts/setup.mjs", join(tmp, "scripts", "setup.mjs"));
    copyFileSync("scripts/direktaufruf.mjs", join(tmp, "scripts", "direktaufruf.mjs"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ engines: { node: engines } }));
    const r = spawnSync(process.execPath, [join(tmp, "scripts", "setup.mjs")], { cwd: tmp, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } });
    return { status: r.status, aus: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

it("main: zu alte Node-Version bricht mit Exit 1 ab", () => {
  const r = lauf(">=999.0.0");
  expect(r.status).toBe(1);
  expect(r.aus).toMatch(/Node >=999\.0\.0 benötigt/);
});

it("main: fehlgeschlagener Schritt bricht mit Exit 1 und Abbruchmeldung ab", () => {
  const r = lauf(">=1.0.0");
  expect(r.status).toBe(1);
  expect(r.aus).toMatch(/Setup abgebrochen: Schritt „Git-Hooks verdrahten/);
});
