# Live-Testing Optimierung und Website-Analyse

**Erstellt**: 2025-08-20
**Typ**: Enhancement/Testing/Analysis
**Geschätzter Aufwand**: Groß
**Verwandtes Issue**: Request für Live-Website-Testing und Selector-Optimierung

## Kontext & Ziel
Das bestehende Squash-Booking-System navigiert erfolgreich zur eversports.de Website, hat jedoch kritische Probleme beim Erkennen der Court-Selektoren und der Kalenderstruktur. Hauptproblem: Timeout-Fehler beim Finden von `[data-testid="court-selector"], .court-list, .calendar-view` Elementen. Das System muss für zuverlässige Live-Website-Interaktion optimiert werden, indem jede Seite während der Navigation analysiert und alle Interaktionen optimiert werden.

**Identifizierte Kernprobleme:**
1. Court-Selector-Timeout nach 10 Sekunden
2. Veraltete/ungenaue DOM-Selektoren
3. Fehlende Echtzeitanalyse der Website-Struktur
4. Unzureichende Selector-Fallback-Strategien

## Anforderungen
- [ ] Echtzeitanalyse der eversports.de Website-Struktur während Navigation
- [ ] Optimierung aller Selector-Strategien basierend auf tatsächlicher DOM-Struktur
- [ ] Implementierung robuster Fallback-Mechanismen für alle Interaktionen
- [ ] Erstellung von GitHub Issues für jeden gefundenen Problem-Bereich
- [ ] Comprehensive Website-Mapping und Selector-Dokumentation
- [ ] Performance-Optimierung der Timing- und Wait-Strategien
- [ ] Live-Testing-Dashboard für kontinuierliches Monitoring

## Untersuchung & Analyse

### Aktueller Status (basierend auf Test-Logs):
1. **Navigation erfolgreich**: Website wird korrekt geladen (https://www.eversports.de/sb/sportcenter-kautz?sport=squash)
2. **Date Navigation funktioniert**: Alternative Datumsnavigation funktioniert
3. **Court-Detection fehlgeschlagen**: Timeout bei `[data-testid="court-selector"], .court-list, .calendar-view`
4. **SlotSearcher kann keine Courts finden**: Führt zu "No available slot pairs found"

### Problemanalyse aus bestehenden Tests:
- Alle Tests schlagen beim gleichen Punkt fehl: Court-Detection
- System kommt bis zur Datumsnavigation, scheitert dann an Selector-Problemen
- Retry-Mechanismus funktioniert, aber scheitert konsistent am gleichen Problem
- Performance ist OK (Navigation in ~3 Sekunden), aber Selector-Timeouts sind zu lang

### Prior Art Recherche:
- Vorherige Implementierung basierte auf JSON-Automation mit spezifischen Eversports-Selektoren
- `td[data-date][data-start][data-court][data-state]` Schema war erfolgreich
- BookingCalendarPage hat bereits Eversports-spezifische Selektoren, aber möglicherweise unvollständig

## Implementierungsplan

### Phase 1: Website-Struktur-Analyse und DOM-Mapping
- [ ] **Live Website DOM-Explorer erstellen**:
  - Playwright-Script für Echtzeitanalyse der DOM-Struktur
  - Screenshot-basierte Dokumentation jeder Seite
  - Automatische Selector-Extraktion und -Validierung
  - JSON-basierte Website-Map-Erstellung
- [ ] **Court-Detection-Analyse**:
  - Identifikation der tatsächlichen Court-Selector auf der Website
  - Analyse verschiedener View-Modi (Liste, Kalender, etc.)
  - Timing-Analyse: Wann werden Court-Elemente geladen?
  - Mobile vs. Desktop Unterschiede dokumentieren
- [ ] **Calendar-Struktur-Mapping**:
  - Vollständige Analyse der Kalender-DOM-Struktur
  - Time-Slot-Selektoren für alle Court-Arten
  - Verfügbarkeits-Indikatoren (data-state, classes, etc.)
  - Navigation-Element-Mapping (Next/Previous Week)

### Phase 2: Selector-Strategie-Optimierung
- [ ] **Multi-Tier Selector-System implementieren**:
  - Tier 1: Eversports-spezifische Selektoren (höchste Priorität)
  - Tier 2: Semantische/Role-based Selektoren
  - Tier 3: Generic/Fallback-Selektoren
  - Tier 4: Dynamic Selector-Generation basierend auf Page-Analysis
- [ ] **SlotSearcher Selector-Updates**:
  - Ersetzen der aktuellen Court-Selektoren durch validierte Selektoren
  - Implementierung dynamischer Selector-Discovery
  - Timeout-Optimierung für verschiedene Loading-Zustände
  - Retry-Strategien für verschiedene Selector-Tiers
- [ ] **BookingCalendarPage Enhancements**:
  - Erweiterte Eversports-Selektoren basierend auf DOM-Analyse
  - Implementierung intelligenter Wait-Strategien
  - Loading-State-Detection für dynamische Inhalte
  - Cross-viewport Selector-Validation

### Phase 3: Timing und Performance-Optimierung
- [ ] **Adaptive Timeout-Strategien**:
  - Dynamische Timeout-Berechnung basierend auf Network-Conditions
  - Element-spezifische Wait-Strategien (Courts vs. Calendar vs. Navigation)
  - Loading-State-Detection und -Monitoring
  - Performance-Benchmarking für verschiedene Interaktionen
- [ ] **Network-Optimierung**:
  - Request-Interception für API-Call-Monitoring
  - Cache-Strategy-Analysis für wiederholte Navigations-Calls
  - Network-Idle-Detection für bessere Timing-Control
  - Prefetch-Strategien für vorhersagbare Navigation-Patterns

### Phase 4: Error-Handling und Recovery-Mechanismen
- [ ] **Intelligent Retry-Logik**:
  - Context-aware Retry-Strategien (Selector-Fehler vs. Network-Fehler)
  - Exponential Backoff für verschiedene Fehler-Typen
  - Automatic Selector-Fallback bei Timeout-Fehlern
  - Page-Refresh-Recovery bei kritischen Fehlern
- [ ] **Debug-Information-Collection**:
  - Comprehensive Page-State-Logging bei Fehlern
  - DOM-Snapshot-Erstellung für Post-Mortem-Analysis
  - Screenshot-basierte Error-Documentation
  - Network-Traffic-Logging für Debugging

### Phase 5: Live-Website Monitoring und Testing-Infrastructure
- [ ] **Website-Change-Detection**:
  - Automated Daily DOM-Structure-Validation
  - Selector-Health-Checks gegen Live-Website
  - Visual Regression Detection für Layout-Changes
  - API-Endpoint-Monitoring für Breaking Changes
- [ ] **Testing-Dashboard erstellen**:
  - Real-time Booking-Flow-Health-Monitoring
  - Selector-Success-Rate-Tracking
  - Performance-Metrics-Dashboard
  - Alert-System für kritische Failures

### Phase 6: Issue-Tracking und GitHub-Integration
- [ ] **Automated Issue Creation**:
  - GitHub Issue für jedes identifizierte Selector-Problem
  - Issue für Performance-Bottlenecks
  - Issue für neue Website-Features/Changes
  - Issue für Mobile vs. Desktop Discrepancies
- [ ] **Issue-Templates erstellen**:
  - Selector-Problem-Template mit Screenshots
  - Performance-Issue-Template mit Metrics
  - Website-Change-Detection-Template
  - Bug-Report-Template mit Reproduction-Steps

### Phase 7: Advanced Website-Integration-Features
- [ ] **Dynamic Content-Handling**:
  - AJAX-Loading-Detection und -Handling
  - Single-Page-Application Navigation-Support
  - Dynamic Court-Availability-Updates
  - Real-time Slot-Status-Changes
- [ ] **Multi-Language-Support**:
  - German/English Interface-Detection
  - Language-specific Selector-Strategies
  - Locale-specific Date/Time-Handling
  - Currency/Price-Display-Variations

### Phase 8: Production-Readiness und Deployment
- [ ] **Live-Testing-Safe-Mode**:
  - Enhanced Dry-Run-Validation mit Live-Website-Interaction
  - Production-Safety-Checks vor echten Buchungen
  - User-Confirmation-Layers für kritische Actions
  - Rollback-Capabilities bei Fehlern
- [ ] **Monitoring und Alerting**:
  - Real-time Success/Failure-Rate-Monitoring
  - Website-Downtime-Detection
  - Selector-Failure-Alerting
  - Performance-Degradation-Warnings

### Phase 9: Website-Specific Optimierungen
- [ ] **Eversports-Platform-Spezifika**:
  - Sport-Center-spezifische Anpassungen
  - Booking-Rules-Detection und -Handling
  - Peak-Time-Behavior-Analysis
  - Payment-Method-Variations
- [ ] **Cross-Browser-Validation**:
  - Chrome/Firefox/Safari-Compatibility-Testing
  - Mobile-Browser-Testing
  - Different Screen-Resolution-Testing
  - Touch vs. Mouse-Interaction-Optimization

### Phase 10: Documentation und Knowledge-Transfer
- [ ] **Comprehensive Documentation**:
  - Website-Analysis-Findings-Documentation
  - Selector-Strategy-Guide für Future-Maintenance
  - Troubleshooting-Playbook für Common Issues
  - Performance-Optimization-Guidelines
- [ ] **Developer-Experience-Enhancements**:
  - Interactive Website-Explorer-Tools
  - Live-Testing-CLI-Commands
  - Debug-Mode-Enhancements
  - Visual-Testing-Reports

## Fortschrittsnotizen

**2025-08-20 - Initial Analysis**: Scratchpad erstellt basierend auf aktuellen Test-Failures. Hauptproblem identifiziert: Court-Selector-Timeout bei `[data-testid="court-selector"], .court-list, .calendar-view`. System navigiert erfolgreich zur Website, aber kann Court-Elemente nicht finden. Alle Tests scheitern konsistent am gleichen Punkt.

**Kritische Erkenntnisse aus Log-Analyse:**
1. Navigation funktioniert (3-4 Sekunden zur Website)
2. Date-Navigation erfolgreich
3. SlotSearcher.findAvailableCourts() scheitert mit Timeout
4. Alle Retry-Versuche scheitern am gleichen Selector-Problem
5. Dry-Run-Modus funktioniert korrekt

**Nächste Schritte:** Sofortige Live-Website-DOM-Analyse um echte Court-Selektoren zu identifizieren.

## Ressourcen & Referenzen
- [Eversports Sportcenter Kautz](https://www.eversports.de/sb/sportcenter-kautz?sport=squash) - Target-Website
- [Playwright Selector Strategies](https://playwright.dev/docs/locators)
- [DOM Analysis Tools](https://playwright.dev/docs/debug#browser-developer-tools)
- Bestehende Implementation: `src/pages/BookingCalendarPage.ts`, `src/core/SlotSearcher.ts`
- Test-Logs: `test-artifacts/` für aktuelle Failure-Patterns

## GitHub Issues zu erstellen
1. **Selector-Timeout Issue**: Court-Detection Timeout nach 10s
2. **DOM-Mapping Issue**: Vollständige Website-Struktur-Analyse benötigt
3. **Performance Issue**: Selector-Discovery-Performance-Optimization
4. **Mobile-Compatibility Issue**: Mobile vs. Desktop Selector-Differences
5. **Error-Handling Issue**: Bessere Fallback-Strategien für Selector-Failures
6. **Monitoring Issue**: Live-Website-Change-Detection-System
7. **Documentation Issue**: Selector-Strategy-Guide für Maintenance

## Kritische Erfolgsfaktoren
1. **Echte DOM-Struktur-Analyse**: Absolute Priorität - Live-Website analysieren
2. **Robust Selector-Fallbacks**: Multi-Tier-System für Reliability
3. **Performance-Optimization**: Schnelle Element-Detection
4. **Comprehensive Testing**: Alle Website-States und -Conditions abdecken
5. **Monitoring**: Kontinuierliches Website-Change-Monitoring
6. **Documentation**: Wartbare Selector-Strategien dokumentieren

## Abschluss-Checkliste
- [ ] Live-Website DOM-Struktur vollständig analysiert und dokumentiert
- [ ] Alle Court-Detection-Selektoren validiert und optimiert
- [ ] Multi-Tier Selector-System implementiert und getestet
- [ ] Performance-Optimierungen implementiert (< 5s für Court-Detection)
- [ ] Comprehensive Error-Handling und Recovery-Mechanismen
- [ ] GitHub Issues für alle identifizierten Probleme erstellt
- [ ] Live-Testing-Dashboard operational
- [ ] Documentation vollständig für Future-Maintenance
- [ ] Cross-Browser und Mobile-Compatibility validiert
- [ ] Production-Ready Safety-Mechanisms implementiert

---
**Status**: Aktiv
**Zuletzt aktualisiert**: 2025-08-20