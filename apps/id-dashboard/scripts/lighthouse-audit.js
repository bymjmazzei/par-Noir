#!/usr/bin/env node

import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLighthouse() {
  try {
    console.log('Starting Lighthouse audit...');
    
    const chrome = await launch({ 
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] 
    });
    
    const options = {
      logLevel: 'info',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
      port: chrome.port
    };

    console.log('Running Lighthouse on http://localhost:3002...');
    const runnerResult = await lighthouse('http://localhost:3002', options);
    const reportJson = runnerResult.report;
    const scores = runnerResult.lhr.categories;

    await chrome.kill();

    const reportPath = path.join(__dirname, '../lighthouse-report.json');
    fs.writeFileSync(reportPath, reportJson);

    console.log('Lighthouse audit completed successfully!');
    console.log('Scores:');
    console.log(`- Performance: ${Math.round(scores.performance.score * 100)}`);
    console.log(`- Accessibility: ${Math.round(scores.accessibility.score * 100)}`);
    console.log(`- Best Practices: ${Math.round(scores['best-practices'].score * 100)}`);
    console.log(`- SEO: ${Math.round(scores.seo.score * 100)}`);
    if (scores.pwa && scores.pwa.score !== undefined) {
      console.log(`- PWA: ${Math.round(scores.pwa.score * 100)}`);
    } else {
      console.log('- PWA: Not available');
    }
    console.log(`Report saved to: ${reportPath}`);

    return {
      performance: scores.performance,
      accessibility: scores.accessibility,
      bestPractices: scores['best-practices'],
      seo: scores.seo,
      pwa: scores.pwa || null,
      reportPath
    };
  } catch (error) {
    console.error('Lighthouse audit failed:', error.message);
    process.exit(1);
  }
}

// Run audit
runLighthouse(); 