import Phaser from "phaser";

/**
 * Procedural terrain heightmap for the runner.
 *
 * Heights are offsets in screen pixels relative to the baseline ground line:
 * negative = hill (up on screen), positive = valley (down on screen).
 * Segments blend from h0 to h1 with a cosine ease, so crests and dips are
 * smooth and have well-defined slopes.
 */
type Seg = { x0: number; len: number; h0: number; h1: number };

const H_MIN = -85; // highest hill
const H_MAX = 58; // deepest valley

export class Terrain {
  private segs: Seg[] = [];
  private endX = 0;
  private endH = 0;

  reset(startX: number) {
    this.segs = [{ x0: startX - 600, len: 1500, h0: 0, h1: 0 }];
    this.endX = startX + 900;
    this.endH = 0;
  }

  /** Generate segments until the terrain covers worldX. */
  ensure(worldX: number) {
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

  private push(len: number, h1: number) {
    this.segs.push({ x0: this.endX, len, h0: this.endH, h1 });
    this.endX += len;
    this.endH = h1;
  }

  private addSegment() {
    const h0 = this.endH;
    // weights shift so the terrain steers back toward the middle band
    const wFlat = 2.4;
    const wUp = h0 < -50 ? 0.4 : 2.2; // don't climb forever
    const wDown = h0 > 25 ? 0.5 : 2.6; // don't dig forever
    const wBump = 1.6; // small ramp hill (the "schanze")
    const total = wFlat + wUp + wDown + wBump;
    let r = Math.random() * total;

    if ((r -= wFlat) <= 0) {
      this.push(Phaser.Math.Between(350, 800), h0);
    } else if ((r -= wUp) <= 0) {
      const h1 = Math.max(H_MIN, h0 - Phaser.Math.Between(45, 95));
      this.push(Phaser.Math.Between(280, 460), h1);
    } else if ((r -= wDown) <= 0) {
      const h1 = Math.min(H_MAX, h0 + Phaser.Math.Between(55, 125));
      this.push(Phaser.Math.Between(340, 700), h1);
    } else {
      // bump: quick up then back down — slide into it to launch off the crest
      const rise = Phaser.Math.Between(26, 42);
      const top = Math.max(H_MIN, h0 - rise);
      this.push(Phaser.Math.Between(95, 140), top);
      this.push(Phaser.Math.Between(95, 140), h0);
    }
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
