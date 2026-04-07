const RETRIES = 3;
const TIMEOUT_MS = 20000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "User-Agent": "NetlifyFunctionProxy" },
      signal: controller.signal
    });
  } finally {
    clearTimeout(id);
  }
}

exports.handler = async function handler() {
  const upstreamUrl = process.env.UPSTREAM_URL;

  if (!upstreamUrl) {
    return {
      statusCode: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "Missing required environment variable: UPSTREAM_URL"
    };
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const url = `${upstreamUrl}${upstreamUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`;
      const resp = await fetchWithTimeout(url, TIMEOUT_MS);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const csv = await resp.text();
      if (!csv || !csv.trim()) throw new Error("Empty CSV response");

      return {
        statusCode: 200,
        headers: {
          "content-type": resp.headers.get("content-type") || "text/csv; charset=UTF-8",
          "access-control-allow-origin": "*",
          "cache-control": "no-store"
        },
        body: csv
      };
    } catch (err) {
      lastErr = err;
      await sleep(300 * attempt);
    }
  }

  return {
    statusCode: 502,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: `Upstream fetch failed: ${lastErr ? lastErr.message : "unknown error"}`
  };
};
