#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

async function testSDK() {
  try {
    // Build SDK
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'sdk', 'identity-sdk') });
    
    // Run tests
    execSync('npm test', { stdio: 'inherit', cwd: path.join(__dirname, '..', 'sdk', 'identity-sdk') });
    
    // Tests completed successfully
    process.exit(0);
  } catch (error) {
    // Tests failed
    process.exit(1);
  }
}

testSDK(); 