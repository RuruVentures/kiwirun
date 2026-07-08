import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { initLobby } from "./game/lobby";
import "./style.css";

// NOTE: no manual preventDefault on Space/Arrows here! Phaser ignores keydown
// events that are already defaultPrevented — it captures game keys itself.
const game = new Phaser.Game(gameConfig);

// handy for debugging in the browser console
(window as unknown as { __game: Phaser.Game }).__game = game;

// Cross Country lobby (DOM overlay)
initLobby(game);

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

// Mobile polish: go fullscreen + lock landscape on the first touch
// (Android; iOS politely ignores both — that's fine)
let fullscreenTried = false;
window.addEventListener("pointerdown", (e) => {
  if (fullscreenTried || e.pointerType !== "touch") return;
  fullscreenTried = true;
  document.documentElement
    .requestFullscreen?.({ navigationUI: "hide" })
    .then(() => {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      return orientation.lock?.("landscape");
    })
    .catch(() => undefined);
});

// no long-press context menu over the game
window.addEventListener("contextmenu", (e) => e.preventDefault());
