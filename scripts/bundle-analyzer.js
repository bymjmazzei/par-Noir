#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== PHASE 3.2: BUNDLE ANALYSIS AND OPTIMIZATION ===\n');

// Analyze component sizes and dependencies
const analyzeComponentSizes = () => {
  const componentsDir = './apps/id-dashboard/src/components';
  const pagesDir = './apps/id-dashboard/src/pages';
  
  const allFiles = [];
  
  // Get all component files
  const getFilesRecursively = (dir) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          getFilesRecursively(filePath);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          allFiles.push(filePath);
        }
      });
    }
  };
  
  getFilesRecursively(componentsDir);
  getFilesRecursively(pagesDir);
  
  const componentAnalysis = [];
  
  allFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').length;
      const sizeKB = (content.length / 1024).toFixed(2);
      
      // Count imports
      const importMatches = content.match(/import.*from/g) || [];
      const importCount = importMatches.length;
      
      // Count React hooks
      const hookMatches = content.match(/use[A-Z][a-zA-Z]*/g) || [];
      const hookCount = hookMatches.length;
      
      // Count JSX elements
      const jsxMatches = content.match(/<[A-Z][a-zA-Z]*/g) || [];
      const jsxCount = jsxMatches.length;
      
      componentAnalysis.push({
        file: path.relative('./apps/id-dashboard/src', file),
        lines,
        sizeKB,
        importCount,
        hookCount,
        jsxCount,
        complexity: lines + (importCount * 2) + (hookCount * 3) + (jsxCount * 2)
      });
    } catch (error) {
      console.error(`Error analyzing ${file}:`, error.message);
    }
  });
  
  // Sort by complexity
  componentAnalysis.sort((a, b) => b.complexity - a.complexity);
  
  return componentAnalysis;
};

// Analyze bundle optimization opportunities
const analyzeBundleOptimization = (componentAnalysis) => {
  console.log('=== BUNDLE SIZE ANALYSIS ===\n');
  
  const totalSize = componentAnalysis.reduce((sum, comp) => sum + parseFloat(comp.sizeKB), 0);
  const totalLines = componentAnalysis.reduce((sum, comp) => sum + comp.lines, 0);
  
  console.log(`Total Bundle Size: ${totalSize.toFixed(2)} KB`);
  console.log(`Total Lines of Code: ${totalLines.toLocaleString()}`);
  console.log(`Average Component Size: ${(totalSize / componentAnalysis.length).toFixed(2)} KB`);
  console.log(`Average Component Lines: ${Math.round(totalLines / componentAnalysis.length)}`);
  
  console.log('\n=== TOP 10 LARGEST COMPONENTS ===');
  componentAnalysis.slice(0, 10).forEach((comp, index) => {
    console.log(`${index + 1}. ${comp.file} - ${comp.sizeKB} KB (${comp.lines} lines, complexity: ${comp.complexity})`);
  });
  
  console.log('\n=== BUNDLE OPTIMIZATION RECOMMENDATIONS ===');
  
  // Identify large components that could be code-split
  const largeComponents = componentAnalysis.filter(comp => comp.sizeKB > 10);
  if (largeComponents.length > 0) {
    console.log('\n🔴 LARGE COMPONENTS (Code-splitting candidates):');
    largeComponents.forEach(comp => {
      console.log(`   - ${comp.file}: ${comp.sizeKB} KB - Consider lazy loading`);
    });
  }
  
  // Identify components with many imports
  const highImportComponents = componentAnalysis.filter(comp => comp.importCount > 15);
  if (highImportComponents.length > 0) {
    console.log('\n🟡 HIGH IMPORT COMPONENTS (Bundle optimization candidates):');
    highImportComponents.forEach(comp => {
      console.log(`   - ${comp.file}: ${comp.importCount} imports - Consider tree-shaking`);
    });
  }
  
  // Identify components with many hooks
  const highHookComponents = componentAnalysis.filter(comp => comp.hookCount > 8);
  if (highHookComponents.length > 0) {
    console.log('\n🟠 HIGH HOOK COMPONENTS (Performance optimization candidates):');
    highHookComponents.forEach(comp => {
      console.log(`   - ${comp.file}: ${comp.hookCount} hooks - Consider custom hooks`);
    });
  }
  
  return {
    totalSize,
    totalLines,
    largeComponents,
    highImportComponents,
    highHookComponents
  };
};

// Generate optimization report
const generateOptimizationReport = (analysis) => {
  const report = `
# BUNDLE OPTIMIZATION REPORT

## Summary
- Total Bundle Size: ${analysis.totalSize.toFixed(2)} KB
- Total Lines of Code: ${analysis.totalLines.toLocaleString()}
- Components Analyzed: ${analysis.largeComponents.length + analysis.highImportComponents.length + analysis.highHookComponents.length}

## Optimization Opportunities

### 1. Code Splitting (Large Components)
${analysis.largeComponents.map(comp => `- ${comp.file}: ${comp.sizeKB} KB`).join('\n')}

### 2. Bundle Optimization (High Imports)
${analysis.highImportComponents.map(comp => `- ${comp.file}: ${comp.importCount} imports`).join('\n')}

### 3. Performance Optimization (High Hooks)
${analysis.highHookComponents.map(comp => `- ${comp.file}: ${comp.hookCount} hooks`).join('\n')}

## Recommendations
1. Implement React.lazy() for large components
2. Use dynamic imports for route-based code splitting
3. Optimize import statements and remove unused imports
4. Extract custom hooks for complex logic
5. Consider using React.Suspense for loading states
`;

  fs.writeFileSync('./BUNDLE_OPTIMIZATION_REPORT.md', report);
  console.log('\n📄 Bundle optimization report generated: BUNDLE_OPTIMIZATION_REPORT.md');
};

// Run analysis
const componentAnalysis = analyzeComponentSizes();
const bundleAnalysis = analyzeBundleOptimization(componentAnalysis);
generateOptimizationReport(bundleAnalysis);

console.log('\n=== PHASE 3.2 COMPLETED ===');
console.log('Bundle analysis completed! Check BUNDLE_OPTIMIZATION_REPORT.md for detailed recommendations.');
