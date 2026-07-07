/**
 * Global top-10 leaderboard, backed by a Cloudflare Worker + D1.
 * The same worker also hosts the game itself.
 *
 * Anti-cheat: every run fetches a signed token at start; the server
 * only accepts scores that were possible in the run's real duration.
 */
export type ScoreRow = { name: string; score: number; country?: string | null };
export type SubmitResult =
  | { ok: true; top: ScoreRow[]; rank: number }
  | { ok: false; reason: "name" | "rate" | "score" | "token" | "offline" };

const API = "https://kiwirun.christoph-koch.workers.dev/api/scores";

/** "DE" -> 🇩🇪 (renders as letters on Windows, real flags on phones). */
export function flagEmoji(country?: string | null): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(
    ...[...country].map((c) => 127397 + c.charCodeAt(0))
  );
}

let runToken: Promise<string | null> = Promise.resolve(null);

/** Call when a run starts — fetches the signed run token in the background. */
export function beginRun() {
  runToken = fetch(`${API}/token`, { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { token?: string } | null) => d?.token ?? null)
    .catch(() => null);
}

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
): Promise<SubmitResult> {
  try {
    const token = await runToken;
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score, token }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await r.json()) as {
      top?: ScoreRow[];
      rank?: number;
      error?: string;
    };
    if (r.ok && data.top && data.rank) {
      return { ok: true, top: data.top, rank: data.rank };
    }
    const reason =
      data.error === "name" || data.error === "rate" || data.error === "token"
        ? data.error
        : "score";
    return { ok: false, reason };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

/** A score makes the global top 10 if the board isn't full or it beats #10. */
export function qualifies(top: ScoreRow[], score: number): boolean {
  if (score <= 0) return false;
  if (top.length < 10) return true;
  return score > top[top.length - 1].score;
}
