import { DurableObject } from "cloudflare:workers";

/**
 * One RaceRoom per 4-letter code. Holds the lobby roster and (later) runs the
 * race. State lives in each connection's WebSocket attachment, which survives
 * hibernation — so idle rooms cost nothing and we never touch SQL.
 *
 * Phase 1: connectivity + roster only.
 *   client -> { t:"join", name, ready? }
 *   client -> { t:"ready", ready }
 *   server -> { t:"roster", you, players:[{id,name,color,ready,host}] }
 */

const MAX_PLAYERS = 8;

// per-player kiwi tints, handed out in order
const PLAYER_COLORS = [
  0xffe066, 0x6fb0d8, 0xff6b5e, 0x9fe066, 0xf0a3b0, 0xffb35e, 0xb18cff, 0x7ad9c0,
];

function cleanName(raw) {
  if (typeof raw !== "string") return "Kiwi";
  const n = raw
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  return n.length >= 1 ? n : "Kiwi";
}

export class RaceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.finishers = []; // player ids in the order they crossed the line
  }

  async fetch(request) {
    // plain GET = "does this room exist yet?" probe (drives Join vs Create)
    if (request.headers.get("Upgrade") !== "websocket") {
      const players = this.roster();
      return new Response(
        JSON.stringify({ exists: players.length > 0, count: players.length }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const live = this.ctx.getWebSockets();
    if (live.length >= MAX_PLAYERS) {
      return new Response("room full", { status: 403 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);

    const usedColors = live
      .map((w) => this.meta(w)?.color)
      .filter((c) => c !== undefined);
    const color =
      PLAYER_COLORS.find((c) => !usedColors.includes(c)) ?? PLAYER_COLORS[0];

    server.serializeAttachment({
      id: crypto.randomUUID().slice(0, 8),
      name: "",
      color,
      ready: false,
      host: live.length === 0, // first in is host
      seq: Date.now(), // join order, for predictable host reassignment
      joined: false, // becomes true once they send their name
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  meta(ws) {
    try {
      return ws.deserializeAttachment();
    } catch {
      return null;
    }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : "");
    } catch {
      return;
    }
    const me = this.meta(ws);
    if (!me) return;

    if (msg.t === "join") {
      me.name = cleanName(msg.name);
      me.ready = !!msg.ready;
      me.joined = true;
      ws.serializeAttachment(me);
      this.broadcastRoster();
    } else if (msg.t === "ready") {
      me.ready = !!msg.ready;
      ws.serializeAttachment(me);
      this.broadcastRoster();
    } else if (msg.t === "start") {
      this.tryStart(ws, me, msg.course);
    } else if (msg.t === "pos") {
      // relay this racer's progress to everyone else
      this.broadcastExcept(ws, {
        t: "pos",
        id: me.id,
        x: msg.x,
        alive: !!msg.alive,
      });
    } else if (msg.t === "finished") {
      if (!this.finishers.some((f) => f.id === me.id)) {
        this.finishers.push({
          id: me.id,
          name: me.name,
          elapsed: Number(msg.elapsed) || 0,
        });
        // rank by race time — fair regardless of who has the faster connection
        this.finishers.sort((a, b) => a.elapsed - b.elapsed);
        this.broadcast({
          t: "standings",
          list: this.finishers.map((f, i) => ({
            id: f.id,
            name: f.name,
            place: i + 1,
          })),
        });
      }
    } else if (msg.t === "reset") {
      this.finishers = [];
      this.broadcast({ t: "toLobby" });
    }
  }

  /** Host-only: start the race with the host-authored course once all ready. */
  tryStart(ws, me, course) {
    if (!me.host) return;
    const joined = this.roster();
    if (joined.length < 1) return;
    if (!joined.every((p) => p.ready)) {
      try {
        ws.send(
          JSON.stringify({ t: "cantStart", reason: "not everyone is ready" })
        );
      } catch {
        // ignore
      }
      return;
    }
    this.finishers = [];
    // receipt-relative countdown carrying the shared course: the broadcast
    // reaches everyone within a few ms, so local 3-2-1 timers stay in sync
    // without trusting device clocks, and everyone races the same track
    this.broadcast({ t: "countdown", ms: 3600, course: course ?? null });
  }

  broadcast(obj) {
    this.broadcastExcept(null, obj);
  }

  broadcastExcept(exclude, obj) {
    const s = JSON.stringify(obj);
    for (const w of this.ctx.getWebSockets()) {
      if (w === exclude) continue;
      try {
        w.send(s);
      } catch {
        // socket gone
      }
    }
  }

  async webSocketClose(ws) {
    this.reassignHost(ws);
    this.broadcastRoster(ws);
  }

  async webSocketError(ws) {
    this.broadcastRoster(ws);
  }

  /** Promote the oldest remaining player to host if the one leaving was it. */
  reassignHost(leaving) {
    const me = this.meta(leaving);
    if (!me?.host) return;
    const others = this.ctx
      .getWebSockets()
      .filter((w) => w !== leaving)
      .map((w) => ({ w, m: this.meta(w) }))
      .filter((x) => x.m)
      .sort((a, b) => (a.m.seq ?? 0) - (b.m.seq ?? 0));
    if (others.length) {
      const next = others[0];
      next.m.host = true;
      next.w.serializeAttachment(next.m);
    }
  }

  roster(exclude) {
    return this.ctx
      .getWebSockets()
      .filter((w) => w !== exclude)
      .map((w) => this.meta(w))
      .filter((m) => m && m.joined)
      .map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        ready: m.ready,
        host: m.host,
      }));
  }

  broadcastRoster(exclude) {
    const players = this.roster(exclude);
    for (const w of this.ctx.getWebSockets()) {
      if (w === exclude) continue;
      const me = this.meta(w);
      try {
        w.send(JSON.stringify({ t: "roster", you: me?.id, players }));
      } catch {
        // socket already gone — ignore
      }
    }
  }
}
