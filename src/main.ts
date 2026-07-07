import Phaser from "phaser";
import { gameConfig } from "./game/config";
import "./style.css";

// NOTE: no manual preventDefault on Space/Arrows here! Phaser ignores keydown
// events that are already defaultPrevented — it captures game keys itself.
const game = new Phaser.Game(gameConfig);

// handy for debugging in the browser console
(window as unknown as { __game: Phaser.Game }).__game = game;

document.body.style.overflow = "hidden";

// Make canvas focusable and keep focus on pointerdown
setTimeout(() => {
  const c = game.canvas;
  if (!c) return;
  c.setAttribute("tabindex", "0");
  c.focus();
  window.addEventListener("pointerdown", () => c.focus(), { passive: true });
}, 0);

// Keep the loop alive if blur/visibility events try to sleep it
game.events.on(Phaser.Core.Events.BLUR, () => game.loop.wake());
game.events.on(Phaser.Core.Events.HIDDEN, () => game.loop.wake());
