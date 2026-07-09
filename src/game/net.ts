/**
 * Cross Country netcode client — a thin wrapper over one WebSocket to a
 * RaceRoom Durable Object. It auto-joins on open and surfaces roster /
 * countdown / error events via callbacks.
 */
import type { Course, RaceMode } from "./course";

export type RosterPlayer = {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  host: boolean;
};

export type PosUpdate = { id: string; x: number; alive: boolean };
export type Standing = {
  id: string;
  name: string;
  place: number;
  award?: string;
};

type Handlers = {
  roster?: (players: RosterPlayer[], youId: string, mode: RaceMode) => void;
  countdown?: (ms: number, course: Course) => void;
  pos?: (u: PosUpdate) => void;
  standings?: (list: Standing[], over: boolean) => void;
  toLobby?: () => void;
  cantStart?: (reason: string) => void;
  closed?: () => void;
};

const HOST = "kiwirun.christoph-koch.workers.dev";
const WS_BASE = `wss://${HOST}/api/race/`;
const API_BASE = `https://${HOST}/api/race/`;

/** Does a room for this code already have players? Drives Join vs Create. */
export async function checkRoom(
  code: string
): Promise<{ exists: boolean; count: number }> {
  try {
    const r = await fetch(API_BASE + code, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { exists: false, count: 0 };
    return (await r.json()) as { exists: boolean; count: number };
  } catch {
    return { exists: false, count: 0 };
  }
}

// room codes: 4 letters, no I/O to avoid confusion when read aloud
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export class RaceClient {
  code = "";
  youId = "";
  players: RosterPlayer[] = [];
  mode: RaceMode = "finish";
  private ws?: WebSocket;
  private h: Handlers = {};

  on(h: Handlers) {
    this.h = { ...this.h, ...h };
  }

  connect(code: string, name: string) {
    this.code = code;
    const ws = new WebSocket(WS_BASE + code);
    this.ws = ws;
    ws.onopen = () => this.send({ t: "join", name });
    ws.onmessage = (e) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      if (m.t === "roster") {
        this.players = m.players as RosterPlayer[];
        this.youId = m.you as string;
        this.mode = (m.mode as RaceMode) ?? "finish";
        this.h.roster?.(this.players, this.youId, this.mode);
      } else if (m.t === "countdown") {
        this.h.countdown?.(m.ms as number, m.course as Course);
      } else if (m.t === "pos") {
        this.h.pos?.({
          id: m.id as string,
          x: m.x as number,
          alive: m.alive as boolean,
        });
      } else if (m.t === "standings") {
        this.h.standings?.(m.list as Standing[], !!m.over);
      } else if (m.t === "toLobby") {
        this.h.toLobby?.();
      } else if (m.t === "cantStart") {
        this.h.cantStart?.(String(m.reason ?? ""));
      }
    };
    ws.onclose = () => this.h.closed?.();
    ws.onerror = () => this.h.closed?.();
  }

  private send(o: unknown) {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(o));
      }
    } catch {
      // dropped — the closed handler will fire
    }
  }

  setReady(ready: boolean) {
    this.send({ t: "ready", ready });
  }

  setMode(mode: RaceMode) {
    this.send({ t: "setMode", mode });
  }

  sendDead(fruit: number, hits: number) {
    this.send({ t: "dead", fruit, hits });
  }

  /** Host-only: start the race with the course the host authored. */
  start(course: Course) {
    this.send({ t: "start", course });
  }

  sendPos(x: number, alive: boolean) {
    this.send({ t: "pos", x, alive });
  }

  sendFinished(elapsedMs: number, fruit: number, hits: number) {
    this.send({ t: "finished", elapsed: elapsedMs, fruit, hits });
  }

  reset() {
    this.send({ t: "reset" });
  }

  me(): RosterPlayer | undefined {
    return this.players.find((p) => p.id === this.youId);
  }

  isHost(): boolean {
    return this.me()?.host ?? false;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = undefined;
  }
}
