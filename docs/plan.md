build nodejs cli wrap claude-code cli to use Kimi K2 LLM.

launch cli as `kimicc`
The final setup is super simple — users just need to run `npx kimicc`.

Here’s how the claude code package check and install works: When you start, it checks if claude is already in your execution path. If it is, it skips the install. If not, it runs `npm install -g @anthropic-ai/claude-code` to get it installed.

For the API Key: On startup, it looks for KIMI_API_KEY first, then ANTHROPIC_API_KEY. If both are missing, it’ll prompt you interactively to enter your kimi API key, which it then saves to ~/.kimicc.json.

Next, you need to update the Claude settings by checking the ~/.claude.json file. Change the value of autoUpdates to false (add this key if it’s not there), and set hasCompletedOnboarding to true (add this key if it’s missing).

Before launching, it sets up environment variables: it assigns ANTHROPIC_API_KEY (from the method above) and ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic, then starts the claude process.

Focus on launch project ASAP, keep everything simple.
