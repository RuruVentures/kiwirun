import Phaser from "phaser";
import { sfx, startMusic, stopMusic, toggleMusic } from "../audio";
import { Terrain } from "../terrain";

type Killer = "possum" | "rat" | "rock" | "hawk";
type GamePhase = "ready" | "running" | "dead";
type HelperType = "kea" | "ranger";

const GROUND_H = 104;
const PLAYER_X = 150;
const START_SPEED = 300;
const MAX_SPEED = 720;
const ACCEL = 9; // px/s gained per second
const GRAVITY = 1500;
const JUMP_VY = -640;
const FLAP_VY = -540;
const JUMP_CUT_VY = -260;
const FAST_FALL_VY = 950;
const SLIDE_SLOPE = 0.09; // min downhill slope for a sustained slide
const SMASH_POINTS = 25;
const FRUIT_PER_HELPER = 8;
const HELPER_MS = 10000;
const BEST_KEY = "kiwirun_best";

type ArcadeBody = Phaser.Physics.Arcade.Body;
type Obstacle = Phaser.Physics.Arcade.Sprite;

const BIOMES = [
  {
    far: "hills_far",
    near: "hills_near",
    overlay: 0x000000,
    overlayAlpha: 0,
    ground: [0x4e9a4a, 0x3e8a3c, 0x8a6a48],
    deco: ["deco_flax", "deco_cabbage", "deco_toitoi"],
  },
  {
    far: "far_bush",
    near: "near_bush",
    overlay: 0x2e5a34,
    overlayAlpha: 0.12,
    ground: [0x3a7a42, 0x2e6b34, 0x6e5a3e],
    deco: ["deco_treefern", "deco_treefern", "deco_cabbage"],
  },
  {
    far: "far_coast",
    near: "near_coast",
    overlay: 0x4a90c4,
    overlayAlpha: 0.09,
    ground: [0xc9b06a, 0xa89050, 0x9a7f56],
    deco: ["deco_toitoi", "deco_flax", "deco_toitoi"],
  },
];

export class RunScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private fruits!: Phaser.Physics.Arcade.Group;
  private decos: Phaser.GameObjects.Image[] = [];

  private clouds!: Phaser.GameObjects.TileSprite;
  private farA!: Phaser.GameObjects.TileSprite;
  private farB!: Phaser.GameObjects.TileSprite;
  private nearA!: Phaser.GameObjects.TileSprite;
  private nearB!: Phaser.GameObjects.TileSprite;
  private overlay!: Phaser.GameObjects.Rectangle;
  private groundGfx!: Phaser.GameObjects.Graphics;

  private feathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private boomFeathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private slideDust!: Phaser.GameObjects.Particles.ParticleEmitter;

  private duckKeys: Phaser.Input.Keyboard.Key[] = [];
  private touchDuck = false;
  private touchDuckId = -1;

  private terrain = new Terrain();
  private phase: GamePhase = "ready";
  private groundTop = 0;
  private speed = START_SPEED;
  private distance = 0;
  private bonus = 0;
  private fruitCount = 0;
  private best = 0;
  private lastEmittedScore = -1;

  private grounded = true;
  private vy = 0;
  private prevGroundVy = 0;
  private exploded = false;
  private deathSeq = 0;
  private canRestartAt = 0;
  private diedAt = 0;
  private panelEmitted = false;
  private deathPayload?: { score: number; best: number; record: boolean; killer: Killer };
  private ducking = false;
  private sliding = false;
  private slideBurstUntil = 0;
  private slideCooldownAt = 0;
  private airFlaps = 1;
  private safeUntil = 0;
  private comboStep = 0;
  private lastPickupAt = 0;

  private biome = 0;
  private biomeFading = false;
  private groundColors = BIOMES[0].ground;

  private helperReady = false;
  private helperActive = false;
  private helperType: HelperType = "kea";
  private helperSprite?: Phaser.GameObjects.Sprite;
  private helperUntil = 0;
  private helperSecsShown = 0;
  private fruitsToward = 0;

  private runAnimT = 0;
  private runFrameB = false;
  private enemyAnimT = 0;
  private enemyFrameB = false;

  private nextSpawn?: Phaser.Time.TimerEvent;
  private nextFruit?: Phaser.Time.TimerEvent;
  private nextDeco?: Phaser.Time.TimerEvent;
  private idleTween?: Phaser.Tweens.Tween;

  constructor() {
    super("Run");
  }

  // ground height (screen y) at a screen x for the current scroll position
  private gy(screenX: number): number {
    return this.groundTop + this.terrain.heightAt(this.distance + screenX);
  }

  private slopeAtPlayer(): number {
    return this.terrain.slopeAt(this.distance + PLAYER_X);
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.groundTop = h - GROUND_H;
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;

    // the death cam zooms/pans — never let it show the void outside the world
    this.cameras.main.setBounds(0, 0, w, h);

    // ------------------------------------------------ background layers
    this.add.image(0, 0, "sky").setOrigin(0).setDepth(0);
    this.add.image(w - 120, 86, "sun").setDepth(1);
    this.clouds = this.add
      .tileSprite(0, 36, w, 120, "clouds")
      .setOrigin(0)
      .setDepth(2);
    this.farA = this.add
      .tileSprite(0, 240, w, 170, "hills_far")
      .setOrigin(0)
      .setDepth(3);
    this.farB = this.add
      .tileSprite(0, 240, w, 170, "far_bush")
      .setOrigin(0)
      .setDepth(3)
      .setVisible(false);
    this.nearA = this.add
      .tileSprite(0, 280, w, 190, "hills_near")
      .setOrigin(0)
      .setDepth(4);
    this.nearB = this.add
      .tileSprite(0, 280, w, 190, "near_bush")
      .setOrigin(0)
      .setDepth(4)
      .setVisible(false);

    this.groundGfx = this.add.graphics().setDepth(5);

    this.overlay = this.add
      .rectangle(0, 0, w, h, 0x000000, 1)
      .setOrigin(0)
      .setDepth(20)
      .setAlpha(0);

    // ------------------------------------------------------------ player
    this.player = this.physics.add.sprite(PLAYER_X, this.groundTop, "kiwi_run1");
    this.player.setOrigin(0.5, 1);
    this.player.setDepth(10);
    (this.player.body as ArcadeBody).setAllowGravity(false);
    this.standBody();

    // ------------------------------------------------- obstacles & fruit
    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.fruits = this.physics.add.group({ allowGravity: false, immovable: true });

    this.physics.add.overlap(this.player, this.obstacles, (_p, obj) => {
      if (this.phase !== "running") return;
      const o = obj as Obstacle;
      if (o.getData("smashed")) return;
      const killer = o.getData("killer") as Killer;
      if (this.sliding && killer !== "rock") {
        this.smash(o, `+${SMASH_POINTS}`);
        return;
      }
      this.die(killer, o);
    });

    this.physics.add.overlap(this.player, this.fruits, (_p, obj) => {
      if (this.phase !== "running") return;
      this.collectFruit(obj as Phaser.Physics.Arcade.Sprite);
    });

    // --------------------------------------------------------- particles
    this.feathers = this.add.particles(0, 0, "feather", {
      speed: { min: 60, max: 220 },
      angle: { min: 200, max: 340 },
      gravityY: 500,
      lifespan: { min: 400, max: 900 },
      scale: { start: 1, end: 0.5 },
      alpha: { start: 1, end: 0 },
      rotate: { min: -180, max: 180 },
      emitting: false,
    });
    this.feathers.setDepth(11);

    this.dust = this.add.particles(0, 0, "dust", {
      speed: { min: 30, max: 90 },
      angle: { min: 200, max: 340 },
      lifespan: 350,
      scale: { start: 1, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      emitting: false,
    });
    this.dust.setDepth(11);

    // screen-filling feather supernova for the death explosion
    this.boomFeathers = this.add.particles(0, 0, "feather", {
      speed: { min: 260, max: 900 },
      angle: { min: 0, max: 360 },
      gravityY: 380,
      lifespan: { min: 900, max: 1900 },
      scale: { start: 1.6, end: 0.4 },
      alpha: { start: 1, end: 0 },
      rotate: { min: -360, max: 360 },
      emitting: false,
    });
    this.boomFeathers.setDepth(24);

    this.slideDust = this.add.particles(0, 0, "dust", {
      speed: { min: 40, max: 120 },
      angle: { min: 160, max: 200 },
      frequency: 45,
      lifespan: 420,
      scale: { start: 1.1, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
    });
    this.slideDust.setDepth(11);
    this.slideDust.startFollow(this.player, -22, -4);
    this.slideDust.stop();

    this.sparks = this.add.particles(0, 0, "spark", {
      speed: { min: 40, max: 160 },
      lifespan: 340,
      scale: { start: 1, end: 0 },
      emitting: false,
    });
    this.sparks.setDepth(11);

    // ------------------------------------------------------------- input
    const kb = this.input.keyboard;
    const K = Phaser.Input.Keyboard.KeyCodes;
    if (kb) {
      // Event-driven, not polled: JustDown() misses key taps shorter than one
      // frame (keyup clears the flag before update runs).
      [K.SPACE, K.UP, K.W]
        .map((k) => kb.addKey(k))
        .forEach((key) => {
          key.on("down", () => this.pressJump());
          key.on("up", () => this.cutJump());
        });
      this.duckKeys = [K.DOWN, K.S].map((k) => kb.addKey(k));
      kb.on("keydown-E", () => this.callHelper());
      kb.on("keydown-ENTER", () => this.callHelper());
      kb.on("keydown-M", () => {
        this.game.events.emit("music", toggleMusic());
      });
    }
    // touch: hold the LEFT side of the screen to duck/slide, tap anywhere
    // else to jump; the bottom-right corner is the buddy button zone
    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.inBuddyZone(p) && (this.helperReady || this.helperActive)) {
        this.callHelper();
        return;
      }
      if (p.wasTouch && this.phase === "running" && p.x < this.scale.width * 0.38) {
        this.touchDuck = true;
        this.touchDuckId = p.id;
        return;
      }
      this.pressJump();
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.id === this.touchDuckId) {
        this.touchDuck = false;
        this.touchDuckId = -1;
        return;
      }
      this.cutJump();
    });
    this.game.events.on("call-helper", () => this.callHelper());

    // ready state
    this.terrain.reset(0);
    this.drawGround();
    this.player.setY(this.gy(PLAYER_X));
    this.phase = "ready";
    this.idleTween = this.tweens.add({
      targets: this.player,
      scaleY: 0.94,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "sine.inout",
    });
  }

  // ================================================================ update
  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;

    if (this.phase === "ready") {
      this.scroll(40 * dt);
      return;
    }

    if (this.phase === "dead") {
      if (!this.exploded) {
        // extra gravity keeps the death hop snappy
        this.vy += GRAVITY * 1.8 * dt;
        this.player.y += this.vy * dt;
        // the spinning kiwi hits the dirt — KAWUMM from right there
        if (this.vy > 0 && this.player.y >= this.gy(PLAYER_X) + 4) {
          this.explodeKiwi();
        }
      }
      return;
    }

    // ------------------------------------------------------------ running
    this.terrain.ensure(this.distance + this.scale.width + 600);
    this.terrain.prune(this.distance - 700);

    const slope = this.slopeAtPlayer();
    const duckHeld = this.touchDuck || this.duckKeys.some((k) => k.isDown);

    // sliding happens ONLY while the player holds duck
    const wasSliding = this.sliding;
    this.updateSlideState(duckHeld, slope);
    if (this.sliding && !wasSliding) {
      sfx.slide();
      this.slideDust.start();
      this.player.setTint(0xffe9a0);
    } else if (!this.sliding && wasSliding) {
      this.slideDust.stop();
      this.player.clearTint();
    }

    // slope affects speed: uphill drags, downhill slides are fast
    let slopeFactor = 1;
    if (this.grounded) {
      slopeFactor =
        slope > 0
          ? 1 + slope * (this.sliding ? 1.7 : 0.3)
          : 1 + slope * 0.85;
      slopeFactor = Phaser.Math.Clamp(slopeFactor, 0.7, 1.8);
    }

    this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    const eff = this.speed * slopeFactor;
    this.distance += eff * dt;
    this.scroll(eff * dt);
    this.checkBiome();
    this.drawGround();

    // --------------------------------------------- player vertical motion
    if (this.grounded) {
      const newY = this.gy(PLAYER_X);
      const groundVy = (newY - this.player.y) / dt;
      const crestLaunch = this.prevGroundVy < -140 && groundVy > 40;
      const cliffDrop = groundVy > 620;
      if (crestLaunch || cliffDrop) {
        this.grounded = false;
        this.vy =
          this.prevGroundVy < 0
            ? this.prevGroundVy * 1.05 - (this.sliding ? 100 : 0)
            : 80;
        if (crestLaunch && this.vy < -200) sfx.boing();
      } else {
        this.player.y = newY;
        this.prevGroundVy = groundVy;
      }
    } else {
      this.vy += GRAVITY * dt;
      if (duckHeld) this.vy = Math.max(this.vy, FAST_FALL_VY);
      this.player.y += this.vy * dt;
      const groundY = this.gy(PLAYER_X);
      if (this.player.y >= groundY) {
        this.player.y = groundY;
        this.grounded = true;
        this.vy = 0;
        this.prevGroundVy = 0;
        this.airFlaps = 1;
        this.dust.explode(6, this.player.x, this.player.y - 2);
        sfx.thump();
        this.player.setScale(1.12, 0.86);
        this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 120 });
      }
    }

    // ------------------------------------------------- texture & posture
    const wantDuckPose = this.grounded && (this.sliding || duckHeld);
    this.setDuck(wantDuckPose);

    if (!this.ducking) {
      if (!this.grounded) {
        this.setPlayerTexture("kiwi_jump");
      } else {
        const stepDur = Phaser.Math.Clamp(0.18 - eff / 6000, 0.07, 0.18);
        this.runAnimT += dt;
        if (this.runAnimT >= stepDur) {
          this.runAnimT = 0;
          this.runFrameB = !this.runFrameB;
        }
        this.setPlayerTexture(this.runFrameB ? "kiwi_run2" : "kiwi_run1");
      }
    }

    // tilt with the terrain
    const targetAngle = this.grounded
      ? Phaser.Math.RadToDeg(Math.atan(slope)) * 0.7
      : Phaser.Math.Clamp(this.vy * 0.02, -12, 14);
    this.player.angle += (targetAngle - this.player.angle) * Math.min(1, 12 * dt);

    // ------------------------------------------------- world object flow
    this.enemyAnimT += dt;
    if (this.enemyAnimT >= 0.13) {
      this.enemyAnimT = 0;
      this.enemyFrameB = !this.enemyFrameB;
    }

    // iterate over copies — destroying/removing while iterating the live
    // group set makes Phaser hand us undefined children
    for (const child of [...this.obstacles.getChildren()]) {
      const o = child as Obstacle;
      const mul = (o.getData("vxMul") as number) ?? 1;
      o.x -= eff * mul * dt;
      if (o.getData("killer") === "hawk") {
        o.y =
          this.gy(o.x) -
          52 +
          Math.sin(this.time.now * 0.008 + (o.getData("bobPhase") as number)) * 4;
      } else {
        o.y = this.gy(o.x);
      }
      const frames = o.getData("frames") as [string, string] | undefined;
      if (frames) o.setTexture(frames[this.enemyFrameB ? 1 : 0]);
      if (o.x < -150) o.destroy();
    }

    for (const child of [...this.fruits.getChildren()]) {
      const f = child as Phaser.Physics.Arcade.Sprite;
      f.x -= eff * dt;
      f.y = this.gy(f.x) - (f.getData("hover") as number);
      f.rotation += 2.2 * dt;
      if (f.x < -60) f.destroy();
    }

    for (let i = this.decos.length - 1; i >= 0; i--) {
      const d = this.decos[i];
      d.x -= eff * dt;
      d.y = this.gy(d.x) + 3;
      if (d.x < -80) {
        d.destroy();
        this.decos.splice(i, 1);
      }
    }

    this.updateHelper(dt);

    // score
    const score = this.currentScore();
    if (score !== this.lastEmittedScore) {
      this.lastEmittedScore = score;
      this.game.events.emit("score", score);
    }
  }

  private updateSlideState(duckHeld: boolean, slope: number) {
    if (!this.grounded || !duckHeld || this.phase !== "running") {
      this.sliding = false;
      return;
    }
    const now = this.time.now;
    if (slope > SLIDE_SLOPE) {
      // downhill: slide for as long as the key is held
      this.sliding = true;
      return;
    }
    if (now < this.slideBurstUntil) {
      this.sliding = true;
      return;
    }
    if (this.sliding && now > this.slideCooldownAt) {
      // flat ground: only a short burst, then cooldown — plain duck after
      this.sliding = false;
      return;
    }
    if (!this.sliding && now > this.slideCooldownAt) {
      this.slideBurstUntil = now + 450;
      this.slideCooldownAt = now + 1600;
      this.sliding = true;
      return;
    }
    this.sliding = false;
  }

  private scroll(px: number) {
    this.clouds.tilePositionX += px * 0.08;
    this.farA.tilePositionX += px * 0.18;
    this.farB.tilePositionX += px * 0.18;
    this.nearA.tilePositionX += px * 0.45;
    this.nearB.tilePositionX += px * 0.45;
  }

  private drawGround() {
    const w = this.scale.width;
    const h = this.scale.height;
    const [grass, grassDark, dirt] = this.groundColors;
    const g = this.groundGfx;
    g.clear();

    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let x = -16; x <= w + 16; x += 12) {
      pts.push({ x, y: this.gy(x) });
    }

    g.fillStyle(dirt, 1);
    g.beginPath();
    g.moveTo(-16, h + 40);
    for (const p of pts) g.lineTo(p.x, p.y);
    g.lineTo(w + 16, h + 40);
    g.closePath();
    g.fillPath();

    g.lineStyle(16, grass, 1);
    g.strokePoints(pts.map((p) => ({ x: p.x, y: p.y + 6 })), false);
    g.lineStyle(5, grassDark, 1);
    g.strokePoints(pts.map((p) => ({ x: p.x, y: p.y + 15 })), false);
  }

  private checkBiome() {
    const idx = Math.floor(this.distance / 10 / 600) % BIOMES.length;
    if (idx === this.biome || this.biomeFading) return;
    this.biomeFading = true;
    const b = BIOMES[idx];

    this.farB.setTexture(b.far).setAlpha(0).setVisible(true);
    this.nearB.setTexture(b.near).setAlpha(0).setVisible(true);
    this.tweens.add({
      targets: [this.farB, this.nearB],
      alpha: 1,
      duration: 2000,
      onComplete: () => {
        this.farA.setTexture(b.far).setAlpha(1);
        this.nearA.setTexture(b.near).setAlpha(1);
        this.farB.setVisible(false);
        this.nearB.setVisible(false);
        this.biome = idx;
        this.biomeFading = false;
      },
    });
    this.time.delayedCall(1000, () => {
      this.groundColors = b.ground;
    });
    this.overlay.setFillStyle(b.overlay, 1);
    this.tweens.add({ targets: this.overlay, alpha: b.overlayAlpha, duration: 2000 });
  }

  private currentScore() {
    return Math.floor(this.distance / 10) + this.bonus;
  }

  private inBuddyZone(p: Phaser.Input.Pointer): boolean {
    const w = this.scale.width;
    const h = this.scale.height;
    return p.x > w - 118 && p.y > h - 118;
  }

  private setPlayerTexture(key: string) {
    if (this.player.texture.key !== key) this.player.setTexture(key);
  }

  // ================================================================= input
  private pressJump() {
    if (this.phase === "ready") {
      this.startRun();
      return;
    }
    if (this.phase === "dead") {
      // pros can skip the show: first press fast-forwards to the panel,
      // the next one restarts
      if (this.time.now > this.canRestartAt) {
        this.resetRun();
      } else if (!this.panelEmitted && this.time.now > this.diedAt + 350) {
        if (!this.exploded) this.explodeKiwi();
        this.emitDeadPanel();
        this.canRestartAt = this.time.now + 250;
      }
      return;
    }

    if (this.grounded) {
      this.setDuck(false);
      this.grounded = false;
      this.vy = JUMP_VY;
      sfx.jump();
      this.player.setScale(0.9, 1.12);
      this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 140 });
    } else if (this.airFlaps > 0) {
      this.airFlaps--;
      this.vy = FLAP_VY;
      sfx.flap();
      this.feathers.explode(6, this.player.x, this.player.y - 24);
    }
  }

  private cutJump() {
    if (this.phase !== "running") return;
    if (!this.grounded && this.vy < JUMP_CUT_VY) this.vy = JUMP_CUT_VY;
  }

  // ============================================================ player state
  private standBody() {
    const body = this.player.body as ArcadeBody;
    body.setSize(46, 44);
    body.setOffset((this.player.width - 46) / 2, this.player.height - 44);
  }

  private setDuck(on: boolean) {
    if (this.ducking === on) return;
    this.ducking = on;
    const body = this.player.body as ArcadeBody;
    if (on) {
      this.setPlayerTexture("kiwi_duck");
      body.setSize(60, 22);
      body.setOffset((this.player.width - 60) / 2, this.player.height - 22);
    } else {
      this.setPlayerTexture("kiwi_run1");
      this.standBody();
    }
  }

  // ============================================================== lifecycle
  private startRun() {
    this.idleTween?.stop();
    this.idleTween = undefined;
    this.player.setScale(1);
    this.resetRun();
  }

  private resetRun() {
    this.obstacles.clear(true, true);
    this.fruits.clear(true, true);
    for (const d of this.decos) d.destroy();
    this.decos = [];
    this.retireHelper(true);

    // undo death-cam drama
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.setZoom(1);
    cam.centerOn(this.scale.width / 2, this.scale.height / 2);
    this.tweens.killTweensOf(this.player);
    this.player.setVisible(true);
    this.exploded = false;
    this.deathSeq++;

    this.terrain.reset(0);
    this.distance = 0;

    this.player.setFlipY(false);
    this.player.setAngle(0);
    this.player.setScale(1);
    this.player.clearTint();
    this.ducking = false;
    this.sliding = false;
    this.slideDust.stop();
    this.setPlayerTexture("kiwi_run1");
    this.standBody();
    this.player.setPosition(PLAYER_X, this.gy(PLAYER_X));
    this.grounded = true;
    this.vy = 0;
    this.prevGroundVy = 0;

    this.speed = START_SPEED;
    this.bonus = 0;
    this.fruitCount = 0;
    this.fruitsToward = 0;
    this.helperReady = false;
    this.lastEmittedScore = -1;
    this.airFlaps = 1;
    this.comboStep = 0;
    this.slideBurstUntil = 0;
    this.slideCooldownAt = 0;

    this.biome = 0;
    this.biomeFading = false;
    this.groundColors = BIOMES[0].ground;
    this.farA.setTexture(BIOMES[0].far).setAlpha(1);
    this.nearA.setTexture(BIOMES[0].near).setAlpha(1);
    this.farB.setVisible(false);
    this.nearB.setVisible(false);
    this.overlay.setAlpha(0);

    this.phase = "running";
    this.safeUntil = this.time.now + 900;

    this.game.events.emit("started");
    this.game.events.emit("score", 0);
    this.game.events.emit("fruit", 0);
    this.game.events.emit("helper", {
      state: "progress",
      n: 0,
      total: FRUIT_PER_HELPER,
    });

    sfx.start();
    startMusic();
    this.scheduleSpawn();
    this.scheduleFruit();
    this.scheduleDeco();
  }

  private die(killer: Killer, killerSprite?: Obstacle) {
    if (this.phase !== "running") return;
    this.phase = "dead";
    this.deathSeq++;
    this.exploded = false;
    this.panelEmitted = false;
    this.diedAt = this.time.now;
    this.canRestartAt = Number.MAX_SAFE_INTEGER;

    this.nextSpawn?.remove(false);
    this.nextFruit?.remove(false);
    this.nextDeco?.remove(false);
    this.retireHelper(true);
    stopMusic();
    sfx.die();
    this.slideDust.stop();
    this.player.clearTint();

    const px = this.player.x;
    const py = this.player.y - 26;
    const cam = this.cameras.main;

    // 1. white impact flash + comic burst at the hit
    const flash = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff)
      .setOrigin(0)
      .setDepth(25)
      .setAlpha(0.7);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy(),
    });
    this.showComicBurst(px + 26, py - 8);

    // 2. camera punches in — vertical only, no sideways slide
    cam.shake(240, 0.008);
    cam.pan(this.scale.width / 2, py, 320, "Sine.easeOut");
    cam.zoomTo(1.4, 320, "Sine.easeOut");

    // 3. impact poof, then a short snappy spin-hop…
    this.feathers.explode(12, px, py);
    this.dust.explode(8, px, this.player.y - 4);
    this.setPlayerTexture("kiwi_jump");
    this.player.setFlipY(true);
    this.grounded = false;
    this.vy = -420;
    this.tweens.add({ targets: this.player, angle: 900, duration: 650 });
    this.tweens.add({
      targets: this.player,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 450,
      ease: "quad.out",
    });
    // …and it crashes right back down — the update loop triggers
    // explodeKiwi() on landing. Safety net in case something goes sideways:
    const seq = this.deathSeq;
    this.time.delayedCall(1400, () => {
      if (this.phase === "dead" && seq === this.deathSeq && !this.exploded) {
        this.explodeKiwi();
      }
    });

    // 4. the killer does a little victory dance
    if (killerSprite && killerSprite.active) {
      this.tweens.add({
        targets: killerSprite,
        y: killerSprite.y - 14,
        duration: 150,
        yoyo: true,
        repeat: 3,
        ease: "quad.out",
      });
    }

    const score = this.currentScore();
    const record = score > this.best && score > 0;
    if (record) {
      this.best = score;
      localStorage.setItem(BEST_KEY, String(score));
    }
    this.deathPayload = { score, best: this.best, record, killer };
  }

  /** The big KAWUMM — fired from the exact spot where the kiwi lands. */
  private explodeKiwi() {
    if (this.exploded || this.phase !== "dead") return;
    this.exploded = true;
    const seq = this.deathSeq;

    const px = this.player.x;
    const py = Math.min(this.player.y, this.gy(PLAYER_X)) - 10;
    const w = this.scale.width;
    const h = this.scale.height;
    const cam = this.cameras.main;

    this.tweens.killTweensOf(this.player);
    this.player.setVisible(false);
    sfx.kawumm();

    // huge flash
    const flash = this.add
      .rectangle(0, 0, w, h, 0xffffff)
      .setOrigin(0)
      .setDepth(25)
      .setAlpha(0.95);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 340,
      onComplete: () => flash.destroy(),
    });

    // feather supernova across the whole screen
    this.boomFeathers.explode(90, px, py);
    this.sparks.explode(34, px, py);
    this.dust.explode(16, px, py + 8);

    // expanding shockwave rings
    [0xffffff, 0xffe066].forEach((color, i) => {
      const ring = this.add
        .circle(px, py, 12)
        .setStrokeStyle(7 - i * 2, color, 0.9)
        .setFillStyle(0, 0)
        .setDepth(24);
      this.tweens.add({
        targets: ring,
        radius: 420 + i * 160,
        alpha: 0,
        delay: i * 80,
        duration: 480,
        ease: "quad.out",
        onComplete: () => ring.destroy(),
      });
    });

    this.showComicBurst(px, py - 30, "KAWUMM!", 2.3);

    // a cheeky kiwi ghost floats out of the feather cloud — he's fine!
    const ghost = this.add
      .sprite(px, py + 10, "kiwi_jump")
      .setOrigin(0.5, 1)
      .setDepth(24)
      .setAlpha(0)
      .setTintFill(0xdff1ff);
    this.tweens.add({ targets: ghost, alpha: 0.85, duration: 250, delay: 150 });
    this.tweens.add({
      targets: ghost,
      y: py - 190,
      duration: 1400,
      ease: "sine.out",
    });
    this.tweens.add({
      targets: ghost,
      x: px + 14,
      duration: 300,
      yoyo: true,
      repeat: 4,
      ease: "sine.inout",
    });
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      delay: 900,
      duration: 500,
      onComplete: () => ghost.destroy(),
    });

    // camera: big shake and pull back out to show the whole blast
    cam.shake(320, 0.014);
    cam.pan(w / 2, h / 2, 350, "Sine.easeInOut");
    cam.zoomTo(1, 350, "Sine.easeInOut");

    // panel + restart follow quickly — pros want to get back in
    if (this.deathPayload?.record) {
      this.time.delayedCall(700, () => sfx.record());
    }
    this.canRestartAt = this.time.now + 1000;
    this.time.delayedCall(800, () => {
      if (this.phase === "dead" && seq === this.deathSeq) {
        this.emitDeadPanel();
      }
    });
  }

  /** Show the game-over panel (once per death). */
  private emitDeadPanel() {
    if (this.panelEmitted || this.phase !== "dead" || !this.deathPayload) return;
    this.panelEmitted = true;
    this.game.events.emit("dead", this.deathPayload);
  }

  private showComicBurst(x: number, y: number, forcedWord?: string, size = 1.5) {
    // keep the word inside the death cam's view — it zooms to 1.4 right
    // after the burst spawns, so clamp against that zoomed-in window
    const w = this.scale.width;
    const zoomedHalf = w / 1.4 / 2;
    const view = this.cameras.main.worldView;
    const left = Math.max(view.left, w / 2 - zoomedHalf) + 105 * size;
    const right = Math.min(view.right, w / 2 + zoomedHalf) - 105 * size;
    x = Phaser.Math.Clamp(x, left, right);
    y = Math.max(y, view.top + 70);
    const words = ["SPLAT!", "BONK!", "OOF!", "PLOP!", "WHAM!"];
    const burst = this.add
      .image(x, y, "burst")
      .setDepth(24)
      .setScale(0)
      .setAngle(Phaser.Math.Between(-20, 20));
    const word = this.add
      .text(x, y, forcedWord ?? words[Phaser.Math.Between(0, words.length - 1)], {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#a82810",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(24)
      .setScale(0);
    this.tweens.add({
      targets: [burst, word],
      scale: size,
      duration: 380,
      ease: "back.out(2.2)",
    });
    this.tweens.add({
      targets: burst,
      angle: burst.angle + 25,
      duration: 900,
    });
    this.tweens.add({
      targets: [burst, word],
      alpha: 0,
      delay: 750,
      duration: 300,
      onComplete: () => {
        burst.destroy();
        word.destroy();
      },
    });
  }

  // ================================================================ helpers
  private callHelper() {
    if (this.phase !== "running" || !this.helperReady || this.helperActive) return;
    this.helperReady = false;
    this.helperActive = true;
    this.helperUntil = this.time.now + HELPER_MS;
    this.helperSecsShown = Math.ceil(HELPER_MS / 1000);
    this.helperType = Math.random() < 0.5 ? "kea" : "ranger";
    sfx.buddyCall();

    if (this.helperType === "kea") {
      this.helperSprite = this.add
        .sprite(-60, 180, "kea1")
        .setDepth(11);
    } else {
      this.helperSprite = this.add
        .sprite(-40, this.gy(0), "ranger1")
        .setOrigin(0.5, 1)
        .setDepth(11);
    }
    this.game.events.emit("helper", {
      state: "active",
      type: this.helperType,
      secs: this.helperSecsShown,
    });
  }

  private updateHelper(dt: number) {
    if (!this.helperActive || !this.helperSprite) return;
    const s = this.helperSprite;
    const now = this.time.now;

    const secs = Math.max(0, Math.ceil((this.helperUntil - now) / 1000));
    if (secs !== this.helperSecsShown) {
      this.helperSecsShown = secs;
      this.game.events.emit("helper", {
        state: "active",
        type: this.helperType,
        secs,
      });
    }

    if (this.helperType === "kea") {
      s.setTexture(this.enemyFrameB ? "kea2" : "kea1");
      const target = this.nearestSmashable(60);
      const tx = target ? target.x : 420;
      const ty = target
        ? target.y - 8
        : this.gy(420) - 150 + Math.sin(now * 0.004) * 18;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = 560 * dt;
      s.x += (dx / dist) * Math.min(step, dist);
      s.y += (dy / dist) * Math.min(step, dist);
      s.setFlipX(dx > 0);
      if (target && dist < 38) this.smash(target, `SCREE! +${SMASH_POINTS}`);
    } else {
      s.setTexture(this.enemyFrameB ? "ranger2" : "ranger1");
      // bodyguard: sprint to a spot just ahead of the kiwi and hold the line
      const guardX = PLAYER_X + 90;
      const dx = guardX - s.x;
      s.x += Math.sign(dx) * Math.min(420 * dt, Math.abs(dx));
      s.y = this.gy(s.x);
      for (const child of [...this.obstacles.getChildren()]) {
        const o = child as Obstacle;
        if (
          !o.getData("smashed") &&
          o.getData("killer") !== "rock" &&
          Math.abs(o.x - s.x) < 44
        ) {
          this.smash(o, `BONK! +${SMASH_POINTS}`);
        }
      }
    }

    if (now > this.helperUntil) {
      this.retireHelper(false);
    }
  }

  private nearestSmashable(minX: number): Obstacle | undefined {
    let best: Obstacle | undefined;
    let bestX = Infinity;
    for (const child of this.obstacles.getChildren()) {
      const o = child as Obstacle;
      if (
        !o.getData("smashed") &&
        o.getData("killer") !== "rock" &&
        o.x > minX &&
        o.x < bestX
      ) {
        best = o;
        bestX = o.x;
      }
    }
    return best;
  }

  private retireHelper(instant: boolean) {
    if (!this.helperActive && !this.helperSprite) return;
    const s = this.helperSprite;
    this.helperSprite = undefined;
    const wasActive = this.helperActive;
    this.helperActive = false;
    if (s) {
      if (instant) {
        s.destroy();
      } else {
        this.tweens.add({
          targets: s,
          x: this.scale.width + 120,
          y: this.helperType === "kea" ? 30 : s.y,
          duration: 800,
          onComplete: () => s.destroy(),
        });
      }
    }
    if (wasActive && this.phase === "running") {
      this.game.events.emit("helper", { state: "done" });
      this.maybePromoteHelper();
    }
  }

  private maybePromoteHelper() {
    if (this.helperReady || this.helperActive) return;
    if (this.fruitsToward >= FRUIT_PER_HELPER) {
      this.fruitsToward -= FRUIT_PER_HELPER;
      this.helperReady = true;
      sfx.buddyReady();
      this.game.events.emit("helper", { state: "ready" });
    } else {
      this.game.events.emit("helper", {
        state: "progress",
        n: this.fruitsToward,
        total: FRUIT_PER_HELPER,
      });
    }
  }

  // ================================================================ smashing
  private smash(o: Obstacle, label: string) {
    if (o.getData("smashed")) return;
    o.setData("smashed", true);
    this.obstacles.remove(o);
    sfx.smash();
    this.sparks.explode(10, o.x, o.y - 12);
    this.bonus += SMASH_POINTS;
    this.floater(o.x, o.y - 26, label, "#b33c00");
    this.tweens.add({
      targets: o,
      x: o.x + 150,
      y: o.y - 190,
      angle: 640,
      alpha: 0.1,
      duration: 620,
      ease: "quad.out",
      onComplete: () => o.destroy(),
    });
  }

  private floater(x: number, y: number, text: string, color = "#1e5c24") {
    const txt = this.add
      .text(x, y, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color,
      })
      .setOrigin(0.5)
      .setDepth(12);
    this.tweens.add({
      targets: txt,
      y: y - 46,
      alpha: 0,
      duration: 650,
      onComplete: () => txt.destroy(),
    });
  }

  // ================================================================ spawning
  private scheduleSpawn() {
    this.nextSpawn?.remove(false);
    const gapPx =
      Phaser.Math.Clamp(380 + (this.speed - START_SPEED) * 0.55, 380, 640) +
      Phaser.Math.Between(-70, 190);
    const delay = Math.max(340, (gapPx / this.speed) * 1000);

    this.nextSpawn = this.time.delayedCall(delay, () => {
      if (this.phase !== "running") return;
      if (this.time.now >= this.safeUntil) this.spawnPattern();
      this.scheduleSpawn();
    });
  }

  private spawnPattern() {
    const x = this.scale.width + 100;
    const m = Math.floor(this.distance / 10);

    const pool: { w: number; run: () => void }[] = [
      { w: 3, run: () => this.spawnGround("rat1", "rat2", "rat", x) },
      { w: 2.4, run: () => this.spawnGround("rock1", null, "rock", x) },
    ];
    if (m > 120) {
      pool.push(
        { w: 3, run: () => this.spawnGround("possum1", "possum2", "possum", x) },
        {
          w: 2,
          run: () => {
            this.spawnGround("rat1", "rat2", "rat", x);
            this.spawnGround("rat1", "rat2", "rat", x + 74);
          },
        }
      );
    }
    if (m > 300) {
      pool.push(
        { w: 2.5, run: () => this.spawnHawk(x) },
        { w: 1.6, run: () => this.spawnGround("rock2", null, "rock", x) }
      );
    }
    if (m > 600) {
      pool.push(
        {
          w: 1.5,
          run: () => {
            this.spawnGround("rat1", "rat2", "rat", x);
            this.spawnGround("rat1", "rat2", "rat", x + 70);
            this.spawnGround("rat1", "rat2", "rat", x + 140);
          },
        },
        {
          w: 1.3,
          run: () => {
            this.spawnGround("possum1", "possum2", "possum", x);
            this.spawnHawk(x + 320);
          },
        },
        {
          w: 1.2,
          run: () => {
            this.spawnGround("rock1", null, "rock", x);
            this.spawnGround("rock2", null, "rock", x + 120);
          },
        }
      );
    }

    const total = pool.reduce((s, p) => s + p.w, 0);
    let pick = Math.random() * total;
    for (const p of pool) {
      pick -= p.w;
      if (pick <= 0) {
        p.run();
        return;
      }
    }
    pool[0].run();
  }

  private spawnGround(tex: string, tex2: string | null, killer: Killer, x: number) {
    const o = this.obstacles.create(x, this.gy(x), tex) as Obstacle;
    o.setOrigin(0.5, 1);
    o.setDepth(9);
    o.setData("killer", killer);
    o.setData("vxMul", 1);
    if (tex2) o.setData("frames", [tex, tex2]);
    const body = o.body as ArcadeBody;
    const bw = Math.round(o.width * 0.72);
    const bh = Math.round(o.height * 0.8);
    body.setSize(bw, bh);
    body.setOffset((o.width - bw) / 2, o.height - bh);
  }

  private spawnHawk(x: number) {
    const o = this.obstacles.create(x, this.gy(x) - 52, "hawk1") as Obstacle;
    o.setDepth(9);
    o.setData("killer", "hawk");
    o.setData("vxMul", 1.28);
    o.setData("frames", ["hawk1", "hawk2"]);
    o.setData("bobPhase", Math.random() * Math.PI * 2);
    const body = o.body as ArcadeBody;
    body.setSize(56, 22);
    body.setOffset((o.width - 56) / 2, (o.height - 22) / 2);
  }

  private scheduleFruit() {
    this.nextFruit?.remove(false);
    this.nextFruit = this.time.delayedCall(Phaser.Math.Between(2600, 5200), () => {
      if (this.phase !== "running") return;
      this.spawnFruitPattern();
      this.scheduleFruit();
    });
  }

  private spawnFruitPattern() {
    const x0 = this.scale.width + 80;
    const kind = Phaser.Math.Between(0, 2);
    if (kind === 0) {
      for (let i = 0; i < 4; i++) this.spawnFruit(x0 + i * 42, 44);
    } else if (kind === 1) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        this.spawnFruit(x0 + i * 46, 44 + Math.sin(t * Math.PI) * 110);
      }
    } else {
      for (let i = 0; i < 3; i++) this.spawnFruit(x0 + i * 44, 150);
    }
  }

  private spawnFruit(x: number, hover: number) {
    const f = this.fruits.create(x, this.gy(x) - hover, "fruit") as Phaser.Physics.Arcade.Sprite;
    f.setDepth(8);
    f.setData("hover", hover);
    (f.body as ArcadeBody).setCircle(11);
  }

  private scheduleDeco() {
    this.nextDeco?.remove(false);
    this.nextDeco = this.time.delayedCall(Phaser.Math.Between(420, 1000), () => {
      if (this.phase !== "running") return;
      if (this.decos.length < 14) {
        const texs = BIOMES[this.biome].deco;
        const tex = texs[Phaser.Math.Between(0, texs.length - 1)];
        const x = this.scale.width + 60;
        const d = this.add
          .image(x, this.gy(x) + 3, tex)
          .setOrigin(0.5, 1)
          .setDepth(6)
          .setScale(Phaser.Math.FloatBetween(0.8, 1.35));
        this.decos.push(d);
      }
      this.scheduleDeco();
    });
  }

  private collectFruit(f: Phaser.Physics.Arcade.Sprite) {
    const { x, y } = f;
    f.destroy();
    this.bonus += 15;
    this.fruitCount++;
    this.fruitsToward++;

    const now = this.time.now;
    this.comboStep = now - this.lastPickupAt < 1600 ? this.comboStep + 1 : 0;
    this.lastPickupAt = now;
    sfx.pickup(this.comboStep);

    this.sparks.explode(8, x, y);
    this.floater(x, y - 8, "+15");

    this.game.events.emit("fruit", this.fruitCount);
    this.maybePromoteHelper();
  }
}
