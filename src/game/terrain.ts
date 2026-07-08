import Phaser from "phaser";

/**
 * Procedural terrain heightmap for the runner.
 *
 * Heights are offsets in screen pixels relative to the baseline ground line:
 * negative = hill (up on screen), positive = valley (down on screen).
 * Segments blend from h0 to h1 with a cosine ease, so crests and dips are
 * smooth and have well-defined slopes.
 */
export type Seg = { x0: number; len: number; h0: number; h1: number };

const H_MIN = -85; // highest hill
const H_MAX = 42; // deepest valley — keep a fat dirt strip visible below

/** rng-driven segment generation, shared by solo (incremental) and race host. */
function nextSegment(
  segs: Seg[],
  endX: number,
  endH: number,
  rng: () => number
): { endX: number; endH: number } {
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const push = (len: number, h1: number) => {
    segs.push({ x0: endX, len, h0: endH, h1 });
    endX += len;
    endH = h1;
  };
  const h0 = endH;
  const wFlat = 2.4;
  const wUp = h0 < -50 ? 0.4 : 2.2;
  const wDown = h0 > 25 ? 0.5 : 2.6;
  const wBump = 1.6;
  let r = rng() * (wFlat + wUp + wDown + wBump);
  if ((r -= wFlat) <= 0) push(ri(350, 800), h0);
  else if ((r -= wUp) <= 0) push(ri(280, 460), Math.max(H_MIN, h0 - ri(45, 95)));
  else if ((r -= wDown) <= 0) push(ri(340, 700), Math.min(H_MAX, h0 + ri(55, 125)));
  else {
    const top = Math.max(H_MIN, h0 - ri(26, 42));
    push(ri(95, 140), top);
    push(ri(95, 140), h0);
  }
  return { endX, endH };
}

/** Generate a full fixed terrain up front (race host authors this). */
export function generateTerrain(lengthPx: number, rng: () => number): Seg[] {
  const segs: Seg[] = [{ x0: -600, len: 1500, h0: 0, h1: 0 }];
  let endX = 900;
  let endH = 0;
  while (endX < lengthPx + 1500) {
    ({ endX, endH } = nextSegment(segs, endX, endH, rng));
  }
  return segs;
}

export class Terrain {
  private segs: Seg[] = [];
  private endX = 0;
  private endH = 0;
  private loaded = false;

  reset(startX: number) {
    this.segs = [{ x0: startX - 600, len: 1500, h0: 0, h1: 0 }];
    this.endX = startX + 900;
    this.endH = 0;
    this.loaded = false;
  }

  /** Race: adopt a fixed, shared terrain (no further generation). */
  load(segs: Seg[]) {
    this.segs = segs.slice();
    this.loaded = true;
  }

  /** Generate segments until the terrain covers worldX (solo only). */
  ensure(worldX: number) {
    if (this.loaded) return;
    while (this.endX < worldX) this.addSegment();
  }

  /** Drop segments that scrolled far off screen. */
  prune(worldX: number) {
    while (
      this.segs.length > 1 &&
      this.segs[0].x0 + this.segs[0].len < worldX
    ) {
      this.segs.shift();
    }
  }

  private addSegment() {
    ({ endX: this.endX, endH: this.endH } = nextSegment(
      this.segs,
      this.endX,
      this.endH,
      Math.random
    ));
  }

  heightAt(worldX: number): number {
    const segs = this.segs;
    let s = segs[0];
    for (let i = 0; i < segs.length; i++) {
      s = segs[i];
      if (worldX < s.x0 + s.len) break;
    }
    const t = Phaser.Math.Clamp((worldX - s.x0) / s.len, 0, 1);
    return s.h0 + ((s.h1 - s.h0) * (1 - Math.cos(Math.PI * t))) / 2;
  }

  /** Screen-space slope: positive = ground descends ahead (downhill). */
  slopeAt(worldX: number): number {
    return (this.heightAt(worldX + 10) - this.heightAt(worldX - 10)) / 20;
  }
}
