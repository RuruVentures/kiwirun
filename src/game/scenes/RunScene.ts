import Phaser from "phaser";
import { sfx, startMusic, stopMusic, toggleMusic } from "../audio";

type Killer = "possum" | "rat" | "rock" | "hawk";
type GamePhase = "ready" | "running" | "dead";

const GROUND_H = 92;
const START_SPEED = 300;
const MAX_SPEED = 720;
const ACCEL = 9; // px/s gained per second
const JUMP_VY = -640;
const FLAP_VY = -540;
const JUMP_CUT_VY = -260;
const FAST_FALL_VY = 950;
const BEST_KEY = "kiwirun_best";

type ArcadeBody = Phaser.Physics.Arcade.Body;

export class RunScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private fruits!: Phaser.Physics.Arcade.Group;

  private clouds!: Phaser.GameObjects.TileSprite;
  private hillsFar!: Phaser.GameObjects.TileSprite;
  private hillsNear!: Phaser.GameObjects.TileSprite;
  private groundTile!: Phaser.GameObjects.TileSprite;

  private feathers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  private jumpKeys: Phaser.Input.Keyboard.Key[] = [];
  private duckKeys: Phaser.Input.Keyboard.Key[] = [];

  private phase: GamePhase = "ready";
  private groundTop = 0;
  private speed = START_SPEED;
  private distance = 0;
  private bonus = 0;
  private fruitCount = 0;
  private best = 0;
  private lastEmittedScore = -1;
  private ducking = false;
  private airFlaps = 1;
  private wasAirborne = false;
  private deadAt = 0;
  private safeUntil = 0;
  private comboStep = 0;
  private lastPickupAt = 0;

  private runAnimT = 0;
  private runFrameB = false;
  private enemyAnimT = 0;
  private enemyFrameB = false;

  private nextSpawn?: Phaser.Time.TimerEvent;
  private nextFruit?: Phaser.Time.TimerEvent;
  private idleTween?: Phaser.Tweens.Tween;

  constructor() {
    super("Run");
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.groundTop = h - GROUND_H;
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;

    // ------------------------------------------------ background layers
    this.add.image(0, 0, "sky").setOrigin(0);
    this.add.image(w - 120, 86, "sun");
    this.clouds = this.add.tileSprite(0, 36, w, 120, "clouds").setOrigin(0);
    this.hillsFar = this.add
      .tileSprite(0, this.groundTop - 170, w, 170, "hills_far")
      .setOrigin(0);
    this.hillsNear = this.add
      .tileSprite(0, this.groundTop - 120, w, 120, "hills_near")
      .setOrigin(0);
    this.groundTile = this.add
      .tileSprite(0, this.groundTop - 28, w, 28 + GROUND_H, "ground")
      .setOrigin(0);

    // Invisible static ground body
    const groundRect = this.add
      .rectangle(w / 2, this.groundTop + GROUND_H / 2, w, GROUND_H)
      .setVisible(false);
    this.physics.add.existing(groundRect, true);

    // ------------------------------------------------------------ player
    this.player = this.physics.add.sprite(150, this.groundTop, "kiwi_run1");
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.standBody();
    this.physics.add.collider(this.player, groundRect);

    // ------------------------------------------------- obstacles & fruit
    this.obstacles = this.physics.add.group({ allowGravity: false, immovable: true });
    this.fruits = this.physics.add.group({ allowGravity: false, immovable: true });

    this.physics.add.overlap(this.player, this.obstacles, (_p, obj) => {
      if (this.phase !== "running") return;
      const killer = (obj as Phaser.GameObjects.Sprite).getData("killer") as Killer;
      this.die(killer);
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

    this.sparks = this.add.particles(0, 0, "spark", {
      speed: { min: 40, max: 140 },
      lifespan: 320,
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
      kb.on("keydown-M", () => {
        this.game.events.emit("music", toggleMusic());
      });
    }
    this.input.on("pointerdown", () => this.pressJump());
    this.input.on("pointerup", () => this.cutJump());

    // ready state: kiwi breathes while waiting
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
      // let the launched kiwi tumble off screen; nothing else moves
      return;
    }

    // ------------------------------------------------------------ running
    this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    this.distance += this.speed * dt;
    this.scroll(this.speed * dt);

    const body = this.player.body as ArcadeBody;
    const grounded = body.blocked.down || body.touching.down;
    const duckHeld = this.duckKeys.some((k) => k.isDown);

    // fast fall: holding down mid-air slams the kiwi back to the ground
    if (!grounded && duckHeld) {
      body.velocity.y = Math.max(body.velocity.y, FAST_FALL_VY);
    }

    if (grounded) {
      this.airFlaps = 1;
      this.setDuck(duckHeld);
    } else {
      this.setDuck(false);
    }

    if (this.wasAirborne && grounded) {
      this.dust.explode(6, this.player.x, this.player.y - 2);
      sfx.thump();
      this.player.setScale(1.12, 0.86);
      this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 120 });
    }
    this.wasAirborne = !grounded;

    // player texture / run animation
    if (!this.ducking) {
      if (!grounded) {
        this.setPlayerTexture("kiwi_jump");
      } else {
        const stepDur = Phaser.Math.Clamp(0.18 - this.speed / 6000, 0.08, 0.18);
        this.runAnimT += dt;
        if (this.runAnimT >= stepDur) {
          this.runAnimT = 0;
          this.runFrameB = !this.runFrameB;
        }
        this.setPlayerTexture(this.runFrameB ? "kiwi_run2" : "kiwi_run1");
      }
    }

    // enemy walk/flap animation
    this.enemyAnimT += dt;
    if (this.enemyAnimT >= 0.13) {
      this.enemyAnimT = 0;
      this.enemyFrameB = !this.enemyFrameB;
    }

    // move obstacles
    this.obstacles.children.iterate((child) => {
      const o = child as Phaser.Physics.Arcade.Sprite;
      const mul = (o.getData("vxMul") as number) ?? 1;
      o.x -= this.speed * mul * dt;
      const baseY = o.getData("baseY") as number | undefined;
      if (baseY !== undefined) {
        o.y = baseY + Math.sin(this.time.now * 0.008 + (o.getData("bobPhase") as number)) * 4;
      }
      const frames = o.getData("frames") as [string, string] | undefined;
      if (frames) o.setTexture(frames[this.enemyFrameB ? 1 : 0]);
      if (o.x < -150) o.destroy();
      return true;
    });

    // move fruit
    this.fruits.children.iterate((child) => {
      const f = child as Phaser.Physics.Arcade.Sprite;
      f.x -= this.speed * dt;
      f.rotation += 2.2 * dt;
      if (f.x < -60) f.destroy();
      return true;
    });

    // score
    const score = this.currentScore();
    if (score !== this.lastEmittedScore) {
      this.lastEmittedScore = score;
      this.game.events.emit("score", score);
    }
  }

  private scroll(px: number) {
    this.clouds.tilePositionX += px * 0.08;
    this.hillsFar.tilePositionX += px * 0.18;
    this.hillsNear.tilePositionX += px * 0.45;
    this.groundTile.tilePositionX += px;
  }

  private currentScore() {
    return Math.floor(this.distance / 10) + this.bonus;
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
      if (this.time.now > this.deadAt + 600) this.resetRun();
      return;
    }

    const body = this.player.body as ArcadeBody;
    const grounded = body.blocked.down || body.touching.down;

    if (this.ducking && grounded) this.setDuck(false);

    if (grounded) {
      body.velocity.y = JUMP_VY;
      sfx.jump();
      this.player.setScale(0.9, 1.12);
      this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 140 });
    } else if (this.airFlaps > 0) {
      this.airFlaps--;
      body.velocity.y = FLAP_VY;
      sfx.flap();
      this.feathers.explode(6, this.player.x, this.player.y - 24);
    }
  }

  private cutJump() {
    if (this.phase !== "running") return;
    const body = this.player.body as ArcadeBody;
    if (body.velocity.y < JUMP_CUT_VY) body.velocity.y = JUMP_CUT_VY;
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

    const body = this.player.body as ArcadeBody;
    body.checkCollision.none = false;
    this.player.setCollideWorldBounds(true);
    this.player.setFlipY(false);
    this.player.setAngle(0);
    this.player.setScale(1);
    this.ducking = false;
    this.setPlayerTexture("kiwi_run1");
    this.standBody();
    this.player.setPosition(150, this.groundTop);
    body.setVelocity(0, 0);

    this.speed = START_SPEED;
    this.distance = 0;
    this.bonus = 0;
    this.fruitCount = 0;
    this.lastEmittedScore = -1;
    this.airFlaps = 1;
    this.wasAirborne = false;
    this.comboStep = 0;
    this.phase = "running";
    this.safeUntil = this.time.now + 900;

    this.game.events.emit("started");
    this.game.events.emit("score", 0);
    this.game.events.emit("fruit", 0);

    sfx.start();
    startMusic();
    this.scheduleSpawn();
    this.scheduleFruit();
  }

  private die(killer: Killer) {
    if (this.phase !== "running") return;
    this.phase = "dead";
    this.deadAt = this.time.now;

    this.nextSpawn?.remove(false);
    this.nextFruit?.remove(false);
    stopMusic();
    sfx.die();

    this.cameras.main.shake(220, 0.008);
    this.feathers.explode(14, this.player.x, this.player.y - 24);

    // Mario-style death: pop up, spin, tumble off screen
    const body = this.player.body as ArcadeBody;
    body.checkCollision.none = true;
    this.player.setCollideWorldBounds(false);
    this.setPlayerTexture("kiwi_jump");
    this.player.setFlipY(true);
    body.setVelocity(-60, -560);
    this.tweens.add({ targets: this.player, angle: 380, duration: 900 });

    const score = this.currentScore();
    const record = score > this.best && score > 0;
    if (record) {
      this.best = score;
      localStorage.setItem(BEST_KEY, String(score));
      this.time.delayedCall(650, () => sfx.record());
    }
    this.game.events.emit("dead", { score, best: this.best, record, killer });
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
      { w: 3, run: () => this.spawnGround("rock1", null, "rock", x) },
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
        { w: 2, run: () => this.spawnGround("rock2", null, "rock", x) }
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
    const o = this.obstacles.create(x, this.groundTop, tex) as Phaser.Physics.Arcade.Sprite;
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
    const baseY = this.groundTop - 50;
    const o = this.obstacles.create(x, baseY, "hawk1") as Phaser.Physics.Arcade.Sprite;
    o.setDepth(9);
    o.setData("killer", "hawk");
    o.setData("vxMul", 1.28);
    o.setData("frames", ["hawk1", "hawk2"]);
    o.setData("baseY", baseY);
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
      // low line — grab while running
      for (let i = 0; i < 4; i++) this.spawnFruit(x0 + i * 42, this.groundTop - 44);
    } else if (kind === 1) {
      // arc — follows a jump curve
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        this.spawnFruit(x0 + i * 46, this.groundTop - 44 - Math.sin(t * Math.PI) * 110);
      }
    } else {
      // high line — needs a jump (or a flap)
      for (let i = 0; i < 3; i++) this.spawnFruit(x0 + i * 44, this.groundTop - 150);
    }
  }

  private spawnFruit(x: number, y: number) {
    const f = this.fruits.create(x, y, "fruit") as Phaser.Physics.Arcade.Sprite;
    f.setDepth(8);
    (f.body as ArcadeBody).setCircle(11);
  }

  private collectFruit(f: Phaser.Physics.Arcade.Sprite) {
    const { x, y } = f;
    f.destroy();
    this.bonus += 15;
    this.fruitCount++;

    const now = this.time.now;
    this.comboStep = now - this.lastPickupAt < 1600 ? this.comboStep + 1 : 0;
    this.lastPickupAt = now;
    sfx.pickup(this.comboStep);

    this.sparks.explode(8, x, y);
    const txt = this.add
      .text(x, y - 8, "+15", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: "#1e5c24",
      })
      .setOrigin(0.5)
      .setDepth(12);
    this.tweens.add({
      targets: txt,
      y: y - 54,
      alpha: 0,
      duration: 650,
      onComplete: () => txt.destroy(),
    });

    this.game.events.emit("fruit", this.fruitCount);
  }
}
