#!/usr/bin/env node

/**
 * Security Audit Script
 * Performs comprehensive security checks on the codebase
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SecurityAuditor {
  constructor() {
    this.issues = [];
    this.criticalIssues = [];
    this.warnings = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async runAudit() {
    this.log('Starting security audit...', 'info');
    
    try {
      await this.checkEnvironmentVariables();
      await this.checkHardcodedSecrets();
      await this.checkDependencies();
      await this.checkFilePermissions();
      await this.checkSensitiveFiles();
      await this.checkCryptoUsage();
      
      this.generateReport();
    } catch (error) {
      this.log(`Audit failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  async checkEnvironmentVariables() {
    this.log('Checking environment variables...', 'info');
    
    const requiredEnvVars = [
      'JWT_SECRET',
      'SENDGRID_API_KEY',
      'IPFS_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      this.criticalIssues.push({
        type: 'missing_env_vars',
        message: `Missing required environment variables: ${missingVars.join(', ')}`,
        severity: 'critical'
      });
    }

    // Check JWT secret strength
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length < 32) {
      this.criticalIssues.push({
        type: 'weak_jwt_secret',
        message: 'JWT_SECRET must be at least 32 characters long',
        severity: 'critical'
      });
    }
  }

  async checkHardcodedSecrets() {
    this.log('Scanning for hardcoded secrets...', 'info');
    
    const patterns = [
      /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi,
      /secret[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi,
      /password\s*[:=]\s*['"][^'"]{6,}['"]/gi,
      /token\s*[:=]\s*['"][^'"]{10,}['"]/gi,
      /private[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi
    ];

    const files = this.getAllSourceFiles();
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const pattern of patterns) {
          const matches = content.match(pattern);
          if (matches) {
            this.criticalIssues.push({
              type: 'hardcoded_secret',
              message: `Potential hardcoded secret found in ${file}`,
              severity: 'critical',
              file: file,
              matches: matches
            });
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  async checkDependencies() {
    this.log('Checking dependencies for vulnerabilities...', 'info');
    
    try {
      // Run npm audit
      const auditResult = execSync('npm audit --json', { 
        encoding: 'utf8',
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      
      const audit = JSON.parse(auditResult);
      
      if (audit.vulnerabilities) {
        const criticalVulns = Object.values(audit.vulnerabilities)
          .filter(vuln => vuln.severity === 'critical');
        
        if (criticalVulns.length > 0) {
          this.criticalIssues.push({
            type: 'dependency_vulnerability',
            message: `${criticalVulns.length} critical vulnerabilities found in dependencies`,
            severity: 'critical',
            details: criticalVulns
          });
        }
      }
    } catch (error) {
      this.warnings.push({
        type: 'audit_failed',
        message: 'Could not run npm audit',
        severity: 'warning'
      });
    }
  }

  async checkFilePermissions() {
    this.log('Checking file permissions...', 'info');
    
    const sensitiveFiles = [
      '.env',
      '.env.local',
      '.env.production',
      'package-lock.json'
    ];

    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          const mode = stats.mode & parseInt('777', 8);
          
          if (mode > parseInt('644', 8)) {
            this.warnings.push({
              type: 'file_permissions',
              message: `File ${file} has overly permissive permissions (${mode.toString(8)})`,
              severity: 'warning'
            });
          }
        } catch (error) {
          // Skip files that can't be checked
        }
      }
    }
  }

  async checkSensitiveFiles() {
    this.log('Checking for sensitive files in repository...', 'info');
    
    const sensitivePatterns = [
      /\.env$/,
      /\.pem$/,
      /\.key$/,
      /\.p12$/,
      /\.pfx$/,
      /id_rsa$/,
      /id_dsa$/,
      /\.ssh\/config$/
    ];

    const files = this.getAllFiles();
    
    for (const file of files) {
      for (const pattern of sensitivePatterns) {
        if (pattern.test(file)) {
          this.criticalIssues.push({
            type: 'sensitive_file',
            message: `Sensitive file found in repository: ${file}`,
            severity: 'critical',
            file: file
          });
        }
      }
    }
  }

  async checkCryptoUsage() {
    this.log('Checking cryptographic implementations...', 'info');
    
    const files = this.getAllSourceFiles();
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for Math.random() usage (should use crypto.getRandomValues)
        if (content.includes('Math.random()')) {
          this.warnings.push({
            type: 'insecure_random',
            message: `Math.random() usage found in ${file} - should use crypto.getRandomValues()`,
            severity: 'warning',
            file: file
          });
        }
        
        // Check for weak hash functions
        const weakHashes = ['md5', 'sha1'];
        for (const hash of weakHashes) {
          if (content.toLowerCase().includes(hash)) {
            this.warnings.push({
              type: 'weak_hash',
              message: `Weak hash function ${hash} found in ${file}`,
              severity: 'warning',
              file: file
            });
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  getAllSourceFiles() {
    const extensions = ['.js', '.ts', '.tsx', '.jsx'];
    return this.getAllFiles().filter(file => 
      extensions.some(ext => file.endsWith(ext))
    );
  }

  getAllFiles(dir = '.') {
    let files = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip node_modules, .git, dist, build directories
          if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(item)) {
            files = files.concat(this.getAllFiles(fullPath));
          }
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
    
    return files;
  }

  generateReport() {
    this.log('\n=== SECURITY AUDIT REPORT ===', 'info');
    
    if (this.criticalIssues.length === 0 && this.warnings.length === 0) {
      this.log('✅ No security issues found!', 'info');
      return;
    }
    
    if (this.criticalIssues.length > 0) {
      this.log(`\n❌ CRITICAL ISSUES (${this.criticalIssues.length}):`, 'error');
      this.criticalIssues.forEach((issue, index) => {
        this.log(`${index + 1}. ${issue.message}`, 'error');
        if (issue.file) {
          this.log(`   File: ${issue.file}`, 'error');
        }
      });
    }
    
    if (this.warnings.length > 0) {
      this.log(`\n⚠️  WARNINGS (${this.warnings.length}):`, 'warning');
      this.warnings.forEach((warning, index) => {
        this.log(`${index + 1}. ${warning.message}`, 'warning');
        if (warning.file) {
          this.log(`   File: ${warning.file}`, 'warning');
        }
      });
    }
    
    this.log('\n=== SUMMARY ===', 'info');
    this.log(`Critical Issues: ${this.criticalIssues.length}`, 'error');
    this.log(`Warnings: ${this.warnings.length}`, 'warning');
    
    if (this.criticalIssues.length > 0) {
      this.log('\n❌ DEPLOYMENT BLOCKED - Critical issues must be resolved', 'error');
      process.exit(1);
    } else {
      this.log('\n✅ Security audit passed - Ready for deployment', 'info');
    }
  }
}

// Run the audit
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.runAudit().catch(error => {
    console.error('Security audit failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityAuditor;
