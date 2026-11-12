import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";

// Nur die Test-Konfiguration: das Factory-Repo hat keinen Build. Die Tests laufen auf Node, die Worker-Zahl ist lokal begrenzt,
// damit parallele Läufe von Lenses und anderen Worktrees die Git-lastigen Tests nicht ins Zeitlimit treiben.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Coverage misst nur ein Lauf mit --coverage; lcovonly schreibt coverage/lcov.info, das check-diffcoverage.mjs gegen den Diff auswertet.
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcovonly"],
      reportsDirectory: "coverage",
      // Das Produkt (Java, Angular) misst die Produkt-CI über JaCoCo und lcov; dieser Lauf misst nur die Harness-Werkzeuge des Projekts: tools/ und die Schicht-Definition. Die Kern-Skripte unter scripts/ prüft das Factory-Repo selbst (Test: coverage-config.test.ts upstream); ohne include zählt v8 nur im Testprozess geladene Dateien, eine nur als Kindprozess gestartete Datei fehlte im Bericht.
      include: ["tools/**/*.{mjs,cjs}", "scripts/layers.cjs"],
      // Aggregat-Floors (Ratchet, nur nach oben): abgerundet aus der ersten Messung mit include im Factory-Repo (Zeilen 89,33 %, Zweige 87,71 %; Fortschreibung 0022-1942-messbasis nennt sie maßgeblich). Kein Floor je Schicht: die Schichten des Factory-Repos sind klein; den Diff misst check:diffcoverage je Schicht.
      thresholds: { lines: 89, branches: 87 },
    },
    maxWorkers: process.env.CI ? undefined : Math.max(2, Math.floor(availableParallelism() / 4)),
  },
});
