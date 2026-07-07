import Phaser from "phaser";

type DeadPayload = {
  score: number;
  best: number;
  record: boolean;
  killer: "possum" | "rat" | "rock" | "hawk";
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
  private musicText!: Phaser.GameObjects.Text;
  private startPanel!: Phaser.GameObjects.Container;
  private overPanel!: Phaser.GameObjects.Container;
  private overLine!: Phaser.GameObjects.Text;
  private overScore!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private recordTween?: Phaser.Tweens.Tween;

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

    this.musicText = this.add
      .text(16, this.scale.height - 24, "M music: on", {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#1b3a1e",
        strokeThickness: 3,
      })
      .setAlpha(0.8);

    this.startPanel = this.buildStartPanel();
    this.overPanel = this.buildOverPanel();
    this.overPanel.setVisible(false);

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
    });
    g.on("dead", (p: DeadPayload) => this.showGameOver(p));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      g.off("score");
      g.off("fruit");
      g.off("music");
      g.off("started");
      g.off("dead");
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
    const c = this.add.container(w / 2, h / 2 - 14);

    c.add(this.panelBg(600, 320));

    c.add(
      this.add
        .text(0, -126, "KIWI RUN", {
          fontFamily: FONT,
          fontSize: "52px",
          fontStyle: "bold",
          color: "#ffe066",
          stroke: "#3a2a00",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
    );
    c.add(
      this.add
        .text(0, -84, "A flightless bird. Endless problems.", {
          fontFamily: FONT,
          fontSize: "15px",
          color: "#cfe8c8",
        })
        .setOrigin(0.5)
    );

    const lines = [
      "SPACE / ↑ / click — jump  ·  press again mid-air: FLAP!",
      "↓ / S — duck (watch out for the falcon!)  ·  mid-air: dive",
      "Collect kiwifruit: +15 points",
    ];
    lines.forEach((s, i) =>
      c.add(
        this.add
          .text(0, -48 + i * 24, s, {
            fontFamily: FONT,
            fontSize: "14px",
            color: "#ffffff",
          })
          .setOrigin(0.5)
      )
    );

    // enemy line-up
    const lineup: { tex: string; name: string; scale?: number }[] = [
      { tex: "kiwi_run1", name: "YOU" },
      { tex: "possum1", name: "POSSUM" },
      { tex: "rat1", name: "RAT" },
      { tex: "hawk1", name: "KĀREAREA" },
    ];
    const startX = -210;
    lineup.forEach((e, i) => {
      const x = startX + i * 140;
      c.add(this.add.image(x, 52, e.tex).setScale(e.scale ?? 1));
      c.add(
        this.add
          .text(x, 92, e.name, {
            fontFamily: FONT,
            fontSize: "12px",
            fontStyle: "bold",
            color: i === 0 ? "#9fe066" : "#ffb3a0",
          })
          .setOrigin(0.5)
      );
    });

    const go = this.add
      .text(0, 130, "▶  Press SPACE", {
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
    const c = this.add.container(w / 2, h / 2 - 20);

    c.add(this.panelBg(560, 250));

    c.add(
      this.add
        .text(0, -86, "SPLAT!", {
          fontFamily: FONT,
          fontSize: "46px",
          fontStyle: "bold",
          color: "#ff6b5e",
          stroke: "#3a0e08",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
    );

    this.overLine = this.add
      .text(0, -38, "", {
        fontFamily: FONT,
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    c.add(this.overLine);

    this.overScore = this.add
      .text(0, 2, "", {
        fontFamily: FONT,
        fontSize: "20px",
        fontStyle: "bold",
        color: "#cfe8c8",
      })
      .setOrigin(0.5);
    c.add(this.overScore);

    this.recordText = this.add
      .text(0, 40, "★ NEW RECORD! ★", {
        fontFamily: FONT,
        fontSize: "22px",
        fontStyle: "bold",
        color: "#ffe066",
        stroke: "#3a2a00",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    c.add(this.recordText);

    c.add(
      this.add
        .text(0, 88, "SPACE = play again  ·  M = music on/off", {
          fontFamily: FONT,
          fontSize: "14px",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setAlpha(0.85)
    );

    return c;
  }

  private showGameOver(p: DeadPayload) {
    const lines = DEATH_LINES[p.killer] ?? ["Kiwi meets physics."];
    this.overLine.setText(lines[Math.floor(Math.random() * lines.length)]);
    this.overScore.setText(`Score: ${p.score}    Best: ${p.best}`);
    this.bestText.setText(`BEST ${p.best}`);

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
  }
}
