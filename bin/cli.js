#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { checkClaudeInPath, installClaudeCode, getAuthToken, getBaseUrl, getModel, getSmallFastModel, getOpusModel, updateClaudeSettings, readConfig, getProfileConfig, addProfile, ensureDefaultProfileKimiDefaults, updateClaudeEnvFile, resetClaudeEnvFile, CLAUDE_ENV_KEYS } = require('../lib/utils');
const { parseProviderFlag, getProviderBySlug } = require('../lib/providers');
const { runPingSuite, DEFAULT_TIMEOUT_MS } = require('../lib/ping');
const { version } = require('../package.json');

const CONFIG_FILE = path.join(os.homedir(), '.kimicc.json');
const CLAUDE_ENV_FILE = path.join(os.homedir(), '.claude', 'settings.json');

function promptForTokenForProvider(providerName) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const name = providerName || 'provider';
  return new Promise((resolve) => {
    rl.question(`Enter API Auth Token for ${name}: `, (authToken) => {
      rl.close();
      resolve((authToken || '').trim());
    });
  });
}

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
  const args = process.argv.slice(2);
  const injectArgs = args.slice(1);

  let reset = false;
  let profileName = null;
  let baseUrlOverride = null;
  let modelOverride = null;
  let smallFastOverride = null;
  let legacyForceFlag = false;
  const unexpectedArgs = [];

  for (let i = 0; i < injectArgs.length; i++) {
    const token = injectArgs[i];
    if (!token) continue;

    if (token === '--reset' || token === '-r') {
      reset = true;
      continue;
    }
    if (token === '--profile') {
      if (i + 1 >= injectArgs.length) {
        console.error('❌ Missing value for --profile');
        process.exit(1);
      }
      profileName = injectArgs[++i];
      continue;
    }
    if (token.startsWith('--profile=')) {
      profileName = token.slice('--profile='.length);
      continue;
    }
    if (token === '--base-url') {
      if (i + 1 >= injectArgs.length) {
        console.error('❌ Missing value for --base-url');
        process.exit(1);
      }
      baseUrlOverride = injectArgs[++i];
      continue;
    }
    if (token.startsWith('--base-url=')) {
      baseUrlOverride = token.split('=').slice(1).join('=');
      continue;
    }
    if (typeof token === 'string') {
      const baseUrlMatch = token.match(/^base_url=(.+)$/i);
      if (baseUrlMatch) {
        baseUrlOverride = baseUrlMatch[1];
        continue;
      }
    }
    if (token === '--model') {
      if (i + 1 >= injectArgs.length) {
        console.error('❌ Missing value for --model');
        process.exit(1);
      }
      modelOverride = injectArgs[++i];
      continue;
    }
    if (token.startsWith('--model=')) {
      modelOverride = token.split('=').slice(1).join('=');
      continue;
    }
    if (token === '--small-fast-model') {
      if (i + 1 >= injectArgs.length) {
        console.error('❌ Missing value for --small-fast-model');
        process.exit(1);
      }
      smallFastOverride = injectArgs[++i];
      continue;
    }
    if (token.startsWith('--small-fast-model=')) {
      smallFastOverride = token.split('=').slice(1).join('=');
      continue;
    }
    if (token === '--force' || token === '-f') {
      legacyForceFlag = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('Usage: kimicc inject [--profile SLUG] [--base-url URL|base_url=URL] [--model NAME] [--small-fast-model NAME] [--reset]');
      return;
    }
    unexpectedArgs.push(token);
  }

  if (unexpectedArgs.length > 0) {
    console.error(`❌ Unknown arguments for inject command: ${unexpectedArgs.join(', ')}`);
    process.exit(1);
  }

  if (legacyForceFlag) {
    console.log('ℹ️  --force is deprecated for inject and will be ignored.');
  }

  if (reset) {
    if (profileName || baseUrlOverride || modelOverride || smallFastOverride) {
      console.log('ℹ️  --reset ignores profile/model/base-url overrides. Managed keys are global.');
    }
    console.log('🧹 Removing managed Claude environment variables...\n');
    console.log(`Managed keys: ${CLAUDE_ENV_KEYS.join(', ')}`);
    try {
      const result = resetClaudeEnvFile();
      if (result.removedKeys.length > 0) {
        console.log(`✅ Removed ${result.removedKeys.join(', ')} from ${CLAUDE_ENV_FILE}.`);
      } else {
        console.log(`ℹ️  No managed keys found in ${CLAUDE_ENV_FILE}.`);
      }
    } catch (error) {
      console.error(`❌ Failed to reset managed keys: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  const config = readConfig();
  const selectedProfile = profileName ? getProfileConfig(config, profileName) : null;
  if (profileName && !selectedProfile) {
    console.error(`❌ Profile '${profileName}' not found.`);
    process.exit(1);
  }

  const authToken = await getAuthToken(profileName);
  if (!authToken) {
    console.error('❌ No auth token provided. Cannot inject environment variables.');
    return;
  }

  const baseUrl = baseUrlOverride || getBaseUrl(profileName);
  if (profileName && baseUrlOverride && selectedProfile && selectedProfile.url && selectedProfile.url !== baseUrlOverride) {
    console.log(`⚠️  Using --base-url over profile "${profileName}" url "${selectedProfile.url}".`);
  }

  const model = modelOverride || getModel(profileName);
  const smallFastModel = smallFastOverride || getSmallFastModel(profileName, { fallbackToModel: false });

  console.log('💉 Injecting managed environment variables into ~/.claude/settings.json...\n');
  console.log(`Managed keys: ${CLAUDE_ENV_KEYS.join(', ')}`);

  const envUpdates = {
    ANTHROPIC_AUTH_TOKEN: authToken,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_MODEL: model || undefined,
    ANTHROPIC_SMALL_FAST_MODEL: smallFastModel || undefined
  };

  try {
    const result = updateClaudeEnvFile(envUpdates);
    if (result.changed) {
      const changeParts = [];
      if (result.appliedKeys.length > 0) {
        changeParts.push(`set ${result.appliedKeys.join(', ')}`);
      }
      if (result.removedKeys.length > 0) {
        changeParts.push(`removed ${result.removedKeys.join(', ')}`);
      }
      console.log(`✅ Updated ${CLAUDE_ENV_FILE}${changeParts.length ? ` (${changeParts.join('; ')})` : ''}.`);
    } else {
      console.log(`ℹ️  ${CLAUDE_ENV_FILE} already up to date.`);
    }
  } catch (error) {
    console.error(`❌ Failed to update ${CLAUDE_ENV_FILE}: ${error.message}`);
    process.exit(1);
  }
}

async function handlePingCommand() {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs.slice(1); // Skip 'ping'

  let providerSlug = null;
  const providerFlag = parseProviderFlag(args);
  if (providerFlag) {
    providerSlug = providerFlag.slug;
    args.splice(providerFlag.index, 1);
  }

  let baseUrlOverride = null;
  let modelOverride = null;
  let smallFastOverride = null;
  let profileName = null;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let jsonOutput = false;
  let verbose = false;

  const queue = [...args];
  const unexpected = [];

  while (queue.length > 0) {
    const token = queue.shift();
    if (!token) continue;

    if (token === '--help' || token === '-h') {
      console.log('Usage: kimicc ping [--profile SLUG] [--kimi|--deepseek|--glm|--qwen] [--base-url URL|base_url=URL] [--model NAME] [--small-fast-model NAME] [--timeout MS] [--json] [--verbose]');
      return;
    }

    if (typeof token === 'string') {
      const baseUrlMatch = token.match(/^base_url=(.+)$/i);
      if (baseUrlMatch) {
        baseUrlOverride = baseUrlMatch[1];
        continue;
      }
    }

    if (token === '--base-url') {
      const next = queue.shift();
      if (!next) {
        console.error('❌ Missing value for --base-url');
        process.exit(1);
      }
      baseUrlOverride = next;
      continue;
    }
    if (token.startsWith('--base-url=')) {
      baseUrlOverride = token.split('=').slice(1).join('=');
      continue;
    }

    if (token === '--model') {
      const next = queue.shift();
      if (!next) {
        console.error('❌ Missing value for --model');
        process.exit(1);
      }
      modelOverride = next;
      continue;
    }
    if (token.startsWith('--model=')) {
      modelOverride = token.split('=').slice(1).join('=');
      continue;
    }

    if (token === '--small-fast-model') {
      const next = queue.shift();
      if (!next) {
        console.error('❌ Missing value for --small-fast-model');
        process.exit(1);
      }
      smallFastOverride = next;
      continue;
    }
    if (token.startsWith('--small-fast-model=')) {
      smallFastOverride = token.split('=').slice(1).join('=');
      continue;
    }

    if (token === '--profile' || token === '-p') {
      const next = queue.shift();
      if (!next) {
        console.error('❌ Missing value for --profile');
        process.exit(1);
      }
      profileName = next;
      continue;
    }
    if (token.startsWith('--profile=')) {
      profileName = token.split('=').slice(1).join('=');
      continue;
    }

    if (token === '--timeout') {
      const next = queue.shift();
      if (!next) {
        console.error('❌ Missing value for --timeout');
        process.exit(1);
      }
      const parsed = parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        console.error('❌ Timeout must be a positive integer (milliseconds).');
        process.exit(1);
      }
      timeoutMs = parsed;
      continue;
    }
    if (token.startsWith('--timeout=')) {
      const value = token.split('=').slice(1).join('=');
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        console.error('❌ Timeout must be a positive integer (milliseconds).');
        process.exit(1);
      }
      timeoutMs = parsed;
      continue;
    }

    if (token === '--json') {
      jsonOutput = true;
      continue;
    }

    if (token === '--verbose') {
      verbose = true;
      continue;
    }

    if (token.startsWith('--')) {
      const providerCandidate = token.slice(2);
      const provider = getProviderBySlug(providerCandidate);
      if (provider) {
        if (!providerSlug) {
          providerSlug = provider.slug;
        }
        continue;
      }
    }

    unexpected.push(token);
  }

  if (unexpected.length > 0) {
    console.error(`❌ Unknown arguments for ping command: ${unexpected.join(', ')}`);
    process.exit(1);
  }

  if (jsonOutput && verbose) {
    console.error('⚠️  --verbose is ignored when --json is specified.');
    verbose = false;
  }

  try { ensureDefaultProfileKimiDefaults(); } catch {}

  if (providerSlug && profileName) {
    console.log(`⚠️  Both --profile and provider flag specified; using provider '--${providerSlug}'.`);
    profileName = null;
  }

  if (providerSlug) {
    const config = readConfig();
    const existing = config.profiles && config.profiles[providerSlug];
    if (existing) {
      profileName = providerSlug;
    } else {
      const provider = getProviderBySlug(providerSlug);
      const urlToUse = baseUrlOverride || (provider && provider.baseUrl) || 'https://api.moonshot.cn/anthropic';
      try {
        new URL(urlToUse);
      } catch (error) {
        console.error('❌ Invalid base URL. Provide a valid URL via --base-url or base_url=.');
        process.exit(1);
      }
      const token = await promptForTokenForProvider(provider ? provider.name : providerSlug);
      if (!token) {
        console.error('❌ No auth token provided. Exiting...');
        process.exit(1);
      }
      const modelToUse = provider && provider.defaultModel ? provider.defaultModel : null;
      const smallFastToUse = provider && provider.defaultSmallFastModel ? provider.defaultSmallFastModel : (modelToUse || null);
      addProfile(providerSlug, urlToUse, token, false, modelToUse, smallFastToUse);
      console.log(`✅ Profile '${providerSlug}' created.`);
      profileName = providerSlug;
    }
  }

  const authToken = await getAuthToken(profileName);
  if (!authToken) {
    console.error('❌ No auth token available. Exiting...');
    process.exit(1);
  }

  let baseUrl = baseUrlOverride || getBaseUrl(profileName);
  if (!baseUrl) {
    baseUrl = 'https://api.moonshot.cn/anthropic';
  }

  const modelFromConfig = getModel(profileName);
  const smallFastFromConfig = getSmallFastModel(profileName);
  const opusFromConfig = getOpusModel(profileName);

  let resolvedModel = modelOverride || modelFromConfig;
  let resolvedSmallFastModel = smallFastOverride || smallFastFromConfig;
  if (!resolvedSmallFastModel && resolvedModel) {
    resolvedSmallFastModel = resolvedModel;
  }
  const resolvedOpusModel = opusFromConfig;

  const models = Array.from(new Set([resolvedModel, resolvedSmallFastModel, resolvedOpusModel].filter(Boolean)));
  if (models.length === 0) {
    console.error('❌ No model configuration found. Provide --model or configure models in your profile.');
    process.exit(1);
  }

  if (!jsonOutput) {
    console.log('📡 Running kimicc ping...\n');
    console.log(`Base URL: ${baseUrl}`);
    if (profileName) {
      console.log(`Profile: ${profileName}`);
    } else if (providerSlug) {
      console.log(`Provider: ${providerSlug}`);
    }
    console.log(`Timeout: ${timeoutMs} ms`);
    console.log(`Models (${models.length}): ${models.join(', ')}`);
    console.log('');
  }

  let suite;
  try {
    suite = await runPingSuite({
      baseUrl,
      token: authToken,
      models,
      timeoutMs,
      verbose
    });
  } catch (error) {
    console.error(`❌ Ping failed: ${error.message}`);
    process.exit(1);
  }

  if (jsonOutput) {
    const payload = {
      baseUrl,
      profile: profileName || null,
      provider: providerSlug || null,
      timeoutMs,
      ok: suite.ok,
      models: suite.results
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    suite.results.forEach((result) => {
      const icon = result.ok ? '✅' : '❌';
      const statusLabel = result.status !== null && result.status !== undefined ? result.status : 'ERR';
      const latencyLabel = Number.isFinite(result.latencyMs) ? `${result.latencyMs} ms` : '—';
      const errorLabel = result.error ? ` - ${result.error}` : '';
      console.log(`  ${icon} ${result.model} (${statusLabel}, ${latencyLabel})${errorLabel}`);
    });
  }

  if (!suite.ok) {
    process.exitCode = 1;
  }
}

async function handleProfileCommand() {
  const args = process.argv.slice(2);
  const profileArgs = args.slice(1); // Skip the 'profile' command itself
  // Detect provider quick flags and base_url/--base-url override
  let providerFlag = parseProviderFlag(profileArgs);
  let providerSlug = providerFlag ? providerFlag.slug : null;
  if (providerFlag) {
    profileArgs.splice(providerFlag.index, 1);
  }
  // Parse base_url=... or --base-url URL
  let overrideBaseUrl = null;
  for (let i = 0; i < profileArgs.length; i++) {
    const tok = profileArgs[i];
    const m = typeof tok === 'string' ? tok.match(/^base_url=(.+)$/i) : null;
    if (m) {
      overrideBaseUrl = m[1];
      profileArgs.splice(i, 1);
      break;
    }
  }
  const baseUrlFlagIndex = profileArgs.findIndex(a => a === '--base-url');
  if (baseUrlFlagIndex !== -1) {
    if (baseUrlFlagIndex + 1 < profileArgs.length) {
      overrideBaseUrl = profileArgs[baseUrlFlagIndex + 1];
      profileArgs.splice(baseUrlFlagIndex, 2);
    } else {
      console.error('❌ Missing value for --base-url');
      process.exit(1);
    }
  }
  
  if (profileArgs.length === 0 || profileArgs[0] === 'list') {
    // profile list
    const profiles = require('../lib/utils').listProfiles();
    
    if (profiles.length === 0) {
      console.log('📋 No profiles found.');
      console.log('💡 Use "kimicc profile add --slug example https://api.example.com YOUR_AUTH_TOKEN" to add a profile.');
      return;
    }
    
    console.log('📋 Available profiles:\n');
    profiles.forEach(profile => {
      const marker = profile.isDefault ? ' (default)' : '';
      console.log(`  ${profile.slug}${marker}`);
      console.log(`    URL: ${profile.url}`);
      console.log(`    Key: ${profile.key.substring(0, 8)}...`);
      if (profile.model) console.log(`    Model: ${profile.model}`);
      if (profile.smallFastModel) console.log(`    SmallFastModel: ${profile.smallFastModel}`);
      console.log();
    });
    return;
  }
  
  if (profileArgs[0] === 'add') {
    // profile add [--slug slug] [--model model] [--small-fast-model model] [--default] url AUTH_TOKEN
    let slug = null;
    let url = null;
    let authToken = null;
    let model = null;
    let smallFastModel = null;
    let setAsDefault = false;

    // Collect positional args after options
    const remaining = [];
    for (let i = 1; i < profileArgs.length; i++) {
      const v = profileArgs[i];
      if (v === '--slug' && i + 1 < profileArgs.length) {
        slug = profileArgs[++i];
      } else if (v === '--model' && i + 1 < profileArgs.length) {
        model = profileArgs[++i];
      } else if (v && typeof v === 'string' && v.startsWith('--model=')) {
        model = v.split('=')[1];
      } else if (v === '--small-fast-model' && i + 1 < profileArgs.length) {
        smallFastModel = profileArgs[++i];
      } else if (v && typeof v === 'string' && v.startsWith('--small-fast-model=')) {
        smallFastModel = v.split('=')[1];
      } else if (v === '--default') {
        setAsDefault = true;
      } else {
        remaining.push(v);
      }
    }

    // If provider flag present and overrideBaseUrl not set, set defaults from provider
    if (providerSlug) {
      const p = getProviderBySlug(providerSlug);
      if (!overrideBaseUrl && p) overrideBaseUrl = p.baseUrl;
      // Default slug if not provided
      if (!slug) slug = providerSlug;
      // Default model if not provided
      if (!model && p && p.defaultModel) model = p.defaultModel;
    }

    // Derive url/authToken from remaining
    if (remaining.length >= 2) {
      url = remaining[0];
      authToken = remaining[1];
    } else if (remaining.length === 1) {
      // If provider specified, treat single arg as auth token
      if (overrideBaseUrl) {
        url = overrideBaseUrl;
        authToken = remaining[0];
      } else {
        // Ambiguous: treat as URL and prompt later (but we require token), so fail
        url = remaining[0];
      }
    }

    // If no URL but we have overrideBaseUrl, use it
    if (!url && overrideBaseUrl) url = overrideBaseUrl;
    
    if (!url || !authToken) {
      console.error('❌ Missing required arguments: URL and auth token');
      console.log('💡 Usage: kimicc profile add [--slug SLUG] [--model MODEL] [--small-fast-model MODEL] [--default] URL AUTH_TOKEN');
      console.log('   Or:   kimicc profile add --kimi|--deepseek|--glm|--qwen [--base-url URL|base_url=URL] AUTH_TOKEN');
      process.exit(1);
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch (error) {
      console.error('❌ Invalid URL provided');
      process.exit(1);
    }
    
    // Generate slug if not provided
    if (!slug) {
      slug = require('../lib/utils').generateSlugFromUrl(url);
      if (!slug) {
        console.error('❌ Could not generate slug from URL. Please provide --slug manually.');
        process.exit(1);
      }
    }
    
    // Check if slug already exists and prompt for confirmation
    const { readConfig } = require('../lib/utils');
    const config = readConfig();
    if (config.profiles && config.profiles[slug]) {
      console.log(`⚠️  Profile '${slug}' already exists.`);
      console.log(`   Existing: URL=${config.profiles[slug].url}, Key=${config.profiles[slug].key.substring(0, 8)}...`);
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        rl.question(`Do you want to overwrite profile '${slug}'? (y/N): `, async (answer) => {
          rl.close();
          
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            const { addProfile } = require('../lib/utils');
            addProfile(slug, url, authToken, setAsDefault, model, smallFastModel);
            
            console.log(`✅ Profile '${slug}' updated successfully.`);
            if (setAsDefault) {
              console.log(`   Set as default profile.`);
            }
            if (model) {
              console.log(`   Model: ${model}`);
            }
            if (smallFastModel) {
              console.log(`   SmallFastModel: ${smallFastModel}`);
            }
          } else {
            console.log('Profile addition cancelled.');
          }
          resolve();
        });
      });
    }
    
    const { addProfile } = require('../lib/utils');
    addProfile(slug, url, authToken, setAsDefault, model, smallFastModel);
    
    console.log(`✅ Profile '${slug}' added successfully.`);
    if (setAsDefault) {
      console.log(`   Set as default profile.`);
    }
    if (model) {
      console.log(`   Model: ${model}`);
    }
    if (smallFastModel) {
      console.log(`   SmallFastModel: ${smallFastModel}`);
    }
    return;
  }
  
  if (profileArgs[0] === 'del' || profileArgs[0] === 'delete' || profileArgs[0] === 'remove') {
    // Check for -i flag
    const hasInteractive = profileArgs.includes('-i') || profileArgs.includes('--interactive');
    
    if (hasInteractive) {
      // Interactive deletion mode
      const { listProfiles, deleteProfile } = require('../lib/utils');
      const profiles = listProfiles();
      
      if (profiles.length === 0) {
        console.log('📋 No profiles found to delete.');
        return;
      }
      
      console.log('🗑️  Interactive Profile Deletion\n');
      console.log('📋 Available profiles:\n');
      profiles.forEach((profile, index) => {
        const marker = profile.isDefault ? ' (default)' : '';
        console.log(`  ${index + 1}. ${profile.slug}${marker}`);
        console.log(`     URL: ${profile.url}`);
        console.log(`     Key: ${profile.key.substring(0, 8)}...`);
        console.log();
      });
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        rl.question('Enter profile numbers to delete (comma-separated, e.g., 1,3): ', async (answer) => {
          rl.close();
          
          const indices = answer.split(',')
            .map(s => parseInt(s.trim()) - 1)
            .filter(i => !isNaN(i) && i >= 0 && i < profiles.length);
          
          if (indices.length === 0) {
            console.log('No valid profile numbers provided. Deletion cancelled.');
            resolve();
            return;
          }
          
          console.log(`\n📋 Selected profiles to delete: ${indices.map(i => profiles[i].slug).join(', ')}`);
          
          const confirmRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          confirmRl.question('Are you sure you want to delete these profiles? (y/N): ', async (confirmAnswer) => {
            confirmRl.close();
            
            if (confirmAnswer.toLowerCase() === 'y' || confirmAnswer.toLowerCase() === 'yes') {
              let deletedCount = 0;
              
              // Delete profiles in reverse order to maintain indices
              for (let i = indices.length - 1; i >= 0; i--) {
                const slug = profiles[indices[i]].slug;
                const success = deleteProfile(slug);
                if (success) {
                  console.log(`✅ Profile '${slug}' deleted successfully.`);
                  deletedCount++;
                } else {
                  console.log(`❌ Failed to delete profile '${slug}'.`);
                }
              }
              
              console.log(`\n🎉 Deleted ${deletedCount} profile(s).`);
            } else {
              console.log('Deletion cancelled.');
            }
            resolve();
          });
        });
      });
    } else {
      // Original deletion mode with specific slug
      const slug = profileArgs[1];
      
      if (!slug) {
        console.error('❌ Missing profile slug');
        console.log('💡 Usage: kimicc profile del SLUG');
        console.log('   kimicc profile del -i          # Interactive deletion');
        process.exit(1);
      }
      
      const { readConfig, deleteProfile } = require('../lib/utils');
      const config = readConfig();
      
      if (!config.profiles || !config.profiles[slug]) {
        console.error(`❌ Profile '${slug}' not found.`);
        process.exit(1);
      }
      
      // Confirmation prompt
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        rl.question(`Are you sure you want to delete profile '${slug}'? (y/N): `, async (answer) => {
          rl.close();
          
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            const success = deleteProfile(slug);
            if (success) {
              console.log(`✅ Profile '${slug}' deleted successfully.`);
            } else {
              console.log(`❌ Failed to delete profile '${slug}'.`);
            }
          } else {
            console.log('Deletion cancelled.');
          }
          resolve();
        });
      });
    }
  }
  
  if (profileArgs[0] === 'set-default') {
    // profile set-default slug
    const slug = profileArgs[1];
    
    if (!slug) {
      console.error('❌ Missing profile slug');
      console.log('💡 Usage: kimicc profile set-default SLUG');
      process.exit(1);
    }
    
    const { readConfig, setDefaultProfile } = require('../lib/utils');
    const config = readConfig();
    
    if (!config.profiles || !config.profiles[slug]) {
      console.error(`❌ Profile '${slug}' not found.`);
      process.exit(1);
    }
    
    setDefaultProfile(slug);
    console.log(`✅ Set '${slug}' as default profile.`);
    return;
  }
  
  console.error('❌ Unknown profile command');
  console.log('💡 Available profile commands:');
  console.log('   kimicc profile list              # List all profiles');
  console.log('   kimicc profile add [--slug SLUG] [--model MODEL] [--small-fast-model MODEL] [--default] URL AUTH_TOKEN');
  console.log('   kimicc profile add --kimi|--deepseek|--glm|--qwen [--base-url URL|base_url=URL] AUTH_TOKEN');
  console.log('   kimicc profile del SLUG          # Delete a profile');
  console.log('   kimicc profile del -i            # Interactive deletion');
  console.log('   kimicc profile set-default SLUG  # Set default profile');
}

async function main() {
  // Get command line arguments (remove 'node' and script path)
  const args = process.argv.slice(2);
  // Ensure default profile behaves like --kimi (URL + models set)
  try { ensureDefaultProfileKimiDefaults(); } catch {}
  
  // Handle subcommands
  if (args[0] === 'reset') {
    await handleResetCommand();
    return;
  }
  
  if (args[0] === 'inject') {
    await handleInjectCommand();
    return;
  }

  if (args[0] === 'ping') {
    await handlePingCommand();
    return;
  }

  if (args[0] === 'profile') {
    await handleProfileCommand();
    return;
  }

  // Parse provider quick flags and base_url overrides
  let provider = parseProviderFlag(args);
  let selectedProviderSlug = provider ? provider.slug : null;
  if (provider) {
    // Remove provider flag from args passed through
    args.splice(provider.index, 1);
  }
  // Parse base_url=... or --base-url URL on root command
  let explicitBaseUrl = null;
  let explicitModel = null;
  let explicitSmallFastModel = null;
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    const m = typeof tok === 'string' ? tok.match(/^base_url=(.+)$/i) : null;
    if (m) {
      explicitBaseUrl = m[1];
      args.splice(i, 1);
      break;
    }
  }
  const baseUrlIdx = args.findIndex(a => a === '--base-url');
  if (baseUrlIdx !== -1) {
    if (baseUrlIdx + 1 < args.length) {
      explicitBaseUrl = args[baseUrlIdx + 1];
      args.splice(baseUrlIdx, 2);
    } else {
      console.error('❌ Missing value for --base-url');
      process.exit(1);
    }
  }

  // Parse model overrides on root command (support --flag value and --flag=value)
  // --model value
  let modelIdx = args.findIndex(a => a === '--model');
  if (modelIdx !== -1) {
    if (modelIdx + 1 < args.length) {
      explicitModel = args[modelIdx + 1];
      args.splice(modelIdx, 2);
    } else {
      console.error('❌ Missing value for --model');
      process.exit(1);
    }
  } else {
    // --model=value
    const modelEqIdx = args.findIndex(a => typeof a === 'string' && a.startsWith('--model='));
    if (modelEqIdx !== -1) {
      explicitModel = args[modelEqIdx].split('=')[1];
      args.splice(modelEqIdx, 1);
    }
  }
  // --small-fast-model value
  let smallFastIdx = args.findIndex(a => a === '--small-fast-model');
  if (smallFastIdx !== -1) {
    if (smallFastIdx + 1 < args.length) {
      explicitSmallFastModel = args[smallFastIdx + 1];
      args.splice(smallFastIdx, 2);
    } else {
      console.error('❌ Missing value for --small-fast-model');
      process.exit(1);
    }
  } else {
    // --small-fast-model=value
    const smallFastEqIdx = args.findIndex(a => typeof a === 'string' && a.startsWith('--small-fast-model='));
    if (smallFastEqIdx !== -1) {
      explicitSmallFastModel = args[smallFastEqIdx].split('=')[1];
      args.splice(smallFastEqIdx, 1);
    }
  }

  // Parse profile argument from main command
  let profileName = null;
  const profileIndex = args.findIndex(arg => arg === '--profile' || arg === '-p');
  if (profileIndex !== -1 && profileIndex + 1 < args.length) {
    profileName = args[profileIndex + 1];
    // Remove --profile and profile name from args to pass to claude
    args.splice(profileIndex, 2);
  }

  // If provider flag and profile both present, provider takes precedence
  if (selectedProviderSlug && profileName) {
    console.log(`⚠️  Both --profile and provider flag specified; using provider '--${selectedProviderSlug}'.`);
    profileName = null;
  }

  // If a provider flag is used, prefer existing same-name profile; otherwise initialize one
  if (selectedProviderSlug) {
    const config = readConfig();
    const existing = config.profiles && config.profiles[selectedProviderSlug];
    if (existing) {
      profileName = selectedProviderSlug;
    } else {
      const p = getProviderBySlug(selectedProviderSlug);
      const urlToUse = explicitBaseUrl || (p && p.baseUrl) || 'https://api.moonshot.cn/anthropic';
      try {
        new URL(urlToUse);
      } catch (e) {
        console.error('❌ Invalid base URL. Provide a valid URL via --base-url or base_url=.');
        process.exit(1);
      }
      const token = await promptForTokenForProvider(p ? p.name : selectedProviderSlug);
      if (!token) {
        console.error('❌ No auth token provided. Exiting...');
        process.exit(1);
      }
      const modelToUse = p && p.defaultModel ? p.defaultModel : null;
      const smallFastToUse = p && p.defaultSmallFastModel ? p.defaultSmallFastModel : null;
      addProfile(selectedProviderSlug, urlToUse, token, false, modelToUse, smallFastToUse);
      console.log(`✅ Profile '${selectedProviderSlug}' created.`);
      profileName = selectedProviderSlug;
    }
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

  // Get auth token, base URL, and model based on profile or provider
  const authToken = await getAuthToken(profileName);
  if (!authToken) {
    console.error('No auth token provided. Exiting...');
    process.exit(1);
  }
  
  // Base URL resolution priority:
  // 1) explicit --base-url/base_url
  // 2) profile URL when a profile is selected (including provider-created)
  // 3) provider default URL when provider flag used but no profile selected
  // 4) default behavior in utils
  let baseUrl = null;
  if (explicitBaseUrl) {
    baseUrl = explicitBaseUrl;
  } else if (profileName) {
    baseUrl = getBaseUrl(profileName);
  } else if (selectedProviderSlug) {
    const p = getProviderBySlug(selectedProviderSlug);
    baseUrl = (p && p.baseUrl) ? p.baseUrl : null;
  }
  if (!baseUrl) {
    baseUrl = getBaseUrl(profileName);
  }
  const sonnetFromEnvOrProfile = getModel(profileName);
  const haikuFromEnvOrProfile = getSmallFastModel(profileName);
  const opusFromEnvOrProfile = getOpusModel(profileName);

  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: baseUrl,
  };

  // Always use auth token mode
  env.ANTHROPIC_AUTH_TOKEN = authToken;

  // Determine models from CLI > ENV > Profile and map to new Anthropic defaults
  let resolvedSonnetModel = explicitModel || sonnetFromEnvOrProfile;
  let resolvedHaikuModel = explicitSmallFastModel || haikuFromEnvOrProfile;
  let resolvedOpusModel = opusFromEnvOrProfile;

  if (!resolvedHaikuModel && resolvedSonnetModel) {
    resolvedHaikuModel = resolvedSonnetModel;
  }

  if (!resolvedOpusModel) {
    resolvedOpusModel = resolvedSonnetModel || resolvedHaikuModel || null;
  }

  if (resolvedSonnetModel) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolvedSonnetModel;
    env.ANTHROPIC_MODEL = explicitModel || env.ANTHROPIC_MODEL || resolvedSonnetModel;
  }

  if (resolvedHaikuModel) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolvedHaikuModel;
  }

  if (resolvedOpusModel) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolvedOpusModel;
  }

  // Display profile info if using one
  if (profileName) {
    console.log(`📋 Using profile: ${profileName}`);
  } else if (selectedProviderSlug) {
    console.log(`📋 Using provider: ${selectedProviderSlug}`);
  }

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
