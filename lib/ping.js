const { performance } = require('perf_hooks');

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_ERROR_SNIPPET = 240;

function resolveEndpoint(baseUrl) {
  try {
    return new URL('/v1/messages', baseUrl).toString();
  } catch (error) {
    throw new Error(`Invalid base URL "${baseUrl}": ${error.message}`);
  }
}

function sanitizeErrorMessage(value) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= MAX_ERROR_SNIPPET) return text;
  return `${text.slice(0, MAX_ERROR_SNIPPET)}…`;
}

async function parseError(response) {
  const raw = await response.text();
  try {
    const data = JSON.parse(raw);
    if (data && data.error) {
      const message = data.error.message || data.error.type || data.error;
      return sanitizeErrorMessage(message);
    }
  } catch {
    // Non-JSON error, fall through to raw text.
  }
  return sanitizeErrorMessage(raw) || `HTTP ${response.status}`;
}

async function doPing({ baseUrl, token, model, timeoutMs = DEFAULT_TIMEOUT_MS, verbose = false }) {
  if (!baseUrl) {
    throw new Error('Base URL is required for ping.');
  }
  if (!token) {
    throw new Error('Auth token is required for ping.');
  }
  if (!model) {
    throw new Error('Model name is required for ping.');
  }

  const endpoint = resolveEndpoint(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  let ok = false;
  let status = null;
  let latencyMs = null;
  let error = null;

  try {
    const payload = {
      model,
      max_tokens: 5,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: 'Reply with exactly: pong'
        }
      ]
    };

    const headers = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      authorization: `Bearer ${token}`
    };

    if (verbose) {
      console.log(`➡️  POST ${endpoint}`);
      console.log(`   model: ${model}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    status = response.status;
    latencyMs = Math.round(performance.now() - started);

    if (status === 200) {
      ok = true;
      // Drain body to ensure clean connection reuse.
      try {
        await response.json();
      } catch {
        // Ignore parse errors on success responses.
      }
    } else {
      error = await parseError(response);
      if (verbose && error) {
        console.log(`   ❌ Response error: ${error}`);
      }
    }
  } catch (err) {
    latencyMs = Math.round(performance.now() - started);
    if (err.name === 'AbortError') {
      error = `Timed out after ${timeoutMs} ms`;
    } else {
      error = sanitizeErrorMessage(err.message || String(err)) || 'Unknown error';
    }
    if (verbose) {
      console.log(`   ❌ Request failed: ${error}`);
    }
  } finally {
    clearTimeout(timer);
  }

  return {
    model,
    ok,
    status,
    latencyMs,
    error
  };
}

async function runPingSuite({ baseUrl, token, models, timeoutMs = DEFAULT_TIMEOUT_MS, verbose = false }) {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('At least one model is required to run ping tests.');
  }

  const uniqueModels = Array.from(new Set(models.filter(Boolean)));
  if (uniqueModels.length === 0) {
    throw new Error('At least one valid model is required to run ping tests.');
  }

  const results = [];
  for (const model of uniqueModels) {
    // Sequential execution per requirement.
    const result = await doPing({ baseUrl, token, model, timeoutMs, verbose });
    results.push(result);
  }

  return {
    ok: results.every(result => result.ok),
    results
  };
}

module.exports = {
  doPing,
  runPingSuite,
  DEFAULT_TIMEOUT_MS
};
