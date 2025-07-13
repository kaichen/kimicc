#!/usr/bin/env node

const { spawn } = require('child_process');
const { checkClaudeInPath, installClaudeCode, getApiKey, updateClaudeSettings } = require('../lib/utils');

async function main() {
  console.log('🚀 Starting kimicc - Claude Code with Kimi K2...\n');

  // Check if claude is installed
  if (!checkClaudeInPath()) {
    const installed = installClaudeCode();
    if (!installed) {
      console.error('Failed to install Claude Code. Please install it manually.');
      process.exit(1);
    }
  }

  // Update Claude settings
  updateClaudeSettings();

  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error('No API key provided. Exiting...');
    process.exit(1);
  }

  // Set up environment variables
  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/anthropic'
  };

  // Get command line arguments (remove 'node' and script path)
  const args = process.argv.slice(2);

  // Spawn claude process
  console.log('Launching Claude Code...\n');
  const claude = spawn('claude', args, {
    env,
    stdio: 'inherit',
    shell: true
  });

  // Handle process exit
  claude.on('close', (code) => {
    process.exit(code);
  });

  claude.on('error', (err) => {
    console.error('Failed to start Claude Code:', err.message);
    process.exit(1);
  });
}

// Run main function
main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});