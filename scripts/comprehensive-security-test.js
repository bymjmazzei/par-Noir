#!/usr/bin/env node

/**
 * Comprehensive Security Test Script
 * Runs all security tests and generates a comprehensive report
 */

const SecurityAuditor = require('./security-audit');
const SecurityTester = require('./security-testing');
const PenetrationTester = require('./penetration-testing');

class ComprehensiveSecurityTester {
  constructor() {
    this.results = {
      audit: null,
      testing: null,
      penetration: null
    };
    this.overallScore = 0;
    this.recommendations = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async runComprehensiveTests() {
    this.log('Starting comprehensive security testing...', 'info');
    this.log('This will run security audit, testing, and penetration tests', 'info');
    
    try {
      // Run security audit
      this.log('\n=== PHASE 1: SECURITY AUDIT ===', 'info');
      await this.runSecurityAudit();
      
      // Run security testing
      this.log('\n=== PHASE 2: SECURITY TESTING ===', 'info');
      await this.runSecurityTesting();
      
      // Run penetration testing
      this.log('\n=== PHASE 3: PENETRATION TESTING ===', 'info');
      await this.runPenetrationTesting();
      
      // Generate comprehensive report
      this.generateComprehensiveReport();
      
    } catch (error) {
      this.log(`Comprehensive security testing failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  async runSecurityAudit() {
    try {
      const auditor = new SecurityAuditor();
      await auditor.runAudit();
      this.results.audit = {
        status: 'completed',
        criticalIssues: auditor.criticalIssues.length,
        warnings: auditor.warnings.length
      };
    } catch (error) {
      this.results.audit = {
        status: 'failed',
        error: error.message
      };
    }
  }

  async runSecurityTesting() {
    try {
      const tester = new SecurityTester();
      await tester.runSecurityTests();
      this.results.testing = {
        status: 'completed',
        passed: tester.testResults.length,
        failed: tester.failures.length
      };
    } catch (error) {
      this.results.testing = {
        status: 'failed',
        error: error.message
      };
    }
  }

  async runPenetrationTesting() {
    try {
      const tester = new PenetrationTester();
      await tester.runPenetrationTests();
      this.results.penetration = {
        status: 'completed',
        vulnerabilities: tester.vulnerabilities.length,
        critical: tester.vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high: tester.vulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium: tester.vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
        low: tester.vulnerabilities.filter(v => v.severity === 'LOW').length
      };
    } catch (error) {
      this.results.penetration = {
        status: 'failed',
        error: error.message
      };
    }
  }

  calculateOverallScore() {
    let score = 100;
    
    // Deduct points for audit issues
    if (this.results.audit) {
      score -= this.results.audit.criticalIssues * 20; // 20 points per critical issue
      score -= this.results.audit.warnings * 5; // 5 points per warning
    }
    
    // Deduct points for testing failures
    if (this.results.testing) {
      const totalTests = this.results.testing.passed + this.results.testing.failed;
      if (totalTests > 0) {
        const failureRate = this.results.testing.failed / totalTests;
        score -= failureRate * 30; // Up to 30 points for test failures
      }
    }
    
    // Deduct points for vulnerabilities
    if (this.results.penetration) {
      score -= this.results.penetration.critical * 25; // 25 points per critical vulnerability
      score -= this.results.penetration.high * 15; // 15 points per high vulnerability
      score -= this.results.penetration.medium * 10; // 10 points per medium vulnerability
      score -= this.results.penetration.low * 5; // 5 points per low vulnerability
    }
    
    this.overallScore = Math.max(0, Math.min(100, score));
  }

  generateRecommendations() {
    this.recommendations = [];
    
    if (this.results.audit && this.results.audit.criticalIssues > 0) {
      this.recommendations.push({
        priority: 'CRITICAL',
        category: 'Security Audit',
        recommendation: 'Fix all critical security audit issues before deployment',
        impact: 'High'
      });
    }
    
    if (this.results.testing && this.results.testing.failed > 0) {
      this.recommendations.push({
        priority: 'HIGH',
        category: 'Security Testing',
        recommendation: 'Fix all failed security tests',
        impact: 'High'
      });
    }
    
    if (this.results.penetration) {
      if (this.results.penetration.critical > 0) {
        this.recommendations.push({
          priority: 'CRITICAL',
          category: 'Penetration Testing',
          recommendation: 'Fix all critical vulnerabilities immediately',
          impact: 'Critical'
        });
      }
      
      if (this.results.penetration.high > 0) {
        this.recommendations.push({
          priority: 'HIGH',
          category: 'Penetration Testing',
          recommendation: 'Fix all high-severity vulnerabilities',
          impact: 'High'
        });
      }
      
      if (this.results.penetration.medium > 0) {
        this.recommendations.push({
          priority: 'MEDIUM',
          category: 'Penetration Testing',
          recommendation: 'Review and fix medium-severity vulnerabilities',
          impact: 'Medium'
        });
      }
    }
    
    // General recommendations
    this.recommendations.push({
      priority: 'LOW',
      category: 'General',
      recommendation: 'Implement regular security testing in CI/CD pipeline',
      impact: 'Low'
    });
    
    this.recommendations.push({
      priority: 'LOW',
      category: 'General',
      recommendation: 'Conduct third-party security audit before production deployment',
      impact: 'Low'
    });
  }

  generateComprehensiveReport() {
    this.calculateOverallScore();
    this.generateRecommendations();
    
    this.log('\n' + '='.repeat(60), 'info');
    this.log('COMPREHENSIVE SECURITY TEST REPORT', 'info');
    this.log('='.repeat(60), 'info');
    
    // Overall Score
    this.log(`\n🎯 OVERALL SECURITY SCORE: ${this.overallScore}/100`, 
             this.overallScore >= 90 ? 'info' : this.overallScore >= 70 ? 'warning' : 'error');
    
    // Security Grade
    let grade = 'F';
    if (this.overallScore >= 90) grade = 'A';
    else if (this.overallScore >= 80) grade = 'B';
    else if (this.overallScore >= 70) grade = 'C';
    else if (this.overallScore >= 60) grade = 'D';
    
    this.log(`📊 SECURITY GRADE: ${grade}`, 
             grade === 'A' ? 'info' : grade === 'B' ? 'info' : grade === 'C' ? 'warning' : 'error');
    
    // Deployment Recommendation
    let deploymentStatus = 'READY';
    let deploymentColor = 'info';
    
    if (this.overallScore < 60) {
      deploymentStatus = 'NOT READY';
      deploymentColor = 'error';
    } else if (this.overallScore < 80) {
      deploymentStatus = 'CONDITIONAL';
      deploymentColor = 'warning';
    }
    
    this.log(`\n🚀 DEPLOYMENT STATUS: ${deploymentStatus}`, deploymentColor);
    
    // Detailed Results
    this.log('\n📋 DETAILED RESULTS:', 'info');
    
    // Security Audit Results
    if (this.results.audit) {
      this.log(`\n🔍 Security Audit:`, 'info');
      if (this.results.audit.status === 'completed') {
        this.log(`   Critical Issues: ${this.results.audit.criticalIssues}`, 
                 this.results.audit.criticalIssues > 0 ? 'error' : 'info');
        this.log(`   Warnings: ${this.results.audit.warnings}`, 
                 this.results.audit.warnings > 0 ? 'warning' : 'info');
      } else {
        this.log(`   Status: FAILED - ${this.results.audit.error}`, 'error');
      }
    }
    
    // Security Testing Results
    if (this.results.testing) {
      this.log(`\n🧪 Security Testing:`, 'info');
      if (this.results.testing.status === 'completed') {
        this.log(`   Passed: ${this.results.testing.passed}`, 'info');
        this.log(`   Failed: ${this.results.testing.failed}`, 
                 this.results.testing.failed > 0 ? 'error' : 'info');
      } else {
        this.log(`   Status: FAILED - ${this.results.testing.error}`, 'error');
      }
    }
    
    // Penetration Testing Results
    if (this.results.penetration) {
      this.log(`\n🎯 Penetration Testing:`, 'info');
      if (this.results.penetration.status === 'completed') {
        this.log(`   Total Vulnerabilities: ${this.results.penetration.vulnerabilities}`, 
                 this.results.penetration.vulnerabilities > 0 ? 'error' : 'info');
        this.log(`   Critical: ${this.results.penetration.critical}`, 
                 this.results.penetration.critical > 0 ? 'error' : 'info');
        this.log(`   High: ${this.results.penetration.high}`, 
                 this.results.penetration.high > 0 ? 'error' : 'info');
        this.log(`   Medium: ${this.results.penetration.medium}`, 
                 this.results.penetration.medium > 0 ? 'warning' : 'info');
        this.log(`   Low: ${this.results.penetration.low}`, 
                 this.results.penetration.low > 0 ? 'warning' : 'info');
      } else {
        this.log(`   Status: FAILED - ${this.results.penetration.error}`, 'error');
      }
    }
    
    // Recommendations
    if (this.recommendations.length > 0) {
      this.log('\n💡 RECOMMENDATIONS:', 'info');
      
      const criticalRecs = this.recommendations.filter(r => r.priority === 'CRITICAL');
      const highRecs = this.recommendations.filter(r => r.priority === 'HIGH');
      const mediumRecs = this.recommendations.filter(r => r.priority === 'MEDIUM');
      const lowRecs = this.recommendations.filter(r => r.priority === 'LOW');
      
      if (criticalRecs.length > 0) {
        this.log('\n🚨 CRITICAL:', 'error');
        criticalRecs.forEach((rec, index) => {
          this.log(`   ${index + 1}. [${rec.category}] ${rec.recommendation}`, 'error');
        });
      }
      
      if (highRecs.length > 0) {
        this.log('\n🔴 HIGH:', 'error');
        highRecs.forEach((rec, index) => {
          this.log(`   ${index + 1}. [${rec.category}] ${rec.recommendation}`, 'error');
        });
      }
      
      if (mediumRecs.length > 0) {
        this.log('\n🟡 MEDIUM:', 'warning');
        mediumRecs.forEach((rec, index) => {
          this.log(`   ${index + 1}. [${rec.category}] ${rec.recommendation}`, 'warning');
        });
      }
      
      if (lowRecs.length > 0) {
        this.log('\n🟢 LOW:', 'info');
        lowRecs.forEach((rec, index) => {
          this.log(`   ${index + 1}. [${rec.category}] ${rec.recommendation}`, 'info');
        });
      }
    }
    
    // Final Decision
    this.log('\n' + '='.repeat(60), 'info');
    this.log('FINAL SECURITY ASSESSMENT', 'info');
    this.log('='.repeat(60), 'info');
    
    if (this.overallScore >= 90) {
      this.log('\n✅ EXCELLENT SECURITY POSTURE', 'info');
      this.log('The application demonstrates excellent security practices and is ready for production deployment.', 'info');
    } else if (this.overallScore >= 80) {
      this.log('\n✅ GOOD SECURITY POSTURE', 'info');
      this.log('The application has good security practices with minor issues to address.', 'info');
    } else if (this.overallScore >= 70) {
      this.log('\n⚠️  ACCEPTABLE SECURITY POSTURE', 'warning');
      this.log('The application has acceptable security but should address identified issues before production.', 'warning');
    } else if (this.overallScore >= 60) {
      this.log('\n⚠️  POOR SECURITY POSTURE', 'warning');
      this.log('The application has significant security issues that must be addressed before deployment.', 'warning');
    } else {
      this.log('\n❌ CRITICAL SECURITY ISSUES', 'error');
      this.log('The application has critical security vulnerabilities and is NOT ready for production deployment.', 'error');
    }
    
    // Exit with appropriate code
    if (this.overallScore < 60) {
      this.log('\n❌ DEPLOYMENT BLOCKED - Critical security issues must be resolved', 'error');
      process.exit(1);
    } else if (this.overallScore < 80) {
      this.log('\n⚠️  DEPLOYMENT CONDITIONAL - Address security issues before production', 'warning');
      process.exit(1);
    } else {
      this.log('\n✅ SECURITY TESTS PASSED - Ready for deployment', 'info');
    }
  }
}

// Run comprehensive security tests
if (require.main === module) {
  const tester = new ComprehensiveSecurityTester();
  tester.runComprehensiveTests().catch(error => {
    console.error('Comprehensive security testing failed:', error);
    process.exit(1);
  });
}

module.exports = ComprehensiveSecurityTester;
