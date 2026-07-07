/**
 * Kiwi Run leaderboard API + static game hosting.
 *
 * GET  /api/scores        -> { top: [{name, score, country}] }
 * GET  /api/scores/token  -> { token }   (issued when a run starts)
 * POST /api/scores        -> { top, rank } | { error }
 *
 * Anti-cheat: scores must carry a run token. The token proves when the
 * run started, and the server rejects any score that would have been
 * impossible to earn in that much real time. Plus a per-IP rate limit.
 *
 * Name check: cheap heuristic first, then (if ANTHROPIC_API_KEY is set)
 * a tiny Claude Haiku prompt for anything the heuristic can't judge.
 * Results are cached per name; fails open so the game never breaks.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_SCORE = 500000;
const MAX_POINTS_PER_SECOND = 130; // generous upper bound incl. bonuses
const MIN_RUN_MS = 12000; // top-10 scores need at least a few seconds
const MAX_TOKEN_AGE_MS = 6 * 3600 * 1000;
const RATE_LIMIT = 6; // submissions per IP per 5 minutes

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ------------------------------------------------------------ name check
const BLOCKLIST = [
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "nigg",
  "fagg", "rape", "hitler", "nazi", "porn", "penis", "vagina", "boob",
  "tits", "slut", "whore", "retard", "spast", "hurensohn", "fotze",
  "wichs", "arschloch", "kanake", "anal", "cum", "sperm",
];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };

function heuristicBad(name) {
  const normalized = name
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-zäöüßāēīōū]/g, "");
  return BLOCKLIST.some((b) => normalized.includes(b));
}

const nameCache = new Map();

async function aiNameOk(env, name) {
  if (!env.ANTHROPIC_API_KEY) return true;
  if (nameCache.has(name)) return nameCache.get(name);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 5,
        messages: [
          {
            role: "user",
            content:
              `Is "${name}" appropriate as a display name on a children's game leaderboard? ` +
              `Consider profanity, slurs, sexual/violent content and drug references in any ` +
              `language (English, German, te reo Māori, ...) including leetspeak and ` +
              `misspellings. Ordinary names, nicknames and silly-but-harmless names are fine. ` +
              `Reply with exactly OK or BAD.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return true; // fail open
    const data = await r.json();
    const ok = (data.content?.[0]?.text ?? "OK").trim().toUpperCase().startsWith("OK");
    nameCache.set(name, ok);
    return ok;
  } catch {
    return true; // fail open — the heuristic already ran
  }
}

function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  return name.length >= 2 ? name : null;
}

// ------------------------------------------------------------ run tokens
const encoder = new TextEncoder();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(msg) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(msg));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getTop(env) {
  const { results } = await env.DB.prepare(
    "SELECT name, score, country FROM scores ORDER BY score DESC, created_at ASC LIMIT 10"
  ).all();
  return results;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.SCORE_SECRET ?? "dev-secret-change-me";

    if (url.pathname === "/api/scores/token" && request.method === "GET") {
      const ts = String(Date.now());
      return json({ token: `${ts}.${await hmacHex(secret, ts)}` });
    }

    if (url.pathname === "/api/scores") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
      }

      if (request.method === "GET") {
        return json({ top: await getTop(env) });
      }

      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "json" }, 400);
        }

        const name = cleanName(body.name);
        const score = Number(body.score);
        if (!name) return json({ error: "name" }, 422);
        if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) {
          return json({ error: "score" }, 400);
        }

        // run token: proves how long the run could have lasted at most
        const [tsStr, sig] = String(body.token ?? "").split(".");
        if (!tsStr || !sig || sig !== (await hmacHex(secret, tsStr))) {
          return json({ error: "token" }, 400);
        }
        const age = Date.now() - Number(tsStr);
        if (age < MIN_RUN_MS || age > MAX_TOKEN_AGE_MS) {
          return json({ error: "token" }, 400);
        }
        const plausible = Math.floor((age / 1000) * MAX_POINTS_PER_SECOND) + 500;
        if (score > plausible) return json({ error: "score" }, 400);

        // per-IP rate limit (hashed for privacy)
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        const ipHash = (await sha256Hex(ip)).slice(0, 24);
        const { results: recent } = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > datetime('now', '-300 seconds')"
        )
          .bind(ipHash)
          .all();
        if ((recent[0]?.n ?? 0) >= RATE_LIMIT) return json({ error: "rate" }, 429);

        // name moderation: heuristic, then Haiku
        if (heuristicBad(name) || !(await aiNameOk(env, name))) {
          return json({ error: "name" }, 422);
        }

        const cfCountry = request.cf && request.cf.country;
        const country = /^[A-Z]{2}$/.test(cfCountry ?? "") ? cfCountry : null;

        await env.DB.prepare(
          "INSERT INTO scores (name, score, country, ip_hash, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
        )
          .bind(name, score, country, ipHash)
          .run();

        const top = await getTop(env);
        const { results } = await env.DB.prepare(
          "SELECT COUNT(*) AS better FROM scores WHERE score > ?"
        )
          .bind(score)
          .all();
        return json({ top, rank: (results[0]?.better ?? 0) + 1 });
      }

      return json({ error: "method" }, 405);
    }

    // everything else: the game itself
    return env.ASSETS.fetch(request);
  },
};
