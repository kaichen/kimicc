const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');
const { getProviderBySlug } = require('./providers');

const CONFIG_FILE = path.join(os.homedir(), '.kimicc.json');
const CLAUDE_CONFIG_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_CONFIG_BACKUP_FILE = `${CLAUDE_CONFIG_FILE}.bak`;
const CLAUDE_ENV_KEYS = Object.freeze([
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL'
]);

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

function assertObject(value, errorMessage) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(errorMessage || 'Expected configuration to be an object');
  }
}

function readClaudeConfig() {
  if (!fs.existsSync(CLAUDE_CONFIG_FILE)) {
    return { data: {}, exists: false };
  }

  const raw = fs.readFileSync(CLAUDE_CONFIG_FILE, 'utf8');
  if (!raw.trim()) {
    return { data: {}, exists: true };
  }

  try {
    const parsed = JSON.parse(raw);
    assertObject(parsed, `Invalid structure in ${CLAUDE_CONFIG_FILE}`);
    return { data: parsed, exists: true };
  } catch (error) {
    throw new Error(`Failed to parse ${CLAUDE_CONFIG_FILE}: ${error.message}`);
  }
}

function writeClaudeConfigFile(config) {
  assertObject(config, 'Claude configuration must be an object');

  const dir = path.dirname(CLAUDE_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }

  if (fs.existsSync(CLAUDE_CONFIG_FILE) && !fs.existsSync(CLAUDE_CONFIG_BACKUP_FILE)) {
    fs.copyFileSync(CLAUDE_CONFIG_FILE, CLAUDE_CONFIG_BACKUP_FILE);
  }

  const payload = JSON.stringify(config, null, 2) + '\n';
  const tempFile = `${CLAUDE_CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tempFile, payload, { mode: 0o600 });
    fs.renameSync(tempFile, CLAUDE_CONFIG_FILE);
    fs.chmodSync(CLAUDE_CONFIG_FILE, 0o600);
  } finally {
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

function applyClaudeEnvUpdate({ set = {}, remove = [] } = {}) {
  const { data: existingConfig } = readClaudeConfig();
  const envSnapshot = existingConfig.env && typeof existingConfig.env === 'object' && !Array.isArray(existingConfig.env)
    ? { ...existingConfig.env }
    : {};

  const setKeys = Object.keys(set);
  const validKeys = new Set(CLAUDE_ENV_KEYS);
  const appliedKeys = [];
  const removedKeys = [];

  for (const key of setKeys) {
    if (!validKeys.has(key)) continue;
    const value = set[key];
    if (value === undefined || value === null || value === '') {
      if (Object.prototype.hasOwnProperty.call(envSnapshot, key)) {
        delete envSnapshot[key];
        removedKeys.push(key);
      }
    } else if (envSnapshot[key] !== value) {
      envSnapshot[key] = value;
      appliedKeys.push(key);
    }
  }

  for (const key of remove) {
    if (!validKeys.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(envSnapshot, key)) {
      delete envSnapshot[key];
      if (!removedKeys.includes(key)) {
        removedKeys.push(key);
      }
    }
  }

  const changed = appliedKeys.length > 0 || removedKeys.length > 0;
  if (!changed) {
    return { changed: false, appliedKeys, removedKeys, config: existingConfig, env: envSnapshot };
  }

  const nextConfig = { ...existingConfig, env: envSnapshot };
  writeClaudeConfigFile(nextConfig);
  return { changed: true, appliedKeys, removedKeys, config: nextConfig, env: envSnapshot };
}

function updateClaudeEnvFile(values) {
  return applyClaudeEnvUpdate({ set: values });
}

function resetClaudeEnvFile(keys = CLAUDE_ENV_KEYS) {
  return applyClaudeEnvUpdate({ remove: keys });
}

async function promptForPassword(promptText = 'Please enter your API Auth Token: ') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: null // Hide input
  });

  return new Promise((resolve) => {
    let password = '';
    let asterisks = '';

    // Write the prompt
    process.stdout.write(promptText);

    // Handle keypress events for password masking
    process.stdin.on('keypress', (char, key) => {
      if (key && key.name === 'return') {
        // Enter key pressed
        process.stdout.write('\n');
        process.stdin.removeAllListeners('keypress');
        rl.close();
        resolve(password);
        return;
      }

      if (key && key.name === 'backspace') {
        // Backspace key pressed
        if (password.length > 0) {
          password = password.slice(0, -1);
          asterisks = asterisks.slice(0, -1);
          // Remove last asterisk
          process.stdout.write('\b \b');
        }
        return;
      }

      if (key && key.ctrl && key.name === 'c') {
        // Ctrl+C pressed
        process.stdout.write('\n');
        process.stdin.removeAllListeners('keypress');
        rl.close();
        process.exit(0);
      }

      if (char && char.length === 1) {
        // Regular character pressed
        password += char;
        asterisks += '*';
        process.stdout.write('*');
      }
    });

    // Set raw mode to capture individual keypresses
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Clean up on exit
    rl.on('close', () => {
      process.stdin.removeAllListeners('keypress');
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    });
  });
}

async function promptForAuthToken() {
  const authToken = await promptForPassword('Please enter your API Auth Token: ');
  return authToken.trim();
}

function getProfileConfig(config, profileName) {
  if (!config.profiles || !config.profiles[profileName]) {
    return null;
  }
  return config.profiles[profileName];
}

function getDefaultProfile(config) {
  return config.defaultProfile || null;
}

async function getAuthToken(profileName = null) {
  // Check environment variables first (highest priority)
  if (process.env.KIMI_AUTH_TOKEN) {
    return process.env.KIMI_AUTH_TOKEN;
  }
  

  // Check config file
  const config = readConfig();
  
  // Ensure clean state - if we have profiles, we should not use legacy authToken
  const hasProfiles = config.profiles && Object.keys(config.profiles).length > 0;
  
  // If profile is specified, use profile config
  if (profileName) {
    const profile = getProfileConfig(config, profileName);
    if (profile && profile.key) {
      return profile.key;
    }
    console.error(`Profile '${profileName}' not found or missing auth token.`);
    return null;
  }
  
  // Check if a default profile is set
  if (hasProfiles) {
    const defaultProfile = getDefaultProfile(config);
    if (defaultProfile) {
      const profile = getProfileConfig(config, defaultProfile);
      if (profile && profile.key) {
        return profile.key;
      }
    }
    console.error('No default profile found and no legacy auth token.');
    return null;
  }
  
  // Only use legacy authToken if no profiles exist
  if (config.authToken) {
    return config.authToken;
  }

  // Prompt for auth token
  console.log('No auth token found in environment variables or config file.');
  const authToken = await promptForAuthToken();
  
  if (authToken) {
    // Use legacy format only if no profiles exist
    const currentConfig = readConfig();
    if (!currentConfig.profiles || Object.keys(currentConfig.profiles).length === 0) {
      writeConfig({ ...currentConfig, authToken });
      console.log('Auth token saved to ~/.kimicc.json (legacy format)');
    } else {
      // Profiles exist, create default profile instead
      migrateLegacyConfig();
      const p = getProviderBySlug('kimi');
      const model = p && p.defaultModel ? p.defaultModel : null;
      const smallFastModel = p && p.defaultSmallFastModel ? p.defaultSmallFastModel : model;
      const { addProfile } = require('./utils');
      addProfile('default', 'https://api.moonshot.cn/anthropic', authToken, true, model, smallFastModel);
      console.log('Auth token saved as default profile');
    }
  }
  
  return authToken;
}

function getBaseUrl(profileName = null) {
  // Check environment variables first
  if (process.env.ANTHROPIC_BASE_URL) {
    return process.env.ANTHROPIC_BASE_URL;
  }

  // Check config file
  const config = readConfig();
  
  // If profile is specified, use profile config
  if (profileName) {
    const profile = getProfileConfig(config, profileName);
    if (profile && profile.url) {
      return profile.url;
    }
    return 'https://api.moonshot.cn/anthropic'; // fallback
  }
  
  // Check if a default profile is set
  const defaultProfile = getDefaultProfile(config);
  if (defaultProfile) {
    const profile = getProfileConfig(config, defaultProfile);
    if (profile && profile.url) {
      return profile.url;
    }
  }
  
  // Default Kimi endpoint
  return 'https://api.moonshot.cn/anthropic';
}

function getModel(profileName = null) {
  // Prefer new Anthropic configuration variables introduced in Claude Code v0.6+
  if (process.env.ANTHROPIC_DEFAULT_SONNET_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  }
  if (process.env.ANTHROPIC_MODEL) {
    return process.env.ANTHROPIC_MODEL;
  }

  const config = readConfig();

  if (profileName) {
    const profile = getProfileConfig(config, profileName);
    if (!profile) return null;
    if (profile.sonnetModel) return profile.sonnetModel;
    if (profile.model) return profile.model;
    return null;
  }

  const defaultProfile = getDefaultProfile(config);
  if (defaultProfile) {
    const profile = getProfileConfig(config, defaultProfile);
    if (profile) {
      if (profile.sonnetModel) return profile.sonnetModel;
      if (profile.model) return profile.model;
    }
  }

  return null;
}

function getSmallFastModel(profileName = null, options = {}) {
  const { fallbackToModel = true } = options;
  
  // Priority: new env vars > legacy env vars > profile overrides > model fallback
  if (process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  }
  if (process.env.ANTHROPIC_SMALL_FAST_MODEL) {
    return process.env.ANTHROPIC_SMALL_FAST_MODEL;
  }

  const config = readConfig();

  const resolveFromProfile = (profile) => {
    if (!profile) return null;
    if (profile.haikuModel) return profile.haikuModel;
    if (profile.smallFastModel) return profile.smallFastModel;
    if (fallbackToModel && profile.model) return profile.model;
    return null;
  };

  if (profileName) {
    return resolveFromProfile(getProfileConfig(config, profileName));
  }

  const defaultProfile = getDefaultProfile(config);
  if (defaultProfile) {
    return resolveFromProfile(getProfileConfig(config, defaultProfile));
  }

  return null;
}

function getOpusModel(profileName = null) {
  if (process.env.ANTHROPIC_DEFAULT_OPUS_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  }

  const config = readConfig();

  const resolveFromProfile = (profile) => {
    if (!profile) return null;
    if (profile.opusModel) return profile.opusModel;
    if (profile.model) return profile.model;
    return null;
  };

  if (profileName) {
    return resolveFromProfile(getProfileConfig(config, profileName));
  }

  const defaultProfile = getDefaultProfile(config);
  if (defaultProfile) {
    return resolveFromProfile(getProfileConfig(config, defaultProfile));
  }

  return null;
}

function updateClaudeSettings() {
  const claudeConfigFile = CLAUDE_CONFIG_FILE;
  
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
    
    const claudeDir = path.dirname(claudeConfigFile);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true, mode: 0o755 });
    }

    // Write back the updated config
    fs.writeFileSync(claudeConfigFile, JSON.stringify(claudeConfig, null, 2));
    console.log('Claude settings updated successfully.');
    
  } catch (error) {
    console.error('Warning: Could not update Claude settings:', error.message);
    // Don't fail the process, just warn
  }
}


function generateSlugFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // Remove common prefixes including www, api, app, etc.
    hostname = hostname.replace(/^(www\.|api\.|app\.|dev\.|test\.|staging\.|beta\.|alpha\.)/, '');
    
    // Replace dots with empty string and convert to lowercase
    return hostname.replace(/\./g, '').toLowerCase();
  } catch (error) {
    return null;
  }
}

function listProfiles() {
  const config = readConfig();
  if (!config.profiles || Object.keys(config.profiles).length === 0) {
    return [];
  }
  
  return Object.keys(config.profiles).map(slug => ({
    slug,
    ...config.profiles[slug],
    isDefault: slug === config.defaultProfile
  }));
}

function migrateLegacyConfig() {
  const config = readConfig();
  
  // Check if we have legacy config (authToken exists but no profiles)
  if (config.authToken && (!config.profiles || Object.keys(config.profiles).length === 0)) {
    console.log('🔧 Migrating legacy configuration to profile format...');
    
    // Create profiles object if it doesn't exist
    if (!config.profiles) {
      config.profiles = {};
    }
    
    // Create default profile with legacy values
    const defaultSlug = 'default';
    const p = getProviderBySlug('kimi');
    config.profiles[defaultSlug] = {
      url: 'https://api.moonshot.cn/anthropic',
      key: config.authToken,
      model: p && p.defaultModel ? p.defaultModel : undefined,
      smallFastModel: p && p.defaultSmallFastModel ? p.defaultSmallFastModel : (p && p.defaultModel ? p.defaultModel : undefined)
    };
    
    // Set as default profile
    config.defaultProfile = defaultSlug;
    
    // Remove legacy authToken to ensure clean state
    delete config.authToken;
    
    writeConfig(config);
    console.log(`✅ Migrated legacy configuration to profile '${defaultSlug}'`);
    return true;
  }
  
  return false;
}

function ensureDefaultProfileKimiDefaults() {
  const config = readConfig();
  if (!config.profiles) return false;
  const defaultProfileObj = config.profiles['default'];
  if (!defaultProfileObj) return false;

  const p = getProviderBySlug('kimi');
  const kimiUrl = (p && p.baseUrl) || 'https://api.moonshot.cn/anthropic';
  const kimiModel = p && p.defaultModel ? p.defaultModel : null;
  const kimiSmallFast = p && p.defaultSmallFastModel ? p.defaultSmallFastModel : kimiModel;

  let changed = false;
  if (!defaultProfileObj.url || defaultProfileObj.url !== kimiUrl) {
    defaultProfileObj.url = kimiUrl;
    changed = true;
  }
  if (!defaultProfileObj.model && kimiModel) {
    defaultProfileObj.model = kimiModel;
    changed = true;
  }
  if (!defaultProfileObj.smallFastModel && kimiSmallFast) {
    defaultProfileObj.smallFastModel = kimiSmallFast;
    changed = true;
  }

  if (changed) {
    // write back
    writeConfig(config);
  }
  return changed;
}

function addProfile(slug, url, authToken, setAsDefault = false, model = null, smallFastModel = null) {
  let config = readConfig();
  
  // Check for legacy migration on first profile add
  if (!config.profiles || Object.keys(config.profiles).length === 0) {
    const migrated = migrateLegacyConfig();
    if (migrated) {
      // Migration occurred, now add the new profile alongside the migrated one
      // Reload config after migration
      config = readConfig();
    }
  }
  
  if (!config.profiles) {
    config.profiles = {};
  }
  
  config.profiles[slug] = {
    url,
    key: authToken
  };
  
  if (model) {
    config.profiles[slug].model = model;
  }
  // Only set smallFastModel if explicitly provided; otherwise leave unset
  if (smallFastModel) {
    config.profiles[slug].smallFastModel = smallFastModel;
  }
  
  if (setAsDefault || !config.defaultProfile) {
    config.defaultProfile = slug;
  }
  
  // Ensure clean state - remove legacy authToken if it exists
  if (config.authToken) {
    delete config.authToken;
  }
  
  writeConfig(config);
  return true;
}

function deleteProfile(slug) {
  const config = readConfig();
  
  if (!config.profiles || !config.profiles[slug]) {
    return false;
  }
  
  delete config.profiles[slug];
  
  // If this was the default profile, clear it
  if (config.defaultProfile === slug) {
    config.defaultProfile = null;
    
    // Set another profile as default if available
    const remainingProfiles = Object.keys(config.profiles);
    if (remainingProfiles.length > 0) {
      config.defaultProfile = remainingProfiles[0];
    }
  }
  
  writeConfig(config);
  return true;
}

function setDefaultProfile(slug) {
  const config = readConfig();
  
  if (!config.profiles || !config.profiles[slug]) {
    return false;
  }
  
  config.defaultProfile = slug;
  writeConfig(config);
  return true;
}

module.exports = {
  checkClaudeInPath,
  installClaudeCode,
  getAuthToken,
  getBaseUrl,
  getModel,
  getSmallFastModel,
  getOpusModel,
  updateClaudeSettings,
  getProfileConfig,
  getDefaultProfile,
  generateSlugFromUrl,
  listProfiles,
  addProfile,
  deleteProfile,
  setDefaultProfile,
  readConfig,
  writeConfig,
  ensureDefaultProfileKimiDefaults,
  updateClaudeEnvFile,
  resetClaudeEnvFile,
  readClaudeConfig,
  promptForPassword,
  CLAUDE_ENV_KEYS
};
