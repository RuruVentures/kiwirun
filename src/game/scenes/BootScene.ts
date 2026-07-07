import Phaser from "phaser";
import { makeSprites, makeBackgrounds } from "../art";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    makeSprites(this);
    makeBackgrounds(this, this.scale.width, this.scale.height);
    this.scene.start("Run");
    this.scene.launch("UI");
  }
}
