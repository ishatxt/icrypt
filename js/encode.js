/**
 * i-crypt — Encode page glue
 * ---------------------------------------------------------------
 * Wires the encode form, PGN output, position preview and the FEN
 * key generator. Cipher work stays in engine.js.
 * ---------------------------------------------------------------
 */
"use strict";

let lastEncodedMsg = null;
let lastEncodedKey = null;
let prevChess = null;
let prevMoves = [];
let prevIdx = 0;

function doEncode() {
  const msgBox = document.getElementById("encMsg");
  const keyBox = document.getElementById("encKey");
  const msg = (msgBox.value || "").trim();
  const key = keyBox.value;
  clearAlert("encAlert");

  if (!msg) {
    showAlert("encAlert", "Write a message to hide first.", true);
    return;
  }

  const ek = deriveKey(key);
  document.getElementById("pgnOut").textContent =
    "Composing a legal game for this message…";

  setTimeout(() => {
    const result = encodeToPGN(msg, ek);

    if (result.error) {
      showAlert("encAlert", result.error, true);
      document.getElementById("pgnOut").textContent = "Composition failed.";
      return;
    }

    document.getElementById("pgnOut").textContent = result.pgn;
    document.getElementById("encStats").style.display = "flex";
    document.getElementById("sBits").textContent = result.totalBits;
    document.getElementById("sMoves").textContent = result.moves.length;
    document.getElementById("sChars").textContent = msg.length;
    document.getElementById("moveCountBadge").textContent =
      result.moves.length + " moves";

    lastEncodedMsg = msg;
    lastEncodedKey = key;
    setPgnStale(false);

    const section = document.getElementById("encBoardSection");
    if (section) section.style.display = "block";
    prevChess = new Chess();
    prevMoves = result.moves;
    prevIdx = 0;
    renderBoard("boardEncode", prevChess, null, null);
    updatePreviewLabel();

    scrollToId("encResult");
    const card = document.getElementById("encResult");
    if (card) {
      card.classList.remove("result-flash");
      void card.offsetWidth;
      card.classList.add("result-flash");
    }
    animatePreview();
  }, 20);
}

function onEncInputChange() {
  const keyBox = document.getElementById("encKey");
  const status = document.getElementById("encKeyStatus");
  const t = (keyBox.value || "").trim();
  if (!t) {
    status.textContent = "Public — no key, anyone with the game can decode";
    status.style.color = "";
  } else if (isValidFEN(t)) {
    status.textContent = "Key set — a FEN position, hashed into the key";
    status.style.color = "var(--teal)";
  } else {
    status.textContent = "Key set — this text used as the password";
    status.style.color = "var(--teal)";
  }

  if (lastEncodedMsg !== null) {
    const msg = (document.getElementById("encMsg").value || "").trim();
    setPgnStale(msg !== lastEncodedMsg || keyBox.value !== lastEncodedKey);
  }
}

function setPgnStale(stale) {
  const warn = document.getElementById("pgnStaleWarning");
  const box = document.getElementById("pgnOut");
  if (!warn || !box) return;
  warn.style.display = stale ? "block" : "none";
  box.style.opacity = stale ? "0.45" : "1";
}

function animatePreview() {
  if (!prevChess || prevIdx >= prevMoves.length) return;
  const r = prevChess.move(prevMoves[prevIdx], { sloppy: true });
  if (r) renderBoard("boardEncode", prevChess, r.from, r.to);
  prevIdx++;
  updatePreviewLabel();
  if (prevIdx < prevMoves.length) setTimeout(animatePreview, 120);
}

function updatePreviewLabel() {
  const el = document.getElementById("previewMoveLabel");
  if (el) el.textContent = prevIdx + "/" + (prevMoves.length || 0);
}

function previewPrev() {
  if (!prevChess || prevIdx <= 0) return;
  prevIdx = Math.max(0, prevIdx - 2);
  prevChess = new Chess();
  for (let i = 0; i < prevIdx; i++)
    prevChess.move(prevMoves[i], { sloppy: true });
  renderBoard("boardEncode", prevChess, null, null);
  updatePreviewLabel();
}

function previewNext() {
  if (!prevChess || prevIdx >= prevMoves.length) return;
  const r = prevChess.move(prevMoves[prevIdx], { sloppy: true });
  if (r) renderBoard("boardEncode", prevChess, r.from, r.to);
  prevIdx++;
  updatePreviewLabel();
}

function previewReset() {
  if (!prevChess) return;
  prevChess = new Chess();
  prevIdx = 0;
  renderBoard("boardEncode", prevChess, null, null);
  updatePreviewLabel();
}

function generateFENKey() {
  const fen = generateRandomFEN();
  const card = document.getElementById("fenCard");
  const out = document.getElementById("fenOut");
  card.style.display = "block";

  out.innerHTML = `
    <div class="board-wrap" style="margin-bottom: 14px;">
      <div class="board-coord-wrap">
        <div class="board-grid" id="fenBoard"></div>
      </div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6;">
      Copy this position and use it as your key instead of typing a password.
      Two people who arrive at the same position derive the same key.
    </p>
    <div class="slip-head">
      <span class="slip-label">Secret key — FEN</span>
      <button class="copy" onclick="copyText('${escapeHTML(fen)}')">copy</button>
    </div>
    <div class="slip" style="font-size:11px;">${escapeHTML(fen)}</div>
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn btn-teal btn-sm" onclick="useFENAsKey('${escapeHTML(fen)}')">Use as key →</button>
      <button class="btn btn-ghost btn-sm" onclick="generateFENKey()">Generate another</button>
    </div>`;

  setTimeout(() => {
    try {
      const c = new Chess(fen);
      renderBoard("fenBoard", c, null, null);
    } catch (e) {}
  }, 30);

  scrollToId("fenCard");
}

function useFENAsKey(fen) {
  document.getElementById("encKey").value = fen;
  onEncInputChange();
  showToast("FEN key inserted");
}

function clearEncode() {
  document.getElementById("encMsg").value = "";
  document.getElementById("encKey").value = "";
  document.getElementById("pgnOut").textContent =
    "The game appears here. Copy it into Chess.com, Lichess, or any PGN viewer and play it.";
  document.getElementById("encStats").style.display = "none";
  document.getElementById("encBoardSection").style.display = "none";
  document.getElementById("fenCard").style.display = "none";
  document.getElementById("moveCountBadge").textContent = "0 moves";
  clearAlert("encAlert");
  prevChess = null;
  prevMoves = [];
  prevIdx = 0;
  lastEncodedMsg = null;
  lastEncodedKey = null;
  setPgnStale(false);
  onEncInputChange();
}

(function init() {
  const c = new Chess();
  renderBoard("boardEncode", c, null, null);
})();