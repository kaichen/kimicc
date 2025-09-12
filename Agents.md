# Agents.md

## Project Overview

kimicc is a CLI wrapper that allows users to run Claude Code using the Kimi K2 API. It acts as a proxy by intercepting the Claude Code CLI and redirecting API calls to Kimi's endpoint at https://api.moonshot.cn/anthropic.

## Architecture

The project has a simple architecture:
- `bin/cli.js` - Main entry point that handles the CLI lifecycle
- `lib/utils.js` - Utility functions for checking Claude installation, managing auth tokens, and configuration

## Key Implementation Details

### Authentication
The system exclusively uses `ANTHROPIC_AUTH_TOKEN` for authentication. The legacy `ANTHROPIC_API_KEY` has been removed.

### Auth Token Priority
The system checks for auth tokens in this order:
1. `KIMI_AUTH_TOKEN` environment variable
2. `~/.kimicc.json` config file (profiles or legacy format)
3. Interactive prompt (saves to config file)

### Environment Setup
Before spawning the Claude process, the wrapper sets:
- `ANTHROPIC_AUTH_TOKEN` - The Kimi auth token
- `ANTHROPIC_BASE_URL` - https://api.moonshot.cn/anthropic
- `ANTHROPIC_MODEL` - (optional) From CLI/env/profile
- `ANTHROPIC_SMALL_FAST_MODEL` - (optional) From CLI/env/profile; falls back to `ANTHROPIC_MODEL` if unset

### Multi-Profile Support
- Profiles are stored in `~/.kimicc.json` under the `profiles` key
- Each profile contains: `url`, `key` (auth token), and optionally `model`, `smallFastModel` (may be empty). If `smallFastModel` is not set, runtime falls back to `model`.
- Users can switch profiles using `kimicc --profile <profile-name>`
- Default profile is stored in `defaultProfile` field

### Claude Installation
If `claude` command is not found in PATH, the wrapper automatically runs:
```bash
npm install -g @anthropic-ai/claude-code
```

## CLI Commands

### Main Commands
- `kimicc` - Start Claude Code with default settings
- `kimicc --profile <name>` - Start with a specific profile
- `kimicc --model <name>` - Override model for this run
- `kimicc --small-fast-model <name>` - Override small/fast model for this run
- `kimicc reset` - Delete the configuration file
- `kimicc inject` - Inject environment variables into shell config
- `kimicc inject --reset` - Remove injected variables from shell config

### Profile Management
- `kimicc profile list` - List all profiles
- `kimicc profile add [--slug SLUG] [--model MODEL] [--small-fast-model MODEL] [--default] URL AUTH_TOKEN`
- `kimicc profile del SLUG` - Delete a specific profile
- `kimicc profile del -i` - Interactive deletion mode
- `kimicc profile set-default SLUG` - Set default profile

## Development Commands

```bash
# Install dependencies
npm install

# Test the CLI locally
node bin/cli.js [arguments]

# Test with environment variable
KIMI_AUTH_TOKEN=your-token node bin/cli.js [arguments]

# Link for global testing
npm link
kimicc [arguments]

# Unlink after testing
npm unlink
```

## Testing Considerations

- The project currently targets macOS and Node.js >=18.0.0
- Windows and Linux compatibility is not guaranteed
- Test auth token management flow by removing ~/.kimicc.json
- Test Claude installation detection by checking PATH
- Test profile switching and management commands
- Test shell injection with different shell types (bash, zsh, fish)

## Configuration File Format

```json
{
  "profiles": {
    "default": {
      "url": "https://api.moonshot.cn/anthropic",
      "key": "sk-..."
    },
    "custom": {
      "url": "https://api.example.com/anthropic",
      "key": "sk-...",
      "model": "claude-3-opus-20240229",
      "smallFastModel": "claude-3-haiku-20240307"
    }
  },
  "defaultProfile": "default"
}
```

## Precedence Rules

- Auth token: `KIMI_AUTH_TOKEN` > profile/default > prompt
- Base URL: CLI `--base-url`/`base_url=` > `ANTHROPIC_BASE_URL` > profile/default > Kimi default
- Models: CLI `--model`/`--small-fast-model` > `ANTHROPIC_MODEL`/`ANTHROPIC_SMALL_FAST_MODEL` > profile fields > `smallFastModel` falls back to `model`

## Legacy Migration
The system automatically migrates legacy configurations (with `apiKey` field) to the new profile format when adding the first profile.
