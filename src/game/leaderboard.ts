/**
 * Global top-10 leaderboard, backed by a Cloudflare Worker + D1.
 * The same worker also hosts the game itself.
 */
export type ScoreRow = { name: string; score: number };

const API = "https://kiwirun.christoph-koch.workers.dev/api/scores";

export async function fetchTop(): Promise<ScoreRow[] | null> {
  try {
    const r = await fetch(API, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const data = (await r.json()) as { top?: ScoreRow[] };
    return data.top ?? [];
  } catch {
    return null;
  }
}

export async function submitScore(
  name: string,
  score: number
): Promise<{ top: ScoreRow[]; rank: number } | null> {
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return (await r.json()) as { top: ScoreRow[]; rank: number };
  } catch {
    return null;
  }
}

/** A score makes the global top 10 if the board isn't full or it beats #10. */
export function qualifies(top: ScoreRow[], score: number): boolean {
  if (score <= 0) return false;
  if (top.length < 10) return true;
  return score > top[top.length - 1].score;
}
