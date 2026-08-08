/**
 * i-crypt — Decode page glue (the cinematic replay)
 * ---------------------------------------------------------------
 * Wires the decode form, board replay, progress, reveal typing and
 * the speed / pause controls. Sounds come from the local sound/
 * folder — always on, matched to the move type, game end only at
 * the very end. Cipher logic belongs to engine.js.
 * ---------------------------------------------------------------
 */
"use strict";

let decSpd = 1; // 0 instant, 1 normal, 2 fast
let decState = "idle";
let decAbort = false;
let decChess = null;

async function doDecode() {
  if (decState === "running") return;

  preloadSounds();

  const input = (document.getElementById("decInput").value || "").trim();
  const key = document.getElementById("decKey").value;
  clearAlert("decAlert");

  if (!input) {
    showAlert("decAlert", "Paste a PGN string first.", true);
    return;
  }

  scrollToId("decResult");
  const badge = document.getElementById("decodeChanBadge");
  if (badge) badge.textContent = "PGN channel";

  const ek = deriveKey(key);
  let decoded = null;
  try {
    decoded = decodeFromPGN(input, ek);
  } catch (e) {}

  let hist = [];
  try {
    const chess = parsePGNmoves(input);
    hist = chess.history({ verbose: true });
  } catch (e) {}

  if (hist.length < 2) {
    showAlert("decAlert", "That game wouldn't play. Check the PGN and try again.", true);
    return;
  }

  decChess = new Chess();
  decState = "running";
  decAbort = false;

  renderBoard("boardDecode", decChess, null, null);
  document.getElementById("msgOut").innerHTML = '<span class="cursor"></span>';
  setProgress(0);

  await runReplay(hist, decoded, key);
}

async function runReplay(hist, message, key) {
  const total = hist.length;
  const statuses = [
    "Playing the game back…",
    "Reading which moves were chosen…",
    "Extracting the bit stream…",
    "Rebuilding the message…",
  ];
  let si = 0;
  setDecStatus(statuses[0]);

  for (let i = 0; i < total; i++) {
    while (decState === "paused") await sleep(80);
    if (decAbort) {
      decState = "idle";
      decAbort = false;
      return;
    }

    const mv = hist[i];
    const r = decChess.move(mv.san, { sloppy: true });
    if (r) {
      renderBoard("boardDecode", decChess, r.from, r.to);
      if (decSpd !== 0) playMoveSound(r.flags || "", decChess.in_check());
    }

    setProgress(Math.round(((i + 1) / total) * 100));

    const nsi = Math.min(
      Math.floor((i / total) * statuses.length),
      statuses.length - 1,
    );
    if (nsi !== si) {
      si = nsi;
      setDecStatus(statuses[si]);
    }

    if (decSpd === 0) continue;
    await sleep(decSpd === 2 ? 65 : 190);
  }

  setDecStatus("Back at the start. The extracted text:");
  setProgress(100);

  const fallback = getDecoy(
    (document.getElementById("decInput").value || ""),
    (document.getElementById("decKey").value || ""),
  );
  revealMsg(message || fallback, playEndSound);
  decState = "done";

  const panel = document.getElementById("decResult");
  if (panel) {
    panel.classList.remove("result-flash");
    void panel.offsetWidth;
    panel.classList.add("result-flash");
  }
}

function revealMsg(msg, onDone) {
  const el = document.getElementById("msgOut");
  el.textContent = "";
  el.classList.add("glow");

  const cur = document.createElement("span");
  cur.className = "cursor";
  el.appendChild(cur);

  let idx = 0;
  function type() {
    if (idx >= msg.length) {
      cur.remove();
      if (onDone) onDone();
      return;
    }
    const chunk = decSpd === 0 ? msg.length : 1;
    const speed = decSpd === 0 ? 0 : decSpd === 2 ? 8 : 26;
    el.insertBefore(document.createTextNode(msg.substring(idx, idx + chunk)), cur);
    idx += chunk;
    if (speed !== 0 && msg.substring(idx - chunk, idx).trim()) playType();
    if (speed === 0) {
      type();
      return;
    }
    setTimeout(type, speed);
  }
  type();
}

function skipAnim() {
  decAbort = true;
  decState = "idle";

  const input = (document.getElementById("decInput").value || "").trim();
  const key = document.getElementById("decKey").value;
  if (!input) return;

  const ek = deriveKey(key);
  let msg = null;
  try {
    msg = decodeFromPGN(input, ek);
  } catch (e) {}

  try {
    const c = parsePGNmoves(input);
    renderBoard("boardDecode", c, null, null);
  } catch (e) {}

  setProgress(100);
  setDecStatus("Decoded (instantly).");
  revealMsg(msg || getDecoy(input, key), playEndSound);
}

function replayDec() {
  decAbort = true;
  decState = "idle";
  setTimeout(() => {
    decAbort = false;
    doDecode();
  }, 150);
}

function togglePause() {
  if (decState === "running") {
    decState = "paused";
    document.getElementById("pauseBtn")?.classList.add("active");
  } else if (decState === "paused") {
    decState = "running";
    document.getElementById("pauseBtn")?.classList.remove("active");
  }
}

function detectFmt() {
  const val = (document.getElementById("decInput").value || "").trim();
  const b = document.getElementById("fmtBadge");
  if (!val) {
    b.textContent = "PGN channel";
    b.style.color = "";
    return;
  }
  if (detectFENFormat(val)) {
    b.textContent = "That is a position — use the key field instead";
    b.style.color = "var(--red)";
  } else {
    b.textContent = "PGN channel";
    b.style.color = "";
  }
}

function detectFENFormat(s) {
  if (!s) return false;
  const t = s.trim();
  return (
    t.split("/").length === 8 &&
    /^[rnbqkpRNBQKP1-8\/]+/.test(t) &&
    !t.includes(".")
  );
}

function onDecKeyChange() {
  const key = document.getElementById("decKey").value;
  const status = document.getElementById("decKeyStatus");
  const t = (key || "").trim();
  if (!status) return;
  if (!t) {
    status.textContent = "Leave blank if the game was encoded in public mode";
    status.style.color = "";
  } else if (isValidFEN(t)) {
    status.textContent = "Recognized a FEN — it will be hashed into the key";
    status.style.color = "var(--teal)";
  } else {
    status.textContent = "Used as a literal password";
    status.style.color = "var(--teal)";
  }
}

function setSpd(s) {
  decSpd = s;
  ["spd1", "spd2", "spd0"].forEach((id) =>
    document.getElementById(id)?.classList.remove("active"),
  );
  const map = { 1: "spd1", 2: "spd2", 0: "spd0" };
  document.getElementById(map[s])?.classList.add("active");
}

function setProgress(pct) {
  const el = document.getElementById("progBar");
  if (el) el.style.width = pct + "%";
}

function setDecStatus(msg) {
  const el = document.getElementById("decStatus");
  if (el) el.innerHTML = `<span>${escapeHTML(msg)}</span>`;
}

// ============================================================
// SOUND — local files in sound/, always on
// ============================================================
const SOUND_FILES = [
  "sound/move.mp3",
  "sound/capture.mp3",
  "sound/castle.mp3",
  "sound/check.mp3",
  "sound/promote.mp3",
  "sound/gameend.mp3",
];

const soundPool = {};

function soundEl(url) {
  if (!soundPool[url]) {
    soundPool[url] = new Audio(url);
    soundPool[url].preload = "auto";
  }
  return soundPool[url];
}

function preloadSounds() {
  if (typeof Audio === "undefined") return;
  try {
    SOUND_FILES.forEach((u) => soundEl(u));
  } catch (e) {}
}

// Play one file. Every call gets a fresh clone so rapid moves and
// typing overlap naturally instead of cutting each other off.
function playSound(url, vol, rate) {
  if (typeof Audio === "undefined") return;
  try {
    const a = soundEl(url).cloneNode();
    if (vol != null) a.volume = vol;
    a.playbackRate = rate || 1;
    a.play().catch(() => {});
  } catch (e) {}
}

// Plain moves vary randomly across the whole set — a bit like hands
// landing at different pressures on a real board — weighted so the
// plain wood tap is the common one.
function randomMoveSound() {
  const pool = [
    ["sound/move.mp3", 6],
    ["sound/capture.mp3", 1],
    ["sound/castle.mp3", 1],
    ["sound/check.mp3", 1],
    ["sound/promote.mp3", 1],
  ];
  let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
  for (const [url, w] of pool) {
    r -= w;
    if (r < 0) return url;
  }
  return "sound/move.mp3";
}

// The move's real event picks its own sound; anything untagged is a
// random tap. flags come from chess.js verbose move objects.
function soundForMove(flags, inCheck) {
  if (flags.includes("k") || flags.includes("q")) return "sound/castle.mp3";
  if (flags.includes("p")) return "sound/promote.mp3";
  if (flags.includes("c") || flags.includes("e")) return "sound/capture.mp3";
  if (inCheck) return "sound/check.mp3";
  return randomMoveSound();
}

// Board move — volume drops off a touch when the piece has to walk
// a long way, plus a tiny random pitch so nothing feels machine-made.
function playMoveSound(flags, inCheck) {
  playSound(soundForMove(flags, inCheck), 0.62, 0.96 + Math.random() * 0.1);
}

// Typewriter tick — the plain move tap, quiet and pitched up so the
// text reveal reads differently from the board itself.
function playType() {
  playSound("sound/move.mp3", 0.15, 1.9);
}

// Only ever at the end of the replay, never at the start or midway.
function playEndSound() {
  playSound("sound/gameend.mp3", 0.8);
}

(function init() {
  decChess = new Chess();
  renderBoard("boardDecode", decChess, null, null);
})();