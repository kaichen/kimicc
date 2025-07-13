const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

const CONFIG_FILE = path.join(os.homedir(), '.kimicc.json');

function checkClaudeInPath() {
  try {
    execSync('which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function installClaudeCode() {
  console.log('Claude Code not found. Installing @anthropic-ai/claude-code globally...');
  try {
    execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
    console.log('Claude Code installed successfully!');
    return true;
  } catch (error) {
    console.error('Failed to install Claude Code:', error.message);
    return false;
  }
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading config:', error.message);
  }
  return {};
}

function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error writing config:', error.message);
  }
}

async function promptForApiKey() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Please enter your Kimi API Key: ', (apiKey) => {
      rl.close();
      resolve(apiKey.trim());
    });
  });
}

async function getApiKey() {
  // Check environment variables first
  if (process.env.KIMI_API_KEY) {
    return process.env.KIMI_API_KEY;
  }
  
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Check config file
  const config = readConfig();
  if (config.apiKey) {
    return config.apiKey;
  }

  // Prompt for API key
  console.log('No API key found in environment variables or config file.');
  const apiKey = await promptForApiKey();
  
  if (apiKey) {
    // Save to config file
    writeConfig({ ...config, apiKey });
    console.log('API key saved to ~/.kimicc.json');
  }
  
  return apiKey;
}

module.exports = {
  checkClaudeInPath,
  installClaudeCode,
  getApiKey
};