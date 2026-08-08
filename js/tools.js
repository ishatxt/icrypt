/**
 * i-crypt — Tools page glue (dead drop card + FEN key generator)
 * ---------------------------------------------------------------
 * The covert-channel extras. FEN logic stays in engine.js.
 * ---------------------------------------------------------------
 */
"use strict";

function doDeadDrop() {
  const handle = (document.getElementById("ddHandle").value || "").trim();
  const platform = document.getElementById("ddPlat").value;
  const location = document.getElementById("ddLoc").value;
  const idx =
    (document.getElementById("ddIdx").value || "").trim() || "latest";
  const hint = (document.getElementById("ddHint").value || "").trim();

  if (!handle) {
    showAlert("ddAlert", "Give the pickup a handle, then generate.", true);
    return;
  }
  clearAlert("ddAlert");

  const date = new Date().toISOString().split("T")[0];
  const ref = hash32(handle + platform + idx).substring(0, 8).toUpperCase();

  const lines = [
    `REF    ${ref}`,
    `DATE   ${date}`,
    `PICKUP ${platform} · ${location}`,
    `HANDLE ${handle}`,
    `GAME   ${idx}`,
    hint ? `HINT   ${hint}` : `KEY    none required`,
    ``,
    `OPERATION`,
    `---------`,
    `1. open ${platform}`,
    `2. find player: ${handle}`,
    `3. open game: ${idx}`,
    `4. copy the full PGN from the viewer`,
    `5. paste it into i-crypt · decode`,
    hint ? `6. enter the key when asked` : `6. no key required`,
    ``,
    `encoded with i-crypt`,
  ];

  document.getElementById("ddCardOut").textContent = lines.join("\n");
  const card = document.getElementById("ddResult");
  card.style.display = "block";
  scrollToId("ddResult");
  card.classList.remove("result-flash");
  void card.offsetWidth;
  card.classList.add("result-flash");
}

function clearDD() {
  ["ddHandle", "ddIdx", "ddHint"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("ddResult").style.display = "none";
  clearAlert("ddAlert");
}

function generateFENKey() {
  const fen = generateRandomFEN();
  const out = document.getElementById("fenOut2");
  out.innerHTML = `
    <div class="board-wrap" style="margin-bottom: 14px;">
      <div class="board-coord-wrap">
        <div class="board-grid" id="fenBoard2"></div>
      </div>
    </div>
    <div class="slip-head">
      <span class="slip-label">Secret key — FEN</span>
      <button class="copy" onclick="copyText('${escapeHTML(fen)}')">copy</button>
    </div>
    <div class="slip" style="font-size:11px;">${escapeHTML(fen)}</div>
    <div class="btn-row" style="margin-top:14px;">
      <button class="btn btn-teal btn-sm" onclick="copyText('${escapeHTML(fen)}'); showToast('Key copied');">Copy key</button>
      <button class="btn btn-ghost btn-sm" onclick="generateFENKey()">Generate another</button>
    </div>
    <p style="margin-top:10px;font-size:12px;color:var(--muted);line-height:1.6;max-width:52ch;">
      Two people who arrive at the same position by any means — this app,
      Lichess, a printed diagram — always derive the same key. Paste a FEN
      into the key field on the encode or decode page.
    </p>`;

  setTimeout(() => {
    try {
      const c = new Chess(fen);
      renderBoard("fenBoard2", c, null, null);
    } catch (e) {}
  }, 30);
}

(function init() {
  const c = new Chess();
  renderBoard("fenBoard2", c, null, null);
})();