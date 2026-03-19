const DEFAULT_TIMEOUT_MS = 15000;

function mergeHeaders(headers = {}) {
  return {
    Accept: "*/*",
    "User-Agent": "CyberMonitor/2.0 (+static-feed-builder)",
    ...headers
  };
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: mergeHeaders(options.headers)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }

    return {
      url,
      text,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchText(url, {
    ...options,
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      ...(options.headers || {})
    }
  });

  try {
    return {
      ...response,
      json: JSON.parse(response.text)
    };
  } catch (_error) {
    throw new Error(`Invalid JSON response from ${url}`);
  }
}

module.exports = {
  fetchJson,
  fetchText
};
