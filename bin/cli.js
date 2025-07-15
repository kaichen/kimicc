#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { checkClaudeInPath, installClaudeCode, getApiKey, updateClaudeSettings, detectShellType, injectEnvVariables } = require('../lib/utils');
const { version } = require('../package.json');

const CONFIG_FILE = path.join(os.homedir(), '.kimicc.json');

async function handleResetCommand() {
  console.log('🗑️  Resetting kimicc configuration...\n');
  
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log('No configuration file found at ~/.kimicc.json');
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Are you sure you want to delete the configuration file? (y/N): ', (answer) => {
      rl.close();
      
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        try {
          fs.unlinkSync(CONFIG_FILE);
          console.log('✅ Configuration file deleted successfully.');
        } catch (error) {
          console.error('❌ Failed to delete configuration file:', error.message);
        }
      } else {
        console.log('Reset cancelled.');
      }
      resolve();
    });
  });
}

async function handleInjectCommand() {
  console.log('💉 Injecting KimiCC environment variables into shell config...\n');
  
  // Get API key first
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error('❌ No API key provided. Cannot inject environment variables.');
    return;
  }
  
  // Detect shell type
  const shellType = detectShellType();
  console.log(`📋 Detected shell: ${shellType}`);
  
  // Check for force flag
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  
  try {
    const proceed = await injectEnvVariables(apiKey, shellType, force);
    if (proceed === false) {
      console.log('Injection cancelled by user.');
      return;
    }
  } catch (error) {
    console.error('❌ Failed to inject environment variables:', error.message);
    process.exit(1);
  }
}

async function main() {
  // Get command line arguments (remove 'node' and script path)
  const args = process.argv.slice(2);
  
  // Handle subcommands
  if (args[0] === 'reset') {
    await handleResetCommand();
    return;
  }
  
  if (args[0] === 'inject') {
    await handleInjectCommand();
    return;
  }

  console.log(`🚀 Starting kimicc v${version} - Claude Code with Kimi K2...\n`);

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