import Phaser from "phaser";

type RunState = {
  distance: number;
  alive: boolean;
  speed: number;
};

export class RunScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private nextSpawn?: Phaser.Time.TimerEvent;
private groundTopY = 0;


  private state: RunState = { distance: 0, alive: true, speed: 280 };

private keySpace?: Phaser.Input.Keyboard.Key;
private keyUp?: Phaser.Input.Keyboard.Key;


  private safeUntilMs = 0; // no spawning right after reset

  constructor() {
    super("Run");
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.groundTopY = h - 120;

    const groundTopY = h - 120; // ground top edge (because ground rect is 120px tall, centered at h-60)


    // Ground
    this.ground = this.add.rectangle(w / 2, h - 60, w, 120, 0x1b2a3a);
    this.physics.add.existing(this.ground, true);

    // Kiwi texture (greybox)
    const g = this.add.graphics();
    g.fillStyle(0x9ad36a, 1);
    g.fillRoundedRect(0, 0, 44, 34, 10);
    g.generateTexture("kiwi", 44, 34);
    g.destroy();

this.player = this.physics.add.sprite(160, groundTopY - 20, "kiwi");

    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.ground as any);

    // Obstacles
    this.obstacles = this.physics.add.group({
      immovable: true,
      allowGravity: false,
    });

    this.physics.add.overlap(
      this.player,
      this.obstacles,
      () => this.die(),
      undefined,
      this
    );

    // Input (ONE place only)
    this.input.on("pointerdown", () => this.handleAction());



    const up = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    up?.on("down", () => this.handleAction());

this.keySpace = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
this.keyUp = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);



this.events.on(Phaser.Scenes.Events.PAUSE, () => console.log("[RunScene] PAUSED"));
this.events.on(Phaser.Scenes.Events.RESUME, () => console.log("[RunScene] RESUMED"));
this.events.on(Phaser.Scenes.Events.SLEEP, () => console.log("[RunScene] SLEPT"));
this.events.on(Phaser.Scenes.Events.WAKE, () => console.log("[RunScene] WOKE"));

    this.resetRun();
  }

  private scheduleNextSpawn() {
  // kill previous schedule (important on reset)
  this.nextSpawn?.remove(false);

  if (!this.state.alive) return;

  // gap in pixels -> converted to time based on speed
  const minGapPx = Phaser.Math.Clamp(320 + (this.state.speed - 280) * 0.35, 320, 560);

  // add some randomness so it doesn't feel like a metronome
  const jitterPx = Phaser.Math.Between(-80, 140);
  const gapPx = Phaser.Math.Clamp(minGapPx + jitterPx, 260, 640);

  const delayMs = Math.max(350, (gapPx / this.state.speed) * 1000);

  this.nextSpawn = this.time.delayedCall(delayMs, () => {
    if (!this.state.alive) return;
    if (this.time.now < this.safeUntilMs) {
      this.scheduleNextSpawn();
      return;
    }

    this.spawnObstacleAt(this.scale.width + 80);
    this.scheduleNextSpawn();
  });
}





  update(_t: number, dtMs: number) {
    // Keyboard polling (works even if keydown events get flaky)
if (this.keySpace?.isDown || this.keyUp?.isDown) {
  // simple edge guard so it doesn't spam while held
  if ((this.keySpace && Phaser.Input.Keyboard.JustDown(this.keySpace)) ||
      (this.keyUp && Phaser.Input.Keyboard.JustDown(this.keyUp))) {
    this.handleAction();
  }
}

    if (!this.state.alive) return;

    const dt = dtMs / 1000;

    this.state.distance += this.state.speed * dt;
    this.state.speed += 6 * dt; // ramps up slowly

    // Move obstacles left
    this.obstacles.children.iterate((child) => {
      const o = child as Phaser.Physics.Arcade.Sprite;
      o.x -= this.state.speed * dt;
      if (o.x < -120) o.destroy();
      return true;
    });

    this.game.events.emit("distance", Math.floor(this.state.distance / 10));
  }

  private handleAction() {
    if (!this.state.alive) {
      this.resetRun();
      return;
    }
    this.jump();
  }

  private isGrounded() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    return body.blocked.down || body.touching.down;
  }

  private jump() {
    if (!this.isGrounded()) return;
    this.player.setVelocityY(-640);
  }
 

private spawnObstacleAt(x: number) {
  const ow = Phaser.Math.Between(26, 48);
  const oh = Phaser.Math.Between(28, 60);
  const key = `ob_${ow}x${oh}`;

  if (!this.textures.exists(key)) {
    const g = this.add.graphics();
    g.fillStyle(0xffd166, 1);
    g.fillRect(0, 0, ow, oh);
    g.generateTexture(key, ow, oh);
    g.destroy();
  }

  const y = this.groundTopY - oh / 2;
  const o = this.physics.add.sprite(x, y, key);
  o.setImmovable(true);
  o.body.setAllowGravity(false);
  this.obstacles.add(o);
}


  private die() {
    if (!this.state.alive) return;
    this.state.alive = false;
    this.cameras.main.shake(120, 0.006);
    this.game.events.emit("dead");
  }

  private resetRun() {
    // Clear obstacles + reset spawn state
    this.obstacles.clear(true, true);

    const h = this.scale.height; 
const groundTopY = h - 120;
this.player.setPosition(160, groundTopY - 20);

    this.player.setVelocity(0, 0);

    this.state = { distance: 0, alive: true, speed: 280 };

    // Important: give player a short grace period + reset lastSpawnX
    this.safeUntilMs = this.time.now + 700; // 0.7s no spawns after restart

    this.game.events.emit("distance", 0);
    this.game.events.emit("alive");
    this.scheduleNextSpawn();
 
  }
}
  