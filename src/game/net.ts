/**
 * Cross Country netcode client — a thin wrapper over one WebSocket to a
 * RaceRoom Durable Object. It auto-joins on open and surfaces roster /
 * countdown / error events via callbacks.
 */
export type RosterPlayer = {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  host: boolean;
};

type Handlers = {
  roster?: (players: RosterPlayer[], youId: string) => void;
  countdown?: (startAt: number) => void;
  cantStart?: (reason: string) => void;
  closed?: () => void;
};

const WS_BASE = "wss://kiwirun.christoph-koch.workers.dev/api/race/";

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
        this.h.roster?.(this.players, this.youId);
      } else if (m.t === "countdown") {
        this.h.countdown?.(m.startAt as number);
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

  start() {
    this.send({ t: "start" });
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
