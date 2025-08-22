#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files to process (excluding node_modules, dist, test files)
const sourceFiles = [
  'core/identity-core/src/**/*.ts',
  'apps/id-dashboard/src/**/*.ts',
  'apps/id-dashboard/src/**/*.tsx',
  'sdk/identity-sdk/src/**/*.ts'
];

// Console statement patterns to replace
const consolePatterns = [
  {
    pattern: /console\.log\((.*?)\);?/g,
    replacement: '// console.log($1); // Removed for production'
  },
  {
    pattern: /console\.warn\((.*?)\);?/g,
    replacement: '// console.warn($1); // Removed for production'
  },
  {
    pattern: /console\.error\((.*?)\);?/g,
    replacement: '// console.error($1); // Removed for production'
  },
  {
    pattern: /console\.info\((.*?)\);?/g,
    replacement: '// console.info($1); // Removed for production'
  }
];

// Development-only console statements (keep these)
const devConsolePatterns = [
  /console\.log\(.*development.*\)/gi,
  /console\.warn\(.*development.*\)/gi,
  /console\.error\(.*development.*\)/gi,
  /console\.info\(.*development.*\)/gi
];

function shouldKeepConsoleStatement(line) {
  return devConsolePatterns.some(pattern => pattern.test(line));
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let newContent = content;

    // Process each pattern
    consolePatterns.forEach(({ pattern, replacement }) => {
      newContent = newContent.replace(pattern, (match, args) => {
        // Check if this should be kept (development-only)
        if (shouldKeepConsoleStatement(match)) {
          return match;
        }
        modified = true;
        return replacement;
      });
    });

    if (modified) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Cleaned: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function findFiles(pattern) {
  const glob = require('glob');
  return glob.sync(pattern, { ignore: ['**/node_modules/**', '**/dist/**', '**/test/**', '**/__tests__/**'] });
}

// Main execution
console.log('🧹 Cleaning up console statements...');

let totalProcessed = 0;
let totalCleaned = 0;

sourceFiles.forEach(pattern => {
  const files = findFiles(pattern);
  files.forEach(file => {
    totalProcessed++;
    processFile(file);
  });
});

console.log(`\n📊 Summary:`);
console.log(`   Files processed: ${totalProcessed}`);
console.log(`   Console statements removed: ${totalCleaned}`);
console.log(`\n✅ Console cleanup complete!`);
