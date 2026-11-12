import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeDockerfile, pruefeCompose, pruefeNeeds } from "./produkt-struktur.mjs";

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
