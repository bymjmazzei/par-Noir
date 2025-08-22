#!/usr/bin/env node

/**
 * Security Audit Script for Identity Protocol
 * 
 * This script checks for common security issues:
 * - Hardcoded secrets
 * - Weak cryptographic implementations
 * - Missing environment variables
 * - Insecure defaults
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityAuditor {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.passed = [];
  }

  log(level, message, details = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, details };
    
    switch (level) {
      case 'ERROR':
        this.issues.push(logEntry);
        console.error(`❌ ${message}`);
        break;
      case 'WARNING':
        this.warnings.push(logEntry);
        console.warn(`⚠️  ${message}`);
        break;
      case 'SUCCESS':
        this.passed.push(logEntry);
        console.log(`✅ ${message}`);
        break;
    }
  }

  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);

      // Skip test files and build artifacts
      if (filePath.includes('__tests__') || 
          filePath.includes('.test.') || 
          filePath.includes('.spec.') ||
          filePath.includes('/dist/') ||
          filePath.includes('/build/') ||
          filePath.includes('/node_modules/')) {
        return;
      }

      // Check for hardcoded secrets (more specific patterns)
      const secretPatterns = [
        /jwt_secret\s*[:=]\s*['"`][^'"`]+['"`]/gi,
        /api_key\s*[:=]\s*['"`][^'"`]+['"`]/gi,
        /private_key\s*[:=]\s*['"`][^'"`]+['"`]/gi,
        /encryption_key\s*[:=]\s*['"`][^'"`]+['"`]/gi,
        /master_key\s*[:=]\s*['"`][^'"`]+['"`]/gi,
        /password\s*[:=]\s*['"`][^'"`]+['"`]/gi,
        /secret\s*[:=]\s*['"`][^'"`]+['"`]/gi
      ];

      // Check for default/placeholder secrets (more specific)
      const defaultSecretPatterns = [
        /['"`]your-secret-key['"`]/gi,
        /['"`]your-secret['"`]/gi,
        /['"`]change-this['"`]/gi,
        /['"`]placeholder['"`]/gi,
        /['"`]demo-secret['"`]/gi,
        /['"`]demo-key['"`]/gi,
        /['"`]test-secret['"`]/gi,
        /['"`]test-key['"`]/gi
      ];

      secretPatterns.forEach((pattern) => {
        const matches = content.match(pattern);
        if (matches) {
          // Filter out legitimate variable names and test data
          const realSecrets = matches.filter(match => 
            !match.includes('test-') && 
            !match.includes('mock-') && 
            !match.includes('demo-') &&
            match.length > 10 // Avoid short variable names
          );
          
          if (realSecrets.length > 0) {
            this.log('ERROR', `Hardcoded secret found in ${fileName}`, {
              file: filePath,
              matches: realSecrets.slice(0, 3)
            });
          }
        }
      });

      defaultSecretPatterns.forEach((pattern) => {
        const matches = content.match(pattern);
        if (matches) {
          this.log('ERROR', `Default/placeholder secret found in ${fileName}`, {
            file: filePath,
            matches: matches.slice(0, 3)
          });
        }
      });

      // Check for weak crypto
      if (content.includes('Math.random()') && content.includes('crypto')) {
        this.log('WARNING', `Potential weak random generation in ${fileName}`, {
          file: filePath,
          suggestion: 'Use crypto.randomBytes() instead of Math.random()'
        });
      }

      // Check for test credentials in production code
      if (content.includes('test-client') && 
          !filePath.includes('test') && 
          !filePath.includes('__tests__') &&
          !filePath.includes('.test.') &&
          !filePath.includes('.spec.')) {
        this.log('WARNING', `Test client found in non-test file: ${fileName}`, {
          file: filePath,
          suggestion: 'Remove test clients from production code'
        });
      }

      // Check for default secrets
      if (content.includes('your-secret-key') || content.includes('your-secret')) {
        this.log('ERROR', `Default secret found in ${fileName}`, {
          file: filePath,
          suggestion: 'Replace with environment variable or secure random generation'
        });
      }

    } catch (error) {
      this.log('WARNING', `Could not scan file: ${filePath}`, { error: error.message });
    }
  }

  async scanDirectory(dirPath, extensions = ['.js', '.ts', '.tsx', '.jsx']) {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);

      if (file.isDirectory()) {
        // Skip node_modules and .git
        if (file.name !== 'node_modules' && file.name !== '.git') {
          await this.scanDirectory(fullPath, extensions);
        }
      } else if (extensions.some(ext => file.name.endsWith(ext))) {
        await this.scanFile(fullPath);
      }
    }
  }

  checkEnvironmentVariables() {
    const requiredVars = [
      'JWT_SECRET',
      'SENDGRID_API_KEY',
      'IPFS_API_KEY'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      this.log('ERROR', 'Missing required environment variables', { missing });
    } else {
      this.log('SUCCESS', 'All required environment variables are set');

      // Check JWT secret strength
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret && jwtSecret.length < 32) {
        this.log('ERROR', 'JWT_SECRET is too short (must be at least 32 characters)', {
          currentLength: jwtSecret.length
        });
      } else if (jwtSecret) {
        this.log('SUCCESS', 'JWT_SECRET meets minimum length requirement');
      }
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🔒 SECURITY AUDIT REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Errors: ${this.issues.length}`);
    console.log(`   Warnings: ${this.warnings.length}`);
    console.log(`   Passed: ${this.passed.length}`);

    if (this.issues.length > 0) {
      console.log(`\n❌ CRITICAL ISSUES (${this.issues.length}):`);
      this.issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.message}`);
        if (issue.details) {
          console.log(`      Details: ${JSON.stringify(issue.details, null, 2)}`);
        }
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning.message}`);
        if (warning.details) {
          console.log(`      Details: ${JSON.stringify(warning.details, null, 2)}`);
        }
      });
    }

    if (this.passed.length > 0) {
      console.log(`\n✅ PASSED CHECKS (${this.passed.length}):`);
      this.passed.forEach((pass, index) => {
        console.log(`   ${index + 1}. ${pass.message}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    
    if (this.issues.length === 0) {
      console.log('🎉 No critical security issues found!');
    } else {
      console.log('🚨 Critical security issues detected. Please fix them immediately.');
      process.exit(1);
    }
  }

  async run() {
    console.log('🔒 Starting security audit...\n');

    // Check environment variables
    this.checkEnvironmentVariables();

    // Scan source code
    const sourceDirs = ['api', 'core', 'apps', 'sdk'];
    for (const dir of sourceDirs) {
      if (fs.existsSync(dir)) {
        await this.scanDirectory(dir);
      }
    }

    // Generate report
    this.generateReport();
  }
}

// Run the audit
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.run().catch(console.error);
}

module.exports = SecurityAuditor;
