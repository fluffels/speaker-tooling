// Schicht-Definition dieses Repos: die Schichtdaten (ADR 0022 F7).
//
// Hier steht, was dem Repo gehört: Schicht-IDs, Wurzeln, Labels und die erlaubten Import-Richtungen (`SCHICHT_MODELL`).
// Prüfung und Ableitung (Muster, Klassifikation, Coverage-Globs) liegen im Kern `scripts/schichten-kern.cjs`; die
// modellgebundenen Werte unten (`layerOf`, `NON_DOMAIN`, `COVERAGE_GLOBS`) leitet dieser aus dem Modell ab.
//
// Die vier Schicht-IDs (`LAYERS`) sind der Vertrag der Diff-Coverage-Floors (`scripts/check-diffcoverage.mjs`): sie bleiben
// vier, auch wenn heute nur zwei Schichten Wurzeln tragen. Fail-closed: alles Übrige unter den Quellwurzeln (Java und
// Angular) ist die Auffang-Schicht `domaene` mit dem Floor 90 %; nur `SpeakerToolingApplication` (`main()` läuft in keinem
// Test) ist `einstieg` ohne Floor. Anwendung und Präsentation tragen bewusst keine leeren Schichten: eine leere Schicht
// mit `wurzeln: []` wäre ein zweiter Auffang. Die Schichten je Fachmodul legt das erste Fachmodul mit den ArchUnit-Regeln
// fest (docs/module/app.md › Offen).
//
// Quellwurzeln: je Maven-Modul `backend/<modul>/src/main/java/<basis-paket>/` und `frontend/src/app/`. Ein neues Maven-Modul
// trägt seine Quellwurzel hier ein; der Wächter-Test test/tools/schichten.test.ts schlägt sonst an.
//
// Bewusst .cjs (kein .mjs): Konfigurationen dritter Werkzeuge sind CommonJS und `require`n diese Datei direkt; ESM-Skripte
// ziehen sie über `createRequire`.

const kern = require("./schichten-kern.cjs");

/** Kanonische Schicht-Buckets. */
const LAYERS = {
  PRESENTATION: "praesentation",
  APPLICATION: "anwendung",
  ENTRY: "einstieg",
  DOMAIN: "domaene",
};

/** Quellwurzeln: Verzeichnisse mit Slash am Ende, gleich `struktur.quelle` der Projekt-Config (Java bis ins Basis-Paket). */
const QUELLWURZELN = ["backend/app/src/main/java/io/github/fluffels/speakertooling/", "frontend/src/app/"];

/** Endungen der Quelldateien, gleich `struktur.endungen` der Projekt-Config. */
const ENDUNGEN = [".java", ".ts"];

/** Schicht-Modell: die EINE Quelle für Muster, `layerOf`, `NON_DOMAIN` und Coverage-Globs. Die Reihenfolge ist die
 *  Diagramm-Reihenfolge von oben nach unten. Imports innerhalb einer Schicht sind immer erlaubt; was nicht in `darf`
 *  steht, ist verboten (fail-closed). `muster: null` = Auffang-Schicht (alles übrige unter den Quellwurzeln), genau eine davon. */
const SCHICHT_MODELL = {
  quellwurzeln: QUELLWURZELN,
  endungen: ENDUNGEN,
  schichten: [
    { id: LAYERS.ENTRY, label: "Einstieg", wurzeln: ["SpeakerToolingApplication"], nurDatei: true, darf: [LAYERS.DOMAIN] },
    { id: LAYERS.DOMAIN, label: "Alles außer Einstieg (Auffang: Domäne, Anwendung, Adapter, Angular-Oberfläche)", wurzeln: [], darf: [] },
  ].map((s) => ({ ...s, muster: s.wurzeln.length ? kern.musterAus(QUELLWURZELN, s.wurzeln, s.nurDatei === true, ENDUNGEN) : null })),
  extern: [],
};

kern.pruefeModell(SCHICHT_MODELL); // fail-closed beim Laden: ein kaputtes Modell bricht jeden Import dieser Datei

/** Klassifiziert eine repo-relative Datei (POSIX-Pfad) in ihren Schicht-Bucket (vom Kern aus dem Modell abgeleitet). */
const layerOf = kern.layerOfAus(SCHICHT_MODELL);
/** Wurzel-Namen der NICHT-Auffang-Schichten (vom Kern abgeleitet). */
const NON_DOMAIN = kern.wurzelnAusserAuffangAus(SCHICHT_MODELL);
/** Coverage-Globs je Schicht-Bucket (vom Kern abgeleitet). */
const COVERAGE_GLOBS = kern.coverageGlobsAus(SCHICHT_MODELL);

module.exports = { LAYERS, layerOf, NON_DOMAIN, COVERAGE_GLOBS, SCHICHT_MODELL };
