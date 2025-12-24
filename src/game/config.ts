import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { RunScene } from "./scenes/RunScene";
import { UIScene } from "./scenes/UIScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0b1020",
  fps: {
  target: 60,
  min: 10,
  forceSetTimeOut: true,
},

  // optional, aber nice:
  input: { keyboard: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 900,
    height: 500,
  },
  physics: {
    default: "arcade",
arcade: {
  gravity: { x: 0, y: 1400 },
  debug: false,
},

  },
  scene: [BootScene, RunScene, UIScene],
  
};
