#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Find all TypeScript React components
const files = [
  './apps/id-dashboard/src/components/*.tsx',
  './apps/id-dashboard/src/pages/*.tsx',
  './apps/id-dashboard/src/App.tsx',
  './apps/id-dashboard/src/App.refactored.tsx'
];

const allFiles = [];
files.forEach(pattern => {
  const matches = require('glob').sync(pattern, { 
    ignore: ['./node_modules/**', './dist/**', './build/**', './.git/**'] 
  });
  allFiles.push(...matches);
});

console.log('=== PHASE 2: COMPONENT BREAKDOWN ANALYSIS ===\n');

const componentAnalysis = [];

allFiles.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').length;
    
    // Analyze component complexity
    const hasUseEffect = content.includes('useEffect');
    const hasUseState = content.includes('useState');
    const hasUseCallback = content.includes('useCallback');
    const hasUseMemo = content.includes('useMemo');
    const hasMultipleStates = (content.match(/useState/g) || []).length;
    const hasMultipleEffects = (content.match(/useEffect/g) || []).length;
    
    // Calculate complexity score
    let complexityScore = 0;
    if (lines > 300) complexityScore += 3;
    if (lines > 200) complexityScore += 2;
    if (lines > 100) complexityScore += 1;
    if (hasMultipleStates > 5) complexityScore += 2;
    if (hasMultipleEffects > 3) complexityScore += 2;
    if (hasUseCallback) complexityScore += 1;
    if (hasUseMemo) complexityScore += 1;
    
    if (lines > 100) {
      componentAnalysis.push({
        file,
        lines,
        complexityScore,
        hasUseEffect,
        hasUseState,
        hasUseCallback,
        hasUseMemo,
        multipleStates: hasMultipleStates,
        multipleEffects: hasMultipleEffects
      });
    }
  } catch (error) {
    console.error(`Error analyzing ${file}:`, error.message);
  }
});

// Sort by complexity score
componentAnalysis.sort((a, b) => b.complexityScore - a.complexityScore);

console.log('Components ranked by complexity (Phase 2 breakdown priority):\n');

componentAnalysis.forEach((component, index) => {
  const priority = index < 10 ? '🔴 HIGH' : index < 20 ? '🟡 MEDIUM' : '🟢 LOW';
  console.log(`${priority} ${component.file} (${component.lines} lines, score: ${component.complexityScore})`);
  
  if (component.complexityScore >= 4) {
    console.log(`  → BREAKDOWN RECOMMENDED: Multiple states (${component.multipleStates}), effects (${component.multipleEffects})`);
  }
});

console.log(`\nTotal components analyzed: ${componentAnalysis.length}`);
console.log(`High priority breakdown candidates: ${componentAnalysis.filter(c => c.complexityScore >= 4).length}`);
console.log(`Medium priority breakdown candidates: ${componentAnalysis.filter(c => c.complexityScore >= 2 && c.complexityScore < 4).length}`);

console.log('\n=== PHASE 2 BREAKDOWN STRATEGY ===');
console.log('1. Break down components with 4+ complexity score');
console.log('2. Extract reusable logic into custom hooks');
console.log('3. Create focused sub-components');
console.log('4. Implement proper TypeScript interfaces');
console.log('5. Add memory leak prevention patterns');
