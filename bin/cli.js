#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { checkClaudeInPath, installClaudeCode, getAuthToken, getBaseUrl, getModel, updateClaudeSettings, detectShellType, injectEnvVariables, removeEnvVariables, readConfig, getProfileConfig, addProfile } = require('../lib/utils');
const { parseProviderFlag, getProviderBySlug } = require('../lib/providers');
const { version } = require('../package.json');

const CONFIG_FILE = path.join(os.homedir(), '.kimicc.json');

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
  // Parse inject command arguments
  const args = process.argv.slice(2);
  const injectArgs = args.slice(1); // Skip the 'inject' command itself
  
  const force = injectArgs.includes('--force') || injectArgs.includes('-f');
  const reset = injectArgs.includes('--reset') || injectArgs.includes('-r');
  
  if (reset) {
    console.log('🗑️  Removing KimiCC environment variables from shell config...\n');
    
    // Detect shell type
    const shellType = detectShellType();
    console.log(`📋 Detected shell: ${shellType}`);
    
    try {
      const removed = await removeEnvVariables(shellType, force);
      if (!removed) {
        console.log('Removal cancelled or no variables found.');
        return;
      }
    } catch (error) {
      console.error('❌ Failed to remove environment variables:', error.message);
      process.exit(1);
    }
    return;
  }
  
  console.log('💉 Injecting KimiCC environment variables into shell config...\n');
  
  // Get auth token first
  const authToken = await getAuthToken();
  if (!authToken) {
    console.error('❌ No auth token provided. Cannot inject environment variables.');
    return;
  }
  
  // Detect shell type
  const shellType = detectShellType();
  console.log(`📋 Detected shell: ${shellType}`);
  
  try {
    const proceed = await injectEnvVariables(authToken, shellType, force);
    if (proceed === false) {
      console.log('Injection cancelled by user.');
      return;
    }
  } catch (error) {
    console.error('❌ Failed to inject environment variables:', error.message);
    process.exit(1);
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
      if (profile.model) {
        console.log(`    Model: ${profile.model}`);
      }
      console.log();
    });
    return;
  }
  
  if (profileArgs[0] === 'add') {
    // profile add [--slug slug] [--model model] [--default] url AUTH_TOKEN
    let slug = null;
    let url = null;
    let authToken = null;
    let model = null;
    let setAsDefault = false;

    // Collect positional args after options
    const remaining = [];
    for (let i = 1; i < profileArgs.length; i++) {
      const v = profileArgs[i];
      if (v === '--slug' && i + 1 < profileArgs.length) {
        slug = profileArgs[++i];
      } else if (v === '--model' && i + 1 < profileArgs.length) {
        model = profileArgs[++i];
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
      console.log('💡 Usage: kimicc profile add [--slug SLUG] [--model MODEL] [--default] URL AUTH_TOKEN');
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
            addProfile(slug, url, authToken, setAsDefault, model);
            
            console.log(`✅ Profile '${slug}' updated successfully.`);
            if (setAsDefault) {
              console.log(`   Set as default profile.`);
            }
            if (model) {
              console.log(`   Model: ${model}`);
            }
          } else {
            console.log('Profile addition cancelled.');
          }
          resolve();
        });
      });
    }
    
    const { addProfile } = require('../lib/utils');
    addProfile(slug, url, authToken, setAsDefault, model);
    
    console.log(`✅ Profile '${slug}' added successfully.`);
    if (setAsDefault) {
      console.log(`   Set as default profile.`);
    }
    if (model) {
      console.log(`   Model: ${model}`);
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
  console.log('   kimicc profile add [--slug SLUG] [--model MODEL] [--default] URL AUTH_TOKEN');
  console.log('   kimicc profile add --kimi|--deepseek|--glm|--qwen [--base-url URL|base_url=URL] AUTH_TOKEN');
  console.log('   kimicc profile del SLUG          # Delete a profile');
  console.log('   kimicc profile del -i            # Interactive deletion');
  console.log('   kimicc profile set-default SLUG  # Set default profile');
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
      addProfile(selectedProviderSlug, urlToUse, token, false, modelToUse);
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
  const model = getModel(profileName);


  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: baseUrl,
  };

  // Always use auth token mode
  env.ANTHROPIC_AUTH_TOKEN = authToken;

  // Set model environment variables if specified in profile
  if (model) {
    env.ANTHROPIC_MODEL = model;
    env.ANTHROPIC_SMALL_FAST_MODEL = model;
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
