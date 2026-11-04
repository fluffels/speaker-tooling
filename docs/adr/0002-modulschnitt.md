# ADR 0002: Modulschnitt

> Architecture Decision Record (MADR). Status: **akzeptiert** · Datum: 2026-11-04

## Kontext und Problemstellung

Das Produkt besteht aus fachlich getrennten Modulen (Konferenz-Radar, Speaker-Mappe, Publikationen, LinkedIn-Plan, Marken-Cockpit). Jedes soll später einzeln auslieferbar sein können, heute aber von einer Person gebaut und betrieben werden. Gesucht ist ein Schnitt, der Grenzen erzwingt, ohne Betrieb und Pflege zu vervielfachen.

## Betrachtete Optionen

- ein Deployable, ein Maven-Modul je Fachmodul
- je Modul zwei Maven-Module (`-api` und `-core`)
- eine eigene Anwendung je Modul
- Microservices
- Micro-Frontends

## Entscheidung

Gewählt: **ein Spring-Boot-Deployable, ein Maven-Modul je Fachmodul.**

- Der Compiler erzwingt die Modulgrenzen, ArchUnit prüft die Schichten innerhalb eines Moduls.
- Jedes Modul hat ein **eigenes Datenbankschema** und eigene Flyway-Migrationen.
- **Keine Fremdschlüssel über Modulgrenzen.** Ein Modul verweist auf fremde Daten über eine stabile ID und hält bei Bedarf einen Snapshot.
- Module arbeiten über **Events oder optionale Interfaces** zusammen; die Anbindung darf fehlen (`@ConditionalOn…`), jedes Modul bleibt allein lauffähig.
- Frontend: eine Angular-App mit Lazy Routes, ein Ordner je Fachmodul, Grenzen per ESLint-Regel.

Verworfen: `-api`/`-core` je Modul, eine App je Modul, Microservices und Micro-Frontends, weil der Aufwand für eine Person den Nutzen übersteigt.

## Konsequenzen

- Gut: harte Grenzen bei einem einzigen Betriebsartefakt; ein Modul lässt sich später ohne Umbau als eigenes Deployable herauslösen.
- Schlecht: Daten über Modulgrenzen sind bewusst redundant (Snapshots) und brauchen Abgleich.
- Joins über Module hinweg gibt es nicht; Auswertungen laufen über Events oder Lese-Interfaces.

## Re-Evaluierung

- Jemand will wirklich nur ein einzelnes Modul betreiben: dann ein eigenes Deployable je Modul prüfen.
- Ein Modul braucht ein eigenes Skalierungs- oder Release-Tempo.
