import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { main, pruefeDockerfile, pruefeCompose, pruefeNeeds } from "../../tools/produkt-struktur.mjs";

const D = "a".repeat(64);

it("Dockerfile: alle FROM-Zeilen gepinnt, Stage-Verweis und scratch sind ok", () => {
  const text = [
    `FROM eclipse-temurin:25-jdk@sha256:${D} AS build`,
    `FROM --platform=linux/amd64 node:22-alpine@sha256:${D}`,
    "FROM build AS test",
    "FROM scratch",
  ].join("\n");
  expect(pruefeDockerfile(text, "Dockerfile")).toEqual([]);
});

it("Dockerfile: Tag ohne Digest ist ein Fund mit Zeile", () => {
  const f = pruefeDockerfile(`# c\nFROM node:22-alpine AS build\n`, "frontend/Dockerfile");
  expect(f.length).toBe(1);
  expect(f[0]).toMatch(/^frontend\/Dockerfile:2: /);
});

it("Dockerfile: FROM mit --platform ohne Digest ist ein Fund", () => {
  expect(pruefeDockerfile("FROM --platform=linux/amd64 node:22\n", "D").length).toBe(1);
});

it("Dockerfile: zu kurzer oder nicht-hex Digest ist ein Fund", () => {
  expect(pruefeDockerfile("FROM node:22@sha256:abc\n", "D").length).toBe(1);
  expect(pruefeDockerfile(`FROM node:22@sha256:${"z".repeat(64)}\n`, "D").length).toBe(1);
});

it("Dockerfile: FROM mit Variable ist ein Fund (fail-closed)", () => {
  expect(pruefeDockerfile("ARG BASE=node\nFROM ${BASE}\n", "D").length).toBe(1);
});

it("Dockerfile: Verweis auf Stage erst nach deren Definition ok", () => {
  expect(pruefeDockerfile("FROM build\n", "D").length).toBe(1);
});

it("Compose: gepinnt und nur build sind ok", () => {
  const text = `services:\n  db:\n    image: postgres:18@sha256:${D}\n  app:\n    build: ./backend\n`;
  expect(pruefeCompose(text, "compose.yaml")).toEqual([]);
});

it("Compose: Tag ohne Digest ist ein Fund mit Dienst und Zeile", () => {
  const f = pruefeCompose("services:\n  db:\n    image: postgres:18\n", "compose.yaml");
  expect(f.length).toBe(1);
  expect(f[0]).toMatch(/^compose\.yaml:3: .*db/);
});

it("Compose: zu kurzer Digest ist ein Fund", () => {
  expect(pruefeCompose("services:\n  db:\n    image: postgres:18@sha256:abc\n", "c").length).toBe(1);
});

const wf = (needs: string) => `jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x\n  produkt-ci:\n${needs}    runs-on: x\n`;

it("needs: vollständige Liste ist ok", () => {
  expect(pruefeNeeds(wf("    needs: [a, b]\n"))).toEqual([]);
});

it("needs: fehlender Job ist ein Fund", () => {
  const f = pruefeNeeds(wf("    needs: [a]\n"));
  expect(f.length).toBe(1);
  expect(f[0]).toMatch(/\bb\b/);
});

it("needs: String-Form zählt als ein Eintrag", () => {
  expect(pruefeNeeds(wf("    needs: a\n")).length).toBe(1);
  expect(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n    needs: a\n")).toEqual([]);
});

it("needs: ohne needs oder ohne Aggregator ist ein Fund", () => {
  expect(pruefeNeeds(wf("")).length).toBe(1);
  expect(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n").length).toBe(1);
});

const H = "0123456789abcdef".repeat(4);

it("Dockerfile: Digest mit Ziffern ok, 63 und 65 Zeichen oder Anhang sind Funde", () => {
  expect(pruefeDockerfile(`FROM node:22@sha256:${H}\n`, "D")).toEqual([]);
  expect(pruefeDockerfile(`FROM node:22@sha256:${H.slice(1)}\n`, "D").length).toBe(1);
  expect(pruefeDockerfile(`FROM node:22@sha256:${H}0\n`, "D").length).toBe(1);
  expect(pruefeDockerfile(`FROM node:22@sha256:${H}junk\n`, "D").length).toBe(1);
  expect(pruefeCompose(`services:\n  db:\n    image: x@sha256:${H}0\n`, "c").length).toBe(1);
  expect(pruefeCompose(`services:\n  db:\n    image: x@sha256:${H.slice(1)}\n`, "c").length).toBe(1);
});

it("Dockerfile: kleingeschriebenes und eingerücktes from zählt, Kommentar mit FROM nicht", () => {
  expect(pruefeDockerfile("  FROM node:22\n", "D").length).toBe(1);
  expect(pruefeDockerfile("from node:22\n", "D").length).toBe(1);
  expect(pruefeDockerfile(`from node:22@sha256:${H} as build\n`, "D")).toEqual([]);
  expect(pruefeDockerfile("# FROM node:22\n", "D")).toEqual([]);
});

it("Dockerfile: Stage-Namen sind unabhängig von der Schreibweise", () => {
  expect(pruefeDockerfile(`FROM x@sha256:${H} AS Build\nFROM build\n`, "D")).toEqual([]);
  expect(pruefeDockerfile(`FROM x@sha256:${H} AS build\nFROM BUILD\n`, "D")).toEqual([]);
});

it("Compose: ohne services oder mit leerem Dienst kein Absturz, kein Fund", () => {
  expect(pruefeCompose("volumes:\n  v: {}\n", "c")).toEqual([]);
  expect(pruefeCompose("services:\n  db:\n", "c")).toEqual([]);
});

it("needs: ohne jobs ist ein Fund, anderer Aggregator wird respektiert", () => {
  expect(pruefeNeeds("name: x\n").length).toBe(1);
  expect(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n")[0]).toMatch(/fehlt in jobs/);
  expect(pruefeNeeds("jobs: x\n")[0]).toMatch(/fehlt in jobs/);
  expect(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n")[0]).toMatch(/kein needs/);
  const text = "jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n    needs: [a]\n  gesamt:\n    needs: [a, produkt-ci]\n";
  expect(pruefeNeeds(text, "gesamt")).toEqual([]);
  expect(pruefeNeeds(text, "produkt-ci").length).toBe(1);
});

function repo(dateien: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "produkt-struktur-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    mkdirSync(dirname(join(dir, pfad)), { recursive: true });
    writeFileSync(join(dir, pfad), inhalt);
  }
  git("add", "-A");
  return dir;
}
const CI_OK = "jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n    needs: [a]\n";
const CI = ".github/workflows/produkt-ci.yml";
// Fahrt main und sammelt die Fehlermeldungen, statt sie auszugeben.
function lauf(dir: string) {
  const meldungen: string[] = [];
  const alt = console.error;
  console.error = (m: string) => void meldungen.push(m);
  try { return { code: main(dir), meldungen }; } finally { console.error = alt; }
}

it("CLI: keine Docker-Datei gefunden ist Exit 1", () => {
  const dir = repo({ [CI]: CI_OK });
  try { expect(lauf(dir).code).toBe(1); } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("CLI: alle Dateiformen werden gefunden und richtig geprüft, gepinnt ist Exit 0", () => {
  const compose = (i: string) => `services:\n  db:\n    image: ${i}\n`;
  const pfade = [
    "Dockerfile", "sub/Dockerfile", "x.Dockerfile", "sub/y.Dockerfile",
    "compose.yaml", "compose.yml", "sub/compose.yaml", "docker-compose.yaml", "sub/docker-compose.yml",
  ];
  const ist = (p: string) => (p.includes("ompose") ? compose : (i: string) => `FROM ${i}\n`);
  const dirRot = repo({ [CI]: CI_OK, ...Object.fromEntries(pfade.map((p) => [p, ist(p)("p:1")])) });
  const dirGruen = repo({ [CI]: CI_OK, ...Object.fromEntries(pfade.map((p) => [p, ist(p)(`p:1@sha256:${H}`)])) });
  try {
    const rot = lauf(dirRot);
    expect(rot.code).toBe(1);
    expect(rot.meldungen.length).toBe(pfade.length);
    for (const p of pfade) expect(rot.meldungen.some((m) => m.startsWith(`✖ ${p}:`)), p).toBeTruthy();
    expect(lauf(dirGruen).code).toBe(0);
  } finally {
    rmSync(dirRot, { recursive: true, force: true });
    rmSync(dirGruen, { recursive: true, force: true });
  }
});

it("CLI: needs-Fund aus produkt-ci.yml macht Exit 1", () => {
  const dir = repo({ [CI]: CI_OK.replace("[a]", "[]"), Dockerfile: `FROM node:22@sha256:${H}\n` });
  try { expect(lauf(dir).code).toBe(1); } finally { rmSync(dir, { recursive: true, force: true }); }
});
