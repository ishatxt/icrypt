/**
 * i-crypt — Home hero
 * ---------------------------------------------------------------
 * The page performs its own trick: the word SECRET is encoded into
 * a real, legal chess game by the site's own engine, then played
 * out on the rendered board with the notation ticking by.
 * ---------------------------------------------------------------
 */
"use strict";

(function runHero() {
  function fallback() {
    try {
      renderBoard("heroBoard", new Chess(), null, null);
    } catch (e) {}
    const m = document.getElementById("heroMoves");
    if (m) m.textContent = "offline";
    const r = document.getElementById("heroReveal");
    if (r) r.textContent = "SECRET — replay on your machine";
  }

  const board = document.getElementById("heroBoard");
  const movesEl = document.getElementById("heroMoves");
  const revealEl = document.getElementById("heroReveal");
  if (
    !board ||
    !movesEl ||
    !revealEl ||
    typeof Chess === "undefined" ||
    typeof encodeToPGN !== "function"
  ) {
    fallback();
    return;
  }

  const word = "i love you , i++ 🂱";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const res = encodeToPGN(word, "");
  if (!res || !res.moves || res.moves.length === 0) {
    fallback();
    return;
  }

  const chess = new Chess();
  renderBoard("heroBoard", chess, null, null);
  const moves = res.moves;
  let i = 0;

  function step() {
    if (i >= moves.length) {
      finish();
      return;
    }
    const r = chess.move(moves[i], { sloppy: true });
    renderBoard("heroBoard", chess, r ? r.from : null, r ? r.to : null);
    if (i % 2 === 0) {
      const num = document.createElement("b");
      num.textContent = Math.floor(i / 2) + 1 + ".";
      movesEl.appendChild(num);
    }
    movesEl.appendChild(document.createTextNode(" " + moves[i] + " "));
    i++;
    setTimeout(step, reduced ? 0 : 250);
  }

  function finish() {
    if (reduced) {
      revealEl.textContent = word;
      return;
    }
    const chars = Array.from(word);
    let ci = 0;
    const cur = document.createElement("span");
    cur.className = "cursor";
    revealEl.appendChild(cur);
    (function type() {
      if (ci >= chars.length) {
        cur.remove();
        return;
      }
      revealEl.insertBefore(document.createTextNode(chars[ci]), cur);
      ci++;
      setTimeout(type, 150);
    })();
  }

  if (reduced) {
    for (let j = 0; j < moves.length; j++) {
      const r = chess.move(moves[j], { sloppy: true });
      renderBoard("heroBoard", chess, r ? r.from : null, r ? r.to : null);
    }
    finish();
  } else {
    step();
  }
})();