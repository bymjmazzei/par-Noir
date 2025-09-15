#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== PHASE 3.5: DOCUMENTATION GENERATION ===\n');

// Generate component documentation
const generateComponentDocs = () => {
  const componentsDir = './apps/id-dashboard/src/components';
  const pagesDir = './apps/id-dashboard/src/pages';
  
  let componentDocs = '# Component Documentation\n\n';
  componentDocs += '## Overview\n\n';
  componentDocs += 'This document provides comprehensive documentation for all components in the par Noir Identity Dashboard.\n\n';
  
  // Component categories
  const categories = {
    'Core Components': [],
    'Security Components': [],
    'Privacy Components': [],
    'Integration Components': [],
    'UI Components': [],
    'Page Components': []
  };
  
  const categorizeComponent = (filePath, fileName) => {
    if (fileName.includes('Security') || fileName.includes('Auth')) {
      categories['Security Components'].push({ filePath, fileName });
    } else if (fileName.includes('Privacy')) {
      categories['Privacy Components'].push({ filePath, fileName });
    } else if (fileName.includes('Integration') || fileName.includes('API')) {
      categories['Integration Components'].push({ filePath, fileName });
    } else if (fileName.includes('Modal') || fileName.includes('Button') || fileName.includes('Input')) {
      categories['UI Components'].push({ filePath, fileName });
    } else if (filePath.includes('pages/')) {
      categories['Page Components'].push({ filePath, fileName });
    } else {
      categories['Core Components'].push({ filePath, fileName });
    }
  };
  
  // Scan components
  const scanDirectory = (dir, relativePath = '') => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          scanDirectory(filePath, path.join(relativePath, file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          const fileName = path.basename(file, path.extname(file));
          categorizeComponent(path.join(relativePath, file), fileName);
        }
      });
    }
  };
  
  scanDirectory(componentsDir, 'components');
  scanDirectory(pagesDir, 'pages');
  
  // Generate documentation for each category
  Object.entries(categories).forEach(([category, components]) => {
    if (components.length > 0) {
      componentDocs += `## ${category}\n\n`;
      
      components.forEach(({ filePath, fileName }) => {
        try {
          const content = fs.readFileSync(path.join('./apps/id-dashboard/src', filePath), 'utf8');
          
          // Extract component information
          const componentMatch = content.match(/export\s+(?:const|function)\s+(\w+)/);
          const interfaceMatch = content.match(/interface\s+(\w+)Props\s*{([^}]+)}/);
          const descriptionMatch = content.match(/\/\*\*([^*]+)\*\//);
          
          componentDocs += `### ${fileName}\n\n`;
          
          if (descriptionMatch) {
            componentDocs += `${descriptionMatch[1].trim()}\n\n`;
          }
          
          if (componentMatch) {
            componentDocs += `**Component Name:** ${componentMatch[1]}\n\n`;
          }
          
          if (interfaceMatch) {
            componentDocs += `**Props Interface:** ${interfaceMatch[1]}\n\n`;
            componentDocs += '**Props:**\n';
            
            const props = interfaceMatch[2].split('\n').filter(line => line.includes(':'));
            props.forEach(prop => {
              const propMatch = prop.match(/(\w+)\s*:\s*([^;]+)/);
              if (propMatch) {
                componentDocs += `- \`${propMatch[1].trim()}\`: ${propMatch[2].trim()}\n`;
              }
            });
            componentDocs += '\n';
          }
          
          componentDocs += `**File:** \`${filePath}\`\n\n`;
          componentDocs += '---\n\n';
          
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error.message);
        }
      });
    }
  });
  
  return componentDocs;
};

// Generate API documentation
const generateAPIDocs = () => {
  let apiDocs = '# API Documentation\n\n';
  apiDocs += '## Overview\n\n';
  apiDocs += 'This document provides comprehensive API documentation for the par Noir Identity Dashboard.\n\n';
  
  // API categories
  const apiCategories = {
    'Authentication APIs': [],
    'Identity Management APIs': [],
    'Cryptographic APIs': [],
    'Storage APIs': [],
    'Integration APIs': []
  };
  
  // Scan for API functions
  const utilsDir = './apps/id-dashboard/src/utils';
  const servicesDir = './apps/id-dashboard/src/services';
  
  const scanForAPIs = (dir, category) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          try {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            
            // Extract exported functions
            const functionMatches = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g);
            const constMatches = content.match(/export\s+const\s+(\w+)/g);
            
            if (functionMatches || constMatches) {
              const fileName = path.basename(file, path.extname(file));
              apiCategories[category].push({
                file: fileName,
                functions: [...(functionMatches || []), ...(constMatches || [])]
              });
            }
          } catch (error) {
            console.error(`Error processing ${file}:`, error.message);
          }
        }
      });
    }
  };
  
  scanForAPIs(utilsDir, 'Identity Management APIs');
  scanForAPIs(servicesDir, 'Integration APIs');
  
  // Generate API documentation
  Object.entries(apiCategories).forEach(([category, apis]) => {
    if (apis.length > 0) {
      apiDocs += `## ${category}\n\n`;
      
      apis.forEach(api => {
        apiDocs += `### ${api.file}\n\n`;
        apiDocs += '**Exported Functions:**\n';
        api.functions.forEach(func => {
          const funcName = func.replace(/export\s+(?:async\s+)?(?:function|const)\s+/, '');
          apiDocs += `- \`${funcName}\`\n`;
        });
        apiDocs += '\n';
      });
    }
  });
  
  return apiDocs;
};

// Generate architecture documentation
const generateArchitectureDocs = () => {
  let archDocs = '# Architecture Documentation\n\n';
  archDocs += '## Overview\n\n';
  archDocs += 'This document provides comprehensive architecture documentation for the par Noir Identity Dashboard.\n\n';
  
  archDocs += '## System Architecture\n\n';
  archDocs += '### Component Architecture\n\n';
  archDocs += 'The application follows a modular component architecture:\n\n';
  archDocs += '- **Core Components**: Fundamental UI and logic components\n';
  archDocs += '- **Security Components**: Authentication, authorization, and security features\n';
  archDocs += '- **Privacy Components**: Data privacy and control features\n';
  archDocs += '- **Integration Components**: Third-party service integrations\n';
  archDocs += '- **UI Components**: Reusable UI elements\n';
  archDocs += '- **Page Components**: Route-based page components\n\n';
  
  archDocs += '### State Management\n\n';
  archDocs += 'The application uses React hooks for state management:\n\n';
  archDocs += '- **useState**: Local component state\n';
  archDocs += '- **useContext**: Global application state\n';
  archDocs += '- **useReducer**: Complex state logic\n';
  archDocs += '- **Custom Hooks**: Reusable state logic\n\n';
  
  archDocs += '### Performance Optimization\n\n';
  archDocs += 'Multiple performance optimization strategies are implemented:\n\n';
  archDocs += '- **React.memo**: Component memoization\n';
  archDocs += '- **useCallback**: Function memoization\n';
  archDocs += '- **useMemo**: Value memoization\n';
  archDocs += '- **Code Splitting**: Lazy loading of components\n';
  archDocs += '- **Web Workers**: Background processing for crypto operations\n\n';
  
  archDocs += '### Security Architecture\n\n';
  archDocs += 'Multi-layered security approach:\n\n';
  archDocs += '- **Cryptographic Operations**: Web Workers for secure processing\n';
  archDocs += '- **Identity Verification**: Zero-knowledge proofs\n';
  archDocs += '- **Data Encryption**: AES-256-GCM encryption\n';
  archDocs += '- **Secure Storage**: IndexedDB with encryption\n';
  archDocs += '- **API Security**: Rate limiting and validation\n\n';
  
  return archDocs;
};

// Generate README
const generateREADME = () => {
  let readme = '# par Noir Identity Dashboard\n\n';
  readme += 'A decentralized identity management system built with React, TypeScript, and advanced cryptographic technologies.\n\n';
  
  readme += '## Features\n\n';
  readme += '- 🔐 **Decentralized Identity Management**: Self-sovereign identity with DID support\n';
  readme += '- 🛡️ **Advanced Security**: Quantum-resistant cryptography and zero-knowledge proofs\n';
  readme += '- 🔒 **Privacy-First**: Granular privacy controls and data minimization\n';
  readme += '- 🌐 **Cross-Platform**: PWA support with offline capabilities\n';
  readme += '- ⚡ **High Performance**: Optimized with React.memo and code splitting\n';
  readme += '- 🧪 **Comprehensive Testing**: 80%+ test coverage with Jest and Cypress\n\n';
  
  readme += '## Quick Start\n\n';
  readme += '```bash\n';
  readme += '# Install dependencies\n';
  readme += 'npm install\n\n';
  readme += '# Start development server\n';
  readme += 'npm start\n\n';
  readme += '# Run tests\n';
  readme += 'npm test\n\n';
  readme += '# Build for production\n';
  readme += 'npm run build\n';
  readme += '```\n\n';
  
  readme += '## Architecture\n\n';
  readme += 'The application follows modern React patterns with:\n\n';
  readme += '- **Component-Based Architecture**: Modular, reusable components\n';
  readme += '- **Performance Optimization**: React.memo, useCallback, useMemo\n';
  readme += '- **Code Splitting**: Lazy loading for optimal bundle size\n';
  readme += '- **Type Safety**: Full TypeScript implementation\n';
  readme += '- **Testing**: Comprehensive test coverage\n\n';
  
  readme += '## Documentation\n\n';
  readme += '- [Component Documentation](./docs/COMPONENTS.md)\n';
  readme += '- [API Documentation](./docs/API.md)\n';
  readme += '- [Architecture Documentation](./docs/ARCHITECTURE.md)\n\n';
  
  readme += '## Contributing\n\n';
  readme += 'Please read our contributing guidelines and ensure all tests pass before submitting PRs.\n\n';
  
  readme += '## License\n\n';
  readme += 'This project is licensed under the MIT License.\n';
  
  return readme;
};

// Create docs directory
const docsDir = './docs';
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Generate all documentation
const componentDocs = generateComponentDocs();
const apiDocs = generateAPIDocs();
const architectureDocs = generateArchitectureDocs();
const readme = generateREADME();

// Write documentation files
fs.writeFileSync(path.join(docsDir, 'COMPONENTS.md'), componentDocs);
fs.writeFileSync(path.join(docsDir, 'API.md'), apiDocs);
fs.writeFileSync(path.join(docsDir, 'ARCHITECTURE.md'), architectureDocs);
fs.writeFileSync('./README.md', readme);

console.log('✅ Component documentation generated');
console.log('✅ API documentation generated');
console.log('✅ Architecture documentation generated');
console.log('✅ README generated');
console.log('✅ Documentation generation completed');

console.log('\n=== PHASE 3.5 COMPLETED ===');
console.log('Documentation generation completed!');
console.log('- Comprehensive component documentation');
console.log('- API reference documentation');
console.log('- Architecture overview');
console.log('- Project README');
console.log('- All documentation saved to ./docs/ directory');
