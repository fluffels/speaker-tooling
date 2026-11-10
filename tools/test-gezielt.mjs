#!/usr/bin/env node
// Gezielter Test für `node scripts/gate-befehl.mjs testGezielt <datei>` (Backend, Maven/Surefire).
// `backend/<modul>/src/test/java/<paket>/<Klasse>.java` → genau diese Klasse; `backend/<modul>/src/main/java/<paket>/<Klasse>.java` → `<paket>/*Test`
// (Konvention: Tests heißen `<Name>Test`/`<Name>IntegrationTest` und liegen im selben Paket). Das Modul und seine Abhängigkeiten werden gebaut (`-pl <modul> -am`).
// Andere Pfade: Exit 2 mit Meldung. Grenze: ein Muster ohne Treffer bleibt grün (`-Dsurefire.failIfNoSpecifiedTests=false`); das volle `./mvnw verify` fängt das.
import { fileURLToPath } from "node:url";
import { mvnStarten } from "./mvn.mjs";

const TEST = /^backend\/([^/]+)\/src\/test\/java\/(.+)\/([^/]+)\.java$/;
const MAIN = /^backend\/([^/]+)\/src\/main\/java\/(.+)\/[^/]+\.java$/;

/** Pur: `backend/...`-Pfade → Maven-Argumente; `null` bei einem Pfad außerhalb des Schemas. */
export function mavenArgumente(pfade) {
  const module = new Set();
  const muster = new Set();
  for (const roh of pfade) {
    const pfad = roh.replaceAll("\\", "/");
    const t = TEST.exec(pfad);
    const m = MAIN.exec(pfad);
    if (t) {
      module.add(t[1]);
      muster.add(`${t[2]}/${t[3]}`);
    } else if (m) {
      module.add(m[1]);
      muster.add(`${m[2]}/*Test`);
    } else {
      return null;
    }
  }
  if (module.size === 0) return null;
  return ["-B", "-pl", [...module].join(","), "-am", `-Dtest=${[...muster].join(",")}`, "-Dsurefire.failIfNoSpecifiedTests=false", "test"];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = mavenArgumente(process.argv.slice(2));
  if (args === null) {
    console.error("✖ testGezielt kennt nur Java-Dateien unter backend/<modul>/src/{main,test}/java/.\nFix: einen solchen Pfad angeben oder das volle ./mvnw verify fahren.");
    process.exitCode = 2;
  } else {
    process.exitCode = mvnStarten(args);
  }
}
