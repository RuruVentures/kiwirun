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
    this.mode = "finish"; // "finish" (race to the line) or "last" (last kiwi)
    this.finishers = []; // {id,name,elapsed} in finish order (finish mode)
    this.dead = []; // {id,name} in the order they were knocked out (last mode)
    this.racers = []; // {id,name} snapshot taken when the race starts
    this.stats = {}; // id -> {fruit,hits}, for end-of-race awards
    this.racing = false;
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
    } else if (msg.t === "setMode") {
      if (me.host && (msg.mode === "finish" || msg.mode === "last")) {
        this.mode = msg.mode;
        this.broadcastRoster();
      }
    } else if (msg.t === "start") {
      this.tryStart(ws, me, msg.course);
    } else if (msg.t === "dead") {
      this.recordDead(me.id, me.name, msg.fruit, msg.hits);
    } else if (msg.t === "pos") {
      // relay this racer's progress to everyone else
      this.broadcastExcept(ws, {
        t: "pos",
        id: me.id,
        x: msg.x,
        alive: !!msg.alive,
      });
    } else if (msg.t === "finished") {
      this.recordFinish(me.id, me.name, msg.elapsed, msg.fruit, msg.hits);
    } else if (msg.t === "reset") {
      this.finishers = [];
      this.dead = [];
      this.stats = {};
      this.racing = false;
      // clear everyone's ready flag for a fresh rematch lobby
      for (const w of this.ctx.getWebSockets()) {
        const m = this.meta(w);
        if (m) {
          m.ready = false;
          w.serializeAttachment(m);
        }
      }
      this.broadcast({ t: "toLobby" });
      this.broadcastRoster();
    }
  }

  saveStats(id, fruit, hits) {
    this.stats[id] = { fruit: Number(fruit) || 0, hits: Number(hits) || 0 };
  }

  /** Finish-line mode: a racer crossed the line (ranked by race time). */
  recordFinish(id, name, elapsed, fruit, hits) {
    if (this.mode !== "finish" || !this.racing) return;
    if (this.finishers.some((f) => f.id === id)) return;
    this.saveStats(id, fruit, hits);
    this.finishers.push({ id, name, elapsed: Number(elapsed) || 0 });
    this.finishers.sort((a, b) => a.elapsed - b.elapsed);
    const over = this.finishers.length >= this.racers.length;
    const list = this.finishers.map((f, i) => ({
      id: f.id,
      name: f.name,
      place: i + 1,
    }));
    this.emitStandings(list, over);
  }

  /** Last-kiwi mode: a racer was knocked out. Last one standing wins. */
  recordDead(id, name, fruit, hits) {
    if (this.mode !== "last" || !this.racing) return;
    if (this.dead.some((d) => d.id === id)) return;
    this.saveStats(id, fruit, hits);
    this.dead.push({ id, name });

    const n = this.racers.length;
    // earlier deaths place worse: first out = last place
    const list = this.dead.map((d, i) => ({ id: d.id, name: d.name, place: n - i }));
    const alive = this.racers.filter((r) => !this.dead.some((d) => d.id === r.id));
    const over = alive.length <= 1;
    if (over && alive.length === 1) {
      list.unshift({ id: alive[0].id, name: alive[0].name, place: 1 });
    }
    this.emitStandings(list, over);
  }

  /** Broadcast standings; on the final one, hand out fun awards to everyone. */
  emitStandings(list, over) {
    if (over) {
      this.racing = false;
      const withAward = list.map((s) => ({ ...s, award: "" }));
      const stat = (id) => this.stats[id] ?? { fruit: 0, hits: 0 };
      const topBy = (key) => {
        let best = null;
        let bestId = null;
        for (const s of withAward) {
          const v = stat(s.id)[key];
          if (v > 0 && (best === null || v > best)) {
            best = v;
            bestId = s.id;
          }
        }
        return bestId;
      };
      const fruitId = topBy("fruit");
      const hitsId = topBy("hits");
      for (const s of withAward) {
        if (s.place === 1) s.award = "🏆 Cross Country Champion";
        else if (s.id === fruitId) s.award = "🥝 Kiwifruit Muncher";
        else if (s.id === hitsId) s.award = "🛡️ Bravest Kiwi";
        else s.award = "⭐ Great Survival Instincts";
      }
      this.broadcast({ t: "standings", over: true, list: withAward });
    } else {
      this.broadcast({ t: "standings", over: false, list });
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
    this.dead = [];
    this.stats = {};
    this.racers = joined.map((p) => ({ id: p.id, name: p.name }));
    this.racing = true;
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
    this.handleLeave(ws);
  }

  async webSocketError(ws) {
    this.handleLeave(ws);
  }

  /**
   * A socket dropped. Reassign host and update the roster — and if a race is
   * in progress, count the leaver as done (DNF) so the finish/last-kiwi end
   * condition can still complete for everyone else.
   */
  handleLeave(ws) {
    const me = this.meta(ws);
    if (me && this.racing && this.racers.some((r) => r.id === me.id)) {
      if (this.mode === "finish") {
        // DNF sorts last: a huge race time
        this.recordFinish(me.id, me.name, 9e9, 0, 0);
      } else {
        this.recordDead(me.id, me.name, 0, 0);
      }
    }
    this.reassignHost(ws);
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
        w.send(
          JSON.stringify({ t: "roster", you: me?.id, players, mode: this.mode })
        );
      } catch {
        // socket already gone — ignore
      }
    }
  }
}
