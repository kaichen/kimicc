const PROVIDERS = {
  kimi: {
    slug: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/anthropic'
  },
  deepseek: {
    slug: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic'
  },
  glm: {
    slug: 'glm',
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic'
  },
  qwen: {
    slug: 'qwen',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy'
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

