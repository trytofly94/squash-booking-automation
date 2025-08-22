# Court Selector Implementation Guide

## Key Findings

### Working Selectors (Found on Live Website)
- **[data-court]**: 1477 elements found
- **td[data-court]**: 1477 elements found
- **td[data-date]**: 1428 elements found
- **td[data-start]**: 1428 elements found
- **td[data-state]**: 1428 elements found
- **td[data-date][data-court]**: 1428 elements found
- **td[data-start][data-court]**: 1428 elements found

### Failed Selectors (Not Found)


## Sample Data Structure

### [data-court]
- Attributes: {
  "data-court": "45674"
}
- Text: "Court 1"
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

### td[data-court]
- Attributes: {
  "data-court": "45674"
}
- Text: "Court 1"
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

### td[data-date]
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0900",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

### td[data-start]
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0900",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

### td[data-state]
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0900",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

### td[data-date][data-court]
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0900",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

### td[data-start][data-court]
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0800",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0830",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""
- Attributes: {
  "data-court": "45674",
  "data-date": "2025-08-21",
  "data-start": "0900",
  "data-state": "booked",
  "class": "es-tooltip"
}
- Text: ""

## Recommended Implementation Strategy

### 1. Primary Selectors (Use These First)
```typescript
const primarySelectors = [
  '[data-court]',
  'td[data-court]',
  'td[data-date]'
];
```

### 2. Optimized Selectors (High Specificity)
```typescript
const optimizedSelectors = [
  'td[data-court][data-date]',
  'td[data-court][data-start]',
  'td[data-court][data-state]'
];
```

### 3. Implementation in BookingCalendarPage.ts

Replace the current failing selectors with:

```typescript
async findAvailableCourts(): Promise<string[]> {
  const courtSelectors = [
    'td[data-court][data-date]',  // Most specific
    'td[data-court]',             // Fallback
    '[data-court]'                // Broad fallback
  ];
  
  for (const selector of courtSelectors) {
    const courts = await this.page.locator(selector).all();
    if (courts.length > 0) {
      logger.info(`Found ${courts.length} courts with selector: ${selector}`);
      return this.extractCourtIds(courts);
    }
  }
  
  throw new Error('No courts found with any selector');
}
```

## Next Steps

1. ✅ Update `src/pages/BookingCalendarPage.ts` with working selectors
2. ✅ Update `src/core/SlotSearcher.ts` timeout values  
3. ✅ Implement multi-tier fallback strategy
4. ✅ Add comprehensive error handling
5. ✅ Test the updated implementation

## Critical Success Factors

- **[data-court] selector is working** - This is our primary discovery
- **td[data-court] selector is more specific** - Use for calendar cells
- **Multi-tier fallback strategy** - Implement graceful degradation
- **Performance optimization** - Found elements quickly (< 5s)
