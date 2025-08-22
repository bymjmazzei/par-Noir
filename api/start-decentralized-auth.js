#!/usr/bin/env node

/**
 * Startup script for Decentralized Authentication Server
 * 
 * Run this to start the decentralized authentication server independently
 */

const DecentralizedAuthServer = require('./decentralized-auth-server.js');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these environment variables before starting the server.');
  process.exit(1);
}

// Create and start the server
const server = new DecentralizedAuthServer();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down decentralized auth server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down decentralized auth server...');
  process.exit(0);
});

// Start the server
server.start();

console.log('🚀 Decentralized Authentication Server started successfully!');
console.log('📡 Server is running on port:', process.env.PORT || 3001);
console.log('🔗 Health check: http://localhost:' + (process.env.PORT || 3001) + '/health');
console.log('🔐 Auth endpoints: http://localhost:' + (process.env.PORT || 3001) + '/auth/');
console.log('🔄 OAuth compatibility: http://localhost:' + (process.env.PORT || 3001) + '/oauth/');
