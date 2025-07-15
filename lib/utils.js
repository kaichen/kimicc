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

function updateClaudeSettings() {
  const claudeConfigFile = path.join(os.homedir(), '.claude.json');
  
  try {
    let claudeConfig = {};
    
    // Read existing config if it exists
    if (fs.existsSync(claudeConfigFile)) {
      const content = fs.readFileSync(claudeConfigFile, 'utf8');
      claudeConfig = JSON.parse(content);
    }
    
    // Update required settings
    claudeConfig.autoUpdates = false;
    claudeConfig.hasCompletedOnboarding = true;
    
    // Write back the updated config
    fs.writeFileSync(claudeConfigFile, JSON.stringify(claudeConfig, null, 2));
    console.log('Claude settings updated successfully.');
    
  } catch (error) {
    console.error('Warning: Could not update Claude settings:', error.message);
    // Don't fail the process, just warn
  }
}

function detectShellType() {
  // Check multiple sources for shell detection
  const shell = process.env.SHELL || process.env.CMD || '';
  
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  
  // Try to detect from process name
  try {
    const shellName = path.basename(shell);
    if (shellName.includes('zsh')) return 'zsh';
    if (shellName.includes('bash')) return 'bash';
    if (shellName.includes('fish')) return 'fish';
  } catch {
    // fallback to bash as most common
  }
  
  return 'bash';
}

function getShellConfigFile(shellType) {
  const homeDir = os.homedir();
  
  switch (shellType) {
    case 'zsh':
      return path.join(homeDir, '.zshrc');
    case 'bash':
      return path.join(homeDir, '.bashrc');
    case 'fish':
      return path.join(homeDir, '.config', 'fish', 'config.fish');
    default:
      return path.join(homeDir, '.bashrc');
  }
}

function validateShellConfig(configFile) {
  try {
    // Check if file exists and is writable
    if (fs.existsSync(configFile)) {
      fs.accessSync(configFile, fs.constants.W_OK);
    } else {
      // Check if directory exists and is writable, create if needed
      const dir = path.dirname(configFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      }
      fs.accessSync(dir, fs.constants.W_OK);
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function backupConfigFile(configFile) {
  if (fs.existsSync(configFile)) {
    const backupFile = `${configFile}.backup.${Date.now()}`;
    fs.copyFileSync(configFile, backupFile);
    return backupFile;
  }
  return null;
}

function checkExistingEnvVars(configFile) {
  const envVars = {
    ANTHROPIC_API_KEY: false,
    ANTHROPIC_BASE_URL: false
  };
  
  if (!fs.existsSync(configFile)) {
    return envVars;
  }
  
  try {
    const content = fs.readFileSync(configFile, 'utf8');
    
    // Check for existing exports
    Object.keys(envVars).forEach(key => {
      const regex = new RegExp(`^\\s*export\\s+${key}=`, 'm');
      envVars[key] = regex.test(content);
    });
    
    return envVars;
  } catch (error) {
    console.warn(`Warning: Could not read config file: ${error.message}`);
    return envVars;
  }
}

async function injectEnvVariables(apiKey, shellType, force = false) {
  const configFile = getShellConfigFile(shellType);
  
  // Validate shell config
  const validation = validateShellConfig(configFile);
  if (!validation.valid) {
    throw new Error(`Invalid shell configuration: ${validation.error}`);
  }
  
  // Check for existing variables
  const existing = checkExistingEnvVars(configFile);
  const hasExisting = Object.values(existing).some(v => v);
  
  if (hasExisting && !force) {
    console.log('⚠️  Environment variables already exist in shell config:');
    Object.entries(existing).forEach(([key, exists]) => {
      if (exists) console.log(`   - ${key}`);
    });
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('Do you want to overwrite them? (y/N): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }
  
  // Backup original config
  const backupFile = backupConfigFile(configFile);
  
  try {
    const baseUrl = 'https://api.moonshot.cn/anthropic';
    const timestamp = new Date().toISOString();
    const markerStart = '# KimiCC Environment Variables - Added';
    const markerEnd = '# End KimiCC Environment Variables';
    
    // Prepare new content
    const newContent = `
${markerStart} ${timestamp}
export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_API_KEY="${apiKey}"
${markerEnd}
`;
    
    // Read existing content
    let existingContent = '';
    if (fs.existsSync(configFile)) {
      existingContent = fs.readFileSync(configFile, 'utf8');
    }
    
    // Remove existing KimiCC variables using safe string methods
    let cleanedContent = existingContent;
    const startMarkerIndex = cleanedContent.indexOf(markerStart);
    const endMarkerIndex = cleanedContent.indexOf(markerEnd);
    
    if (startMarkerIndex !== -1 && endMarkerIndex !== -1 && endMarkerIndex > startMarkerIndex) {
      const endMarkerLength = markerEnd.length;
      const endIndex = endMarkerIndex + endMarkerLength;
      cleanedContent = cleanedContent.slice(0, startMarkerIndex) + cleanedContent.slice(endIndex);
    }
    
    // Append new variables
    const finalContent = cleanedContent.trimEnd() + newContent;
    
    // Write updated config with proper file locking to prevent race conditions
    const tempFile = configFile + '.tmp';
    fs.writeFileSync(tempFile, finalContent);
    fs.renameSync(tempFile, configFile);
    
    console.log(`✅ Environment variables injected into ${configFile}`);
    if (backupFile) {
      console.log(`📋 Backup created at ${backupFile}`);
    }
    console.log(`\n💡 To apply changes, run: source ${configFile}`);
    
    return true;
    
  } catch (error) {
    // Restore backup on failure
    if (backupFile && fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, configFile);
      console.error('❌ Failed to inject variables, restored original config');
    }
    throw error;
  }
}

async function removeEnvVariables(shellType, force = false) {
  const configFile = getShellConfigFile(shellType);
  
  // Validate shell config
  const validation = validateShellConfig(configFile);
  if (!validation.valid) {
    throw new Error(`Invalid shell configuration: ${validation.error}`);
  }
  
  if (!fs.existsSync(configFile)) {
    console.log(`ℹ️  Shell config file not found: ${configFile}`);
    return false;
  }
  
  // Check if KimiCC variables exist
  const content = fs.readFileSync(configFile, 'utf8');
  const markerStart = '# KimiCC Environment Variables - Added';
  const markerEnd = '# End KimiCC Environment Variables';
  
  const startIndex = content.indexOf(markerStart);
  const endIndex = content.indexOf(markerEnd);
  
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    console.log('ℹ️  No KimiCC environment variables found to remove.');
    return false;
  }
  
  if (!force) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('Are you sure you want to remove KimiCC environment variables? (y/N): ', (answer) => {
        rl.close();
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          proceedWithRemoval();
          resolve(true);
        } else {
          console.log('Removal cancelled.');
          resolve(false);
        }
      });
    });
  } else {
    proceedWithRemoval();
    return true;
  }
  
  function proceedWithRemoval() {
    // Backup original config
    const backupFile = backupConfigFile(configFile);
    
    try {
      // Remove the marked section
      const endMarkerLength = markerEnd.length;
      const endIndexWithMarker = endIndex + endMarkerLength;
      const cleanedContent = content.slice(0, startIndex) + content.slice(endIndexWithMarker);
      
      // Write updated config with proper file locking
      const tempFile = configFile + '.tmp';
      fs.writeFileSync(tempFile, cleanedContent);
      fs.renameSync(tempFile, configFile);
      
      console.log(`✅ KimiCC environment variables removed from ${configFile}`);
      if (backupFile) {
        console.log(`📋 Backup created at ${backupFile}`);
      }
      console.log(`\n💡 To apply changes, run: source ${configFile}`);
      
    } catch (error) {
      // Restore backup on failure
      if (backupFile && fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, configFile);
        console.error('❌ Failed to remove variables, restored original config');
      }
      throw error;
    }
  }
}

module.exports = {
  checkClaudeInPath,
  installClaudeCode,
  getApiKey,
  updateClaudeSettings,
  detectShellType,
  getShellConfigFile,
  validateShellConfig,
  injectEnvVariables,
  removeEnvVariables
};