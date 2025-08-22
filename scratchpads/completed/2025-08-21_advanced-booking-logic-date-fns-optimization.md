# Advanced Booking Logic with date-fns and Optimized Slot Selection

**Erstellt**: 2025-08-21
**Typ**: Feature/Enhancement
**Geschätzter Aufwand**: Groß
**Verwandtes Issue**: GitHub #9 - Advanced Booking Logic with date-fns and Optimized Slot Selection

## Kontext & Ziel
Implementierung einer erweiterten Buchungslogik mit verbesserter Datumsbehandlung durch date-fns-Integration und optimierten Slot-Auswahl-Algorithmen. Das Ziel ist es, die Buchungserfolgsquote durch intelligente Slot-Selektion, Zeitzonen-Awareness und Pattern-basiertes Lernen zu verbessern.

## Anforderungen
- [ ] Integration von date-fns und date-fns-tz für robuste Datumsberechnungen
- [ ] Ersetzen der nativen JavaScript Date-Objekte durch date-fns-Funktionen
- [ ] Zeitzonen-bewusste Datumskalkulationen implementieren
- [ ] Erweiterte Slot-Auswahl-Algorithmen mit Court-Präferenzen
- [ ] Pattern-Analyse für Buchungserfolg implementieren (Basic)
- [ ] Fallback-Strategien für alternative Zeitslots
- [ ] Court-Scoring-System basierend auf Erfolgswahrscheinlichkeit
- [ ] Holiday/Wochenend-Awareness für Buchungslogik
- [ ] Alle bestehenden Funktionalitäten erhalten
- [ ] Umfassende Test-Abdeckung für neue Features

## Untersuchung & Analyse

### Aktuelle Implementierung (Ist-Zustand):
1. **DateTimeCalculator.ts**:
   - Nutzt native JavaScript Date-Objekte
   - Keine Zeitzonen-spezifische Behandlung
   - Basis-Arithmetik für Datum/Zeit-Berechnungen
   - Keine Holiday-Awareness
   - Feste 30-Minuten-Slot-Logik

2. **SlotSearcher.ts**:
   - Einfache Court-Iteration ohne Präferenz-System
   - Lineare Slot-Suche ohne Optimierung
   - Keine Pattern-Analyse oder Lernen
   - Keine Fallback-Strategien für alternative Zeiten

3. **BookingManager.ts**:
   - Basis-Retry-Mechanismus ohne intelligente Backoff-Strategien
   - Keine Court-Scoring oder Präferenz-Behandlung
   - Feste Zielzeiten ohne flexible Alternativen

4. **Identifizierte Verbesserungsmöglichkeiten**:
   - DST-Übergänge können zu Fehlern führen
   - Keine Berücksichtigung lokaler Feiertage
   - Suboptimale Slot-Auswahl bei hoher Nachfrage
   - Fehlende Lernfähigkeit aus vergangenen Buchungsversuchen
   - Keine Court-spezifische Optimierung

### Vorherige verwandte Arbeiten:
- **2025-08-19_comprehensive-testing-validation-and-optimization.md**: Umfassende Tests und Core-Module-Validierung abgeschlossen
- **2025-08-18_squash-booking-playwright-conversion.md**: Grundlegende Playwright-Konvertierung implementiert
- **Aktuelle PRs**: Retry-Mechanismen (#14) und Anti-Detection-Features (#13) in Arbeit

### Technische Anforderungen aus Issue #9:
```bash
# Neue Dependencies:
npm install date-fns date-fns-tz

# Neue Environment-Variablen:
TIMEZONE=Europe/Berlin
PREFERRED_COURTS=1,3,5
BOOKING_PATTERN_LEARNING=true
FALLBACK_TIME_RANGE=120  # minutes
```

## Implementierungsplan

### Phase 1: Dependency-Setup und Konfiguration
- [ ] date-fns und date-fns-tz installieren und konfigurieren
- [ ] Neue Environment-Variablen zu .env.example hinzufügen
- [ ] TypeScript-Typen für erweiterte Konfiguration definieren
- [ ] BookingConfig-Interface um neue Optionen erweitern:
  - timezone: string (default: 'Europe/Berlin')
  - preferredCourts: string[] (default: [])
  - enablePatternLearning: boolean (default: false)
  - fallbackTimeRange: number (default: 120)
  - holidayProvider?: HolidayProvider

### Phase 2: DateTimeCalculator Enhancement
- [ ] **Vollständige date-fns Migration**:
  - Ersetzen aller Date()-Konstruktoren durch date-fns Funktionen
  - format(), parseISO(), addDays(), startOfDay() implementieren
  - isWithinInterval(), differenceInMinutes() für Slot-Berechnungen
- [ ] **Timezone-Awareness implementieren**:
  - zonedTimeToUtc(), utcToZonedTime() für lokale Zeit-Konvertierung
  - DST-sichere Berechnungen mit date-fns-tz
  - Konfigurierbare Timezone-Unterstützung
- [ ] **Holiday/Wochenend-Detection**:
  - isWeekend(), getDay() für Wochenenderkennung
  - Optionale Holiday-Provider-Integration (deutsche Feiertage)
  - Business-Hours-Validation für Buchungszeiten
- [ ] **Erweiterte Zeit-Arithmetik**:
  - Flexible Slot-Duration-Berechnung (nicht nur 30min)
  - Business-Hours-aware Slot-Generierung
  - Time-Range-Validation mit besseren Error-Messages

### Phase 3: Optimierte Slot-Selection-Algorithmen
- [ ] **Court-Scoring-System implementieren**:
  - CourtScorer-Klasse für Erfolgswahrscheinlichkeits-Berechnung
  - Faktoren: Historische Verfügbarkeit, Beliebtheit, Position
  - Gewichtungs-System für verschiedene Kriterien
- [ ] **Pattern-Analyse (Basic)**:
  - BookingPattern-Interface für Erfolgs-/Fehlschlag-Tracking
  - Simple JSON-basierte Pattern-Storage (für Start)
  - Success-Rate-Berechnung pro Court und Zeitslot
  - Pattern-basierte Court-Priorisierung
- [ ] **Erweiterte Slot-Suche**:
  - Multi-Criteria-Slot-Ranking (Zeit, Court, Verfügbarkeit)
  - Preferred-Time-Range-Algorithmus mit Gewichtung
  - Alternative-Time-Generation basierend auf Präferenzen
  - Optimierte Slot-Pairing für bessere Isolation-Vermeidung

### Phase 4: Fallback-Strategien und Smart Alternatives  
- [ ] **Flexible Time-Slot-Generation**:
  - TimeSlotGenerator-Klasse mit konfigurierbaren Parametern
  - Alternative-Time-Calculation basierend auf FALLBACK_TIME_RANGE
  - Priority-Queue für Zeitslot-Ranking nach Präferenz-Distance
- [ ] **Smart Fallback-Logic**:
  - FallbackStrategy-Interface mit verschiedenen Strategien
  - Zeitbasierte Fallbacks (±15min, ±30min, ±60min intervals)
  - Court-basierte Fallbacks (Präferenz-Liste durchgehen)
  - Tagesbasierte Fallbacks (nächste verfügbare Tage)
- [ ] **Booking-Window-Optimization**:
  - Optimale Booking-Zeit-Berechnung basierend auf Website-Traffic
  - Load-balancing über verschiedene Tageszeiten
  - Peak-Zeit-Vermeidung mit intelligenten Delays

### Phase 5: Integration in bestehende Core-Module
- [ ] **BookingManager Updates**:
  - Neue Konfiguration für erweiterte Features verarbeiten
  - Pattern-Learning-Integration in Erfolgs-/Fehlschlag-Handling
  - Smart-Retry-Logic mit Court-Scoring-Berücksichtigung
  - Enhanced Error-Handling für Timezone-spezifische Probleme
- [ ] **SlotSearcher Refactoring**:
  - Integration des neuen Court-Scoring-Systems
  - Multi-Strategy-Search-Implementation
  - Pattern-aware Slot-Priorisierung
  - Performance-Optimierung für erweiterte Algorithmen
- [ ] **IsolationChecker Enhancements**:
  - date-fns-basierte Zeit-Arithmetik für Isolation-Checks
  - Erweiterte Isolation-Patterns für variable Slot-Sizes
  - Smart Isolation-Avoidance mit alternativen Zeitfenstern

### Phase 6: Configuration und Environment-Integration
- [ ] **Erweiterte BookingConfig**:
  ```typescript
  interface AdvancedBookingConfig extends BookingConfig {
    timezone: string;
    preferredCourts: string[];
    enablePatternLearning: boolean;
    fallbackTimeRange: number; // minutes
    courtScoringWeights: CourtScoringWeights;
    timePreferences: TimePreference[];
    holidayProvider?: HolidayProvider;
  }
  ```
- [ ] **Environment-Variable-Handling**:
  - Validation für neue ENV-Vars mit defaults
  - Type-safe Environment-Configuration-Loading
  - Runtime-Configuration-Updates für Pattern-Learning
- [ ] **Pattern-Storage-System**:
  - JSON-basierte Pattern-Persistence (für Start)
  - BookingHistory-Interface für Success/Failure-Tracking
  - Automatic Pattern-Cleanup (alte Daten entfernen)

### Phase 7: Type-Definitions und Interfaces
- [ ] **Neue TypeScript-Interfaces**:
  ```typescript
  interface CourtScoringWeights {
    availability: number;    // 0.4
    historical: number;      // 0.3
    preference: number;      // 0.2
    position: number;        // 0.1
  }
  
  interface TimePreference {
    startTime: string;
    priority: number;        // 1-10
    flexibility: number;     // minutes
  }
  
  interface BookingPattern {
    courtId: string;
    timeSlot: string;
    dayOfWeek: number;
    successRate: number;
    totalAttempts: number;
    lastUpdated: Date;
  }
  
  interface HolidayProvider {
    isHoliday(date: Date): boolean;
    getNextBusinessDay(date: Date): Date;
    getHolidayName(date: Date): string | null;
  }
  ```

### Phase 8: Comprehensive Testing
- [ ] **Unit-Tests für neue Module**:
  - DateTimeCalculator mit date-fns (Timezone-Tests, DST-Übergänge)
  - CourtScorer Algorithmus-Tests mit verschiedenen Szenarien
  - TimeSlotGenerator mit Edge-Cases und Boundary-Conditions
  - Pattern-Analysis mit Mock-Daten und verschiedenen Success-Rates
- [ ] **Integration-Tests**:
  - End-to-End-Tests mit erweiterten Booking-Konfigurationen
  - Multi-Court-Scenario-Tests mit Pattern-Learning
  - Fallback-Strategy-Tests unter verschiedenen Verfügbarkeits-Bedingungen
  - Timezone-übergreifende Tests (verschiedene Zeitzonen simulieren)
- [ ] **Performance-Tests**:
  - Benchmark neuer Algorithmen gegen alte Implementation
  - Memory-Usage-Tests für Pattern-Storage
  - Load-Tests mit vielen Courts und Zeitslots
  - Latenz-Tests für Smart-Scoring-Berechnung

### Phase 9: Documentation und Migration
- [ ] **Code-Dokumentation**:
  - JSDoc für alle neuen Klassen und Methoden
  - Algorithm-Explanation für Court-Scoring-System
  - Configuration-Guide für neue Environment-Variables
  - Migration-Guide von alter zu neuer API
- [ ] **User-Documentation Updates**:
  - README.md mit neuen Features und Konfiguration
  - .env.example mit allen neuen Variablen und Erklärungen
  - Troubleshooting-Guide für Timezone und Pattern-Learning
  - Best-Practices für Court-Preferences und Time-Ranges
- [ ] **Backwards-Compatibility**:
  - Graceful Fallbacks für fehlende neue Konfiguration
  - Default-Values für alle neuen Features
  - Deprecation-Warnings für veraltete APIs (falls nötig)

### Phase 10: Monitoring und Validation
- [ ] **Enhanced Logging**:
  - Structured Logging für Court-Scoring-Decisions
  - Pattern-Learning-Progress-Logging
  - Timezone-Conversion-Logging für Debugging
  - Performance-Metrics für Algorithm-Execution-Time
- [ ] **Validation Framework**:
  - Real-world Testing gegen echte Website (Dry-Run)
  - A/B-Testing zwischen alter und neuer Logic
  - Success-Rate-Monitoring für verschiedene Konfigurationen
  - Error-Rate-Analysis für neue Features
- [ ] **Production-Readiness**:
  - Feature-Flags für schrittweise Rollout-Möglichkeit
  - Circuit-Breaker für Pattern-Learning bei Fehlern
  - Monitoring-Dashboards für neue Metriken
  - Alerting für Algorithm-Performance-Degradation

## Fortschrittsnotizen

**2025-08-21 - Planner Phase**: Detaillierte Analyse von Issue #9 durchgeführt. Aktuelle Codebase analysiert - DateTimeCalculator, SlotSearcher und BookingManager verstanden. Umfassender 10-Phasen-Plan erstellt der bestehende Funktionalität erhält und erweitert. Pattern-Learning als "Basic" implementiert mit JSON-Storage für einfachen Start.

**Erkenntnisse aus Codebase-Analyse**:
- DateTimeCalculator nutzt aktuell native Date() mit einfacher Arithmetik
- SlotSearcher hat bereits gute Court-Multi-Search-Logik, braucht Scoring-Enhancement
- BookingManager hat solides Retry-System, aber ohne intelligente Court-Präferenz
- IsolationChecker ist bereits implementiert, braucht date-fns-Integration
- Bestehende Tests sind vorhanden, brauchen Erweiterung für neue Features
- Package.json zeigt moderne Tool-Setup mit Playwright, Jest, TypeScript

**Risiken identifiziert**:
- date-fns Migration muss carefully durchgeführt werden (Breaking Changes möglich)
- Pattern-Learning erfordert Persistent-Storage (JSON als Start, später Database)
- Timezone-Integration kann komplexe Edge-Cases haben (DST-Übergangs)
- Performance-Impact von Court-Scoring-Algorithmen muss überwacht werden

## Ressourcen & Referenzen
- [date-fns Documentation](https://date-fns.org/docs/Getting-Started)
- [date-fns-tz for Timezone Support](https://github.com/marnusw/date-fns-tz)
- [GitHub Issue #9](https://github.com/trytofly94/squash-booking-automation/issues/9)
- [Playwright Best Practices für Time-based Testing](https://playwright.dev/docs/clock)
- [TypeScript Advanced Types für Configuration](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- Bestehende Core-Module: BookingManager, SlotSearcher, DateTimeCalculator, IsolationChecker
- Verwandte Scratchpads: 2025-08-19_comprehensive-testing-validation-and-optimization.md

## Abschluss-Checkliste
- [ ] date-fns und date-fns-tz erfolgreich integriert
- [ ] Alle native Date-Objekte durch date-fns-Funktionen ersetzt
- [ ] Timezone-aware Berechnungen implementiert und getestet
- [ ] Court-Scoring-System funktional mit konfigurierbaren Gewichten
- [ ] Pattern-Learning (Basic) mit JSON-Storage implementiert
- [ ] Fallback-Strategien für alternative Zeitslots funktional
- [ ] Holiday/Wochenend-Awareness implementiert
- [ ] Alle bestehenden Tests bestehen weiterhin
- [ ] Neue umfassende Test-Suite für erweiterte Features
- [ ] Backwards-Compatibility gewährleistet
- [ ] Documentation vollständig aktualisiert
- [ ] Real-world Dry-Run Testing gegen echte Website erfolgreich
- [ ] Performance-Benchmarks erfüllen oder übertreffen alte Implementation
- [ ] Code-Review und Quality-Gates bestanden
- [ ] Production-Ready-Validation abgeschlossen

---
**Status**: Aktiv  
**Zuletzt aktualisiert**: 2025-08-21