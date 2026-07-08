import Phaser from "phaser";
import {
  fetchTop,
  submitScore,
  qualifies,
  flagEmoji,
  GAME_URL,
  type ScoreRow,
} from "../leaderboard";

type DeadPayload = {
  score: number;
  best: number;
  record: boolean;
  killer: "possum" | "rat" | "rock" | "hawk";
};

type HelperPayload = {
  state: "progress" | "ready" | "active" | "done";
  n?: number;
  total?: number;
  type?: "kea" | "ranger" | "quad" | "plane";
  secs?: number;
};

const HELPER_NAMES: Record<string, string> = {
  kea: "KEA",
  ranger: "RANGER",
  quad: "QUAD BIKE",
  plane: "✈ KIWI AIR FORCE",
};

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const BEST_KEY = "kiwirun_best";

const DEATH_LINES: Record<DeadPayload["killer"], string[]> = {
  possum: [
    "Flattened by a possum!",
    "The possum came from Australia. Without a visa.",
    "Possum 1 : Kiwi 0",
  ],
  rat: [
    "Tripped over a rat. Ouch.",
    "The rat had right of way.",
    "Ratatouille strikes back!",
  ],
  rock: [
    "That was a rock. It's been there forever.",
    "The rock didn't even brake.",
    "Geology 1 : Kiwi 0",
  ],
  hawk: [
    "The kārearea struck from above!",
    "Note: falcons can fly. Kiwis can't.",
    "FROM ABOVE! They always come from above!",
  ],
};

export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private fruitText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private helperTween?: Phaser.Tweens.Tween;
  private musicText!: Phaser.GameObjects.Text;
  private buddyBtn!: Phaser.GameObjects.Container;
  private buddyIcon!: Phaser.GameObjects.Image;
  private buddyBtnTween?: Phaser.Tweens.Tween;
  private startPanel!: Phaser.GameObjects.Container;
  private overPanel!: Phaser.GameObjects.Container;
  private overLine!: Phaser.GameObjects.Text;
  private overScore!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private recordTween?: Phaser.Tweens.Tween;
  private topListText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private shareBtn!: Phaser.GameObjects.Text;
  private entryScore = 0;
  private lastScore = 0;
  private deathCount = 0;

  constructor() {
    super("UI");
  }

  create() {
    const w = this.scale.width;
    const best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;

    // ----------------------------------------------------------- HUD
    this.scoreText = this.add
      .text(w - 24, 16, "0", {
        fontFamily: FONT,
        fontSize: "34px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#1b3a1e",
        strokeThickness: 5,
      })
      .setOrigin(1, 0);

    this.bestText = this.add
      .text(w - 24, 56, `BEST ${best}`, {
        fontFamily: FONT,
        fontSize: "14px",
        fontStyle: "bold",
        color: "#e9f5e6",
        stroke: "#1b3a1e",
        strokeThickness: 3,
      })
      .setOrigin(1, 0);

    this.add.image(30, 30, "fruit").setScale(1.1);
    this.fruitText = this.add.text(48, 20, "× 0", {
      fontFamily: FONT,
      fontSize: "20px",
      fontStyle: "bold",
      color: "#ffffff",
      stroke: "#1b3a1e",
      strokeThickness: 4,
    });

    this.helperText = this.add.text(20, 48, "Buddy 0/8", {
      fontFamily: FONT,
      fontSize: "14px",
      fontStyle: "bold",
      color: "#cfe8c8",
      stroke: "#1b3a1e",
      strokeThickness: 3,
    });

    this.musicText = this.add
      .text(16, this.scale.height - 24, "M music: on", {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#1b3a1e",
        strokeThickness: 3,
      })
      .setAlpha(0.8);

    // buddy button (bottom-right) — the touch/click zone lives in RunScene,
    // this is just the visual
    const bw = this.scale.width;
    const bh = this.scale.height;
    this.buddyBtn = this.add.container(bw - 64, bh - 64);
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x0e2415, 0.85);
    btnBg.fillCircle(0, 0, 44);
    btnBg.lineStyle(3, 0xffe066, 1);
    btnBg.strokeCircle(0, 0, 44);
    this.buddyBtn.add(btnBg);
    this.buddyIcon = this.add.image(0, -8, "kea1").setScale(0.8);
    this.buddyBtn.add(this.buddyIcon);
    this.buddyBtn.add(
      this.add
        .text(0, 24, "HELP!", {
          fontFamily: FONT,
          fontSize: "13px",
          fontStyle: "bold",
          color: "#ffe066",
        })
        .setOrigin(0.5)
    );
    this.buddyBtn.setVisible(false);

    this.startPanel = this.buildStartPanel();
    this.overPanel = this.buildOverPanel();
    this.overPanel.setVisible(false);

    // the Cross Country button (DOM) shows on the title & game-over screens
    const ccBtn = document.getElementById("cc-btn");
    const showCc = (on: boolean) => ccBtn?.classList.toggle("hidden", !on);
    showCc(true);

    // ---------------------------------------------------------- events
    const g = this.game.events;
    g.on("score", (s: number) => this.scoreText.setText(String(s)));
    g.on("fruit", (n: number) => this.fruitText.setText(`× ${n}`));
    g.on("music", (on: boolean) =>
      this.musicText.setText(`M music: ${on ? "on" : "off"}`)
    );
    g.on("started", () => {
      this.startPanel.setVisible(false);
      this.overPanel.setVisible(false);
      this.recordTween?.stop();
      this.closeEntry();
      showCc(false);
    });

    // name entry overlay (plain DOM so mobile keyboards behave)
    const input = document.getElementById("ne-name") as HTMLInputElement | null;
    document
      .getElementById("ne-save")
      ?.addEventListener("click", () => this.submitEntry());
    document
      .getElementById("ne-skip")
      ?.addEventListener("click", () => this.closeEntry());
    input?.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") this.submitEntry();
    });
    g.on("dead", (p: DeadPayload) => this.showGameOver(p));
    g.on("helper", (p: HelperPayload) => this.showHelper(p));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      g.off("score");
      g.off("fruit");
      g.off("music");
      g.off("started");
      g.off("dead");
      g.off("helper");
    });
  }

  // ------------------------------------------------------------ panels
  private panelBg(pw: number, ph: number): Phaser.GameObjects.Graphics {
    const bg = this.add.graphics();
    bg.fillStyle(0x0e2415, 0.88);
    bg.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 16);
    bg.lineStyle(3, 0xffe066, 1);
    bg.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 16);
    return bg;
  }

  private buildStartPanel(): Phaser.GameObjects.Container {
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(w / 2, h / 2);

    c.add(this.panelBg(780, 440));

    c.add(
      this.add
        .text(0, -186, "KIWI RUN", {
          fontFamily: FONT,
          fontSize: "46px",
          fontStyle: "bold",
          color: "#ffe066",
          stroke: "#3a2a00",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
    );
    c.add(
      this.add
        .text(0, -148, "A flightless bird. Endless problems. One global top 10.", {
          fontFamily: FONT,
          fontSize: "14px",
          color: "#cfe8c8",
        })
        .setOrigin(0.5)
    );

    const touch = this.sys.game.device.input.touch;
    const controls = touch
      ? [
          "TAP  —  jump",
          "TAP again mid-air  —  FLAP (double jump)",
          "HOLD LEFT half  —  duck / slide",
          "HOLD LEFT mid-air  —  dive down fast",
          "HELP! button  —  call your buddy",
        ]
      : [
          "SPACE / ↑ / click  —  jump",
          "press again mid-air  —  FLAP (double jump)",
          "release early  —  shorter jump",
          "hold ↓ / S  —  duck  ·  mid-air: dive",
          "E  —  call your buddy   ·   M  —  music",
        ];
    const rules = [
      "Dodge possums, rats & the kārearea falcon",
      "The falcon flies low  —  DUCK under it!",
      "Hold duck on a DOWNHILL  —  slide & smash",
      "pests for +25  ·  rocks NEVER break: jump!",
      "Slide over a hill crest for big air  —  boing!",
      "Kiwifruit = +15  ·  8 of them = a random buddy:",
      "kea, ranger, QUAD… and legends tell of a plane ✈",
    ];

    const col = (
      x: number,
      title: string,
      lines: string[],
      colTitleColor: string
    ) => {
      c.add(
        this.add
          .text(x, -118, title, {
            fontFamily: FONT,
            fontSize: "16px",
            fontStyle: "bold",
            color: colTitleColor,
          })
          .setOrigin(0, 0)
      );
      lines.forEach((s, i) =>
        c.add(
          this.add
            .text(x, -90 + i * 20, s, {
              fontFamily: FONT,
              fontSize: "13px",
              color: "#ffffff",
            })
            .setOrigin(0, 0)
        )
      );
    };
    col(-360, "🎮 CONTROLS", controls, "#9fe066");
    col(10, "🥝 HOW TO PLAY", rules, "#ffe066");

    // cast line-up: pests in red, friends in green
    const lineup: { tex: string; name: string; friend?: boolean }[] = [
      { tex: "kiwi_run1", name: "YOU", friend: true },
      { tex: "possum1", name: "POSSUM" },
      { tex: "rat1", name: "RAT" },
      { tex: "hawk1", name: "KĀREAREA" },
      { tex: "kea1", name: "KEA ♥", friend: true },
      { tex: "ranger1", name: "RANGER ♥", friend: true },
    ];
    const startX = -290;
    lineup.forEach((e, i) => {
      const x = startX + i * 116;
      c.add(this.add.image(x, 96, e.tex));
      c.add(
        this.add
          .text(x, 136, e.name, {
            fontFamily: FONT,
            fontSize: "11px",
            fontStyle: "bold",
            color: e.friend ? "#9fe066" : "#ffb3a0",
          })
          .setOrigin(0.5)
      );
    });

    const go = this.add
      .text(0, 178, touch ? "▶  TAP to start" : "▶  Press SPACE", {
        fontFamily: FONT,
        fontSize: "20px",
        fontStyle: "bold",
        color: "#ffe066",
      })
      .setOrigin(0.5);
    c.add(go);
    this.tweens.add({
      targets: go,
      alpha: 0.25,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    return c;
  }

  private buildOverPanel(): Phaser.GameObjects.Container {
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(w / 2, h / 2 - 14);

    c.add(this.panelBg(720, 310));

    // left column: what happened
    c.add(
      this.add
        .text(-180, -100, "SPLAT!", {
          fontFamily: FONT,
          fontSize: "44px",
          fontStyle: "bold",
          color: "#ff6b5e",
          stroke: "#3a0e08",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
    );

    this.overLine = this.add
      .text(-180, -54, "", {
        fontFamily: FONT,
        fontSize: "15px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: 310 },
      })
      .setOrigin(0.5);
    c.add(this.overLine);

    this.overScore = this.add
      .text(-180, -10, "", {
        fontFamily: FONT,
        fontSize: "20px",
        fontStyle: "bold",
        color: "#cfe8c8",
      })
      .setOrigin(0.5);
    c.add(this.overScore);

    this.recordText = this.add
      .text(-180, 30, "★ NEW RECORD! ★", {
        fontFamily: FONT,
        fontSize: "20px",
        fontStyle: "bold",
        color: "#ffe066",
        stroke: "#3a2a00",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    c.add(this.recordText);

    // right column: global top 10
    c.add(
      this.add
        .text(180, -118, "🌍 GLOBAL TOP 10", {
          fontFamily: FONT,
          fontSize: "18px",
          fontStyle: "bold",
          color: "#9fe066",
        })
        .setOrigin(0.5, 0)
    );

    this.topListText = this.add
      .text(180, -88, "loading…", {
        fontFamily: "ui-monospace, Consolas, monospace",
        fontSize: "14px",
        color: "#e9f5e6",
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0);
    c.add(this.topListText);

    this.rankText = this.add
      .text(-180, 62, "", {
        fontFamily: FONT,
        fontSize: "16px",
        fontStyle: "bold",
        color: "#9fe066",
      })
      .setOrigin(0.5);
    c.add(this.rankText);

    // share your score (and the game) — native share sheet on phones,
    // clipboard on desktop
    this.shareBtn = this.add
      .text(-180, 100, "📤  Share score", {
        fontFamily: FONT,
        fontSize: "14px",
        fontStyle: "bold",
        color: "#ffe066",
        backgroundColor: "#1c3a26",
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.shareBtn.on("pointerdown", () => {
      this.input.stopPropagation(); // don't let the tap restart the run
      this.shareScore();
    });
    c.add(this.shareBtn);

    c.add(
      this.add
        .text(0, 130, "SPACE / tap = play again  ·  M = music on/off", {
          fontFamily: FONT,
          fontSize: "14px",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setAlpha(0.85)
    );

    return c;
  }

  // ------------------------------------------------------- leaderboard
  private renderTop(rows: ScoreRow[], highlight?: ScoreRow) {
    if (!rows.length) {
      this.topListText.setText("nobody yet —\nbe the first legend!");
      return;
    }
    let marked = false;
    const lines = rows.map((r, i) => {
      const flag = flagEmoji(r.country);
      const line = `${String(i + 1).padStart(2)}. ${r.name.padEnd(12)} ${String(
        r.score
      ).padStart(6)}${flag ? " " + flag : ""}`;
      if (
        !marked &&
        highlight &&
        r.name === highlight.name &&
        r.score === highlight.score
      ) {
        marked = true;
        return line + " ◄";
      }
      return line;
    });
    this.topListText.setText(lines.join("\n"));
  }

  private async loadBoard(p: DeadPayload) {
    const myDeath = this.deathCount;
    const top = await fetchTop();
    if (myDeath !== this.deathCount || !this.overPanel.visible) return;
    if (top === null) {
      this.topListText.setText("offline —\nleaderboard unavailable");
      return;
    }
    this.renderTop(top);
    if (qualifies(top, p.score)) this.openEntry(p.score);
  }

  private openEntry(score: number) {
    this.entryScore = score;
    const overlay = document.getElementById("name-entry");
    const input = document.getElementById("ne-name") as HTMLInputElement | null;
    const scoreEl = document.getElementById("ne-score");
    if (!overlay || !input) return;
    if (scoreEl)
      scoreEl.textContent = `${score} points — you made the global top 10!`;
    input.value = localStorage.getItem("kiwirun_name") ?? "";
    overlay.classList.remove("hidden");
    if (this.game.input.keyboard) this.game.input.keyboard.enabled = false;
    setTimeout(() => input.focus(), 50);
  }

  private closeEntry() {
    document.getElementById("name-entry")?.classList.add("hidden");
    if (this.game.input.keyboard) this.game.input.keyboard.enabled = true;
  }

  private submitEntry() {
    const input = document.getElementById("ne-name") as HTMLInputElement | null;
    const name = (input?.value ?? "").trim().slice(0, 12);
    if (name.length < 2) {
      input?.focus();
      return;
    }
    localStorage.setItem("kiwirun_name", name);
    const score = this.entryScore;
    const myDeath = this.deathCount;
    this.closeEntry();
    this.rankText.setText("submitting…");
    void submitScore(name, score).then((res) => {
      if (myDeath !== this.deathCount || !this.overPanel.visible) return;
      if (res.ok) {
        this.renderTop(res.top, { name, score });
        this.rankText.setText(
          res.rank === 1
            ? "👑 WORLD #1, KIWI LEGEND!"
            : `You're world #${res.rank}!`
        );
        return;
      }
      if (res.reason === "name") {
        this.rankText.setText("That name won't fly 😅 pick another!");
        this.time.delayedCall(900, () => {
          if (myDeath === this.deathCount && this.overPanel.visible) {
            this.openEntry(score);
          }
        });
      } else if (res.reason === "rate") {
        this.rankText.setText("Whoa, slow down — try again in a bit!");
      } else {
        this.rankText.setText("Submit failed — score not accepted.");
      }
    });
  }

  private showHelper(p: HelperPayload) {
    this.helperTween?.stop();
    this.helperText.setAlpha(1);
    this.buddyBtnTween?.stop();
    if (p.state === "ready") {
      // the button shows WHO is coming
      const iconScale: Record<string, number> = {
        kea: 0.8,
        ranger: 0.5,
        quad: 0.72,
        plane: 0.5,
      };
      const type = p.type ?? "kea";
      this.buddyIcon.setTexture(`${type}1`).setScale(iconScale[type] ?? 0.7);
      this.buddyBtn.setVisible(true).setScale(1);
      this.buddyBtnTween = this.tweens.add({
        targets: this.buddyBtn,
        scale: 1.12,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: "sine.inout",
      });
    } else {
      this.buddyBtn.setVisible(false);
    }
    if (p.state === "ready") {
      const name = HELPER_NAMES[p.type ?? "kea"] ?? "a friend";
      const hint = this.sys.game.device.input.touch
        ? `Tap HELP! → ${name}!`
        : `E = call the ${name}!`;
      this.helperText.setText(hint).setColor("#ffe066");
      this.helperTween = this.tweens.add({
        targets: this.helperText,
        alpha: 0.3,
        duration: 400,
        yoyo: true,
        repeat: -1,
      });
    } else if (p.state === "active") {
      const name = HELPER_NAMES[p.type ?? "kea"] ?? "BUDDY";
      this.helperText.setText(`${name}! ${p.secs}s`).setColor("#ffb35e");
    } else {
      this.helperText
        .setText(`Buddy ${p.n ?? 0}/${p.total ?? 8}`)
        .setColor("#cfe8c8");
    }
  }

  private shareScore() {
    const url = GAME_URL;
    const text = `🥝 I scored ${this.lastScore} points in KIWI RUN! Think you can beat me?`;
    const nav = navigator;
    if (typeof nav.share === "function") {
      nav.share({ title: "Kiwi Run", text, url }).catch(() => undefined);
      return;
    }
    void nav.clipboard
      ?.writeText(`${text} ${url}`)
      .then(() => {
        this.shareBtn.setText("✅  Copied — paste anywhere!");
        this.time.delayedCall(2000, () =>
          this.shareBtn.setText("📤  Share score")
        );
      })
      .catch(() => undefined);
  }

  private showGameOver(p: DeadPayload) {
    this.deathCount++;
    this.lastScore = p.score;
    const lines = DEATH_LINES[p.killer] ?? ["Kiwi meets physics."];
    this.overLine.setText(lines[Math.floor(Math.random() * lines.length)]);
    this.overScore.setText(`Score: ${p.score}    Best: ${p.best}`);
    this.bestText.setText(`BEST ${p.best}`);
    this.rankText.setText("");
    this.topListText.setText("loading…");
    void this.loadBoard(p);

    this.recordText.setVisible(p.record);
    this.recordTween?.stop();
    if (p.record) {
      this.recordText.setScale(1);
      this.recordTween = this.tweens.add({
        targets: this.recordText,
        scale: 1.15,
        duration: 300,
        yoyo: true,
        repeat: -1,
        ease: "sine.inout",
      });
    }

    this.overPanel.setVisible(true);
    document.getElementById("cc-btn")?.classList.remove("hidden");
  }
}
