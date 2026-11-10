#!/usr/bin/env node
// Maven-Starter für die Projekt-Befehle (`befehle` in .factory/projekt.json): startet den Maven Wrapper im Ordner `backend`
// (`mvnw.cmd` unter Windows, sonst `./mvnw`) und reicht alle Argumente durch; der Exit-Code ist der von Maven.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..", "backend");

export function mvnStarten(args) {
  const windows = process.platform === "win32";
  const r = spawnSync(windows ? "mvnw.cmd" : "./mvnw", args, { cwd: BACKEND, stdio: "inherit", shell: windows });
  if (r.error) {
    console.error(`✖ Maven Wrapper konnte nicht starten: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = mvnStarten(process.argv.slice(2));
