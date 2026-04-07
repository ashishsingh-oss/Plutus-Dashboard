const { getStore } = require("@netlify/blobs");

const RETRIES = 3;
const TIMEOUT_MS = 20000;
const BLOB_STORE = "plutus-dashboard";
const BLOB_KEY = "latest-data.csv";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "User-Agent": "NetlifyScheduledRefresh" },
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

      const store = getStore(BLOB_STORE);
      await store.set(BLOB_KEY, csv, { metadata: { refreshedAt: new Date().toISOString() } });

      return {
        statusCode: 200,
        body: `Snapshot refreshed at ${new Date().toISOString()}`
      };
    } catch (err) {
      lastErr = err;
      await sleep(300 * attempt);
    }
  }

  return {
    statusCode: 502,
    body: `Scheduled refresh failed: ${lastErr ? lastErr.message : "unknown error"}`
  };
};

exports.config = {
  schedule: "0 * * * *"
};
