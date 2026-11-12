# ADR 0003: Sicherungen mit age verschlüsseln

> Architecture Decision Record (MADR). Status: **akzeptiert** · Datum: 2026-11-12

## Kontext und Problemstellung

Sicherungen aus `betrieb/backup.sh` sind Klartext-SQL und tragen künftig personenbezogene Daten (Kontakte, Honorare). Vor dem ersten Speichern solcher Daten braucht es Verschlüsselung im Ruhezustand und eine Löschregel (Ticket #33).

## Betrachtete Optionen

- `age` mit öffentlichen Empfängerschlüsseln
- `gpg`
- `openssl enc` mit Passphrase
- Verschlüsselung des Datenträgers (FileVault) allein

## Entscheidung

Gewählt: **`age`, asymmetrisch.** Der Dump läuft als Strom durch `age -R`, Klartext berührt die Platte nie. Zum Sichern genügt der öffentliche Schlüssel, der private liegt nur beim Einspielen auf dem Rechner. `age` ist authentifiziert (Manipulation und Abschneiden fallen beim Entschlüsseln auf), klein und aus apt und Homebrew installierbar.

- Der Schutz ist opt-in, aber klebrig: aktiv per `BACKUP_EMPFAENGER`, per `backups/empfaenger.txt` oder sobald eine `*.sql.age` im Ordner liegt. Bei aktivem Schutz lehnt `backup.sh` Klartext ab (fail-closed), `restore.sh` spielt Klartext-Altbestände mit Warnung ein.
- `restore.sh` entschlüsselt vor dem Einspielen einmal komplett (Prüflauf), weil `age` bei einer abgeschnittenen Datei die ersten Blöcke schon ausgibt und `psql` sonst einen Teil festschreiben könnte.
- Die Löschregel (30 Tage, jüngste geprüfte Sicherung bleibt) steht in `docs/betrieb.md` und ist nicht automatisiert.

Verworfen: `gpg` (Schlüsselbund, viel Bedienfläche), `openssl enc` (keine Authentifizierung, Passphrase im Aufruf), FileVault allein (schützt nicht Kopien außer Haus).

## Konsequenzen

- Gut: gestohlene oder kopierte Sicherungen sind ohne den privaten Schlüssel wertlos.
- Schlecht: geht der private Schlüssel verloren, sind alle verschlüsselten Sicherungen unlesbar; dagegen helfen doppelte Ablage und ein zweiter Empfänger.
- `age` authentifiziert keinen Absender: wer den öffentlichen Schlüssel kennt, kann eine gültige Sicherung bauen. Es bleibt bei „nur eigene Sicherungen einspielen“.
- Der Prüflauf kostet eine zweite Entschlüsselung (bei passphrasegeschützter Schlüsseldatei zwei Eingaben).

## Re-Evaluierung

- Sicherungen sollen automatisch oder in einen Cloud-Speicher laufen: Schlüsselverwaltung und Löschautomatik neu prüfen.
- `age` wird nicht mehr gepflegt oder eine Plattform stellt es nicht bereit: Alternative prüfen.
