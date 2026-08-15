/**
 * i-crypt — Cipher Engine
 * ---------------------------------------------------------------
 * Pure logic, zero DOM dependency. Everything here is a function of
 * its inputs only, so it can be lifted out and reused (tested from
 * a CLI, ported to a different frontend, etc) without touching any
 * UI code.
 *
 * Contents:
 *   - Crypto primitives     (strEnc/strDec, XOR cipher, hashing, key derivation)
 *   - PGN codec             (encodeToPGN, decodeFromPGN) — hides messages
 *   - Random FEN key gen    (generateRandomFEN, isValidFEN) — generates
 *                             portable encryption keys, never hides data
 *   - Decoy system          (deterministic wrong-key responses)
 * ---------------------------------------------------------------
 */
"use strict";

// ============================================================
      // CRYPTO PRIMITIVES  (strict, tested)
      // ============================================================

      /** String → Uint8Array */
      function strEnc(s) {
        return new TextEncoder().encode(s);
      }

      /** Uint8Array/Array → String */
      function strDec(bytes) {
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(
            new Uint8Array(bytes),
          );
        } catch (e) {
          return null;
        }
      }

      /** bytes → bit array (MSB first) */
      function bytesToBits(bytes) {
        const bits = [];
        for (const b of bytes)
          for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
        return bits;
      }

      /** bit array → byte array */
      function bitsToBytes(bits) {
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) {
          let b = 0;
          for (let j = 0; j < 8 && i + j < bits.length; j++)
            b = (b << 1) | bits[i + j];
          bytes.push(b);
        }
        return bytes;
      }

      /** XOR stream cipher — fully reversible */
      function xorCipher(bytes, key) {
        if (!key || !key.length) return bytes;
        const kb = Array.from(strEnc(key));
        return bytes.map((b, i) => b ^ kb[i % kb.length]);
      }

      /** Simple 32-bit hash (djb2 variant) */
      function hash32(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++)
          h = Math.imul(h, 33) ^ s.charCodeAt(i);
        return (h >>> 0).toString(16).padStart(8, "0");
      }

      /**
       * Derive the effective encryption key from whatever the user put
       * in the Key field. Whether a key is applied depends only on
       * whether this field is non-empty — never on a separate "mode"
       * flag. If the (trimmed) input contains a recognizable FEN piece
       * placement, the key is derived by hashing a normalized version
       * of just that placement (see normalizedKeyFEN below) — otherwise
       * the input is used directly as a literal password. Empty input
       * means public/no-key. This function is 100% deterministic: the
       * same input always produces the same output, on both the encode
       * and decode side.
       */
      function deriveKey(userKey) {
        const t = (userKey || "").trim();
        if (!t) return "";
        if (isValidFEN(t)) return hash32(normalizedKeyFEN(t));
        return t;
      }

      // ============================================================
      // STEGANOGRAPHY — PGN ENCODE
      //
      // Algorithm:
      //   1. Build payload: [len_hi, len_lo, ...encrypted_bytes]
      //   2. Convert to bit stream
      //   3. At each chess position: sort moves by SAN (deterministic)
      //      k = floor(log2(N)) — bits this position can carry
      //      Read k bits from stream → choose move index
      //   4. Guarantee: index < N (since 2^k ≤ N)
      // ============================================================

      /** Deterministic bit capacity at a position with N legal moves */
      function bitsPerPos(n) {
        if (n < 2) return 0;
        return Math.floor(Math.log2(n));
      }

      /** Sort moves by SAN for deterministic ordering */
      function sortedMoves(chess) {
        return chess.moves().sort();
      }

      function encodeToPGN(message, effectiveKey) {
        try {
          let bytes = Array.from(strEnc(message));
          if (effectiveKey) bytes = xorCipher(bytes, effectiveKey);

          const len = bytes.length;
          if (len > 4096)
            return { error: "Message too long (max ~4000 chars)." };

          // 2-byte big-endian length prefix
          const payload = [len >> 8, len & 0xff, ...bytes];
          const bits = bytesToBits(payload);
          const totalBits = bits.length;

          const chess = new Chess();
          let bitIdx = 0;
          let moves = [];
          let safetyLimit = 0;

          while (bitIdx < totalBits && safetyLimit < 5000) {
            safetyLimit++;
            if (chess.in_checkmate() || chess.in_stalemate() || chess.in_draw())
              break;

            const legal = sortedMoves(chess);
            const N = legal.length;
            const k = bitsPerPos(N);

            if (k === 0) {
              // Only 1 legal move — forced, encode 0 bits
              chess.move(legal[0]);
              moves.push(legal[0]);
              continue;
            }

            // Read k bits (or remaining bits, padded with 0)
            let idx = 0;
            const toRead = Math.min(k, totalBits - bitIdx);
            for (let b = 0; b < toRead; b++) idx = (idx << 1) | bits[bitIdx++];
            for (let b = toRead; b < k; b++) idx = idx << 1; // zero-pad trailing

            // idx is now in [0, 2^k) which is ≤ N — guaranteed valid
            const chosen = legal[idx];
            chess.move(chosen);
            moves.push(chosen);
          }

          if (bitIdx < totalBits) {
            return {
              error: `Game ended before all bits encoded. Try a shorter message. (${bitIdx}/${totalBits} bits encoded)`,
            };
          }

          // Build PGN
          const date = new Date().toISOString().split("T")[0];
          let pgn = `[Event "Casual Game"]\n[Site "i-crypt"]\n[Date "${date}"]\n[White "Player1"]\n[Black "Player2"]\n[Result "*"]\n\n`;
          for (let i = 0; i < moves.length; i++) {
            if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
            pgn += moves[i] + " ";
          }
          pgn += "*";

          return { pgn, moves, totalBits };
        } catch (e) {
          console.error("encodeToPGN error:", e);
          return { error: "Encoding failed: " + e.message };
        }
      }

      // ============================================================
      // STEGANOGRAPHY — PGN DECODE
      // ============================================================

      function parsePGNmoves(pgn) {
        // Strip headers and comments
        const clean = pgn
          .replace(/\[.*?\]/gs, "")
          .replace(/\{[^}]*\}/g, "")
          .replace(/\([^)]*\)/g, "")
          .trim();

        const chess = new Chess();
        const tokens = clean
          .split(/\s+/)
          .map((t) => t.replace(/[+#!?]/g, "").trim())
          .filter(
            (t) => t && !/^\d+\./.test(t) && !/^[01\*]/.test(t) && t !== "--",
          );

        for (const tok of tokens) {
          if (!tok) continue;
          try {
            const r = chess.move(tok, { sloppy: true });
            if (!r) break;
          } catch (e) {
            break;
          }
        }
        return chess;
      }

      function decodeFromPGN(pgn, effectiveKey) {
        try {
          const chess = parsePGNmoves(pgn);
          const hist = chess.history({ verbose: true });
          if (hist.length < 4) return null;

          // Replay from start collecting bits
          const replay = new Chess();
          const bits = [];

          for (const mv of hist) {
            const legal = sortedMoves(replay);
            const N = legal.length;
            const k = bitsPerPos(N);

            if (k > 0) {
              // Find chosen move's index in sorted list
              const idx = legal.indexOf(mv.san);
              if (idx < 0) {
                // Fallback: try without annotations
                const san2 = mv.san.replace(/[+#!?]/g, "");
                const idx2 = legal.indexOf(san2);
                const useIdx = idx2 >= 0 ? idx2 : 0;
                // Extract k bits from index (only indices in [0, 2^k) carry signal)
                if (useIdx < 1 << k) {
                  for (let b = k - 1; b >= 0; b--) bits.push((useIdx >> b) & 1);
                } else {
                  for (let b = k - 1; b >= 0; b--) bits.push(0);
                }
              } else {
                if (idx < 1 << k) {
                  for (let b = k - 1; b >= 0; b--) bits.push((idx >> b) & 1);
                } else {
                  for (let b = k - 1; b >= 0; b--) bits.push(0);
                }
              }
            }

            replay.move(mv.san, { sloppy: true });
          }

          if (bits.length < 16) return null;

          // Extract length prefix
          const lenBytes = bitsToBytes(bits.slice(0, 16));
          const len = (lenBytes[0] << 8) | lenBytes[1];

          if (len <= 0 || len > 4096) return null;
          if (bits.length < 16 + len * 8) return null;

          let msgBytes = bitsToBytes(bits.slice(16, 16 + len * 8));

          // Decrypt
          if (effectiveKey) msgBytes = xorCipher(msgBytes, effectiveKey);

          const msg = strDec(msgBytes);
          if (msg === null) return null;

          // Basic printability check
          const printable = msg.split("").filter((c) => {
            const code = c.charCodeAt(0);
            return (code >= 32 && code < 127) || code > 160;
          }).length;
          if (msg.length > 0 && printable / msg.length < 0.7) return null;

          return msg;
        } catch (e) {
          console.error("decodeFromPGN error:", e);
          return null;
        }
      }

      // ============================================================
      // FEN ENCODING / DECODING
      // ============================================================

      // ============================================================
      // RANDOM FEN SECRET KEY GENERATOR
      //
      // The FEN channel does NOT hide messages. Its only job is to
      // produce a random, fully legal chess position whose FEN string
      // can be used as a portable encryption key for the PGN channel —
      // two people who independently arrive at the exact same position
      // (via i-crypt, Lichess, Chess.com, a printed diagram, anything)
      // get the exact same FEN, and therefore the exact same key,
      // without ever typing or transmitting a password.
      // ============================================================

      /**
       * Generates a random legal chess position by playing a random
       * number of random legal moves out from the starting position.
       * Every move is validated by chess.js as it's played, so the
       * result is always a completely ordinary, legal FEN — nothing
       * about it is specific to this app. Short walks tend to look
       * like openings (full castling rights intact); longer walks
       * drift toward middlegame/endgame-like material and often lose
       * castling rights or trade pieces down, so repeated calls
       * naturally produce a wide variety of positions.
       */
      function generateRandomFEN() {
        const chess = new Chess();
        const plies = 4 + Math.floor(Math.random() * 46); // 4..49 plies
        for (let i = 0; i < plies; i++) {
          const moves = chess.moves();
          if (moves.length === 0) break; // checkmate/stalemate — stop early
          const mv = moves[Math.floor(Math.random() * moves.length)];
          chess.move(mv);
        }
        return chess.fen();
      }

      /**
       * Strips common copy/paste noise (wrapping quotes, a leading
       * "FEN:" label, stray whitespace/newlines) and returns ONLY the
       * 8-row piece-placement field of a FEN-like string — i.e.
       * whatever comes before the first space. This is deliberately
       * the only part of a FEN this app's key system ever looks at.
       * Everything else in a FEN (side to move, castling rights, en
       * passant target, move clocks) is invisible on a static picture
       * of a board: two people transcribing the same position by hand
       * can easily disagree on "w" vs "b" or on castling rights, and
       * that must never change the derived key.
       */
      function extractPlacement(s) {
        const cleaned = (s || "")
          .trim()
          .replace(/^["']+|["']+$/g, "")
          .replace(/^fen\s*:\s*/i, "")
          .replace(/\s+/g, " ")
          .trim();
        return cleaned.split(" ")[0] || "";
      }

      /** True if a complete FEN (placement + hardcoded defaults) loads in chess.js. */
      function tryLoadFEN(fullFen) {
        try {
          new Chess(fullFen);
          return true;
        } catch (e) {
          return false;
        }
      }

      /**
       * True if `s` contains a structurally valid 8-row piece placement
       * — the only part of a FEN this app's key system cares about.
       * Accepts a full FEN, a placement-only string, or a placement
       * followed by arbitrary/malformed trailing metadata; everything
       * after the placement is ignored. Works the same regardless of
       * which platform (Chess.com, Lichess, Chess24, any board editor,
       * or this app's own generator) produced the string.
       */
      function isValidFEN(s) {
        const placement = extractPlacement(s);
        if (!placement) return false;

        const ranks = placement.split("/");
        if (ranks.length !== 8) return false;

        for (const rank of ranks) {
          if (!/^[rnbqkpRNBQKP1-8]+$/.test(rank)) return false;
          let cols = 0;
          for (const ch of rank) cols += /[1-8]/.test(ch) ? Number(ch) : 1;
          if (cols !== 8) return false;
        }

        // Confirm it's an actually loadable arrangement. We don't know
        // (and don't care) whose turn it really was, so try both — if
        // either side-to-move makes it a legal position, the placement
        // itself is accepted.
        return (
          tryLoadFEN(placement + " w - - 0 1") ||
          tryLoadFEN(placement + " b - - 0 1")
        );
      }

      /**
       * The exact string used for key hashing: the 8-row placement,
       * with a fixed, hardcoded rest-of-FEN appended so chess.js's
       * parser (which needs a complete FEN) never sees anything but
       * this one normalized form. That appended suffix is always
       * identical no matter what the original input's turn/castling/
       * en passant/move-clock fields said — so two FENs that look the
       * same on a board always normalize to this exact same string,
       * and therefore always hash to the exact same key.
       */
      function normalizedKeyFEN(s) {
        return extractPlacement(s) + " w - - 0 1";
      }

      // ============================================================
      // DECOY SYSTEM  (deterministic per PGN+key combo)
      // ============================================================

      const DECOYS = {
        normal: [
          "Retarded bitch, type the password",
          "Move ur ass bitch , type the password",
          "Nigger , type the password",
          "Nice try diddy, type the password",
          "Move ur ass bitch , type the password",
          "Retarded bitch, type the password",
          "Move ur ass bitch , type the password",
        ],
        suspicious: [
          "SUP nigga, type the password",
          "Retarded bitch, type the password",
          "Bitch , type the password",
          "Son of bitch , type the password",
        ],
        troll: [
          "Nice try nigger , type the password",
          "Move ur ass bitch , type the password",
          "Nice try diddy, type the password",
        ],
      };

      function getDecoy(pgn, keyAttempt) {
        const seed = parseInt(hash32((pgn || "") + (keyAttempt || "")), 16);
        const pct = seed % 100;
        const pool =
          pct < 60
            ? DECOYS.normal
            : pct < 90
              ? DECOYS.suspicious
              : DECOYS.troll;
        return pool[seed % pool.length];
      }

      
