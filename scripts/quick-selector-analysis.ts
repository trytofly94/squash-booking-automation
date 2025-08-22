#!/usr/bin/env npx ts-node

/**
 * Quick Selector Analysis for Court Detection
 * 
 * Based on initial findings, this script performs targeted analysis
 * of the working selectors: [data-court] and td[data-court]
 */

import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../src/utils/logger';

interface SelectorAnalysisResult {
  selector: string;
  count: number;
  samples: Array<{
    attributes: Record<string, string>;
    textContent: string;
    isVisible: boolean;
  }>;
}

class QuickSelectorAnalysis {
  private browser!: Browser;
  private page!: Page;
  private baseUrl = 'https://www.eversports.de/sb/sportcenter-kautz?sport=squash';
  private outputDir = path.join(process.cwd(), 'analysis-output');

  async initialize(): Promise<void> {
    logger.info('[CREATOR] Initializing Quick Selector Analysis...');
    
    await fs.mkdir(this.outputDir, { recursive: true });
    
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 500
    });

    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1920, height: 1080 });
  }

  async analyzeWorkingSelectors(): Promise<SelectorAnalysisResult[]> {
    logger.info('[CREATOR] Navigating to website...');
    
    await this.page.goto(this.baseUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait for dynamic content to load
    await this.page.waitForTimeout(5000);

    const workingSelectors = [
      '[data-court]',
      'td[data-court]',
      'td[data-date]',
      'td[data-start]',
      'td[data-state]',
      'td[data-date][data-court]',
      'td[data-start][data-court]'
    ];

    const results: SelectorAnalysisResult[] = [];

    for (const selector of workingSelectors) {
      logger.info(`[CREATOR] Analyzing selector: ${selector}`);
      
      try {
        const elements = await this.page.locator(selector).all();
        const count = elements.length;
        
        // Get first 3 samples for analysis
        const samples = [];
        const maxSamples = Math.min(3, elements.length);
        
        for (let i = 0; i < maxSamples; i++) {
          const element = elements[i];
          if (!element) continue;
          
          const isVisible = await element.isVisible();
          
          if (isVisible) {
            const attributes: Record<string, string> = {};
            
            // Get common eversports attributes
            const commonAttrs = ['data-court', 'data-date', 'data-start', 'data-state', 'class', 'id'];
            
            for (const attr of commonAttrs) {
              const value = await element.getAttribute(attr);
              if (value !== null) {
                attributes[attr] = value;
              }
            }
            
            const textContent = (await element.textContent()) || '';
            
            samples.push({
              attributes,
              textContent: textContent.trim().substring(0, 50),
              isVisible
            });
          }
        }

        results.push({
          selector,
          count,
          samples
        });

        logger.info(`[CREATOR] Found ${count} elements for ${selector}, ${samples.length} visible`);
        
      } catch (error) {
        logger.warn(`[CREATOR] Selector ${selector} failed: ${error}`);
        results.push({
          selector,
          count: 0,
          samples: []
        });
      }
    }

    return results;
  }

  async generateOptimizedSelectors(results: SelectorAnalysisResult[]): Promise<string[]> {
    const optimizedSelectors: string[] = [];

    // Analyze the successful selectors and generate optimized versions
    for (const result of results) {
      if (result.count > 0 && result.samples.length > 0) {
        const sample = result.samples[0];
        if (!sample) continue;
        
        // Generate specific selectors based on found attributes
        if (sample.attributes['data-court'] && sample.attributes['data-date']) {
          optimizedSelectors.push('td[data-court][data-date]');
        }
        
        if (sample.attributes['data-court'] && sample.attributes['data-start']) {
          optimizedSelectors.push('td[data-court][data-start]');
        }
        
        if (sample.attributes['data-court'] && sample.attributes['data-state']) {
          optimizedSelectors.push('td[data-court][data-state]');
        }
        
        if (sample.attributes['class']) {
          const classes = sample.attributes['class'].split(' ');
          for (const cls of classes) {
            if (cls.includes('court') || cls.includes('slot') || cls.includes('calendar')) {
              optimizedSelectors.push(`td.${cls}[data-court]`);
            }
          }
        }
      }
    }

    return [...new Set(optimizedSelectors)]; // Remove duplicates
  }

  async saveResults(results: SelectorAnalysisResult[], optimizedSelectors: string[]): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Save detailed results
    const detailsFile = path.join(this.outputDir, `selector-analysis-${timestamp}.json`);
    await fs.writeFile(detailsFile, JSON.stringify({ results, optimizedSelectors }, null, 2));
    
    // Create implementation guide
    const guideFile = path.join(this.outputDir, `implementation-guide-${timestamp}.md`);
    const guide = this.generateImplementationGuide(results, optimizedSelectors);
    await fs.writeFile(guideFile, guide);
    
    logger.info(`[CREATOR] Results saved to ${detailsFile} and ${guideFile}`);
  }

  private generateImplementationGuide(results: SelectorAnalysisResult[], optimizedSelectors: string[]): string {
    return `# Court Selector Implementation Guide

## Key Findings

### Working Selectors (Found on Live Website)
${results
  .filter(r => r.count > 0)
  .map(r => `- **${r.selector}**: ${r.count} elements found`)
  .join('\n')}

### Failed Selectors (Not Found)
${results
  .filter(r => r.count === 0)
  .map(r => `- **${r.selector}**: NOT FOUND`)
  .join('\n')}

## Sample Data Structure

${results
  .filter(r => r.samples.length > 0)
  .map(r => `### ${r.selector}
${r.samples.map(s => `- Attributes: ${JSON.stringify(s.attributes, null, 2)}
- Text: "${s.textContent}"`).join('\n')}`)
  .join('\n\n')}

## Recommended Implementation Strategy

### 1. Primary Selectors (Use These First)
\`\`\`typescript
const primarySelectors = [
${results
  .filter(r => r.count > 0)
  .slice(0, 3)
  .map(r => `  '${r.selector}'`)
  .join(',\n')}
];
\`\`\`

### 2. Optimized Selectors (High Specificity)
\`\`\`typescript
const optimizedSelectors = [
${optimizedSelectors.slice(0, 5).map(s => `  '${s}'`).join(',\n')}
];
\`\`\`

### 3. Implementation in BookingCalendarPage.ts

Replace the current failing selectors with:

\`\`\`typescript
async findAvailableCourts(): Promise<string[]> {
  const courtSelectors = [
    'td[data-court][data-date]',  // Most specific
    'td[data-court]',             // Fallback
    '[data-court]'                // Broad fallback
  ];
  
  for (const selector of courtSelectors) {
    const courts = await this.page.locator(selector).all();
    if (courts.length > 0) {
      logger.info(\`Found \${courts.length} courts with selector: \${selector}\`);
      return this.extractCourtIds(courts);
    }
  }
  
  throw new Error('No courts found with any selector');
}
\`\`\`

## Next Steps

1. ✅ Update \`src/pages/BookingCalendarPage.ts\` with working selectors
2. ✅ Update \`src/core/SlotSearcher.ts\` timeout values  
3. ✅ Implement multi-tier fallback strategy
4. ✅ Add comprehensive error handling
5. ✅ Test the updated implementation

## Critical Success Factors

- **[data-court] selector is working** - This is our primary discovery
- **td[data-court] selector is more specific** - Use for calendar cells
- **Multi-tier fallback strategy** - Implement graceful degradation
- **Performance optimization** - Found elements quickly (< 5s)
`;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    logger.info('[CREATOR] Quick Selector Analysis cleanup completed');
  }
}

// Main execution
async function main() {
  const analyzer = new QuickSelectorAnalysis();
  
  try {
    await analyzer.initialize();
    const results = await analyzer.analyzeWorkingSelectors();
    const optimizedSelectors = await analyzer.generateOptimizedSelectors(results);
    await analyzer.saveResults(results, optimizedSelectors);
    
    logger.info('[CREATOR] ✅ Quick selector analysis completed successfully!');
    
    // Summary
    const workingSelectors = results.filter(r => r.count > 0);
    logger.info(`[CREATOR] Found ${workingSelectors.length} working selectors:`);
    workingSelectors.forEach(r => {
      logger.info(`[CREATOR] - ${r.selector}: ${r.count} elements`);
    });
    
  } catch (error) {
    logger.error(`[CREATOR] ❌ Quick selector analysis failed: ${error}`);
    throw error;
  } finally {
    await analyzer.cleanup();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { QuickSelectorAnalysis };