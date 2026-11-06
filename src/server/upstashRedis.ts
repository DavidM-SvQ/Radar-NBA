// @ts-nocheck
const __name = (fn, _n) => fn;

function getRedisRestConfig() {
  const explicitPairs = [
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
    [process.env.REDIS_REST_URL, process.env.REDIS_REST_TOKEN],
    [process.env.FANTASY_REDIS_REST_URL, process.env.FANTASY_REDIS_REST_TOKEN]
  ];
  for (const [rawUrl, rawToken] of explicitPairs) {
    if (typeof rawUrl === "string" && rawUrl.trim().startsWith("https://") && typeof rawToken === "string" && rawToken.trim()) {
      return {
        url: rawUrl.trim().replace(/\/+$/, ""),
        token: rawToken.trim()
      };
    }
  }
  for (const [key, val] of Object.entries(process.env)) {
    if (typeof val !== "string" || !val.trim().startsWith("https://")) continue;
    if (key.endsWith("_REDIS_REST_URL")) {
      const prefix = key.slice(0, -"_REDIS_REST_URL".length);
      const tok = process.env[`${prefix}_REDIS_REST_TOKEN`];
      if (typeof tok === "string" && tok.trim()) {
        return { url: val.trim().replace(/\/+$/, ""), token: tok.trim() };
      }
    }
    if (key.endsWith("_KV_REST_API_URL")) {
      const prefix = key.slice(0, -"_KV_REST_API_URL".length);
      const tok = process.env[`${prefix}_KV_REST_API_TOKEN`];
      if (typeof tok === "string" && tok.trim()) {
        return { url: val.trim().replace(/\/+$/, ""), token: tok.trim() };
      }
    }
  }
  return null;
}
__name(getRedisRestConfig, "getRedisRestConfig");

function isUpstashRedisConfigured() {
  return getRedisRestConfig() !== null;
}
__name(isUpstashRedisConfigured, "isUpstashRedisConfigured");

async function executeUpstashCommand(redisCfg, commandArgs, timeoutMs = 5e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(redisCfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisCfg.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commandArgs),
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Upstash HTTP ${res.status}: ${errText.slice(0, 160)}`);
    }
    const payload = await res.json();
    if (payload && payload.error) {
      throw new Error(`Upstash Redis error: ${String(payload.error)}`);
    }
    return payload ? payload.result : null;
  } finally {
    clearTimeout(timer);
  }
}
__name(executeUpstashCommand, "executeUpstashCommand");

async function executeUpstashPipeline(redisCfg, commandsList, timeoutMs = 5e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${redisCfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisCfg.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commandsList),
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Upstash Pipeline HTTP ${res.status}: ${errText.slice(0, 160)}`);
    }
    const payload = await res.json();
    if (!Array.isArray(payload)) {
      throw new Error("Upstash Pipeline malformed response");
    }
    return payload.map((item) => {
      if (item && item.error) {
        throw new Error(`Upstash Redis pipeline item error: ${String(item.error)}`);
      }
      return item ? item.result : null;
    });
  } finally {
    clearTimeout(timer);
  }
}
__name(executeUpstashPipeline, "executeUpstashPipeline");

export {
  executeUpstashCommand,
  executeUpstashPipeline,
  getRedisRestConfig,
  isUpstashRedisConfigured
};
