const PROVIDERS = {
  kimi: {
    slug: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    defaultModel: 'kimi-k2-turbo-preview',
    defaultSmallFastModel: 'kimi-k2-turbo-preview'
  },
  deepseek: {
    slug: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-chat',
    defaultSmallFastModel: 'deepseek-chat'
  },
  glm: {
    slug: 'glm',
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'glm-4.6',
    defaultSmallFastModel: 'glm-4.5-air'
  },
  qwen: {
    slug: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy',
    defaultModel: 'qwen3-coder-plus',
    defaultSmallFastModel: 'qwen3-coder-plus'
  }
};

function getProviderBySlug(slug) {
  if (!slug) return null;
  return PROVIDERS[slug] || null;
}

function parseProviderFlag(args) {
  if (!Array.isArray(args)) return null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') continue;
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    if (PROVIDERS[name]) {
      return { slug: name, index: i };
    }
  }
  return null;
}

module.exports = {
  PROVIDERS,
  getProviderBySlug,
  parseProviderFlag
};
