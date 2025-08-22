#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function runTests() {
  const tests = [
    {
      name: 'SDK Structure',
      test: () => {
        const sdkPath = path.join(__dirname, '../sdk/identity-sdk');
        return fs.existsSync(sdkPath);
      }
    },
    {
      name: 'Core Identity Module',
      test: () => {
        const corePath = path.join(__dirname, '../core/identity-core');
        return fs.existsSync(corePath);
      }
    },
    {
      name: 'Dashboard App',
      test: () => {
        const dashboardPath = path.join(__dirname, '../apps/id-dashboard');
        return fs.existsSync(dashboardPath);
      }
    },
    {
      name: 'API Server',
      test: () => {
        const apiPath = path.join(__dirname, '../api');
        return fs.existsSync(apiPath);
      }
    },
    {
      name: 'Tools Directory',
      test: () => {
        const toolsPath = path.join(__dirname, '../tools');
        return fs.existsSync(toolsPath);
      }
    },
    {
      name: 'Browser Components',
      test: () => {
        const browserPath = path.join(__dirname, '../browser');
        return fs.existsSync(browserPath);
      }
    },
    {
      name: 'Package.json Files',
      test: () => {
        const rootPackage = path.join(__dirname, '../package.json');
        const sdkPackage = path.join(__dirname, '../sdk/identity-sdk/package.json');
        const corePackage = path.join(__dirname, '../core/identity-core/package.json');
        const dashboardPackage = path.join(__dirname, '../apps/id-dashboard/package.json');
        
        return fs.existsSync(rootPackage) && 
               fs.existsSync(sdkPackage) && 
               fs.existsSync(corePackage) && 
               fs.existsSync(dashboardPackage);
      }
    },
    {
      name: 'TypeScript Config',
      test: () => {
        const tsConfigPaths = [
          path.join(__dirname, '../tsconfig.json'),
          path.join(__dirname, '../sdk/identity-sdk/tsconfig.json'),
          path.join(__dirname, '../core/identity-core/tsconfig.json'),
          path.join(__dirname, '../apps/id-dashboard/tsconfig.json')
        ];
        
        return tsConfigPaths.every(configPath => fs.existsSync(configPath));
      }
    },
    {
      name: 'Source Files',
      test: () => {
        const sourcePaths = [
          path.join(__dirname, '../sdk/identity-sdk/src'),
          path.join(__dirname, '../core/identity-core/src'),
          path.join(__dirname, '../apps/id-dashboard/src')
        ];
        
        return sourcePaths.every(sourcePath => fs.existsSync(sourcePath));
      }
    },
    {
      name: 'Build Scripts',
      test: () => {
        const packagePaths = [
          path.join(__dirname, '../package.json'),
          path.join(__dirname, '../sdk/identity-sdk/package.json'),
          path.join(__dirname, '../core/identity-core/package.json'),
          path.join(__dirname, '../apps/id-dashboard/package.json')
        ];
        
        return packagePaths.every(pkgPath => {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            return pkg.scripts && pkg.scripts.build;
          } catch {
            return false;
          }
        });
      }
    },
    {
      name: 'Dependencies',
      test: () => {
        const packagePaths = [
          path.join(__dirname, '../package.json'),
          path.join(__dirname, '../sdk/identity-sdk/package.json'),
          path.join(__dirname, '../core/identity-core/package.json'),
          path.join(__dirname, '../apps/id-dashboard/package.json')
        ];
        
        return packagePaths.every(pkgPath => {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            return pkg.dependencies || pkg.devDependencies;
          } catch {
            return false;
          }
        });
      }
    },
    {
      name: 'Documentation',
      test: () => {
        const docPaths = [
          path.join(__dirname, '../README.md'),
          path.join(__dirname, '../docs'),
          path.join(__dirname, '../CHANGELOG.md')
        ];
        
        return docPaths.some(docPath => fs.existsSync(docPath));
      }
    },
    {
      name: 'Configuration Files',
      test: () => {
        const configPaths = [
          path.join(__dirname, '../.gitignore'),
          path.join(__dirname, '../.eslintrc.js'),
          path.join(__dirname, '../.prettierrc')
        ];
        
        return configPaths.some(configPath => fs.existsSync(configPath));
      }
    },
    {
      name: 'Test Files',
      test: () => {
        const testPaths = [
          path.join(__dirname, '../sdk/identity-sdk/test'),
          path.join(__dirname, '../core/identity-core/test'),
          path.join(__dirname, '../apps/id-dashboard/test')
        ];
        
        return testPaths.some(testPath => fs.existsSync(testPath));
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      if (test.test()) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
    }
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests(); 