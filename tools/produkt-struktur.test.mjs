import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { main, pruefeDockerfile, pruefeCompose, pruefeNeeds } from "./produkt-struktur.mjs";

const D = "a".repeat(64);

test("Dockerfile: alle FROM-Zeilen gepinnt, Stage-Verweis und scratch sind ok", () => {
  const text = [
    `FROM eclipse-temurin:25-jdk@sha256:${D} AS build`,
    `FROM --platform=linux/amd64 node:22-alpine@sha256:${D}`,
    "FROM build AS test",
    "FROM scratch",
  ].join("\n");
  assert.deepEqual(pruefeDockerfile(text, "Dockerfile"), []);
});

test("Dockerfile: Tag ohne Digest ist ein Fund mit Zeile", () => {
  const f = pruefeDockerfile(`# c\nFROM node:22-alpine AS build\n`, "frontend/Dockerfile");
  assert.equal(f.length, 1);
  assert.match(f[0], /^frontend\/Dockerfile:2: /);
});

test("Dockerfile: FROM mit --platform ohne Digest ist ein Fund", () => {
  assert.equal(pruefeDockerfile("FROM --platform=linux/amd64 node:22\n", "D").length, 1);
});

test("Dockerfile: zu kurzer oder nicht-hex Digest ist ein Fund", () => {
  assert.equal(pruefeDockerfile("FROM node:22@sha256:abc\n", "D").length, 1);
  assert.equal(pruefeDockerfile(`FROM node:22@sha256:${"z".repeat(64)}\n`, "D").length, 1);
});

test("Dockerfile: FROM mit Variable ist ein Fund (fail-closed)", () => {
  assert.equal(pruefeDockerfile("ARG BASE=node\nFROM ${BASE}\n", "D").length, 1);
});

test("Dockerfile: Verweis auf Stage erst nach deren Definition ok", () => {
  assert.equal(pruefeDockerfile("FROM build\n", "D").length, 1);
});

test("Compose: gepinnt und nur build sind ok", () => {
  const text = `services:\n  db:\n    image: postgres:18@sha256:${D}\n  app:\n    build: ./backend\n`;
  assert.deepEqual(pruefeCompose(text, "compose.yaml"), []);
});

test("Compose: Tag ohne Digest ist ein Fund mit Dienst und Zeile", () => {
  const f = pruefeCompose("services:\n  db:\n    image: postgres:18\n", "compose.yaml");
  assert.equal(f.length, 1);
  assert.match(f[0], /^compose\.yaml:3: .*db/);
});

test("Compose: zu kurzer Digest ist ein Fund", () => {
  assert.equal(pruefeCompose("services:\n  db:\n    image: postgres:18@sha256:abc\n", "c").length, 1);
});

const wf = (needs) => `jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x\n  produkt-ci:\n${needs}    runs-on: x\n`;

test("needs: vollständige Liste ist ok", () => {
  assert.deepEqual(pruefeNeeds(wf("    needs: [a, b]\n")), []);
});

test("needs: fehlender Job ist ein Fund", () => {
  const f = pruefeNeeds(wf("    needs: [a]\n"));
  assert.equal(f.length, 1);
  assert.match(f[0], /\bb\b/);
});

test("needs: String-Form zählt als ein Eintrag", () => {
  assert.equal(pruefeNeeds(wf("    needs: a\n")).length, 1);
  assert.deepEqual(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n    needs: a\n"), []);
});

test("needs: ohne needs oder ohne Aggregator ist ein Fund", () => {
  assert.equal(pruefeNeeds(wf("")).length, 1);
  assert.equal(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n").length, 1);
});

const H = "0123456789abcdef".repeat(4);

test("Dockerfile: Digest mit Ziffern ok, 63 und 65 Zeichen oder Anhang sind Funde", () => {
  assert.deepEqual(pruefeDockerfile(`FROM node:22@sha256:${H}\n`, "D"), []);
  assert.equal(pruefeDockerfile(`FROM node:22@sha256:${H.slice(1)}\n`, "D").length, 1);
  assert.equal(pruefeDockerfile(`FROM node:22@sha256:${H}0\n`, "D").length, 1);
  assert.equal(pruefeDockerfile(`FROM node:22@sha256:${H}junk\n`, "D").length, 1);
  assert.equal(pruefeCompose(`services:\n  db:\n    image: x@sha256:${H}0\n`, "c").length, 1);
  assert.equal(pruefeCompose(`services:\n  db:\n    image: x@sha256:${H.slice(1)}\n`, "c").length, 1);
});

test("Dockerfile: kleingeschriebenes und eingerücktes from zählt, Kommentar mit FROM nicht", () => {
  assert.equal(pruefeDockerfile("  FROM node:22\n", "D").length, 1);
  assert.equal(pruefeDockerfile("from node:22\n", "D").length, 1);
  assert.deepEqual(pruefeDockerfile(`from node:22@sha256:${H} as build\n`, "D"), []);
  assert.deepEqual(pruefeDockerfile("# FROM node:22\n", "D"), []);
});

test("Dockerfile: Stage-Namen sind unabhängig von der Schreibweise", () => {
  assert.deepEqual(pruefeDockerfile(`FROM x@sha256:${H} AS Build\nFROM build\n`, "D"), []);
  assert.deepEqual(pruefeDockerfile(`FROM x@sha256:${H} AS build\nFROM BUILD\n`, "D"), []);
});

test("Compose: ohne services oder mit leerem Dienst kein Absturz, kein Fund", () => {
  assert.deepEqual(pruefeCompose("volumes:\n  v: {}\n", "c"), []);
  assert.deepEqual(pruefeCompose("services:\n  db:\n", "c"), []);
});

test("needs: ohne jobs ist ein Fund, anderer Aggregator wird respektiert", () => {
  assert.equal(pruefeNeeds("name: x\n").length, 1);
  assert.match(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n")[0], /fehlt in jobs/);
  assert.match(pruefeNeeds("jobs: x\n")[0], /fehlt in jobs/);
  assert.match(pruefeNeeds("jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n")[0], /kein needs/);
  const text = "jobs:\n  a:\n    runs-on: x\n  produkt-ci:\n    needs: [a]\n  gesamt:\n    needs: [a, produkt-ci]\n";
  assert.deepEqual(pruefeNeeds(text, "gesamt"), []);
  assert.equal(pruefeNeeds(text, "produkt-ci").length, 1);
});

function repo(dateien) {
  const dir = mkdtempSync(join(tmpdir(), "produkt-struktur-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
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
function lauf(dir) {
  const meldungen = [];
  const alt = console.error;
  console.error = (m) => meldungen.push(m);
  try { return { code: main(dir), meldungen }; } finally { console.error = alt; }
}

test("CLI: keine Docker-Datei gefunden ist Exit 1", () => {
  const dir = repo({ [CI]: CI_OK });
  try { assert.equal(lauf(dir).code, 1); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: alle Dateiformen werden gefunden und richtig geprüft, gepinnt ist Exit 0", () => {
  const compose = (i) => `services:\n  db:\n    image: ${i}\n`;
  const pfade = [
    "Dockerfile", "sub/Dockerfile", "x.Dockerfile", "sub/y.Dockerfile",
    "compose.yaml", "compose.yml", "sub/compose.yaml", "docker-compose.yaml", "sub/docker-compose.yml",
  ];
  const ist = (p) => (p.includes("ompose") ? compose : (i) => `FROM ${i}\n`);
  const dirRot = repo({ [CI]: CI_OK, ...Object.fromEntries(pfade.map((p) => [p, ist(p)("p:1")])) });
  const dirGruen = repo({ [CI]: CI_OK, ...Object.fromEntries(pfade.map((p) => [p, ist(p)(`p:1@sha256:${H}`)])) });
  try {
    const rot = lauf(dirRot);
    assert.equal(rot.code, 1);
    assert.equal(rot.meldungen.length, pfade.length);
    for (const p of pfade) assert.ok(rot.meldungen.some((m) => m.startsWith(`✖ ${p}:`)), p);
    assert.equal(lauf(dirGruen).code, 0);
  } finally {
    rmSync(dirRot, { recursive: true, force: true });
    rmSync(dirGruen, { recursive: true, force: true });
  }
});

test("CLI: needs-Fund aus produkt-ci.yml macht Exit 1", () => {
  const dir = repo({ [CI]: CI_OK.replace("[a]", "[]"), Dockerfile: `FROM node:22@sha256:${H}\n` });
  try { assert.equal(lauf(dir).code, 1); } finally { rmSync(dir, { recursive: true, force: true }); }
});
