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
  r: 0x9a7a5a, // rat fur (warm brown — clearly an animal, not a rock)
  H: 0x4c3a26, // hawk dark brown
  h: 0x8a6a42, // hawk light brown
  C: 0xf2e6c9, // cream chest
  y: 0xf2c14e, // yellow (beak, sparkle)
  f: 0x8a6a3e, // kiwifruit skin
  F: 0x9fe066, // kiwifruit flesh
  s: 0x6d7f92, // rock light (cool slate)
  S: 0x3e4a58, // rock dark
  Q: 0xaebfd0, // rock quartz highlight
  t: 0xd9c9a8, // dust
  N: 0x4c9e4f, // fern green
  n: 0x2e6b34, // fern green dark
  v: 0x74923d, // kea olive
  V: 0x51702c, // kea dark
  o: 0xe07830, // kea orange underwing
  u: 0x9a8a5a, // ranger khaki
  U: 0x3f5a35, // ranger DOC green
  R: 0xd23f2f, // quad / biplane red
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
// Jagged slate with a mossy cap — reads as terrain, never as an animal.
const ROCK_1 = [
  "....NN.n....",
  "..NNsQNNn...",
  ".NsQQss sN..",
  ".ssQssSsss..",
  "sssssSSssss.",
  "SsssSssssSs.",
  "SSsssssssSS.",
  "SSSSSSSSSSSS",
];

const ROCK_2 = [
  ".....Nn...NN....",
  "...NNsQN.NsnN...",
  "..NsQQssNssssN..",
  "..ssQQsssSsssss.",
  ".sssQssssssSsss.",
  ".ssSssssQQsssss.",
  "sssssSssQssssss.",
  "SsssSsssssssSsss",
  "SSsssssssssssSS.",
  "SSSssssssssssSSS",
  "SSSSSSSSSSSSSSSS",
];

// ------------------------------------------------------- kea (friendly!)
// Faces left like the hawk; flipped at runtime when it darts right.
// Body rows 5-8 are identical in both frames.
const KEA_A = [
  "........vvv.........",
  ".......vvvv.........",
  "......vvvv..........",
  ".....vvvv...........",
  "..vv.vvv............",
  ".vkvvvvvvvvvvvVV....",
  "SvvvvvvvvvvvvvvVVV..",
  ".vooooovvvvvvVVV....",
  "..ooooovvvv.........",
  "....................",
];

const KEA_B = [
  "....................",
  "....................",
  "....................",
  "....................",
  "..vv................",
  ".vkvvvvvvvvvvvVV....",
  "SvvvvvvvvvvvvvvVVV..",
  ".vooooovvvvvvVVV....",
  "..ooooovvvvv........",
  ".....vvvv...........",
];

// ------------------------------------------------- DOC ranger (friendly!)
// Real NZ predator control: the ranger carries a rifle and shoots the
// pests. Frame A: aiming. Frame B: recoil + muzzle flash.
const RANGER_A = [
  "...UUUUU........",
  "..UUUUUUU.......",
  "...BBBB.........",
  "...BkBB.........",
  "..uuuuuu........",
  ".uuuuuuuBB......",
  ".uuuukkkkkkkkkk.",
  "..uuuuHH........",
  "...UUUU.........",
  "...U..U.........",
  "..HH..HH........",
];

const RANGER_B = [
  "...UUUUU........",
  "..UUUUUUU.......",
  "...BBBB.........",
  "...BkBB.........",
  "..uuuuuu........",
  ".uuuuuuuBB......",
  ".uuukkkkkkkkkkyy",
  "..uuuuHH......y.",
  "...UUUU.........",
  "....UU..........",
  "...HH.HH........",
];

// ---------------------------------------------- quad bike (ultra buddy!)
// Ranger-style driver on a chunky red quad, facing the incoming pests.
const QUAD_A = [
  "......UUUU..........",
  "......UUUUU.........",
  ".......BBB..........",
  "......uuuuu.........",
  ".....uuuuuuu........",
  "....RRRRRRRRRR......",
  "...RRRRRRRRRRRR.....",
  "..RRRRRRRRRRRRRR....",
  ".kkk..RRRR...kkk....",
  "kkkkk.RRRR..kkkkk...",
  "kSkkk.......kSkkk...",
  "kkkkk.......kkkkk...",
  ".kkk.........kkk....",
];

const QUAD_B = [
  "......UUUU..........",
  "......UUUUU.........",
  ".......BBB..........",
  "......uuuuu.........",
  ".....uuuuuuu........",
  "....RRRRRRRRRR......",
  "...RRRRRRRRRRRR.....",
  "..RRRRRRRRRRRRRR....",
  ".kkk..RRRR...kkk....",
  "kkkkk.RRRR..kkkkk...",
  "kkkSk.......kkkSk...",
  "kkkkk.......kkkkk...",
  ".kkk.........kkk....",
];

// ------------------------------- the legendary biplane (easter egg buddy)
// Kiwi with a leather aviator cap in a red double-decker, prop spinning.
const PLANE_A = [
  "....RRRRRRRRRRRRRR........",
  "......s....s....s.........",
  "..........HHHH............",
  ".........Hbbkw............",
  ".........bbbbBBBB.........",
  "..RR..yyyyyyyyyyyy....w...",
  ".RRR..yyyyyyyyyyyyy...ww..",
  "..RR..yyyyyyyyyyyy....w...",
  "......s....s....s.........",
  "....RRRRRRRRRRRRRR........",
  ".........kk..kk...........",
];

const PLANE_B = [
  "....RRRRRRRRRRRRRR........",
  "......s....s....s.........",
  "..........HHHH............",
  ".........Hbbkw............",
  ".........bbbbBBBB.........",
  "..RR..yyyyyyyyyyyy....ww..",
  ".RRR..yyyyyyyyyyyyy....w..",
  "..RR..yyyyyyyyyyyy....ww..",
  "......s....s....s.........",
  "....RRRRRRRRRRRRRR........",
  ".........kk..kk...........",
];

const BOMB = [
  "..kk..",
  ".kkkk.",
  ".kkkk.",
  ".kkkk.",
  "..kk..",
  "..tt..",
  ".t..t.",
];

// parachute for the plane exit — red/white canopy, grey lines
const CHUTE = [
  "...RwRwRwRwR...",
  ".RwRwRwRwRwRwR.",
  "RwRwRwRwRwRwRwR",
  ".s....s.....s..",
  "..s...s....s...",
  "...s..s...s....",
  "....s.s..s.....",
];

// little kiwi ghost — dark outline so it reads against the bright sky
const GHOST = [
  "...GGGGG....",
  "..GwwwwwG...",
  ".GwwwwwwwG..",
  ".GwkwwkwwG..",
  ".GwwwwwwwGG.",
  ".GwwwwBBBBG.",
  ".GwwwwwwwG..",
  ".GwwwwwwwG..",
  "..GwwwwwG...",
  ".GwGGwGGwG..",
  "..G..G..G...",
];

// ------------------------------------------------------- vegetation deco
const TREE_FERN = [
  "....N...N...N...",
  ".N..NN.NN..N.N..",
  ".NN..NNNN.NN....",
  "..NNNnNNNNN..N..",
  "....NnNNNNNN....",
  ".NNNN.HH.NNNN...",
  "......HH........",
  "......HH........",
  "......HH........",
];

const CABBAGE_TREE = [
  "..N..N..N..",
  ".NNN.N.NNN.",
  "..NnNNNnN..",
  "....NNN....",
  ".....H.....",
  ".....H.....",
  ".....H.....",
  ".....H.....",
  ".....HH....",
];

const FLAX = [
  "N....n....N",
  ".N...n...N.",
  ".NN.NnN.NN.",
  "..NnNNNnN..",
  "...NNNNN...",
];

const TOITOI = [
  "..tt...tt..",
  ".tttt.tttt.",
  "..tt...tt..",
  "...n...n...",
  "...n..n....",
  "...nn.n....",
  "....nnn....",
  "....nn.....",
];

// ------------------------------------------------------------ particles
const FEATHER = [".b", "bb", "bB", ".B"];
const DUST = [".tt.", "tttt", ".tt."];
const SPARK = ["..y..", ".yyy.", "yywyy", ".yyy.", "..y.."];

/** Comic starburst for the death animation. */
function makeBurst(scene: Phaser.Scene) {
  if (scene.textures.exists("burst")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cx = 52;
  const cy = 52;
  const star = (spikes: number, rOut: number, rIn: number, color: number) => {
    g.fillStyle(color, 1);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? rOut : rIn;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    g.fillPoints(pts, true);
  };
  star(12, 50, 24, 0xe8542f);
  star(12, 42, 20, 0xffe066);
  star(10, 26, 13, 0xffffff);
  g.generateTexture("burst", 104, 104);
  g.destroy();
}

export function makeSprites(scene: Phaser.Scene) {
  makeBurst(scene);
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
  pixelTexture(scene, "kea1", KEA_A);
  pixelTexture(scene, "kea2", KEA_B);
  pixelTexture(scene, "ranger1", RANGER_A, 4); // bigger, per kids' request
  pixelTexture(scene, "ranger2", RANGER_B, 4);
  pixelTexture(scene, "pellet", ["yyy"], 2);
  pixelTexture(scene, "quad1", QUAD_A);
  pixelTexture(scene, "quad2", QUAD_B);
  pixelTexture(scene, "plane1", PLANE_A);
  pixelTexture(scene, "plane2", PLANE_B);
  pixelTexture(scene, "bomb", BOMB, 2);
  pixelTexture(scene, "ghost", GHOST);
  pixelTexture(scene, "chute", CHUTE);
  pixelTexture(scene, "deco_treefern", TREE_FERN);
  pixelTexture(scene, "deco_cabbage", CABBAGE_TREE);
  pixelTexture(scene, "deco_flax", FLAX);
  pixelTexture(scene, "deco_toitoi", TOITOI);
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
  // Near textures are 190 tall with a solid base so valleys never show sky.
  if (!scene.textures.exists("hills_near")) {
    const g = make();
    const H = 190;
    g.fillStyle(0x74b06a, 1);
    g.fillRect(0, 96, w, H - 96);
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

  // --- bush biome: layered forest canopy (drawn 3x shifted for seamless tiling)
  if (!scene.textures.exists("far_bush")) {
    const g = make();
    const H = 170;
    const drawRow = (y: number, r: number, color: number, seed: number) => {
      g.fillStyle(color, 1);
      const step = w / 10;
      for (let pass = -1; pass <= 1; pass++) {
        for (let i = 0; i < 10; i++) {
          const cx = pass * w + i * step + rnd(i * 7 + seed) * 40;
          g.fillCircle(cx, y, r + rnd(i * 3 + seed) * 18);
        }
      }
      g.fillRect(0, y, w, H - y);
    };
    drawRow(60, 34, 0x4a7a52, 11);
    drawRow(100, 40, 0x35603d, 23);
    g.generateTexture("far_bush", w, H);
    g.destroy();
  }

  if (!scene.textures.exists("near_bush")) {
    const g = make();
    const H = 190;
    const drawRow = (y: number, r: number, color: number, seed: number) => {
      g.fillStyle(color, 1);
      const step = w / 8;
      for (let pass = -1; pass <= 1; pass++) {
        for (let i = 0; i < 8; i++) {
          const cx = pass * w + i * step + rnd(i * 13 + seed) * 50;
          g.fillCircle(cx, y, r + rnd(i * 5 + seed) * 16);
        }
      }
      g.fillRect(0, y, w, H - y);
    };
    drawRow(56, 34, 0x2c5232, 31);
    // tree-fern silhouettes poking out of the canopy
    g.fillStyle(0x1e3d24, 1);
    for (let i = 0; i < 8; i++) {
      const fx = 40 + rnd(i * 17 + 41) * (w - 80);
      const fy = 44 - rnd(i * 19 + 3) * 16;
      g.fillRect(fx - 2, fy, 4, 30);
      for (let a = 0; a < 5; a++) {
        const ang = -Math.PI * (0.15 + a * 0.175);
        g.fillTriangle(
          fx,
          fy,
          fx + Math.cos(ang) * 16,
          fy + Math.sin(ang) * 16,
          fx + Math.cos(ang + 0.28) * 15,
          fy + Math.sin(ang + 0.28) * 15
        );
      }
    }
    g.generateTexture("near_bush", w, H);
    g.destroy();
  }

  // --- coast biome: sea horizon + distant island, then dunes
  if (!scene.textures.exists("far_coast")) {
    const g = make();
    const H = 170;
    g.fillStyle(0x4a90c4, 1);
    g.fillRect(0, 40, w, H - 40);
    g.fillStyle(0x6fb0d8, 1);
    for (let i = 0; i < 24; i++) {
      const lx = rnd(i * 11 + 7) * (w - 40);
      const ly = 48 + rnd(i * 13 + 5) * 100;
      g.fillRect(lx, ly, 14 + rnd(i) * 22, 2);
    }
    // distant island
    g.fillStyle(0x39698c, 1);
    g.fillEllipse(w * 0.7, 62, 170, 26);
    // little sail
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(w * 0.3, 60, w * 0.3, 46, w * 0.3 + 9, 58);
    g.generateTexture("far_coast", w, H);
    g.destroy();
  }

  if (!scene.textures.exists("near_coast")) {
    const g = make();
    const H = 190;
    g.fillStyle(0xd8c48a, 1);
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= w; x += 6) {
      const y =
        62 +
        Math.sin((x / w) * Math.PI * 2 * 4) * 14 +
        Math.sin((x / w) * Math.PI * 2 * 9 + 1) * 7;
      g.lineTo(x, y);
    }
    g.lineTo(w, H);
    g.closePath();
    g.fillPath();
    // beach grass
    g.fillStyle(0x9a8a4a, 1);
    for (let i = 0; i < 16; i++) {
      const gx = 20 + rnd(i * 23 + 9) * (w - 40);
      const gy = 68 + rnd(i * 29 + 4) * 30;
      g.fillTriangle(gx - 4, gy, gx + 4, gy, gx, gy - 14);
      g.fillTriangle(gx, gy, gx + 8, gy, gx + 6, gy - 11);
    }
    g.generateTexture("near_coast", w, H);
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
