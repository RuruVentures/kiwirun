import Phaser from "phaser";
import { gameConfig } from "./game/config";

// Prevent Space/Arrow keys from scrolling / stealing focus
window.addEventListener(
  "keydown",
  (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
    }
  },
  { passive: false }
);

const game = new Phaser.Game(gameConfig);

// Prevent page scroll from stealing focus
document.body.style.overflow = "hidden";

// Make canvas focusable and keep focus on pointerdown
setTimeout(() => {
  const c = game.canvas;
  if (!c) return;
  c.setAttribute("tabindex", "0");
  c.focus();
  window.addEventListener("pointerdown", () => c.focus(), { passive: true });
}, 0);

game.events.on(Phaser.Core.Events.BLUR, () => {
  // Keep the loop alive if blur triggers unexpectedly
  game.loop.wake();
});

game.events.on(Phaser.Core.Events.HIDDEN, () => {
  // Sometimes visibility changes cause sleep; wake it
  game.loop.wake();
}); 

game.events.on(Phaser.Core.Events.BLUR, () => console.log("[GAME] BLUR"));
game.events.on(Phaser.Core.Events.FOCUS, () => console.log("[GAME] FOCUS"));
game.events.on(Phaser.Core.Events.HIDDEN, () => console.log("[GAME] HIDDEN"));
game.events.on(Phaser.Core.Events.VISIBLE, () => console.log("[GAME] VISIBLE"));


