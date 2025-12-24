import Phaser from "phaser";

export class UIScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super("UI");
  }

  create() {
    this.scoreText = this.add.text(20, 18, "0", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "28px",
      color: "#ffffff",
    });

    this.hintText = this.add.text(20, 54, "Tap to jump.", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "#b6c2d9",
    });

    this.game.events.on("distance", (d: number) =>
      this.scoreText.setText(String(d))
    );
    this.game.events.on("dead", () =>
      this.hintText.setText("Kiwi met physics. Tap to try again.")
    );
    this.game.events.on("alive", () =>
      this.hintText.setText("Tap to jump.")
    );

    const debug = this.add.text(20, 78, "", {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "12px",
  color: "#9fb0cc",
});

this.time.addEvent({
  delay: 250,
  loop: true,
  callback: () => {
    const fps = Math.round(this.game.loop.actualFps);
    const now = Math.round(this.time.now);
    debug.setText(`fps=${fps}  uiNow=${now}`);
  },
});

  }
}
