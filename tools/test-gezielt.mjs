#!/usr/bin/env node
// Gezielter Test für `node scripts/gate-befehl.mjs testGezielt <datei>` (Backend, Maven/Surefire).
// `backend/<modul>/src/test/java/<paket>/<Klasse>.java` → genau diese Klasse; `backend/<modul>/src/main/java/<paket>/<Klasse>.java` → `<paket>/*Test`
// (Konvention: Tests heißen `<Name>Test`/`<Name>IntegrationTest` und liegen im selben Paket). Das Modul und seine Abhängigkeiten werden gebaut (`-pl <modul> -am`).
// Pfade: repo-relativ, mit `./`, absolut oder mit Backslashes; sie werden gegen die Repo-Wurzel (nicht das cwd) normalisiert.
// Andere Pfade (auch außerhalb der Wurzel): Exit 2 mit Meldung. Grenze: ein Muster ohne Treffer bleibt grün (`-Dsurefire.failIfNoSpecifiedTests=false`); das volle `./mvnw verify` fängt das.
// Verteilung nach Pfad: `LAEUFER` ordnet ein Präfix einem Läufer zu, heute nur `backend/` → Maven. `frontend/` → Vitest/Angular wäre der nächste Eintrag der Tabelle, ist bewusst nicht aktiv (außerhalb von `backend/` gilt weiter Exit 2).
import { posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mvnStarten } from "./mvn.mjs";

const WURZEL = fileURLToPath(new URL("..", import.meta.url));
const TEST = /^backend\/([^/]+)\/src\/test\/java\/(.+)\/([^/]+)\.java$/;
const MAIN = /^backend\/([^/]+)\/src\/main\/java\/(.+)\/[^/]+\.java$/;

/** Pur: ein Pfad (relativ, `./`, absolut, Backslashes) → POSIX-Pfad relativ zur Repo-Wurzel; `null` für die Wurzel selbst oder einen Pfad außerhalb. */
export function repoRelativ(roh, wurzel = WURZEL) {
  const rel = relative(wurzel, resolve(wurzel, roh.replaceAll("\\", "/"))).split(sep).join("/");
  if (rel === "" || rel === ".." || rel.startsWith("../") || posix.isAbsolute(rel)) return null;
  return rel;
}

/** Pur: repo-relative `backend/...`-Pfade → Maven-Argumente; `null` bei einem Pfad außerhalb des Schemas. */
export function mavenArgumente(pfade) {
  const module = new Set();
  const muster = new Set();
  for (const pfad of pfade) {
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

/** Verteiltabelle Präfix → Läufer: `argumente` baut die Läufer-Argumente aus repo-relativen Pfaden (`null` = ungültig). */
const LAEUFER = [{ praefix: "backend/", argumente: mavenArgumente }];

/** Normalisiert die Pfade, wählt den Läufer und startet ihn über `starte` (Standard Maven); Exit-Code 2 bei unbrauchbaren Pfaden. */
export function cli(argv, { wurzel = WURZEL, starte = mvnStarten } = {}) {
  const pfade = argv.map((roh) => repoRelativ(roh, wurzel));
  const gueltig = pfade.length > 0 && pfade.every((p) => p !== null);
  const laeufer = gueltig ? LAEUFER.find((l) => pfade.every((p) => p?.startsWith(l.praefix))) : undefined;
  const args = laeufer?.argumente(pfade) ?? null;
  if (args === null) {
    console.error(
      `✖ testGezielt kennt nur Java-Dateien unter backend/<modul>/src/{main,test}/java/ (Pfade gelten relativ zur Repo-Wurzel ${wurzel}; Pfad: ${argv.join(", ") || "keiner"}).\nFix: einen solchen Pfad angeben oder das volle ./mvnw verify fahren.`,
    );
    return 2;
  }
  return starte(args);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv.slice(2));
