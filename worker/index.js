/**
 * Kiwi Run leaderboard API + static game hosting.
 *
 * GET  /api/scores          -> { top: [{name, score}] }  (global top 10)
 * POST /api/scores          -> { top: [...], rank }      (submit a score)
 *
 * Everything else is served from the built game in ./dist via the
 * assets binding.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_SCORE = 500000; // sanity cap — nobody runs 5000 km

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function cleanName(raw) {
  if (typeof raw !== "string") return null;
  // strip control chars and angle brackets, collapse whitespace
  const name = raw
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  return name.length >= 2 ? name : null;
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
          return json({ error: "invalid json" }, 400);
        }
        const name = cleanName(body.name);
        const score = Number(body.score);
        if (!name) return json({ error: "invalid name" }, 400);
        if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) {
          return json({ error: "invalid score" }, 400);
        }

        // Cloudflare tells us the player's country at the edge — free geo,
        // no permission prompts, no way to fake a flag from the client
        const cfCountry = request.cf && request.cf.country;
        const country = /^[A-Z]{2}$/.test(cfCountry ?? "") ? cfCountry : null;

        await env.DB.prepare(
          "INSERT INTO scores (name, score, country, created_at) VALUES (?, ?, ?, datetime('now'))"
        )
          .bind(name, score, country)
          .run();

        const top = await getTop(env);
        const { results } = await env.DB.prepare(
          "SELECT COUNT(*) AS better FROM scores WHERE score > ?"
        )
          .bind(score)
          .all();
        const rank = (results[0]?.better ?? 0) + 1;
        return json({ top, rank });
      }

      return json({ error: "method not allowed" }, 405);
    }

    // everything else: the game itself
    return env.ASSETS.fetch(request);
  },
};
