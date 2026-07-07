import Phaser from "phaser";

/**
 * All game art is generated at boot time from pixel maps — no image assets needed.
 * '.' or ' ' = transparent, every other char looks up a color in PAL.
 */
const PAL: Record<string, number> = {
  b: 0x7a4a21, // kiwi body brown
  d: 0x5b3413, // dark feather streaks
  B: 0xe9c58a, // beak / bone
  l: 0xd98e3f, // kiwi legs
  w: 0xffffff, // white
  k: 0x141414, // black
  g: 0x9193a3, // possum grey
  G: 0x6b6d7c, // possum dark grey
  p: 0xf0a3b0, // pink (noses, ears, rat tail)
  r: 0x8f7d70, // rat fur
  H: 0x4c3a26, // hawk dark brown
  h: 0x8a6a42, // hawk light brown
  C: 0xf2e6c9, // cream chest
  y: 0xf2c14e, // yellow (beak, sparkle)
  f: 0x8a6a3e, // kiwifruit skin
  F: 0x9fe066, // kiwifruit flesh
  s: 0x8494a5, // rock light
  S: 0x5d6b7a, // rock dark
  t: 0xd9c9a8, // dust
  N: 0x4c9e4f, // fern green
};

export function pixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  scale = 3
) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const w = Math.max(...rows.map((r) => r.length));
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === "." || c === " ") continue;
      const color = PAL[c];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  g.generateTexture(key, w * scale, rows.length * scale);
  g.destroy();
}

// ---------------------------------------------------------------- kiwi bird
// Round brown body, long pale beak, tiny orange legs. Faces right.
const KIWI_BODY = [
  "...............bbbbb.......",
  "..............bbbbkwb......",
  "..............bbbbbbb......",
  "..............bbbbbBBBBBBB.",
  ".....bbbbbbbbbbbbbbb.......",
  "...bbbbbbbbbbbbbbbbb.......",
  "..bbbbbbdbbbbbbbbbbb.......",
  ".bbbbbdbbbdbbbbbbbb........",
  ".bbbbbbbdbbbbdbbbbb........",
  ".bbbdbbbbbdbbbbbbb.........",
  "..bbbbbbdbbbbbbbbb.........",
  "..bbbbbbbbbbbbbbb..........",
  "...bbbbbbbbbbbbb...........",
  ".....bbbbbbbbbb............",
];

const KIWI_LEGS_A = [
  "......ll.......ll..........",
  ".....ll.........ll.........",
  "....lll.........lll........",
];

const KIWI_LEGS_B = [
  ".........ll...ll...........",
  ".........ll...ll...........",
  "........lll...lll..........",
];

const KIWI_LEGS_JUMP = [
  ".......ll......ll..........",
  "........ll.....ll..........",
  "...........................",
];

const KIWI_DUCK = [
  "..................bbbb.......",
  ".....bbbbbbbbbbbbbbbbkwb.....",
  "..bbbbbbbdbbbbbbbbbbbbbBBBBBB",
  ".bbbbbdbbbbdbbbbbbbbbbb......",
  ".bbbbbbbbdbbbbbbbbbbbb.......",
  "..bbbbdbbbbbdbbbbbbbb........",
  "...bbbbbbbbbbbbbbbb..........",
  ".....bbbbbbbbbbbb............",
  ".....ll.......ll.............",
  "....lll.......lll............",
];

// ------------------------------------------------------------------ possum
// Hunched grey body, pink nose, curled tail. Faces left (towards the kiwi).
const POSSUM_TOP = [
  "............................",
  ".......................GGG..",
  "....pg................G...G.",
  "...gggg..ggggggg......G...G.",
  "..gggggggggggggggg.....GGG..",
  ".ggkgggggggggggggggg.GG.....",
  "pgggggggggggggggggggGG......",
  ".gGgggggggggggggggggg.......",
  "..ggggggggggggggggggg.......",
  "...ggggggggggggggggg........",
  "....ggggggggggggggg.........",
];

const POSSUM_LEGS_A = [
  "....gg...gg....gg...........",
  "....GG...GG....GG...........",
];

const POSSUM_LEGS_B = [
  "...gg...gg....gg............",
  "...GG...GG....GG............",
];

// -------------------------------------------------------------------- rat
const RAT_A = [
  "...rr..............",
  "..rrrr..rrrrr......",
  ".rrrrrrrrrrrrr.....",
  "rkrrrrrrrrrrrrr....",
  "prrrrrrrrrrrrrpppp.",
  ".rrrrrrrrrrrrr.....",
  "..rr...rr...rr.....",
];

const RAT_B = [
  "...rr..............",
  "..rrrr..rrrrr......",
  ".rrrrrrrrrrrrr.....",
  "rkrrrrrrrrrrrrr....",
  "prrrrrrrrrrrrrpppp.",
  ".rrrrrrrrrrrrr.....",
  ".rr...rr...rr......",
];

// ------------------------------------------------- kārearea (NZ falcon)
// Both frames share body rows y5-y8 so the texture swap doesn't jitter.
const HAWK_A = [
  ".........HHH..............",
  "........HHHH..............",
  ".......HHHH...............",
  "......HHHH................",
  "..hh.HHHH.................",
  ".hkhhhhhhhhhhhhhHHHHHH....",
  "yhhhhhhhhhhhhhhhHHHHHHH...",
  ".hCCCCCChhhhhhhhHHHHH.....",
  "..CCCCCChhhhhh............",
  "...CCCC...................",
  "..........................",
  "..........................",
  "..........................",
];

const HAWK_B = [
  "..........................",
  "..........................",
  "..........................",
  "..........................",
  "..hh......................",
  ".hkhhhhhhhhhhhhhHHHHHH....",
  "yhhhhhhhhhhhhhhhHHHHHHH...",
  ".hCCCCCChhhhhhhhHHHHH.....",
  "..CCCCCChhhhhhHH..........",
  "......HHHH................",
  ".......HHHH...............",
  "........HHHH..............",
  ".........HHH..............",
];

// -------------------------------------------------------------- pickups
const FRUIT = [
  "...ffffff...",
  "..fFFFFFFf..",
  ".fFFkFFkFFf.",
  "fFFFFwwFFFFf",
  "fFkFwwwwFkFf",
  "fFFFwwwwFFFf",
  "fFkFwwwwFkFf",
  "fFFFFwwFFFFf",
  ".fFFkFFkFFf.",
  "..fFFFFFFf..",
  "...ffffff...",
];

// --------------------------------------------------------------- rocks
const ROCK_1 = [
  "....ssss....",
  "..ssssssss..",
  ".sssSssssss.",
  "ssssssSsssss",
  "sssSssssssSs",
  "SssssssSssss",
  "SSssssssssSS",
  "SSSSSSSSSSSS",
];

const ROCK_2 = [
  "......ssss......",
  "....ssssssss....",
  "...ssssSssssss..",
  "..ssSssssssssss.",
  ".sssssssSsssssss",
  ".ssSsssssssssSss",
  "SssssssSssssssss",
  "SsssSsssssssSsss",
  "SSssssssssssssSS",
  "SSSssssssssssSSS",
  "SSSSSSSSSSSSSSSS",
];

// ------------------------------------------------------------ particles
const FEATHER = [".b", "bb", "bB", ".B"];
const DUST = [".tt.", "tttt", ".tt."];
const SPARK = ["..y..", ".yyy.", "yywyy", ".yyy.", "..y.."];

export function makeSprites(scene: Phaser.Scene) {
  pixelTexture(scene, "kiwi_run1", [...KIWI_BODY, ...KIWI_LEGS_A]);
  pixelTexture(scene, "kiwi_run2", [...KIWI_BODY, ...KIWI_LEGS_B]);
  pixelTexture(scene, "kiwi_jump", [...KIWI_BODY, ...KIWI_LEGS_JUMP]);
  pixelTexture(scene, "kiwi_duck", KIWI_DUCK);
  pixelTexture(scene, "possum1", [...POSSUM_TOP, ...POSSUM_LEGS_A]);
  pixelTexture(scene, "possum2", [...POSSUM_TOP, ...POSSUM_LEGS_B]);
  pixelTexture(scene, "rat1", RAT_A);
  pixelTexture(scene, "rat2", RAT_B);
  pixelTexture(scene, "hawk1", HAWK_A);
  pixelTexture(scene, "hawk2", HAWK_B);
  pixelTexture(scene, "fruit", FRUIT, 2);
  pixelTexture(scene, "rock1", ROCK_1);
  pixelTexture(scene, "rock2", ROCK_2);
  pixelTexture(scene, "feather", FEATHER, 2);
  pixelTexture(scene, "dust", DUST, 2);
  pixelTexture(scene, "spark", SPARK, 2);
}

// ---------------------------------------------------------- backgrounds

/** Deterministic pseudo-random in [0,1) so textures are stable per boot. */
function rnd(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export function makeBackgrounds(scene: Phaser.Scene, w: number, h: number) {
  const make = () => scene.make.graphics({ x: 0, y: 0 }, false);

  // Sky gradient — drawn as horizontal bands (fillGradientStyle is unreliable
  // when rendered into a generated texture)
  if (!scene.textures.exists("sky")) {
    const g = make();
    const top = Phaser.Display.Color.ValueToColor(0x5aaee4);
    const bottom = Phaser.Display.Color.ValueToColor(0xd8f0f7);
    const bands = 24;
    const bandH = Math.ceil(h / bands);
    for (let i = 0; i < bands; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        top,
        bottom,
        bands - 1,
        i
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, i * bandH, w, bandH + 1);
    }
    g.generateTexture("sky", w, h);
    g.destroy();
  }

  // Sun
  if (!scene.textures.exists("sun")) {
    const g = make();
    g.fillStyle(0xffe9a8, 0.35);
    g.fillCircle(44, 44, 44);
    g.fillStyle(0xffe285, 1);
    g.fillCircle(44, 44, 30);
    g.generateTexture("sun", 88, 88);
    g.destroy();
  }

  // Clouds strip (tiles horizontally: blobs kept away from the edges)
  if (!scene.textures.exists("clouds")) {
    const g = make();
    g.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 5; i++) {
      const cx = 70 + rnd(i * 3 + 1) * (w - 220);
      const cy = 18 + rnd(i * 7 + 2) * 70;
      const r = 16 + rnd(i * 11 + 3) * 14;
      g.fillEllipse(cx, cy, r * 3.2, r * 1.3);
      g.fillEllipse(cx - r, cy + 5, r * 1.8, r);
      g.fillEllipse(cx + r * 1.1, cy + 4, r * 2, r);
    }
    g.generateTexture("clouds", w, 120);
    g.destroy();
  }

  // Far layer: hazy snow-capped mountains (fully inside → tiles seamlessly)
  if (!scene.textures.exists("hills_far")) {
    const g = make();
    const H = 170;
    for (let i = 0; i < 4; i++) {
      const mw = 130 + rnd(i * 13 + 4) * 130;
      const mh = 90 + rnd(i * 17 + 6) * 70;
      // keep the whole triangle inside the texture so tiling has no seams
      const cx = mw + rnd(i * 5 + 9) * (w - 2 * mw);
      g.fillStyle(0x93aec4, 1);
      g.fillTriangle(cx - mw, H, cx + mw, H, cx, H - mh);
      // snow cap
      g.fillStyle(0xf2f7fa, 1);
      const capW = mw * 0.28;
      g.fillTriangle(
        cx - capW,
        H - mh + mh * 0.28,
        cx + capW,
        H - mh + mh * 0.28,
        cx,
        H - mh
      );
    }
    g.generateTexture("hills_far", w, H);
    g.destroy();
  }

  // Near layer: rolling green hills (sine waves with whole cycles → seamless)
  if (!scene.textures.exists("hills_near")) {
    const g = make();
    const H = 120;
    g.fillStyle(0x74b06a, 1);
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= w; x += 6) {
      const y =
        58 +
        Math.sin((x / w) * Math.PI * 2 * 3) * 20 +
        Math.sin((x / w) * Math.PI * 2 * 7 + 2) * 10;
      g.lineTo(x, y);
    }
    g.lineTo(w, H);
    g.closePath();
    g.fillPath();
    // scattered darker fern silhouettes on the hills
    g.fillStyle(0x2e6b34, 0.9);
    for (let i = 0; i < 14; i++) {
      const fx = 20 + rnd(i * 23 + 5) * (w - 40);
      const fy = 66 + rnd(i * 29 + 8) * 40;
      const fh = 8 + rnd(i * 31 + 2) * 10;
      g.fillTriangle(fx - 5, fy, fx + 5, fy, fx, fy - fh);
      g.fillTriangle(fx - 8, fy, fx - 1, fy, fx - 5, fy - fh * 0.7);
      g.fillTriangle(fx + 1, fy, fx + 8, fy, fx + 5, fy - fh * 0.7);
    }
    g.generateTexture("hills_near", w, H);
    g.destroy();
  }

  // Ground strip: 28px of transparent overhang with grass tufts, then grass + dirt
  if (!scene.textures.exists("ground")) {
    const g = make();
    const OVER = 28;
    const H = OVER + 92;
    // dirt
    g.fillStyle(0x8a6a48, 1);
    g.fillRect(0, OVER + 16, w, H - OVER - 16);
    // dirt speckles
    g.fillStyle(0x74563a, 1);
    for (let i = 0; i < 90; i++) {
      const sx = Math.floor(rnd(i * 7 + 13) * (w - 6));
      const sy = OVER + 22 + Math.floor(rnd(i * 11 + 17) * (H - OVER - 30));
      g.fillRect(sx, sy, 3 + Math.floor(rnd(i) * 3), 3);
    }
    // grass band
    g.fillStyle(0x4e9a4a, 1);
    g.fillRect(0, OVER, w, 18);
    g.fillStyle(0x3e8a3c, 1);
    for (let x = 0; x < w; x += 12) {
      g.fillRect(x, OVER + 12, 6, 6);
    }
    // grass tufts poking above the ground line
    for (let i = 0; i < 26; i++) {
      const tx = 10 + Math.floor(rnd(i * 37 + 3) * (w - 30));
      const th = 6 + Math.floor(rnd(i * 41 + 7) * 12);
      g.fillStyle(0x4c9e4f, 1);
      g.fillTriangle(tx - 4, OVER + 2, tx + 4, OVER + 2, tx, OVER + 2 - th);
      g.fillTriangle(tx, OVER + 2, tx + 8, OVER + 2, tx + 5, OVER + 4 - th);
      if (rnd(i * 53) > 0.7) {
        g.fillStyle(0xffe285, 1); // tiny flower
        g.fillRect(tx + 4, OVER - th + 2, 3, 3);
      }
    }
    g.generateTexture("ground", w, H);
    g.destroy();
  }
}
