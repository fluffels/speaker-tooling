#!/usr/bin/env node
// Einmal-Einrichtung des Arbeitsplatzes (`npm run setup`, Projektdatei): Node-Version gegen engines.node prüfen, Git-Hooks verdrahten
// (core.hooksPath → .githooks), Skill-Zeiger erzeugen, Abhängigkeiten installieren. Nur Node-Builtins, läuft im frischen Klon vor dem ersten
// `npm install`. Bewusst ohne Testlauf: die Prüfung bleibt `node scripts/gate-befehl.mjs verifyKompakt`. Das Produkt (Backend, Frontend) baut die Produkt-CI.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { istDirektaufruf } from "./direktaufruf.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** `22.23.4` (auch `>=22.23.4`, `v22`) als [major, minor, patch]; unlesbar: null. */
export function version(text) {
  const m = /^\s*(?:>=\s*)?v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(text));
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** Erfüllt `haben` das Minimum `min` (beide Texte)? Unlesbar: nein. */
export function erfuellt(haben, min) {
  const h = version(haben);
  const m = version(min);
  if (!h || !m) return false;
  for (let i = 0; i < 3; i++) if (h[i] !== m[i]) return h[i] > m[i];
  return true;
}

function schritt(label, befehl, args) {
  console.log(`▶ ${label}`);
  try {
    execFileSync(befehl, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  } catch {
    console.error(`✖ Setup abgebrochen: Schritt „${label}“ ist fehlgeschlagen, Ursache steht oben; danach \`npm run setup\` erneut starten.`);
    process.exit(1);
  }
}

function main() {
  const engines = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).engines?.node;
  if (!erfuellt(process.versions.node, engines)) {
    console.error(`✖ Node ${engines ?? "?"} benötigt, gefunden ist ${process.versions.node}.`);
    process.exit(1);
  }
  console.log(`✓ Node ${process.versions.node} (engines.node ${engines})`);
  schritt("Git-Hooks verdrahten (core.hooksPath → .githooks)", "git", ["config", "core.hooksPath", ".githooks"]);
  schritt("Skill-Zeiger", "npm", ["run", "skills:sync", "--", "--prune"]);
  schritt("Abhängigkeiten installieren", "node", ["scripts/gate-befehl.mjs", "install"]);
  console.log("✅ Setup fertig. Prüfen: node scripts/gate-befehl.mjs verifyKompakt");
}

if (istDirektaufruf(import.meta.url)) main();
