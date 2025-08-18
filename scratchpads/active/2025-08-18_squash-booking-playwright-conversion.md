# Squash Court Booking Automation - Playwright Conversion

**Erstellt**: 2025-08-18
**Typ**: Enhancement/Modernization
**Geschätzter Aufwand**: Groß
**Verwandtes Issue**: Direct request for JSON-to-Playwright conversion

## Kontext & Ziel
Modernisierung einer bestehenden JSON-basierten Squash-Court-Buchungsautomatisierung in eine robuste Playwright-basierte Lösung mit umfassender Testabdeckung. Das System soll intelligente Features beibehalten (Multi-Court-Suche, Vermeidung isolierter Slots, Retry-Mechanismus) und gleichzeitig durch Tests validierbar sein, ohne echte Buchungen durchzuführen.

## Anforderungen
- [ ] Konvertierung der JSON-Automatisierung zu Playwright TypeScript
- [ ] Implementierung aller intelligenten Features aus dem Original:
  - Multi-Court-Suche
  - Vermeidung isolierter Slots (30-min-Slots vor/nach der Buchung)
  - Retry-Mechanismus (max. 3 Versuche)
  - 20-Tage-Vorausbuchung für 14:00-15:00 Uhr Slots
- [ ] Umfassende Test-Suite mit Mocking/Stubbing für echte Buchungen
- [ ] GitHub Repository Setup mit CI/CD
- [ ] Wartbare und dokumentierte Codebase

## Untersuchung & Analyse

### Bestehende JSON-Automatisierung Analyse:
1. **Zielplattform**: Eversports.de (Sportcenter Kautz Squash-Buchung)
2. **Buchungslogik**: 
   - Datum: +20 Tage vom aktuellen Datum
   - Zeit: 14:00 + 14:30 (zwei aufeinanderfolgende 30-min Slots)
   - Court: Beliebiger verfügbarer Court
3. **Intelligente Features**:
   - Suche durch alle verfügbaren Courts
   - Prüfung auf isolierte Slots (verhindert 30-min-Lücken)
   - Retry-Mechanismus bei Fehlern
4. **Checkout-Prozess**: Vollständiger Checkout mit Login und Zahlungsabwicklung

### Technische Erkenntnisse:
- XPath-basierte Element-Selektion
- Komplexe JavaScript-Logik für Slot-Suche
- Datum/Zeit-Berechnungen
- DOM-Manipulation und -Analyse
- Fehlerbehandlung mit mehreren Retry-Versuchen

## Implementierungsplan

### Phase 1: Projekt-Setup und Repository-Struktur
- [ ] GitHub Repository erstellen
- [ ] TypeScript + Playwright Projekt-Setup
- [ ] Ordnerstruktur definieren:
  ```
  squash-booking-automation/
  ├── src/
  │   ├── core/
  │   │   ├── BookingManager.ts
  │   │   ├── SlotSearcher.ts
  │   │   ├── IsolationChecker.ts
  │   │   └── DateTimeCalculator.ts
  │   ├── pages/
  │   │   ├── BasePage.ts
  │   │   ├── BookingCalendarPage.ts
  │   │   └── CheckoutPage.ts
  │   ├── types/
  │   │   └── booking.types.ts
  │   └── utils/
  │       └── logger.ts
  ├── tests/
  │   ├── unit/
  │   ├── integration/
  │   └── fixtures/
  ├── config/
  ├── docs/
  └── scripts/
  ```

### Phase 2: Core-Komponenten Entwicklung
- [ ] **DateTimeCalculator.ts**: 
  - Implementierung der +20 Tage Berechnung
  - Zeit-Slot-Berechnung (14:00, 14:30)
  - Nachbar-Slot-Berechnung für Isolation-Checks
- [ ] **BookingTypes Interface**:
  ```typescript
  interface BookingSlot {
    date: string;
    startTime: string;
    courtId: string;
    isAvailable: boolean;
  }
  
  interface BookingPair {
    slot1: BookingSlot;
    slot2: BookingSlot;
    courtId: string;
  }
  ```

### Phase 3: Page Object Model Implementation
- [ ] **BasePage.ts**: Gemeinsame Playwright-Funktionalität
- [ ] **BookingCalendarPage.ts**: 
  - Navigation zur Kalenderansicht
  - Slot-Suche und -Auswahl
  - DOM-Query-Methoden für verfügbare Slots
- [ ] **CheckoutPage.ts**: 
  - Login-Prozess
  - Checkout-Schritte
  - Bestätigungsvalidierung

### Phase 4: Intelligente Buchungslogik
- [ ] **SlotSearcher.ts**:
  - Multi-Court-Suche-Algorithmus
  - Verfügbare Slot-Paare finden
  - Integration mit IsolationChecker
- [ ] **IsolationChecker.ts**:
  - Prüfung auf isolierte 30-min-Slots vor/nach Buchung
  - Logik zur Vermeidung unerwünschter Slot-Fragmentierung
- [ ] **BookingManager.ts**: 
  - Orchestrierung des gesamten Buchungsprozesses
  - Retry-Mechanismus
  - Fehlerbehandlung und Logging

### Phase 5: Test-Strategie und -Implementation
- [ ] **Mock-Strategien entwickeln**:
  - DOM-Mocking für Kalender-Tests
  - HTTP-Response-Mocking für API-Calls
  - Date-Mocking für zeitabhängige Tests
- [ ] **Unit Tests**:
  - DateTimeCalculator Tests
  - IsolationChecker Logic Tests
  - SlotSearcher Algorithm Tests
- [ ] **Integration Tests**:
  - Page Object Integration
  - End-to-End Booking Flow (mit Mocks)
- [ ] **Test Fixtures**:
  - Mock-Kalender-HTML-Strukturen
  - verschiedene Slot-Verfügbarkeits-Szenarien

### Phase 6: Testbare Buchungslogik ohne echte Buchungen
- [ ] **Dry-Run Modus implementieren**:
  - Flag für Test-Modus vs. Production-Modus
  - Logging aller Aktionen ohne tatsächliche Ausführung
- [ ] **Booking Simulation Framework**:
  - Mock-Responses für erfolgreiche Buchungen
  - Simulierte Checkout-Schritte
  - Validierung aller Logik-Pfade

### Phase 7: CI/CD und Deployment
- [ ] **GitHub Actions Setup**:
  ```yaml
  # .github/workflows/test.yml
  - Tests bei jedem PR/Push
  - Playwright Browser-Installation
  - Test-Reports und Screenshots
  ```
- [ ] **Konfiguration Management**:
  - Environment-spezifische Konfigurationen
  - Sichere Credential-Verwaltung
- [ ] **Monitoring und Alerting**:
  - Erfolgs-/Fehler-Logging
  - Benachrichtigungen bei kritischen Fehlern

### Phase 8: Dokumentation und Wartbarkeit
- [ ] **README.md mit**:
  - Setup-Anweisungen
  - Konfigurationsoptionen
  - Test-Ausführung
  - Deployment-Prozess
- [ ] **Code-Dokumentation**:
  - JSDoc für alle öffentlichen Methoden
  - Architektur-Diagramme
  - API-Dokumentation
- [ ] **Betriebshandbuch**:
  - Monitoring-Guidelines
  - Troubleshooting-Guide
  - Backup-Strategien

## Fortschrittsnotizen
[Laufende Notizen über Fortschritt, Blocker und Entscheidungen werden hier dokumentiert]

## Ressourcen & Referenzen
- [Playwright Documentation](https://playwright.dev/)
- [TypeScript Best Practices](https://typescript-eslint.io/)
- [Eversports Booking Platform](https://www.eversports.de/sb/sportcenter-kautz?sport=squash)
- Bestehende JSON-Automatisierung: `/Volumes/Dokumente/Projekte/Coding/Web-Automationen/Squash-Buchen/Squash-Buchen.json`

## Kritische Erfolgsfaktoren
1. **Testability**: Alle Buchungslogik muss ohne echte Buchungen testbar sein
2. **Maintainability**: Klare Separation of Concerns und modularer Aufbau
3. **Reliability**: Robuste Fehlerbehandlung und Retry-Mechanismen
4. **Observability**: Umfassendes Logging für Debugging und Monitoring

## Abschluss-Checkliste
- [ ] GitHub Repository erstellt und konfiguriert
- [ ] Alle Core-Komponenten implementiert und getestet
- [ ] Page Object Model vollständig funktional
- [ ] Intelligente Buchungslogik portiert und erweitert
- [ ] Umfassende Test-Suite mit 100% Mock-Coverage
- [ ] CI/CD Pipeline operational
- [ ] Dokumentation vollständig und aktuell
- [ ] Dry-Run Modus funktional für sichere Tests
- [ ] Code-Review durchgeführt und approved
- [ ] Production-Deployment vorbereitet

---
**Status**: Aktiv
**Zuletzt aktualisiert**: 2025-08-18