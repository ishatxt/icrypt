# i-crypt

**The field console for chess steganography.**

i-crypt turns any text into a perfectly legal, playable chess game. Post the game anywhere - Chess.com, Lichess, a forum, or a printed scoresheet - and only whoever holds the right key ever sees the real message.

Live site: [https://ishatxt.github.io/icrypt/](https://ishatxt.github.io/icrypt/)

## How it works

1. **Encode** - Type a message, optionally add a key (a password or a FEN position agreed on beforehand). The tool composes a legal game whose moves carry your message as bits.
2. **Play** - Import the generated PGN anywhere and play it naturally. Every move is a legal, ordinary chess move; the game looks like a normal game.
3. **Recover** - Whoever holds the key pastes the game back. The replay runs and the message reveals itself.

## The technique

At every position, the legal moves are sorted in a deterministic order. If *N* moves are legal, that position carries **floor(log₂ N)** bits, enough to select one specific move. The result is a game that looks natural - development, captures, castling - and plays in any PGN viewer.

### Encryption keys

- **Blank key** - public: anyone can decode.
- **Password** - encrypts the payload.
- **FEN position** - a random legal position used as a key; the same position hashes to the same key on any device, from a diagram or Lichess. Only piece placement matters.

A wrong or missing key never errors out - it returns plausible chess commentary seeded from the game and the attempt, indistinguishable from a genuine empty reading without the right key.

## Privacy

All processing - hashing, composing, replaying, decrypting - runs entirely in your browser. No account, no server, no logs. Nothing leaves your machine.

## Repository structure

```
├── index.html     Landing page
├── encode.html    Encode a message into a game
├── decode.html    Decode a game back into a message
├── tools.html     FEN keys and portable drop cards
├── guide.html     How it works, in depth
├── css/
│   └── styles.css
├── js/
│   ├── encode.js  Message-to-game encoding
│   ├── decode.js  Game-to-message decoding
│   ├── engine.js  Chess move legality and bit packing
│   ├── pieces.js  Board rendering
│   ├── shared.js  Key handling and hashing
│   └── home.js    Landing page logic
└── sound/
```

## Pages

- [Home](https://ishatxt.github.io/icrypt/index.html)
- [Encode](https://ishatxt.github.io/icrypt/encode.html)
- [Decode](https://ishatxt.github.io/icrypt/decode.html)
- [Tools](https://ishatxt.github.io/icrypt/tools.html)
- [Guide](https://ishatxt.github.io/icrypt/guide.html)

---

Made by ishan. i-crypt is free and runs entirely on your machine.