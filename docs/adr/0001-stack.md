# ADR 0001: Technologie-Stack

> Architecture Decision Record (MADR). Status: **akzeptiert** · Datum: 2026-11-04

## Kontext und Problemstellung

Das Speaker-Tooling braucht einen Stack für Backend, Datenbank, Frontend und Tests. Maßstab ist der **verbreitete Marktstandard**: weder der neueste Trend noch veraltet. Der Harness soll später auch in Bestandsprojekten laufen, und die nutzen meist den Standard.

## Entscheidungstreiber

- Verbreitung und Langzeitpflege der Werkzeuge
- Lizenzlage, weil das Repo öffentlich ist
- so wenige Prüfebenen wie nötig für eine Person

## Betrachtete Optionen

- Backend: Java 25 (LTS) mit Spring Boot 4.1 und Maven
- Migrationen: Flyway oder Liquibase
- Architekturtests: ArchUnit oder Spring Modulith
- Frontend: Angular 22 mit Angular CLI, ohne oder mit Nx
- Frontend-Tests: Karma oder Vitest (Unit), Playwright (E2E)

## Entscheidung

Gewählt: **Java 25, Spring Boot 4.1, Maven (Wrapper), PostgreSQL mit Flyway, ArchUnit, Angular 22 mit Vitest und Playwright.**

- **Flyway statt Liquibase:** schlichte SQL-Migrationen, Spring-Boot-Standard. Liquibase steht seit Version 5.0 unter der Functional Source License statt Apache 2.0.
- **ArchUnit statt Spring Modulith:** bei Maven-Modulen wäre Modulith eine dritte Grenzprüfung für dasselbe (Compiler und ArchUnit prüfen schon).
- **Vitest statt Karma:** Karma ist abgekündigt, Vitest ist der Unit-Test-Standard der Angular CLI.
- **Nx verworfen:** bei einem Einzelprojekt Overhead ohne Gewinn.

## Konsequenzen

- Gut: Standardwerkzeuge, viel Dokumentation, keine Lizenzfrage bei Migrationen.
- Schlecht: Ein späteres Projekt mit Liquibase braucht dort eigene Migrationen; dieses Repo nutzt sie nicht.
- Offen bleiben Authentifizierung (später) und Hosting.

## Re-Evaluierung

- Flyway ändert seine Lizenz, oder Liquibase kehrt zu einer offenen Lizenz zurück.
- Das Repo wächst auf mehrere Frontend-Apps: dann Nx neu prüfen.
