import Phaser from "phaser";
import { RaceClient, randomCode, checkRoom, type RosterPlayer } from "./net";
import { buildCourseObjects, type Course } from "./course";
import { generateTerrain } from "./terrain";

const FINISH_PX = 12000; // ~1200 m to the finish line

function makeCourse(): Course {
  return {
    terrain: generateTerrain(FINISH_PX, Math.random),
    ...buildCourseObjects(Math.random, FINISH_PX),
    finishPx: FINISH_PX,
  };
}

/**
 * The Cross Country lobby — a DOM overlay driven by a RaceClient.
 * Create or join a room by code, see everyone gather, tick "ready", and the
 * host starts a synchronized countdown. The race itself arrives in Phase 3.
 */

let open = false;
export function isLobbyOpen() {
  return open;
}

const $ = (id: string) => document.getElementById(id)!;

export function initLobby(game: Phaser.Game) {
  const overlay = $("lobby");
  const entry = $("lobby-entry");
  const room = $("lobby-room");
  const countdown = $("lobby-countdown");
  const countNum = $("lobby-count-num");
  const nameInput = $("lobby-name") as HTMLInputElement;
  const codeInput = $("lobby-code") as HTMLInputElement;
  const goBtn = $("lobby-go") as HTMLButtonElement;
  const diceBtn = $("lobby-dice") as HTMLButtonElement;
  const roomCode = $("lobby-roomcode");
  const roomSub = $("lobby-room-sub");
  const playersUl = $("lobby-players");
  const readyBox = $("lobby-ready") as HTMLInputElement;
  const startBtn = $("lobby-start") as HTMLButtonElement;
  const entryMsg = $("lobby-entry-msg");
  const roomMsg = $("lobby-room-msg");
  const ccBtn = $("cc-btn");

  let client: RaceClient | undefined;
  let countTimer: number | undefined;
  let checkTimer: number | undefined;
  let checkSeq = 0;

  function resetGo() {
    goBtn.disabled = true;
    goBtn.textContent = "Enter a code";
  }

  // debounced room lookup: flips the button between Create and Join
  function refreshGo() {
    const code = codeInput.value.trim().toUpperCase();
    if (checkTimer) clearTimeout(checkTimer);
    if (!/^[A-Z]{4}$/.test(code)) {
      resetGo();
      return;
    }
    goBtn.disabled = true;
    goBtn.textContent = "Checking…";
    const seq = ++checkSeq;
    checkTimer = window.setTimeout(async () => {
      const { exists } = await checkRoom(code);
      if (seq !== checkSeq || !open) return; // stale / lobby closed
      goBtn.disabled = false;
      goBtn.textContent = exists ? "Join race" : "Create race";
    }, 300);
  }

  const show = (el: HTMLElement) => el.classList.remove("hidden");
  const hide = (el: HTMLElement) => el.classList.add("hidden");

  function setKeyboard(on: boolean) {
    if (game.input.keyboard) game.input.keyboard.enabled = on;
  }

  function openLobby() {
    open = true;
    setKeyboard(false);
    nameInput.value = localStorage.getItem("kiwirun_name") ?? "";
    codeInput.value = "";
    entryMsg.textContent = "";
    resetGo();
    show(entry);
    hide(room);
    hide(countdown);
    show(overlay);
    setTimeout(() => nameInput.focus(), 50);
  }

  function closeLobby() {
    if (countTimer) clearInterval(countTimer);
    countTimer = undefined;
    client?.close();
    client = undefined;
    hide(overlay);
    open = false;
    setKeyboard(true);
  }

  function connectRoom(code: string, name: string) {
    localStorage.setItem("kiwirun_name", name);
    client = new RaceClient();
    client.on({
      roster: (players, youId) => renderRoom(players, youId),
      countdown: (ms, course) => runCountdown(ms, course),
      cantStart: (reason) => {
        roomMsg.textContent = reason;
      },
      closed: () => {
        if (open) roomMsg.textContent = "Connection lost.";
      },
    });
    client.connect(code, name);
    roomCode.textContent = code;
    readyBox.checked = false;
    roomMsg.textContent = "";
    hide(entry);
    show(room);
  }

  function renderRoom(players: RosterPlayer[], youId: string) {
    playersUl.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "lobby-dot";
      dot.style.background = "#" + p.color.toString(16).padStart(6, "0");
      const name = document.createElement("span");
      name.className = "lobby-pname";
      name.textContent = p.name + (p.id === youId ? " (you)" : "");
      const tag = document.createElement("span");
      tag.className = "lobby-tag" + (p.ready ? " lobby-ready-yes" : "");
      tag.textContent = (p.host ? "👑 " : "") + (p.ready ? "✓ ready" : "…");
      li.append(dot, name, tag);
      playersUl.append(li);
    }

    const iAmHost = client?.isHost() ?? false;
    roomSub.textContent = iAmHost
      ? `📣 Read out code ${client?.code} — friends type it to join you!`
      : "You're in! Tick “I'm ready”, then wait for GO 🏁";
    const allReady = players.length > 0 && players.every((p) => p.ready);
    startBtn.classList.toggle("hidden", !iAmHost);
    startBtn.disabled = !allReady;
    startBtn.textContent = allReady
      ? "Start race!"
      : "Waiting for everyone…";
  }

  function runCountdown(ms: number, course: Course) {
    hide(entry);
    hide(room);
    show(countdown);
    const end = performance.now() + ms;
    const tick = () => {
      const left = end - performance.now();
      if (left > 0) {
        countNum.textContent = String(Math.ceil(left / 1000));
        return;
      }
      countNum.textContent = "GO!";
      if (countTimer) clearInterval(countTimer);
      countTimer = undefined;
      // hand off to the race — keep the client alive for position updates
      const c = client;
      hide(overlay);
      open = false;
      setKeyboard(true);
      game.events.emit("raceStart", {
        course,
        client: c,
        youId: c?.youId,
        players: c?.players ?? [],
      });
    };
    tick();
    countTimer = window.setInterval(tick, 100);
  }

  // ---- entry wiring
  ccBtn.addEventListener("click", openLobby);
  $("lobby-back").addEventListener("click", closeLobby);
  $("lobby-leave").addEventListener("click", () => {
    client?.close();
    client = undefined;
    resetGo();
    show(entry);
    hide(room);
  });

  goBtn.addEventListener("click", () => {
    const name = nameInput.value.trim().slice(0, 12);
    const code = codeInput.value.trim().toUpperCase();
    if (name.length < 1) {
      entryMsg.textContent = "Type your name first!";
      nameInput.focus();
      return;
    }
    if (!/^[A-Z]{4}$/.test(code)) {
      entryMsg.textContent = "A code is 4 letters.";
      codeInput.focus();
      return;
    }
    connectRoom(code, name);
  });

  diceBtn.addEventListener("click", () => {
    codeInput.value = randomCode();
    refreshGo();
    codeInput.focus();
  });

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, "");
    refreshGo();
  });
  readyBox.addEventListener("change", () => client?.setReady(readyBox.checked));
  startBtn.addEventListener("click", () => client?.start(makeCourse()));

  // race asked to end — drop the connection and return to the title
  game.events.on("raceExit", () => {
    client?.close();
    client = undefined;
  });

  // let inputs handle their own keys without Phaser interfering
  for (const el of [nameInput, codeInput]) {
    el.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !goBtn.disabled) goBtn.click();
    });
  }

  game.events.on("openLobby", openLobby);
}
