#!/usr/bin/env node

/**
 * Fix Weak Random Number Generation Script
 * 
 * This script automatically replaces Math.random() calls with cryptographically
 * secure alternatives throughout the codebase.
 */

const fs = require('fs');
const path = require('path');

class WeakRandomFixer {
  constructor() {
    this.fixedFiles = [];
    this.skippedFiles = [];
    this.errors = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  // Patterns to replace Math.random() calls
  getReplacementPatterns() {
    return [
      // Math.random().toString(36).substring(2, 15) -> SecureRandom.generateId(15)
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\)/g,
        replacement: 'SecureRandom.generateId(15)',
        description: 'Random ID generation'
      },
      // Math.random().toString(36).substring(2, 8) -> SecureRandom.generateId(8)
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substring\(2,\s*8\)/g,
        replacement: 'SecureRandom.generateId(8)',
        description: 'Short random ID generation'
      },
      // Math.random().toString(36).substring(2, 9) -> SecureRandom.generateId(9)
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substring\(2,\s*9\)/g,
        replacement: 'SecureRandom.generateId(9)',
        description: 'Medium random ID generation'
      },
      // Math.random().toString(36).substring(2, 10) -> SecureRandom.generateId(10)
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substring\(2,\s*10\)/g,
        replacement: 'SecureRandom.generateId(10)',
        description: 'Medium random ID generation'
      },
      // Math.random().toString(36).substring(2) -> SecureRandom.generateId()
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substring\(2\)/g,
        replacement: 'SecureRandom.generateId()',
        description: 'Random ID generation without length'
      },
      // Math.random().toString(36).substr(2, 9) -> SecureRandom.generateId(9)
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)/g,
        replacement: 'SecureRandom.generateId(9)',
        description: 'Random ID generation with substr'
      },
      // Math.random().toString(36).substr(2, 15) -> SecureRandom.generateId(15)
      {
        pattern: /Math\.random\(\)\.toString\(36\)\.substr\(2,\s*15\)/g,
        replacement: 'SecureRandom.generateId(15)',
        description: 'Random ID generation with substr'
      },
      // Math.random() > 0.1 -> SecureRandom.generateSuccess(0.9)
      {
        pattern: /Math\.random\(\)\s*>\s*0\.1/g,
        replacement: 'SecureRandom.generateSuccess(0.9)',
        description: '90% success rate'
      },
      // Math.random() > 0.05 -> SecureRandom.generateSuccess(0.95)
      {
        pattern: /Math\.random\(\)\s*>\s*0\.05/g,
        replacement: 'SecureRandom.generateSuccess(0.95)',
        description: '95% success rate'
      },
      // Math.floor(Math.random() * 1000) -> SecureRandom.generateStatistic(0, 999)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*1000\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 999)',
        description: 'Random number 0-999'
      },
      // Math.floor(Math.random() * 950) -> SecureRandom.generateStatistic(0, 949)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*950\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 949)',
        description: 'Random number 0-949'
      },
      // Math.floor(Math.random() * 800) -> SecureRandom.generateStatistic(0, 799)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*800\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 799)',
        description: 'Random number 0-799'
      },
      // Math.floor(Math.random() * 200) -> SecureRandom.generateStatistic(0, 199)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*200\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 199)',
        description: 'Random number 0-199'
      },
      // Math.floor(Math.random() * 50) -> SecureRandom.generateStatistic(0, 49)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*50\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 49)',
        description: 'Random number 0-49'
      },
      // Math.floor(Math.random() * 30) -> SecureRandom.generateStatistic(0, 29)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*30\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 29)',
        description: 'Random number 0-29'
      },
      // Math.floor(Math.random() * 20) -> SecureRandom.generateStatistic(0, 19)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*20\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 19)',
        description: 'Random number 0-19'
      },
      // Math.floor(Math.random() * 10) -> SecureRandom.generateStatistic(0, 9)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*10\)/g,
        replacement: 'SecureRandom.generateStatistic(0, 9)',
        description: 'Random number 0-9'
      },
      // Math.floor(Math.random() * statuses.length) -> SecureRandom.generateStatistic(0, statuses.length - 1)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*(\w+)\.length\)/g,
        replacement: 'SecureRandom.generateStatistic(0, $1.length - 1)',
        description: 'Random array index'
      },
      // Math.random() * 100 + 10 -> SecureRandom.generateStatistic(10, 109)
      {
        pattern: /Math\.random\(\)\s*\*\s*100\s*\+\s*10/g,
        replacement: 'SecureRandom.generateStatistic(10, 109)',
        description: 'Random number 10-109'
      },
      // Math.random() * 1000 -> SecureRandom.generateStatistic(0, 999)
      {
        pattern: /Math\.random\(\)\s*\*\s*1000/g,
        replacement: 'SecureRandom.generateStatistic(0, 999)',
        description: 'Random number 0-999'
      },
      // Math.random() * 100 -> SecureRandom.generateStatistic(0, 99)
      {
        pattern: /Math\.random\(\)\s*\*\s*100/g,
        replacement: 'SecureRandom.generateStatistic(0, 99)',
        description: 'Random number 0-99'
      },
      // Math.floor(Math.random() * 900000000) + 100000000 -> SecureRandom.generateStatistic(100000000, 999999999)
      {
        pattern: /Math\.floor\(Math\.random\(\)\s*\*\s*900000000\)\s*\+\s*100000000/g,
        replacement: 'SecureRandom.generateStatistic(100000000, 999999999)',
        description: '9-digit random number'
      }
    ];
  }

  // Specific replacements for different file types
  getSpecificReplacements(filePath) {
    const fileName = path.basename(filePath);
    const specificReplacements = [];

    // Server-specific replacements
    if (fileName === 'server.ts') {
      specificReplacements.push(
        {
          pattern: /const authCode = Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\);/,
          replacement: 'const authCode = SecureRandom.generateAuthCode();',
          description: 'Authorization code generation'
        },
        {
          pattern: /id: `did:identity:\${Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\)}`/,
          replacement: 'id: SecureRandom.generateIdentityId()',
          description: 'Identity ID generation'
        },
        {
          pattern: /token: Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\)/,
          replacement: 'token: SecureRandom.generateAccessToken()',
          description: 'Access token generation'
        },
        {
          pattern: /const recoveryId = Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\);/,
          replacement: 'const recoveryId = SecureRandom.generateRecoveryId();',
          description: 'Recovery ID generation'
        },
        {
          pattern: /const cid = `Qm\${Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\)}`;/,
          replacement: 'const cid = SecureRandom.generateCID();',
          description: 'CID generation'
        },
        {
          pattern: /const webhookId = Math\.random\(\)\.toString\(36\)\.substring\(2,\s*15\);/,
          replacement: 'const webhookId = SecureRandom.generateWebhookId();',
          description: 'Webhook ID generation'
        }
      );
    }

    // App.tsx specific replacements
    if (fileName === 'App.tsx') {
      specificReplacements.push(
        {
          pattern: /const randomNumbers = Math\.floor\(Math\.random\(\) \* 900000000\) \+ 100000000;/,
          replacement: 'const randomNumbers = SecureRandom.generateStatistic(100000000, 999999999);',
          description: '9-digit random number'
        },
        {
          pattern: /const transferId = Math\.random\(\)\.toString\(36\)\.substring\(2,\s*8\)\.toUpperCase\(\);/,
          replacement: 'const transferId = SecureRandom.generateTransferId();',
          description: 'Transfer ID generation'
        },
        {
          pattern: /accessToken: `biometric_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`/,
          replacement: 'accessToken: SecureRandom.generateBiometricToken()',
          description: 'Biometric token generation'
        },
        {
          pattern: /invitationCode: `code-\${Math\.random\(\)\.toString\(36\)\.substring\(2\)}`/,
          replacement: 'invitationCode: SecureRandom.generateInvitationCode()',
          description: 'Invitation code generation'
        },
        {
          pattern: /return `device-\${Date\.now\(\)}-\${Math\.random\(\)\.toString\(36\)\.substring\(2\)}`;/,
          replacement: 'return SecureRandom.generateDeviceId();',
          description: 'Device ID generation'
        }
      );
    }

    // Service-specific replacements
    if (fileName.includes('Service') || fileName.includes('service')) {
      specificReplacements.push(
        {
          pattern: /const success = Math\.random\(\) > 0\.1;/,
          replacement: 'const success = SecureRandom.generateSuccess(0.9);',
          description: '90% success rate'
        },
        {
          pattern: /const success = Math\.random\(\) > 0\.05;/,
          replacement: 'const success = SecureRandom.generateSuccess(0.95);',
          description: '95% success rate'
        },
        {
          pattern: /return `msg_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`;/,
          replacement: 'return SecureRandom.generateMessageId();',
          description: 'Message ID generation'
        },
        {
          pattern: /return `event_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`;/,
          replacement: 'return SecureRandom.generateEventId();',
          description: 'Event ID generation'
        },
        {
          pattern: /return `span_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`;/,
          replacement: 'return SecureRandom.generateSpanId();',
          description: 'Span ID generation'
        },
        {
          pattern: /return `error_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`;/,
          replacement: 'return SecureRandom.generateErrorId();',
          description: 'Error ID generation'
        },
        {
          pattern: /return `alert_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`;/,
          replacement: 'return SecureRandom.generateAlertId();',
          description: 'Alert ID generation'
        },
        {
          pattern: /return `tx_\${Date\.now\(\)}_\${Math\.random\(\)\.toString\(36\)\.substr\(2,\s*9\)}`;/,
          replacement: 'return SecureRandom.generateTransactionId();',
          description: 'Transaction ID generation'
        }
      );
    }

    return specificReplacements;
  }

  async processFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let modifiedContent = content;
      let hasChanges = false;

      // Skip if file doesn't contain Math.random()
      if (!content.includes('Math.random()')) {
        return false;
      }

      // Skip test files and build artifacts
      if (filePath.includes('__tests__') || 
          filePath.includes('.test.') || 
          filePath.includes('.spec.') ||
          filePath.includes('/dist/') ||
          filePath.includes('/build/') ||
          filePath.includes('/node_modules/') ||
          filePath.includes('/assets/')) {
        this.skippedFiles.push(filePath);
        return false;
      }

      // Add SecureRandom import if needed
      const needsSecureRandomImport = content.includes('Math.random()') && 
                                    !content.includes('SecureRandom') &&
                                    !content.includes('secureRandom');

      if (needsSecureRandomImport) {
        // Determine the correct import path based on file location
        let importPath = '';
        if (filePath.includes('/api/')) {
          importPath = './utils/secureRandom';
        } else if (filePath.includes('/core/identity-core/')) {
          importPath = './utils/secureRandom';
        } else if (filePath.includes('/apps/id-dashboard/')) {
          importPath = '../utils/secureRandom';
        } else if (filePath.includes('/sdk/identity-sdk/')) {
          importPath = './utils/secureRandom';
        }

        if (importPath) {
          const importStatement = `import SecureRandom from '${importPath}';\n`;
          modifiedContent = importStatement + modifiedContent;
          hasChanges = true;
        }
      }

      // Apply specific replacements first
      const specificReplacements = this.getSpecificReplacements(filePath);
      for (const replacement of specificReplacements) {
        if (modifiedContent.match(replacement.pattern)) {
          modifiedContent = modifiedContent.replace(replacement.pattern, replacement.replacement);
          hasChanges = true;
          this.log(`Applied specific replacement: ${replacement.description} in ${path.basename(filePath)}`);
        }
      }

      // Apply general pattern replacements
      const patterns = this.getReplacementPatterns();
      for (const pattern of patterns) {
        if (modifiedContent.match(pattern.pattern)) {
          modifiedContent = modifiedContent.replace(pattern.pattern, pattern.replacement);
          hasChanges = true;
          this.log(`Applied pattern replacement: ${pattern.description} in ${path.basename(filePath)}`);
        }
      }

      // Write back to file if changes were made
      if (hasChanges) {
        fs.writeFileSync(filePath, modifiedContent, 'utf8');
        this.fixedFiles.push(filePath);
        this.log(`Fixed weak random generation in ${path.basename(filePath)}`, 'success');
        return true;
      }

      return false;
    } catch (error) {
      this.errors.push({ file: filePath, error: error.message });
      this.log(`Error processing ${path.basename(filePath)}: ${error.message}`, 'error');
      return false;
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
        await this.processFile(fullPath);
      }
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🔧 WEAK RANDOM GENERATION FIX REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Files Fixed: ${this.fixedFiles.length}`);
    console.log(`   Files Skipped: ${this.skippedFiles.length}`);
    console.log(`   Errors: ${this.errors.length}`);

    if (this.fixedFiles.length > 0) {
      console.log(`\n✅ FIXED FILES (${this.fixedFiles.length}):`);
      this.fixedFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${path.relative(process.cwd(), file)}`);
      });
    }

    if (this.skippedFiles.length > 0) {
      console.log(`\n⏭️  SKIPPED FILES (${this.skippedFiles.length}):`);
      this.skippedFiles.slice(0, 10).forEach((file, index) => {
        console.log(`   ${index + 1}. ${path.relative(process.cwd(), file)}`);
      });
      if (this.skippedFiles.length > 10) {
        console.log(`   ... and ${this.skippedFiles.length - 10} more`);
      }
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ ERRORS (${this.errors.length}):`);
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${path.relative(process.cwd(), error.file)}: ${error.error}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    
    if (this.fixedFiles.length > 0) {
      console.log('🎉 Successfully fixed weak random generation issues!');
    } else {
      console.log('ℹ️  No files needed fixing.');
    }
  }

  async run() {
    console.log('🔧 Starting weak random generation fix...\n');

    // Scan source code directories
    const sourceDirs = ['api', 'core', 'apps', 'sdk'];
    for (const dir of sourceDirs) {
      if (fs.existsSync(dir)) {
        this.log(`Scanning directory: ${dir}`);
        await this.scanDirectory(dir);
      }
    }

    // Generate report
    this.generateReport();
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new WeakRandomFixer();
  fixer.run().catch(console.error);
}

module.exports = WeakRandomFixer;
