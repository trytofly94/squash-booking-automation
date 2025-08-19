# Projekt-Konfiguration für Squash-Booking-Automation

## 1. Technologie-Stack
- **Sprache**: TypeScript 5.4.3 (kompiliert zu JavaScript ES2022)
- **Runtime**: Node.js (>= 18.0.0)
- **Testing Framework**: Playwright 1.42.1 für E2E-Tests, Jest 29.7.0 für Unit/Integration-Tests
- **Paketmanager**: npm (>= 8.0.0)
- **Haupt-Abhängigkeiten**:
  - @playwright/test: Browser-Automatisierung und E2E-Tests
  - dotenv: Umgebungsvariablen-Management
  - winston: Strukturiertes Logging
  - ts-node: TypeScript-Direktausführung für Entwicklung

## 2. Wichtige Befehle
- **Abhängigkeiten installieren**: `npm install`
- **Playwright-Browser installieren**: `npx playwright install`
- **Anwendung starten (Entwicklung)**: `npm run dev`
- **Anwendung starten (Produktion)**: `npm start`
- **Build-Prozess**: `npm run build`
- **Tests ausführen**:
  - Alle Tests: `npm test`
  - Unit-Tests: `npm run test:unit`
  - Integration-Tests: `npm run test:integration`
  - Playwright E2E-Tests: `npm run test:playwright`
  - Tests mit Coverage: `npm run test:coverage`
  - E2E-Tests spezifisch: `npm run test:e2e`
  - Tests mit Debug-Modus: `npm run test:debug`
  - Tests mit UI-Modus: `npm run test:ui`
  - Test-Reports anzeigen: `npm run test:report`
  - Test-Reports zusammenführen: `npm run test:merge-reports`
- **Entwickler-Tools**:
  - Playwright UI-Modus: `npm run dev:ui`
  - Debug-Modus: `npm run dev:debug`
  - Code-Generierung: `npm run dev:codegen`
  - Website-Analyse: `npm run dev:analyze`
- **Linter ausführen**: `npm run lint`
- **Code formatieren**: `npm run format`
- **TypeScript-Typen prüfen**: `npm run type-check`
- **Build-Artefakte löschen**: `npm run clean`

## 3. Architektur-Übersicht
- **Kern-Logik Verzeichnis**: `src/core/` - Geschäftslogik für Buchungsautomatisierung
  - `BookingManager.ts`: Hauptorchestrator für den Buchungsprozess
  - `SlotSearcher.ts`: Findet verfügbare Slots über mehrere Courts
  - `IsolationChecker.ts`: Verhindert Slot-Fragmentierung durch Isolation-Check
  - `DateTimeCalculator.ts`: Datum- und Zeit-Berechnungen
- **Page Objects Verzeichnis**: `src/pages/` - Playwright Page Object Model
  - `BasePage.ts`: Gemeinsame Browser-Funktionalitäten
  - `BookingCalendarPage.ts`: Kalender-Interaktionen
  - `CheckoutPage.ts`: Login, Checkout und Zahlungsabwicklung
- **Typ-Definitionen**: `src/types/booking.types.ts`
- **Utilities**: `src/utils/` - Hilfsfunktionen und Validator
  - `logger.ts`: Winston-basiertes Logging
  - `DryRunValidator.ts`: Dry-Run-Validierung und Test-Assertions
- **Tests Struktur**:
  - `tests/unit/`: Unit-Tests für einzelne Komponenten
  - `tests/integration/`: Integration-Tests für Komponenteninteraktion
  - `tests/fixtures/`: Test-Daten und Mock-Responses
- **Konfigurationsdateien**: 
  - `playwright.config.ts`: Playwright-Konfiguration für E2E-Tests
  - `jest.config.js`: Jest-Konfiguration für Unit/Integration-Tests
  - `tsconfig.json`: TypeScript-Compiler-Konfiguration
  - `.env`: Umgebungsvariablen (aus .env.example kopieren)

## 4. Spezielle Projektmerkmale
- **Dry-Run Modus**: Das System kann im Test-Modus laufen ohne echte Buchungen
- **Intelligente Slot-Auswahl**: Verhindert Erstellung isolierter 30-Minuten-Slots
- **Multi-Court-Suche**: Durchsucht alle verfügbaren Courts nach optimalen Optionen
- **Retry-Mechanismus**: Robuste Fehlerbehandlung mit konfigurierbaren Wiederholungsversuchen
- **Path Aliases**: TypeScript-Pfad-Aliase (@/, @/core/, @/pages/, @/types/, @/utils/)
- **Comprehensive Logging**: Winston-basiertes Logging mit verschiedenen Log-Levels
- **Environment-basierte Konfiguration**: Vollständig über .env-Datei konfigurierbar
- **Erweiterte Testing-Features**: UI-Mode, Trace-Viewer, Test-Reports und Debugging-Tools
- **Test-Artefakte**: Automatische Generierung von Screenshots, Videos und Traces bei Fehlern

## 5. Umgebungsvariablen
- **DAYS_AHEAD**: Wie viele Tage im Voraus gebucht wird (Standard: 20)
- **TARGET_START_TIME**: Gewünschte Startzeit im HH:MM Format (Standard: "14:00")
- **DURATION**: Buchungsdauer in Minuten (Standard: 60)
- **MAX_RETRIES**: Maximale Wiederholungsversuche bei Fehlern (Standard: 3)
- **DRY_RUN**: Testlauf ohne echte Buchungen (Standard: true)
- **LOG_LEVEL**: Logging-Level (info, debug, warn, error)
- **USER_EMAIL** / **USER_PASSWORD**: Optionale Authentifizierung

## 6. Hinweise für die Agenten

### Für den Planner-Agent:
- Das Projekt implementiert eine Squash-Court-Buchungsautomatisierung für eversports.de
- Kernfunktionalität liegt in `src/core/`, Page Objects in `src/pages/`
- Tests sind klar in Unit/Integration (Jest) und E2E (Playwright) getrennt
- Beachte die Dry-Run-Funktionalität für sichere Entwicklung

### Für den Creator-Agent:
- Halte dich an den TypeScript-Stil mit strikten Compiler-Optionen
- Verwende die definierten Path-Aliases (@/, @/core/, etc.)
- Neue Core-Logik gehört in `src/core/`, Browser-Interaktionen in `src/pages/`
- Logging erfolgt über Winston (importiere aus `@/utils/logger`)
- Beachte die ESLint-Regeln und formatiere Code mit Prettier

### Für den Tester-Agent:
- Unit-Tests mit Jest: `npm run test:unit`
- Integration-Tests: `npm run test:integration` 
- E2E-Tests mit Playwright: `npm run test:playwright`
- Coverage-Report: `npm run test:coverage`
- Erweiterte Playwright-Features:
  - Debug-Modus: `npm run test:debug`
  - UI-Modus: `npm run test:ui`
  - Test-Reports: `npm run test:report`
  - Trace-Viewer: `npm run test:trace`
- Teste immer zuerst im Dry-Run-Modus
- Mock-Daten gehören in `tests/fixtures/`
- Achte auf die Coverage-Schwellenwerte (80% für alle Metriken)
- Test-Artefakte werden automatisch in `test-artifacts/` und `test-reports/` gespeichert

### Für den Deployer-Agent:
- Build mit `npm run build` erstellt `dist/`-Verzeichnis
- Führe vor Deployment alle Tests aus: `npm test && npm run test:playwright`
- Prüfe Code-Qualität: `npm run lint && npm run type-check`
- Dokumentation ist bereits umfassend in README.md vorhanden
- Projekt verwendet GitHub Actions (siehe `.github/`-Verzeichnis)