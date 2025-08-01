# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kimicc is a CLI wrapper that allows users to run Claude Code using the Kimi K2 API. It acts as a proxy by intercepting the Claude Code CLI and redirecting API calls to Kimi's endpoint at https://api.moonshot.cn/anthropic.

## Architecture

The project has a simple architecture:
- `bin/cli.js` - Main entry point that handles the CLI lifecycle
- `lib/utils.js` - Utility functions for checking Claude installation, managing auth tokens, and configuration

## Key Implementation Details

### Auth Token Priority
The system checks for auth tokens in this order:
1. `KIMI_AUTH_TOKEN` environment variable
2. `~/.kimicc.json` config file
3. Interactive prompt (saves to config file)

### Environment Setup
Before spawning the Claude process, the wrapper sets:
- `ANTHROPIC_AUTH_TOKEN` - The Kimi auth token
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