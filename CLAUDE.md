# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kimicc is a CLI wrapper that allows users to run Claude Code using the Kimi K2 API. It acts as a proxy by intercepting the Claude Code CLI and redirecting API calls to Kimi's endpoint at https://api.moonshot.cn/anthropic.

## Architecture

The project has a simple architecture:
- `bin/cli.js` - Main entry point that handles the CLI lifecycle
- `lib/utils.js` - Utility functions for checking Claude installation, managing API keys, and configuration

## Key Implementation Details

### API Key Priority
The system checks for API keys in this order:
1. `KIMI_API_KEY` environment variable
2. `ANTHROPIC_API_KEY` environment variable  
3. `~/.kimicc.json` config file
4. Interactive prompt (saves to config file)

### Environment Setup
Before spawning the Claude process, the wrapper sets:
- `ANTHROPIC_API_KEY` - The Kimi API key
- `ANTHROPIC_BASE_URL` - https://api.moonshot.cn/anthropic

### Claude Installation
If `claude` command is not found in PATH, the wrapper automatically runs:
```bash
npm install -g @anthropic-ai/claude-code
```

## Development Commands

```bash
# Install dependencies
npm install

# Test the CLI locally
node bin/cli.js [arguments]

# Test with environment variable
KIMI_API_KEY=your-key node bin/cli.js [arguments]

# Link for global testing
npm link
kimicc [arguments]

# Unlink after testing
npm unlink
```

## Testing Considerations

- The project currently targets macOS and Node.js >=18.0.0
- Windows and Linux compatibility is not guaranteed
- Test API key management flow by removing ~/.kimicc.json
- Test Claude installation detection by checking PATH