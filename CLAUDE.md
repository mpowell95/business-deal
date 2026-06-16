# Business Deal — CLAUDE.md

## Project Overview
A single-player-vs-AI web card game based on the Monopoly Deal ruleset, built as
a Progressive Web App (PWA). The goal is an ad-free, phone-installable game with
a genuinely strategic AI opponent — better than what exists in typical mobile clones.

**Player count:** 1 human vs 1 AI  
**Platform target:** Mobile browser (iPhone/Android), installable via "Add to Home Screen"  
**Hosting:** GitHub Pages (free, deploy by pushing to `main`)

---

## Tech Stack
- **Vanilla HTML/CSS/JS only** — no frameworks, no build step, no npm
- **PWA** — `manifest.json` + service worker for offline play and home screen install
- **Single repo** → GitHub Pages deployment

---

## File Structure
```
business-deal/
├── index.html          # Main entry point, game shell
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline caching)
├── icons/
│   ├── icon-192.png    # PWA icon (generate a simple card/chip icon)
│   └── icon-512.png
├── css/
│   └── styles.css      # All styles
└── js/
    ├── deck.js         # Card definitions + deck builder
    ├── game.js         # Game state machine + rules engine
    ├── ai.js           # AI decision engine
    └── ui.js           # DOM rendering + event handlers
```

Build order: `deck.js` → `game.js` → `ai.js` → `ui.js` → `index.html` → PWA files.

---

## Complete Card Inventory (110 cards total)

### 4 Quick Start Rule Cards
Not used in gameplay — exclude from the deck.

### 20 Money Cards
| Value | Count |
|-------|-------|
| 1M    | 6     |
| 2M    | 5     |
| 3M    | 3     |
| 4M    | 3     |
| 5M    | 2     |
| 10M   | 1     |

### 34 Action Cards
| Card              | Count | Effect |
|-------------------|-------|--------|
| Deal Breaker      | 2     | Steal a complete property set (including buildings) from any player |
| Just Say No       | 3     | Cancel any action card played against you (can be countered by another JSN) |
| Pass Go           | 10    | Draw 2 extra cards from draw pile immediately |
| Forced Deal       | 3     | Swap any ONE property with opponent (cannot be from a full set) |
| Sly Deal          | 3     | Steal ONE property from opponent (cannot be from a full set) |
| Debt Collector    | 3     | Force opponent to pay you 5M |
| It's My Birthday  | 2     | Opponent pays you 2M |
| Double the Rent   | 2     | Must be played WITH a rent card; doubles the rent charged |
| House             | 3     | Add to any full set you own; adds 3M to rent (not Railroads or Utilities) |
| Hotel             | 2     | Add to any full set that already has a House; adds 4M to rent (not Railroads or Utilities) |

### 13 Rent Cards
| Card                  | Count | Targets |
|-----------------------|-------|---------|
| Dark Blue / Green     | 2     | Charge ALL players |
| Red / Yellow          | 2     | Charge ALL players |
| Pink / Orange         | 2     | Charge ALL players |
| Light Blue / Brown    | 2     | Charge ALL players |
| Railroad / Utility    | 2     | Charge ALL players |
| Wild Rent (any color) | 3     | Charge ONE player for any color |

### 28 Property Cards
| Color      | Cards Needed | Count in Deck |
|------------|-------------|----------------|
| Dark Blue  | 2           | 2              |
| Brown      | 2           | 2              |
| Utility    | 2           | 2              |
| Light Blue | 3           | 3              |
| Pink       | 3           | 3              |
| Orange     | 3           | 3              |
| Red        | 3           | 3              |
| Yellow     | 3           | 3              |
| Green      | 3           | 3              |
| Railroad   | 4           | 4              |

### 11 Property Wildcards
| Wildcard              | Count |
|-----------------------|-------|
| Dark Blue / Green     | 1     |
| Green / Railroad      | 1     |
| Utility / Railroad    | 1     |
| Light Blue / Railroad | 1     |
| Light Blue / Brown    | 1     |
| Pink / Orange         | 2     |
| Red / Yellow          | 2     |
| Multi-color (any)     | 2     |

**Wildcard rules:**
- Regular wildcards act as one of the two colors shown — player assigns on placement
- Multi-color wildcards can be any color
- Wildcards can be reassigned to different sets during the owner's turn
- Multi-color wildcards have NO monetary value and cannot be used to pay debts
- Regular wildcards CAN be used as payment (use their money value shown)

---

## Rent Values

> ⚠️ Verify these values in-game during testing. These are based on standard
> Monopoly Deal rules and may need adjustment.

| Color      | 1 card | 2 cards | 3 cards | 4 cards | + House | + Hotel |
|------------|--------|---------|---------|---------|---------|---------|
| Brown      | 1M     | 2M      | —       | —       | +3M     | +4M     |
| Light Blue | 1M     | 2M      | 3M      | —       | +3M     | +4M     |
| Pink       | 1M     | 2M      | 4M      | —       | +3M     | +4M     |
| Orange     | 1M     | 3M      | 5M      | —       | +3M     | +4M     |
| Red        | 2M     | 3M      | 6M      | —       | +3M     | +4M     |
| Yellow     | 2M     | 4M      | 6M      | —       | +3M     | +4M     |
| Green      | 2M     | 4M      | 7M      | —       | +3M     | +4M     |
| Dark Blue  | 3M     | 8M      | —       | —       | +3M     | +4M     |
| Railroad   | 1M     | 2M      | 3M      | 4M      | N/A     | N/A     |
| Utility    | 1M     | 2M      | —       | —       | N/A     | N/A     |

---

## Core Rules

### Setup
1. Shuffle 106-card deck (exclude Quick Start cards)
2. Deal 5 cards to each player (human and AI)
3. Remainder is the draw pile

### Each Turn
1. **Draw 2 cards** from draw pile (draw 5 if hand was empty)
2. **Play up to 3 cards** in any combination:
   - **Bank:** Place money or action/rent cards face-up in bank pile (they become money, losing action ability)
   - **Properties:** Place property cards in your property collection
   - **Actions:** Play action cards to center discard pile and execute effect
3. **End turn:** Discard down to 7 cards in hand if over limit

### Payment Rules
- Cards **never** return to a player's hand once played to the table
- Pay from bank and/or properties — player's choice how to pay
- **No change given** — if you pay 3M for a 2M debt, the extra is gone
- If you pay with property, it goes into the recipient's property collection
- If you have nothing on the table, you pay nothing
- You CANNOT pay with cards from your hand

### Just Say No (JSN) Chains
- Play JSN at any time when an action card is played against you
- The attacker can counter with their own JSN, which can be countered again
- JSN is resolved before payment is made

### Deal Breaker
- Steals an ENTIRE complete set, including any houses/hotels on it
- Target player can respond with Just Say No

### Sly Deal / Forced Deal
- Cannot steal from a complete set
- Forced Deal: you give one of your non-full-set properties in exchange

### Houses and Hotels
- Can only be added to a FULL property set
- Only one house and one hotel per set
- Hotel requires a house to already be on the set
- Cannot be added to Railroad or Utility sets
- If a Deal Breaker steals the set, buildings go with it

### Draw Pile Empty
Shuffle the discard pile, flip face-down, use as new draw pile.

### Winning
First player to have **3 complete property sets of different colors** on the table wins.
- Must be declared on YOUR turn (even if you completed the third set on someone else's turn)
- The sets must remain complete — they can be broken up by Sly Deal / Forced Deal before you declare

---

## AI Strategy Engine

The AI should evaluate and rank possible plays every turn. Below is the decision
priority order — implement as a scored evaluation, not a rigid switch statement,
so the AI can combine the best available plays across 3 slots.

### Turn Evaluation Priority

1. **Win check** — Do I currently have 3 complete sets? Declare win.

2. **Deal Breaker to win** — Would playing a Deal Breaker give me a 3rd complete set? Play it. (Preserve JSN to counter their JSN if needed.)

3. **Complete a set** — Can I place a property card or wildcard that completes one of my sets? Prioritize high-rent sets.

4. **Sly Deal / Forced Deal to complete a set** — Is there a specific card in the opponent's non-full collection that would complete my set? Play it.

5. **Deal Breaker for set advantage** — Even if it doesn't win, would stealing a full set hurt the opponent significantly or give me a near-win?

6. **High-value rent combo** — Do I have a rent card + Double the Rent where the total charge would be 6M+? Play it.

7. **Debt Collector / It's My Birthday** — Play if opponent has money to pay and I'm behind on bank value.

8. **Standard rent** — Play rent for any color I own if expected return > 2M.

9. **Pass Go** — Play if hand has fewer than 4 cards after other plays.

10. **Property placement** — Play property cards that advance toward a set, prioritizing sets I'm closest to completing.

11. **House/Hotel** — Add to a full set before playing rent on it.

12. **Bank filler** — Bank the lowest-value card in hand that isn't needed for a set.

### JSN Logic (AI)
- **Always save JSN for:** Deal Breaker played against a full set I own
- **Use JSN for:** Forced Deal that would break a nearly-complete set
- **Don't use JSN for:** Debt Collector, Birthday (small cost), rent charges under 4M if I have money to pay

### Wildcard Placement Logic
- Assign wildcards to the color set where they're most needed to complete a set
- Reassign wildcards at start of turn if a better assignment exists

### Payment Logic (when AI owes)
- Pay with lowest-value money cards first
- Avoid paying with properties unless no money available
- If forced to pay with property, give from sets furthest from completion

---

## PWA Setup

### manifest.json
```json
{
  "name": "Business Deal",
  "short_name": "Business Deal",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a472a",
  "theme_color": "#1a472a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### index.html head requirements
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Business Deal">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="manifest" href="manifest.json">
```

### Service Worker (sw.js)
Cache all game assets on install for offline play. Use cache-first strategy.

---

## UI / UX Notes

### Layout (mobile-first, portrait)
- **Top half:** AI's property sets + AI bank/hand count (cards face-down)
- **Middle strip:** Draw pile, discard pile, turn indicator, message log
- **Bottom half:** Human's property sets + human bank
- **Bottom bar:** Human's hand (scrollable horizontal row of cards)

### Card Design
- No licensed Monopoly artwork — use clean color blocks with text
- Each card: colored background matching property color, card name, value in corner
- Money cards: simple green with dollar amount
- Action cards: dark with card name and brief effect text

### Interactions
- Tap a card in hand to select it → highlights valid play zones
- Tap a play zone to place it
- "End Turn" button always visible
- When AI plays, animate card movements with brief delays so it's readable
- JSN prompt: modal asking "Play Just Say No?" when opponent plays action against you

### Game Log
- Small scrollable text area showing recent actions: "AI played Sly Deal — stole your Orange property"

---

## GitHub Pages Deployment

1. Create repo: `github.com/[username]/business-deal`
2. Push all files to `main` branch
3. Go to repo Settings → Pages → Source: `main` branch, root `/`
4. Game available at: `https://[username].github.io/business-deal`
5. On iPhone: visit URL in Safari → Share → "Add to Home Screen"
6. On Android: visit URL in Chrome → menu → "Add to Home Screen"

---

## Build Session Plan

**Session 1:** `deck.js` (card definitions, deck builder, shuffle) + `game.js` (state machine, turn logic, payment resolution, win detection)

**Session 2:** `ai.js` (full decision engine per priority spec above)

**Session 3:** `ui.js` + `styles.css` (rendering, hand display, property collections, bank display, card animations)

**Session 4:** `index.html` (wire everything together) + `manifest.json` + `sw.js` (PWA)

**Session 5:** Testing, bug fixes, AI tuning

---

## Notes
- All monetary values in this game are in millions (M) — display as "$1M", "$3M" etc.
- The discard pile is face-up; the draw pile is face-down
- Players cannot look through opponent's bank pile or property stack order
- A card played to the bank as money loses its action ability permanently for that game
