import Phaser from "phaser";
import { sfx, startMusic, stopMusic, toggleMusic } from "../audio";
import { Terrain } from "../terrain";
import { beginRun } from "../leaderboard";
import {
  CourseStream,
  type PestKind,
  type Course,
  type RaceMode,
} from "../course";
import { isLobbyOpen } from "../lobby";
import type { RaceClient, RosterPlayer, PosUpdate } from "../net";

type Ghost = {
  img: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  dist: number; // smoothed on-screen distance
  lastX: number; // last reported distance
  lastMsgAt: number; // when that report arrived
  vel: number; // estimated px/ms, for extrapolation
  color: number;
  name: string;
};

type RaceStartPayload = {
  course: Course;
  client: RaceClient;
  youId: string;
  players: RosterPlayer[];
};

// texture / hitbox spec per ground pest kind
const GROUND: Record<
  Exclude<PestKind, "hawk">,
  { tex: string; tex2: string | null; killer: Killer }
> = {
  rat: { tex: "rat1", tex2: "rat2", killer: "rat" },
  possum: { tex: "possum1", tex2: "possum2", killer: "possum" },
  rock1: { tex: "rock1", tex2: null, killer: "rock" },
  rock2: { tex: "rock2", tex2: null, killer: "rock" },
};

type Killer = "possum" | "rat" | "rock" | "hawk";
type GamePhase = "ready" | "running" | "dead";
type HelperType = "kea" | "ranger" | "quad" | "plane";

// the stronger, the rarer — final balance per Leopold's tuning
const HELPER_DEFS: Record<HelperType, { ms: number; weight: number }> = {
  kea: { ms: 8000, weight: 40 },
  ranger: { ms: 12000, weight: 30 },
  quad: { ms: 16000, weight: 20 },
  plane: { ms: 20000, weight: 10 },
};

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
const PLANE_Y = 170; // cruising altitude — above every hill and hawk
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

  private jumpKeys: Phaser.Input.Keyboard.Key[] = [];
  private duckKeys: Phaser.Input.Keyboard.Key[] = [];
  private touchDuck = false;
  private touchDuckId = -1;
  private touchJump = false;
  private touchJumpId = -1;

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
  private planeActive = false;
  private bombs: { img: Phaser.GameObjects.Image; vy: number }[] = [];
  private nextBombAt = 0;
  private bullets: Phaser.GameObjects.Image[] = [];
  private nextShotAt = 0;
  private lastShotAt = 0;
  private nextHelperType?: HelperType;
  private invulnUntil = 0;
  private parachuting = false;
  private chute?: Phaser.GameObjects.Image;

  private runAnimT = 0;
  private runFrameB = false;
  private enemyAnimT = 0;
  private enemyFrameB = false;

  private nextDeco?: Phaser.Time.TimerEvent;
  private idleTween?: Phaser.Tweens.Tween;

  // data-driven course (Phase 0): the track is generated into arrays and
  // played back by distance, instead of random timers
  private course?: CourseStream;
  private obIdx = 0;
  private fruitIdx = 0;

  // Cross Country race mode
  private raceMode = false;
  private raceClient?: RaceClient;
  private raceCourse?: Course;
  private myId = "";
  private myColor = 0xffe066;
  private raceKind: RaceMode = "finish";
  private finishPx = 0;
  private finished = false;
  private spectating = false;
  private raceStartAt = 0;
  private raceHits = 0;
  private stumbleUntil = 0;
  private posAccum = 0;
  private ghosts = new Map<string, Ghost>();
  private raceBar?: Phaser.GameObjects.Graphics;
  private raceBanner?: Phaser.GameObjects.Text;
  private finishGfx?: Phaser.GameObjects.Graphics;
  private finishText?: Phaser.GameObjects.Text;
  private glittered = false;

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
      if (this.phase !== "running" || this.planeActive || this.parachuting) return;
      if (this.time.now < this.invulnUntil) return; // post-buddy grace period
      const o = obj as Obstacle;
      if (o.getData("smashed")) return;
      const killer = o.getData("killer") as Killer;
      if (this.sliding && killer !== "rock") {
        this.smash(o, `+${SMASH_POINTS}`);
        return;
      }
      if (this.raceMode) {
        if (this.raceKind === "last") this.raceEliminate();
        else this.raceStumble();
      } else {
        this.die(killer, o);
      }
    });

    this.physics.add.overlap(this.player, this.fruits, (_p, obj) => {
      if (this.phase !== "running" || this.planeActive) return;
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
      this.jumpKeys = [K.SPACE, K.UP, K.W].map((k) => kb.addKey(k));
      this.jumpKeys.forEach((key) => {
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
      this.touchJump = true; // held-state used to steer the plane up
      this.touchJumpId = p.id;
      this.pressJump();
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.id === this.touchDuckId) {
        this.touchDuck = false;
        this.touchDuckId = -1;
        return;
      }
      if (p.id === this.touchJumpId) {
        this.touchJump = false;
        this.touchJumpId = -1;
      }
      this.cutJump();
    });
    this.game.events.on("call-helper", () => this.callHelper());
    this.game.events.on("raceStart", (p: RaceStartPayload) => this.startRace(p));

    this.raceBar = this.add.graphics().setDepth(21).setVisible(false);

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
    this.pumpCourse();

    const slope = this.slopeAtPlayer();
    const duckHeld =
      !this.planeActive &&
      (this.touchDuck || this.duckKeys.some((k) => k.isDown));

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
    if (this.grounded && !this.planeActive) {
      slopeFactor =
        slope > 0
          ? 1 + slope * (this.sliding ? 1.7 : 0.3)
          : 1 + slope * 0.85;
      slopeFactor = Phaser.Math.Clamp(slopeFactor, 0.7, 1.8);
    }

    this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    let eff = this.speed * slopeFactor;
    if (this.raceMode) {
      if (this.finished) eff = 0; // parked at the finish line
      else if (this.time.now < this.stumbleUntil) eff *= 0.2; // trip penalty
    }
    this.distance += eff * dt;
    this.scroll(eff * dt);
    this.checkBiome();
    this.drawGround();

    // --------------------------------------------- player vertical motion
    if (this.planeActive) {
      // the kiwi is up in the biplane — nothing to do down here
    } else if (this.parachuting) {
      // gentle descent under the canopy, drifting back to running position
      this.player.y += 135 * dt;
      this.player.x += (PLAYER_X - this.player.x) * Math.min(1, 2.2 * dt);
      this.player.angle = Math.sin(this.time.now * 0.004) * 8;
      this.chute
        ?.setPosition(
          this.player.x + this.player.angle * 0.8,
          this.player.y - this.player.displayHeight - 22
        )
        .setAngle(this.player.angle * 0.7);
      const groundY = this.gy(this.player.x);
      if (this.player.y >= groundY) {
        this.parachuting = false;
        this.player.y = groundY;
        this.player.setAngle(0);
        this.grounded = true;
        this.vy = 0;
        this.invulnUntil = this.time.now + 2000;
        this.dust.explode(8, this.player.x, this.player.y - 2);
        sfx.thump();
        const chute = this.chute;
        this.chute = undefined;
        if (chute) {
          this.tweens.add({
            targets: chute,
            y: chute.y - 140,
            alpha: 0,
            duration: 700,
            onComplete: () => chute.destroy(),
          });
        }
        this.tweens.add({ targets: this.player, x: PLAYER_X, duration: 300 });
      }
    } else if (this.grounded) {
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
    const wantDuckPose =
      !this.planeActive && this.grounded && (this.sliding || duckHeld);
    this.setDuck(wantDuckPose);

    if (!this.ducking && !this.planeActive) {
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
    if (!this.planeActive && !this.parachuting) {
      const targetAngle = this.grounded
        ? Phaser.Math.RadToDeg(Math.atan(slope)) * 0.7
        : Phaser.Math.Clamp(this.vy * 0.02, -12, 14);
      this.player.angle +=
        (targetAngle - this.player.angle) * Math.min(1, 12 * dt);
    }

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

    this.updateHelper(dt, eff);
    this.updateBombs(dt, eff);
    this.updateBullets(dt);
    if (this.raceMode) this.updateRace(dt);

    // invulnerability blink
    if (this.parachuting || this.time.now < this.invulnUntil) {
      this.player.setAlpha(0.55 + Math.sin(this.time.now * 0.02) * 0.35);
    } else if (this.player.alpha !== 1) {
      this.player.setAlpha(1);
    }

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
    if (this.raceMode && this.finished) return; // done — results screen handles it
    if (this.phase === "ready") {
      if (isLobbyOpen()) return; // don't start solo behind the lobby overlay
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

    if (this.planeActive || this.parachuting) return; // hands off the stick

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

    if (this.raceMode && this.raceCourse) {
      // race: the shared, host-authored course — identical for everyone
      this.terrain.load(this.raceCourse.terrain);
      this.course = CourseStream.preloaded(
        this.raceCourse.obstacles,
        this.raceCourse.fruit
      );
    } else {
      // solo: an endless course generated on the fly from Math.random
      this.terrain.reset(0);
      this.course = new CourseStream(Math.random);
    }
    this.distance = 0;
    this.obIdx = 0;
    this.fruitIdx = 0;

    this.player.setFlipY(false);
    this.player.setAngle(0);
    this.player.setScale(1);
    this.player.setAlpha(1);
    this.player.clearTint();
    this.parachuting = false;
    this.chute?.destroy();
    this.chute = undefined;
    this.invulnUntil = 0;
    this.nextHelperType = undefined;
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

    this.game.events.emit("started");
    this.game.events.emit("score", 0);
    this.game.events.emit("fruit", 0);
    if (!this.raceMode) {
      this.game.events.emit("helper", {
        state: "progress",
        n: 0,
        total: FRUIT_PER_HELPER,
      });
    }

    sfx.start();
    startMusic();
    if (!this.raceMode) beginRun(); // solo: fetch the signed leaderboard token
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

    // a cheeky kiwi ghost floats out AFTER the feather cloud disperses,
    // drawn above the particles so it's clearly visible
    this.time.delayedCall(300, () => {
      if (seq !== this.deathSeq) return;
      const ghost = this.add
        .sprite(px + 30, py + 6, "ghost")
        .setOrigin(0.5, 1)
        .setDepth(26)
        .setAlpha(0)
        .setScale(1.2);
      this.tweens.add({ targets: ghost, alpha: 0.95, duration: 200 });
      this.tweens.add({
        targets: ghost,
        y: py - 250,
        duration: 950,
        ease: "sine.out",
      });
      this.tweens.add({
        targets: ghost,
        angle: -8,
        duration: 240,
        yoyo: true,
        repeat: 3,
        ease: "sine.inout",
      });
      this.tweens.add({
        targets: ghost,
        alpha: 0,
        delay: 650,
        duration: 350,
        onComplete: () => ghost.destroy(),
      });
    });

    // camera: big shake and pull back out to show the whole blast
    cam.shake(320, 0.014);
    cam.pan(w / 2, h / 2, 350, "Sine.easeInOut");
    cam.zoomTo(1, 350, "Sine.easeInOut");

    // panel + restart follow quickly — pros want to get back in
    if (this.deathPayload?.record) {
      this.time.delayedCall(700, () => sfx.record());
    }
    this.canRestartAt = this.time.now + 1150;
    this.time.delayedCall(950, () => {
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
  private pickHelperType(): HelperType {
    const entries = Object.entries(HELPER_DEFS) as [HelperType, { weight: number }][];
    const total = entries.reduce((s, [, d]) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const [type, d] of entries) {
      r -= d.weight;
      if (r <= 0) return type;
    }
    return "kea";
  }

  private callHelper() {
    if (this.phase !== "running" || !this.helperReady || this.helperActive) return;
    this.helperReady = false;
    this.helperActive = true;
    this.helperType = this.nextHelperType ?? this.pickHelperType();
    this.nextHelperType = undefined;
    const ms = HELPER_DEFS[this.helperType].ms;
    this.helperUntil = this.time.now + ms;
    this.helperSecsShown = Math.ceil(ms / 1000);
    sfx.buddyCall();

    switch (this.helperType) {
      case "kea":
        this.helperSprite = this.add.sprite(-60, 180, "kea1").setDepth(11);
        break;
      case "ranger":
        this.helperSprite = this.add
          .sprite(-40, this.gy(0), "ranger1")
          .setOrigin(0.5, 1)
          .setDepth(11);
        break;
      case "quad":
        this.helperSprite = this.add
          .sprite(-80, this.gy(0), "quad1")
          .setOrigin(0.5, 1)
          .setDepth(11);
        sfx.engine();
        break;
      case "plane":
        this.enterPlane();
        break;
    }
    this.game.events.emit("helper", {
      state: "active",
      type: this.helperType,
      secs: this.helperSecsShown,
    });
  }

  /** Easter egg: the kiwi puts on an aviator cap and takes to the sky. */
  private enterPlane() {
    this.planeActive = true;
    this.sliding = false;
    this.slideDust.stop();
    this.player.clearTint();
    this.setDuck(false);
    this.player.setVisible(false);
    this.player.setPosition(PLAYER_X, this.gy(PLAYER_X));
    this.vy = 0;
    this.grounded = true;
    sfx.engine();

    this.helperSprite = this.add
      .sprite(-140, PLANE_Y, "plane1")
      .setDepth(11)
      .setScale(1.5); // big enough to see the pilot, per kids' request
    this.tweens.add({
      targets: this.helperSprite,
      x: 250,
      duration: 900,
      ease: "sine.out",
    });
    this.nextBombAt = this.time.now + 900;
  }

  private dropBomb() {
    const s = this.helperSprite!;
    const img = this.add.image(s.x + 38, s.y + 34, "bomb").setDepth(9);
    this.bombs.push({ img, vy: 60 });
    sfx.bombDrop();
  }

  private updateBombs(dt: number, eff: number) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy += 1100 * dt;
      b.img.y += b.vy * dt;
      b.img.x -= eff * 0.25 * dt;
      b.img.rotation = Math.atan2(b.vy, 40);
      if (b.img.y >= this.gy(b.img.x) - 4) {
        this.explodeBomb(b.img.x, this.gy(b.img.x));
        b.img.destroy();
        this.bombs.splice(i, 1);
      }
    }
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += 720 * dt;
      b.y = this.gy(b.x) - 34; // tracer skims the terrain
      let hit = false;
      for (const child of [...this.obstacles.getChildren()]) {
        const o = child as Obstacle;
        if (
          !o.getData("smashed") &&
          o.getData("killer") !== "rock" &&
          Math.abs(o.x - b.x) < 28
        ) {
          this.smash(o, `PEW! +${SMASH_POINTS}`);
          hit = true;
          break;
        }
      }
      if (hit || b.x > this.scale.width + 50) {
        b.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  private explodeBomb(x: number, y: number) {
    sfx.bombHit();
    this.sparks.explode(14, x, y - 10);
    this.dust.explode(10, x, y - 4);
    this.cameras.main.shake(90, 0.004);
    for (const child of [...this.obstacles.getChildren()]) {
      const o = child as Obstacle;
      if (
        !o.getData("smashed") &&
        o.getData("killer") !== "rock" &&
        Math.abs(o.x - x) < 80
      ) {
        this.smash(o, `BOOM! +${SMASH_POINTS}`);
      }
    }
  }

  private updateHelper(dt: number, eff: number) {
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
    } else if (this.helperType === "ranger") {
      // recoil frame right after each shot, otherwise aiming pose
      s.setTexture(now - this.lastShotAt < 140 ? "ranger2" : "ranger1");
      // bodyguard: hold the line ahead of the kiwi and pick off the pests
      const guardX = PLAYER_X + 90;
      const dx = guardX - s.x;
      s.x += Math.sign(dx) * Math.min(420 * dt, Math.abs(dx));
      s.y = this.gy(s.x);
      if (now > this.nextShotAt) {
        const target = this.nearestSmashable(s.x + 50);
        if (target && target.x < this.scale.width + 60) {
          this.nextShotAt = now + 550;
          this.lastShotAt = now;
          this.bullets.push(
            this.add.image(s.x + 40, this.gy(s.x + 40) - 34, "pellet").setDepth(9)
          );
          sfx.shoot();
        }
      }
      // rifle-butt safety whack for anything that gets too close
      for (const child of [...this.obstacles.getChildren()]) {
        const o = child as Obstacle;
        if (
          !o.getData("smashed") &&
          o.getData("killer") !== "rock" &&
          Math.abs(o.x - s.x) < 36
        ) {
          this.smash(o, `WHACK! +${SMASH_POINTS}`);
        }
      }
    } else if (this.helperType === "quad") {
      s.setTexture(this.enemyFrameB ? "quad2" : "quad1");
      // ultra bodyguard: bigger reach, crushes even rocks
      const guardX = PLAYER_X + 120;
      const dx = guardX - s.x;
      s.x += Math.sign(dx) * Math.min(480 * dt, Math.abs(dx));
      s.y = this.gy(s.x);
      s.angle = Phaser.Math.RadToDeg(Math.atan(this.terrain.slopeAt(this.distance + s.x))) * 0.7;
      for (const child of [...this.obstacles.getChildren()]) {
        const o = child as Obstacle;
        if (o.getData("smashed") || Math.abs(o.x - s.x) >= 58) continue;
        if (o.getData("killer") === "rock") {
          this.smash(o, "CRUSH! +40", 40);
        } else {
          this.smash(o, `VROOM! +${SMASH_POINTS}`);
        }
      }
    } else {
      // plane: steer with jump/duck, scoop up fruit, drop aimed bombs
      s.setTexture(this.enemyFrameB ? "plane2" : "plane1");
      const upHeld = this.touchJump || this.jumpKeys.some((k) => k.isDown);
      const downHeld = this.touchDuck || this.duckKeys.some((k) => k.isDown);
      let vy: number;
      if (upHeld && !downHeld) vy = -240;
      else if (downHeld && !upHeld) vy = 240;
      else vy = Phaser.Math.Clamp((PLANE_Y - s.y) * 0.8, -60, 60);
      s.y = Phaser.Math.Clamp(s.y + vy * dt, 70, this.gy(s.x) - 85);
      s.angle = Phaser.Math.Clamp(vy * 0.03, -9, 9);

      // scoop fruit mid-air — that's the whole point of steering!
      for (const child of [...this.fruits.getChildren()]) {
        const f = child as Phaser.Physics.Arcade.Sprite;
        if (Math.abs(f.x - s.x) < 48 && Math.abs(f.y - s.y) < 42) {
          this.collectFruit(f);
        }
      }

      // aimed bombing: only drop when the fall-time math says a pest
      // will actually be inside the blast radius
      if (now > this.nextBombAt && s.x > 200 && !this.tweens.isTweening(s)) {
        const dropX = s.x + 38;
        const h = Math.max(60, this.gy(dropX) - (s.y + 34));
        const t = Math.sqrt((2 * h) / 1100);
        const impactX = dropX - eff * 0.25 * t;
        for (const child of this.obstacles.getChildren()) {
          const o = child as Obstacle;
          if (o.getData("smashed") || o.getData("killer") === "rock") continue;
          const mul = (o.getData("vxMul") as number) ?? 1;
          const predicted = o.x - eff * mul * t;
          if (Math.abs(predicted - impactX) < 55) {
            this.dropBomb();
            this.nextBombAt = now + 450;
            break;
          }
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

    // clean up any leftover ordnance
    for (const b of this.bombs) b.img.destroy();
    this.bombs = [];
    for (const b of this.bullets) b.destroy();
    this.bullets = [];

    if (this.planeActive) {
      this.planeActive = false;
      this.player.setVisible(true);
      if (instant || !s) {
        this.player.setPosition(PLAYER_X, this.gy(PLAYER_X));
        this.vy = 0;
        this.grounded = true;
      } else {
        // the kiwi bails out with a parachute; the plane climbs away
        this.parachuting = true;
        this.player.setPosition(s.x, s.y + 24);
        this.player.setAngle(0);
        this.vy = 0;
        this.grounded = false;
        this.chute?.destroy();
        this.chute = this.add
          .image(s.x, s.y - 30, "chute")
          .setDepth(10)
          .setScale(1.4);
        this.feathers.explode(5, s.x, s.y + 10);
      }
    }

    if (s) {
      if (instant) {
        s.destroy();
      } else if (this.helperType === "plane") {
        // up, up and away!
        this.tweens.add({
          targets: s,
          x: s.x + 380,
          y: -120,
          angle: -14,
          duration: 1100,
          ease: "sine.in",
          onComplete: () => s.destroy(),
        });
      } else {
        this.tweens.add({
          targets: s,
          x: this.scale.width + 160,
          y: this.helperType === "kea" ? 40 : s.y,
          duration: 800,
          onComplete: () => s.destroy(),
        });
      }
    }
    if (wasActive && this.phase === "running") {
      // grace period so nobody dies to whatever the buddy left behind
      if (!this.parachuting) this.invulnUntil = this.time.now + 2500;
      this.game.events.emit("helper", { state: "done" });
      this.maybePromoteHelper();
    }
  }

  private maybePromoteHelper() {
    if (this.helperReady || this.helperActive) return;
    if (this.fruitsToward >= FRUIT_PER_HELPER) {
      this.fruitsToward -= FRUIT_PER_HELPER;
      this.helperReady = true;
      // roll the buddy NOW so the button can show who's coming
      this.nextHelperType = this.pickHelperType();
      sfx.buddyReady();
      this.game.events.emit("helper", {
        state: "ready",
        type: this.nextHelperType,
      });
    } else {
      this.game.events.emit("helper", {
        state: "progress",
        n: this.fruitsToward,
        total: FRUIT_PER_HELPER,
      });
    }
  }

  // ================================================================ smashing
  private smash(o: Obstacle, label: string, points = SMASH_POINTS) {
    if (o.getData("smashed")) return;
    o.setData("smashed", true);
    this.obstacles.remove(o);
    sfx.smash();
    this.sparks.explode(10, o.x, o.y - 12);
    this.bonus += points;
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
  // ================================================================ course
  /**
   * Spawn whatever the course places just off the right edge. Obstacles and
   * fruit live in world-distance space; we extend the stream a little ahead
   * of the screen each frame and spawn newly-covered entries at their
   * screen position (worldX - distance).
   */
  private pumpCourse() {
    if (!this.course) return;
    const frontier = this.distance + this.scale.width + 250;
    this.course.generateUpTo(frontier);

    const obs = this.course.obstacles;
    while (this.obIdx < obs.length && obs[this.obIdx].x < frontier) {
      const e = obs[this.obIdx++];
      const sx = e.x - this.distance;
      if (e.kind === "hawk") this.spawnHawk(sx);
      else this.spawnGroundKind(e.kind, sx);
    }

    const fr = this.course.fruit;
    while (this.fruitIdx < fr.length && fr[this.fruitIdx].x < frontier) {
      const f = fr[this.fruitIdx++];
      this.spawnFruit(f.x - this.distance, f.hover);
    }
  }

  private spawnGroundKind(kind: Exclude<PestKind, "hawk">, x: number) {
    const s = GROUND[kind];
    this.spawnGround(s.tex, s.tex2, s.killer, x);
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
    if (!this.raceMode) this.maybePromoteHelper();
  }

  // ============================================================ Cross Country
  startRace(p: RaceStartPayload) {
    this.raceMode = true;
    this.raceClient = p.client;
    this.raceCourse = p.course;
    this.myId = p.youId;
    this.raceKind = p.course.mode;
    this.finishPx = p.course.finishPx;
    this.finished = false;
    this.spectating = false;
    this.stumbleUntil = 0;
    this.raceHits = 0;
    this.glittered = false;
    this.raceStartAt = this.time.now; // ≈ GO; races are timed from here

    // finish gate (finish-line mode only)
    this.finishGfx?.destroy();
    this.finishText?.destroy();
    this.finishGfx = undefined;
    this.finishText = undefined;
    if (this.raceKind === "finish") {
      this.finishGfx = this.add.graphics().setDepth(8);
      this.finishText = this.add
        .text(-999, 0, "🏁 FINISH", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          fontStyle: "bold",
          color: "#1a1a1a",
        })
        .setOrigin(0.5)
        .setDepth(9);
    }

    this.clearGhosts();
    for (const pl of p.players) {
      if (pl.id === this.myId) {
        this.myColor = pl.color;
        continue;
      }
      const img = this.add
        .sprite(-999, 0, "kiwi_run1")
        .setOrigin(0.5, 1)
        .setDepth(9)
        .setAlpha(0.5)
        .setTint(pl.color)
        .setVisible(false);
      const label = this.add
        .text(-999, 0, pl.name, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#0a1a0e",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(12)
        .setVisible(false);
      this.ghosts.set(pl.id, {
        img,
        label,
        dist: 0,
        lastX: 0,
        lastMsgAt: 0,
        vel: 0,
        color: pl.color,
        name: pl.name,
      });
    }

    this.raceClient.on({
      pos: (u) => this.onGhostPos(u),
      standings: (list, over) => this.onStandings(list, over),
      toLobby: () => this.teardownRace(false),
      closed: () => {
        if (this.raceMode) this.teardownRace(true);
      },
    });

    this.idleTween?.stop();
    this.idleTween = undefined;
    this.player.setScale(1);
    this.raceBar?.setVisible(true);
    this.game.events.emit("raceHud", true); // hide solo HUD (buddy/score/best)
    this.resetRun();
  }

  private updateRace(dt: number) {
    // report my progress to the room a few times a second
    this.posAccum += dt;
    if (this.posAccum >= 0.13) {
      this.posAccum = 0;
      this.raceClient?.sendPos(Math.round(this.distance), !this.finished);
    }

    // extrapolate each ghost to ~now from its last report + speed, then
    // smooth — this removes the systematic "opponent looks behind" lag
    const now = this.time.now;
    for (const g of this.ghosts.values()) {
      const ahead = Phaser.Math.Clamp(now - g.lastMsgAt, 0, 400);
      const predicted = g.lastX + g.vel * ahead;
      g.dist += (predicted - g.dist) * Math.min(1, 12 * dt);
      const sx = PLAYER_X + (g.dist - this.distance);
      // hide ghosts once you finish, but keep them while spectating (out)
      const canSee = !this.finished || this.spectating;
      const show = canSee && sx > -80 && sx < this.scale.width + 80;
      g.img.setVisible(show);
      g.label.setVisible(show);
      if (show) {
        const gyy = this.gy(sx);
        g.img
          .setPosition(sx, gyy)
          .setTexture(this.runFrameB ? "kiwi_run2" : "kiwi_run1");
        g.label.setPosition(sx, gyy - 46);
      }
    }

    this.drawRaceBar();

    if (this.raceKind === "finish") {
      this.drawFinishGate();
      if (!this.finished && this.distance >= this.finishPx) this.finishRace();
    }
  }

  private drawFinishGate() {
    const g = this.finishGfx;
    const t = this.finishText;
    if (!g || !t) return;
    // aligned with the crossing check: at the kiwi when distance == finishPx
    const sx = PLAYER_X + (this.finishPx - this.distance);
    if (sx < -60 || sx > this.scale.width + 140) {
      g.clear();
      t.setVisible(false);
      return;
    }
    const groundY = this.gy(sx);
    const topY = groundY - 150;
    g.clear();
    // posts
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(sx - 52, topY, 9, 150);
    g.fillRect(sx + 43, topY, 9, 150);
    // checkered banner
    const bx = sx - 52;
    const by = topY - 6;
    const bw = 104;
    const cols = 8;
    const cw = bw / cols;
    g.fillStyle(0xffffff, 1);
    g.fillRect(bx, by, bw, 28);
    g.fillStyle(0x1a1a1a, 1);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) g.fillRect(bx + i * cw, by + j * 14, cw, 14);
      }
    }
    // the tape — unbroken until you run through it
    if (!this.finished) {
      g.lineStyle(5, 0xff3860, 1);
      g.lineBetween(sx - 48, groundY - 32, sx + 48, groundY - 32);
    }
    t.setPosition(sx, by - 14).setVisible(true);
  }

  private confettiRain() {
    if (this.glittered) return;
    this.glittered = true;
    const rain = this.add
      .particles(0, 0, "spark", {
        x: { min: 0, max: this.scale.width },
        y: -10,
        quantity: 3,
        frequency: 45,
        speedY: { min: 120, max: 280 },
        speedX: { min: -50, max: 50 },
        gravityY: 160,
        lifespan: 2600,
        scale: { start: 1.2, end: 0.2 },
        rotate: { min: 0, max: 360 },
        tint: [0xffe066, 0xffffff, 0x9fe066, 0xff6b5e, 0x6fb0d8],
      })
      .setDepth(23);
    this.time.delayedCall(2600, () => rain.stop());
    this.time.delayedCall(5400, () => rain.destroy());
  }

  private drawRaceBar() {
    const g = this.raceBar;
    if (!g) return;
    const w = this.scale.width;
    const left = 140;
    const right = w - 70;
    const y = 16;
    g.clear();
    g.fillStyle(0x0e2415, 0.72);
    g.fillRoundedRect(left - 12, y - 9, right - left + 40, 24, 9);
    g.lineStyle(2, 0xffffff, 0.25);
    g.lineBetween(left, y + 3, right, y + 3);
    g.fillStyle(0xffe066, 1);
    g.fillRect(right, y - 5, 3, 16); // finish line
    const at = (d: number) =>
      left + Phaser.Math.Clamp(d / this.finishPx, 0, 1) * (right - left);
    for (const gh of this.ghosts.values()) {
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(at(gh.dist), y + 3, 5);
      g.fillStyle(gh.color, 1);
      g.fillCircle(at(gh.dist), y + 3, 3.5);
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(at(this.distance), y + 3, 6.5);
    g.fillStyle(this.myColor, 1);
    g.fillCircle(at(this.distance), y + 3, 4.5);
  }

  private onGhostPos(u: PosUpdate) {
    const g = this.ghosts.get(u.id);
    if (!g) return;
    const now = this.time.now;
    const gap = now - g.lastMsgAt;
    if (g.lastMsgAt > 0 && gap > 0) {
      // px per ms, clamped to a sane running speed
      g.vel = Phaser.Math.Clamp((u.x - g.lastX) / gap, 0, 0.8);
    }
    g.lastX = u.x;
    g.lastMsgAt = now;
  }

  private onStandings(
    list: { id: string; name: string; place: number }[],
    over: boolean
  ) {
    const mine = list.find((s) => s.id === this.myId);
    if (mine) {
      this.showRaceBanner(`🏁 ${ordinal(mine.place)} place!`);
      if (mine.place === 1) this.confettiRain();
    } else {
      const latest = list[list.length - 1];
      if (latest) {
        this.floater(
          this.scale.width / 2,
          90,
          `${latest.name} — ${ordinal(latest.place)}!`,
          "#ffe066"
        );
      }
    }
    // once the race is over, freeze everyone — including the last-kiwi winner,
    // who otherwise kept running after the game was already decided
    if (over) {
      this.finished = true;
      this.game.events.emit("raceResults", { list, youId: this.myId });
    }
  }

  private starsAt(x: number, y: number) {
    // dizzy stars circling the head for the stumble
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(x, y, "spark").setDepth(13).setScale(1.2);
      const a0 = (i / 3) * Math.PI * 2;
      this.tweens.add({
        targets: star,
        angle: 360,
        duration: 1400,
        onUpdate: (tw) => {
          const a = a0 + (tw.progress ?? 0) * Math.PI * 4;
          star.setPosition(
            this.player.x + Math.cos(a) * 22,
            this.player.y - 42 + Math.sin(a) * 8
          );
        },
        onComplete: () => star.destroy(),
      });
    }
  }

  private raceStumble() {
    if (this.time.now < this.invulnUntil) return;
    this.raceHits++;
    this.stumbleUntil = this.time.now + 1500;
    this.invulnUntil = this.stumbleUntil; // pass through the pest while tripping
    this.player.setTint(0xff8888);
    this.feathers.explode(6, this.player.x, this.player.y - 20);
    this.starsAt(this.player.x, this.player.y);
    sfx.thump();
    this.cameras.main.shake(120, 0.006);
    this.time.delayedCall(1500, () => {
      if (!this.finished) this.player.clearTint();
    });
  }

  /** Last-kiwi mode: knocked out — explode, spectate the survivors on the bar. */
  private raceEliminate() {
    if (this.finished || this.time.now < this.invulnUntil) return;
    this.raceHits++;
    this.finished = true;
    this.spectating = true;
    this.raceClient?.sendDead(this.fruitCount, this.raceHits);
    sfx.die();
    this.cameras.main.shake(220, 0.008);
    this.feathers.explode(22, this.player.x, this.player.y - 24);
    this.sparks.explode(14, this.player.x, this.player.y - 20);
    this.player.setVisible(false);
    this.showRaceBanner("💀 OUT! watching the race…");
  }

  private finishRace() {
    this.finished = true;
    this.player.clearTint();
    this.raceClient?.sendFinished(
      Math.round(this.time.now - this.raceStartAt),
      this.fruitCount,
      this.raceHits
    );
    sfx.record();
    this.feathers.explode(20, this.player.x, this.player.y - 24);
    // snap the tape
    this.sparks.explode(24, this.player.x + 20, this.gy(PLAYER_X) - 32);
    this.showRaceBanner("🏁 FINISH! waiting for the others…");
  }

  private showRaceBanner(text: string) {
    if (!this.raceBanner) {
      this.raceBanner = this.add
        .text(this.scale.width / 2, this.scale.height / 2, "", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "34px",
          fontStyle: "bold",
          color: "#ffe066",
          stroke: "#0a1a0e",
          strokeThickness: 7,
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(24);
    }
    this.raceBanner.setText(text).setVisible(true);
  }

  /**
   * Tear the race down and idle at the title. toTitle=true means we're fully
   * leaving (disconnected) → the lobby closes; toTitle=false means "play again"
   * (server reset) → the lobby re-opens the room with the client still live.
   */
  private teardownRace(toTitle: boolean) {
    if (!this.raceMode) return;
    this.game.events.emit("raceHud", false); // restore the solo HUD
    this.raceMode = false;
    this.finished = false;
    this.spectating = false;
    this.raceCourse = undefined;
    if (toTitle) this.raceClient = undefined;
    this.clearGhosts();
    this.raceBar?.clear().setVisible(false);
    this.raceBanner?.setVisible(false);
    this.finishGfx?.destroy();
    this.finishText?.destroy();
    this.finishGfx = undefined;
    this.finishText = undefined;
    this.obstacles.clear(true, true);
    this.fruits.clear(true, true);
    for (const d of this.decos) d.destroy();
    this.decos = [];
    this.nextDeco?.remove(false);
    stopMusic();

    this.player.setVisible(true).setAlpha(1).clearTint().setFlipY(false).setAngle(0).setScale(1);
    this.terrain.reset(0);
    this.distance = 0;
    this.player.setPosition(PLAYER_X, this.gy(PLAYER_X));
    this.grounded = true;
    this.vy = 0;
    this.drawGround();
    this.phase = "ready";
    this.idleTween?.stop();
    this.idleTween = this.tweens.add({
      targets: this.player,
      scaleY: 0.94,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "sine.inout",
    });
    this.game.events.emit(toTitle ? "toTitle" : "raceReturnLobby");
  }

  private clearGhosts() {
    for (const g of this.ghosts.values()) {
      g.img.destroy();
      g.label.destroy();
    }
    this.ghosts.clear();
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
