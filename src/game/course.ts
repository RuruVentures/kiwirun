/**
 * Course generation as data.
 *
 * The whole track — which pest sits at which metre, where the fruit floats —
 * is produced from a random source into plain arrays, in world-distance
 * space (pixels along the track). In solo play the source is Math.random and
 * the stream is extended forever; in Cross Country the server runs the exact
 * same generator once and broadcasts the arrays, so every kiwi races an
 * identical course.
 *
 * Terrain (the height map) is generated separately in terrain.ts.
 */

export type PestKind = "rat" | "possum" | "rock1" | "rock2" | "hawk";
export type CourseObstacle = { x: number; kind: PestKind };
export type CourseFruit = { x: number; hover: number };

/** Any function returning a float in [0, 1) — Math.random or a seeded PRNG. */
export type Rng = () => number;

const ri = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

/**
 * A weighted pest pattern for the given distance milestone (metres).
 * Mirrors the classic spawn pools; returns obstacle offsets from a base x.
 */
export function pickPattern(m: number, rng: Rng): { kind: PestKind; dx: number }[] {
  const pool: { w: number; entries: [PestKind, number][] }[] = [
    { w: 3, entries: [["rat", 0]] },
    { w: 2.4, entries: [["rock1", 0]] },
  ];
  if (m > 120)
    pool.push(
      { w: 3, entries: [["possum", 0]] },
      { w: 2, entries: [["rat", 0], ["rat", 74]] }
    );
  if (m > 300)
    pool.push(
      { w: 2.5, entries: [["hawk", 0]] },
      { w: 1.6, entries: [["rock2", 0]] }
    );
  if (m > 600)
    pool.push(
      { w: 1.5, entries: [["rat", 0], ["rat", 70], ["rat", 140]] },
      { w: 1.3, entries: [["possum", 0], ["hawk", 320]] },
      { w: 1.2, entries: [["rock1", 0], ["rock2", 120]] }
    );
  if (m > 1200)
    pool.push(
      { w: 2, entries: [["hawk", 0], ["hawk", 300]] },
      { w: 2, entries: [["rock1", 0], ["possum", 170]] }
    );
  if (m > 2000)
    pool.push(
      { w: 2.2, entries: [["possum", 0], ["rat", 120], ["possum", 235]] },
      { w: 2, entries: [["hawk", 0], ["rock2", 70]] }
    );

  const total = pool.reduce((s, p) => s + p.w, 0);
  let pick = rng() * total;
  for (const p of pool) {
    pick -= p.w;
    if (pick <= 0) return p.entries.map(([kind, dx]) => ({ kind, dx }));
  }
  return pool[0].entries.map(([kind, dx]) => ({ kind, dx }));
}

/**
 * Distance between pest patterns (px). The old timer used
 * `delay = gapPx / speed`, so the world spacing was always ~gapPx — this
 * reproduces that spacing directly as a function of distance.
 */
function pestGap(m: number, rng: Rng): number {
  let gap = Math.min(611, 380 + (m / 2380) * 231) + ri(rng, -70, 190);
  if (m > 1500) gap *= 0.88; // tighter deep into a run
  return Math.max(300, gap);
}

function fruitPattern(x0: number, rng: Rng): CourseFruit[] {
  const kind = ri(rng, 0, 2);
  const out: CourseFruit[] = [];
  if (kind === 0) {
    for (let i = 0; i < 4; i++) out.push({ x: x0 + i * 42, hover: 44 });
  } else if (kind === 1) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      out.push({ x: x0 + i * 46, hover: 44 + Math.sin(t * Math.PI) * 110 });
    }
  } else {
    for (let i = 0; i < 3; i++) out.push({ x: x0 + i * 44, hover: 150 });
  }
  return out;
}

/**
 * Incrementally-generated course. Call `generateUpTo(worldX)` each frame to
 * extend coverage; read the growing `obstacles` / `fruit` arrays (sorted by
 * world x). For a fixed-length race, generate once up to the finish line.
 */
export class CourseStream {
  readonly obstacles: CourseObstacle[] = [];
  readonly fruit: CourseFruit[] = [];
  private rng: Rng;
  private pestX: number;
  private fruitX: number;

  constructor(rng: Rng, startX = 250) {
    this.rng = rng;
    // first pest/fruit sit far enough ahead to clear the start grace period
    this.pestX = startX + 900;
    this.fruitX = startX + 1400;
  }

  generateUpTo(worldX: number) {
    while (this.pestX < worldX) {
      const m = Math.floor(this.pestX / 10);
      for (const e of pickPattern(m, this.rng)) {
        this.obstacles.push({ x: this.pestX + e.dx, kind: e.kind });
      }
      this.pestX += pestGap(m, this.rng);
    }
    while (this.fruitX < worldX) {
      for (const f of fruitPattern(this.fruitX, this.rng)) this.fruit.push(f);
      this.fruitX += ri(this.rng, 900, 1800);
    }
  }
}
