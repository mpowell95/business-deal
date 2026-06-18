/* =============================================================================
 * ui.js — DOM rendering, human interaction, and game loop for "Business Deal"
 * -----------------------------------------------------------------------------
 * Recreates the look of the reference "Business" app: bright blue table, AI
 * opponents across the top, authentic Monopoly-Deal card faces, tap-to-enlarge
 * card detail with Flip / Bank / Play / Pass, target selection for multi-player
 * actions, speech bubbles, and toast banners.
 *
 * Supports 2–5 players (you + 1–4 AI). The human plays through HumanAgent, whose
 * async decisions are resolved by taps; the AI uses AIAgent. Both satisfy the
 * same engine agent interface.
 *
 * Loaded after deck.js + game.js + ai.js. Exposes window.UI.
 * ===========================================================================*/
(function (root, factory) {
  root.UI = factory(root.Deck, root.Game, root.AI);
})(typeof self !== 'undefined' ? self : this, function (Deck, GameModule, AI) {
  'use strict';

  const Game = GameModule.Game || GameModule;
  const T = Deck.CARD_TYPES;
  const A = Deck.ACTIONS;
  const REQ = Deck.SET_REQUIREMENTS;
  const RENT = Deck.RENT_VALUES;
  const CM = Deck.COLOR_META;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const elNew = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // Bump alongside the sw.js cache name on every release so the visible stamp
  // and the cached build always match.
  const APP_VERSION = 'v14';

  const LIGHT_BANDS = ['lightblue', 'yellow', 'utility']; // need dark text on band

  // Railroad & Utility are the two "sets" not identified by a vivid color block,
  // so they get an icon; every other set reads from its color. colorLabel()
  // prepends the icon where a color name is shown on a card/chip.
  const COLOR_EMOJI = { railroad: '🚂', utility: '💡' };
  const colorLabel = (color) => (COLOR_EMOJI[color] ? COLOR_EMOJI[color] + ' ' : '') + CM[color].label;

  // AI opponent flavor (names + avatar emoji + header tint).
  const AI_NAMES = ['NobleRep', 'Parker', 'JustVendor', 'Mogul Mae', 'Tycoon Tim', 'Baron Bo'];
  const AI_AVATARS = ['🧑‍💼', '👩‍💼', '🧔', '👨‍🦰', '👩‍🦱', '🧑'];
  const OPP_TINTS = ['#1f8a4c', '#1f5fc8', '#c0392b', '#7d3cc0', '#0e8f8f'];

  const ACTION_ICON = {
    deal_breaker: '💥', just_say_no: '🚫', pass_go: '➡️', forced_deal: '↔️',
    sly_deal: '🕵️', debt_collector: '🧾', birthday: '🎂', double_rent: '×2',
    house: '🏠', hotel: '🏨',
  };
  // Emblem name rendered as [small pre-word(s)] + [BIG hero word] so the
  // crucial word is legible at a glance (e.g. GO on Pass Go). Single-word
  // actions just use `hero`.
  const ACTION_NAME = {
    deal_breaker: { pre: 'DEAL', hero: 'BREAKER' }, just_say_no: { pre: 'JUST SAY', hero: 'NO!' },
    pass_go: { pre: 'PASS', hero: 'GO' }, forced_deal: { pre: 'FORCED', hero: 'DEAL' },
    sly_deal: { pre: 'SLY', hero: 'DEAL' }, debt_collector: { pre: 'DEBT', hero: 'COLLECTOR' },
    birthday: { pre: "IT'S MY", hero: 'BIRTHDAY' }, double_rent: { pre: 'DOUBLE', hero: 'RENT' },
    house: { hero: 'HOUSE' }, hotel: { hero: 'HOTEL' },
  };
  const ACTION_LABEL = {
    deal_breaker: 'DEAL BREAKER', just_say_no: 'JUST SAY NO!', pass_go: 'PASS GO',
    forced_deal: 'FORCED DEAL', sly_deal: 'SLY DEAL', debt_collector: 'DEBT COLLECTOR',
    birthday: "IT'S MY BIRTHDAY", double_rent: 'DOUBLE RENT', house: 'HOUSE', hotel: 'HOTEL',
  };
  const ACTION_DESC = {
    deal_breaker: 'Steal a complete set of properties.', just_say_no: 'Cancel an action played against you.',
    pass_go: 'Draw 2 extra cards.', forced_deal: 'Swap a property with another player.',
    sly_deal: 'Steal a property (not from a full set).', debt_collector: 'Force a player to pay you 5M.',
    birthday: 'All players give you 2M.', double_rent: 'Play with a rent card to double it.',
    house: 'Add to a full set: +3M rent.', hotel: 'Add to a full set: +4M rent.',
  };

  /* ==========================================================================
   * Card-face rendering (authentic Monopoly-Deal layout, em-scaled)
   * ========================================================================*/
  function rentLadder(color) {
    const t = RENT[color];
    return t.map((v, i) => `${i + 1}${i === t.length - 1 ? ' (full)' : ''}: <b>${v}M</b>`).join('<br>');
  }
  // Compact one-line rents for a single color (used on the split 2-color card).
  function rentLadderShort(color) { return RENT[color].map(v => `${v}M`).join(' · '); }

  // The universal value badge: a small white rounded pill, TOP-LEFT on every
  // card. Big number with a smaller, lowered "M" for clear separation.
  function valPillHTML(value) {
    return `<div class="v-pill"><span class="v-num">${value}</span><span class="v-m">M</span></div>`;
  }

  function rentWheelBg(colors) {
    if (colors.length >= 5) {
      return 'conic-gradient(#e23b9a 0 20%, #f08a1d 20% 40%, #f6cf2e 40% 60%, #2faa5d 60% 80%, #1f3a93 80% 100%)';
    }
    const a = `var(--c-${colors[0]})`, b = `var(--c-${colors[1] || colors[0]})`;
    return `conic-gradient(${a} 0 50%, ${b} 50% 100%)`;
  }

  /** Build a card-face element. opts.chosenColor highlights a wild's target. */
  function renderCardFace(card, opts) {
    opts = opts || {};
    const face = elNew('div', 'cardface');
    const PILL = valPillHTML(card.value);

    if (card.type === T.MONEY) {
      face.classList.add('money', 'm' + card.value);
      face.innerHTML = PILL +
        `<div class="m-center"><div class="big">${card.value}</div><div class="unit">MILLION</div></div>`;
      return face;
    }

    if (card.type === T.PROPERTY) {
      face.classList.add('property');
      const dark = LIGHT_BANDS.indexOf(card.color) === -1;
      const nameStyle = dark ? '' : 'color:#1a1a1a;text-shadow:none';
      // Value pill sits on the white header area; the colored band below holds
      // a large, dominant color name; rents at the bottom.
      face.innerHTML = PILL +
        `<div class="p-band" style="background:var(--c-${card.color})">` +
          `<div class="p-name" style="${nameStyle}">${esc(colorLabel(card.color))}</div></div>` +
        `<div class="p-body"><div class="p-ladder">${rentLadder(card.color)}</div></div>`;
      return face;
    }

    if (card.type === T.PROPERTY_WILD) {
      face.classList.add('wild');
      if (card.isMulti) {
        // Multi-color "any" wild: rainbow field with a clear ANY label. No value
        // pill — it has no cash value, and a "0" reads like a junk card.
        face.innerHTML =
          `<div class="wm-band"></div>` +
          `<div class="wm-body"><div class="wm-title">PROPERTY WILD</div>` +
          `<div class="wm-any">ANY<br>COLOR</div>` +
          `<div class="wm-note">no cash value</div></div>`;
        return face;
      }
      // Two-color wild: split into the two colors, each half labeled with its
      // name + rents. Rebuilt from scratch (was an unreadable stacked mess).
      const [c1, c2] = card.colors;
      const chosen = opts.chosenColor;
      const half = (color, pos) => {
        const dark = LIGHT_BANDS.indexOf(color) === -1;
        const st = dark ? '' : 'color:#1a1a1a;text-shadow:none';
        const on = chosen === color ? ' on' : (chosen ? ' off' : '');
        return `<div class="w-half ${pos}${on}" style="background:var(--c-${color})">` +
          `<div class="wh-name" style="${st}">${esc(colorLabel(color))}</div>` +
          `<div class="wh-rent" style="${st}">${rentLadderShort(color)}</div></div>`;
      };
      face.innerHTML = PILL +
        `<div class="w-split">${half(c1, 'top')}${half(c2, 'bot')}</div>` +
        `<div class="w-tag">WILD</div>`;
      return face;
    }

    if (card.type === T.RENT) {
      face.classList.add('rent');
      // The functional info IS the color pair + who it hits — make THAT the big,
      // glanceable content (the decorative wheel was hiding it before).
      const scope = card.isWild ? 'ONE' : 'ALL';
      const body = card.isWild
        ? `<div class="rent-any">ANY<br>COLOR</div>`
        : card.colors.map(c => {
            const dk = LIGHT_BANDS.indexOf(c) === -1;
            return `<div class="rent-bar" style="background:var(--c-${c})${dk ? '' : ';color:#1a1a1a;text-shadow:none'}">${esc(colorLabel(c))}</div>`;
          }).join('');
      face.innerHTML = PILL +
        `<div class="a-head">RENT</div>` +
        `<div class="rent-scope scope-${scope.toLowerCase()}">Charge ${scope}</div>` +
        `<div class="rent-colors${card.isWild ? ' any' : ''}">${body}</div>`;
      return face;
    }

    // ACTION — one-line header; icon in a circle; the NAME as a full-width band
    // below (hero word large) so even long names stay legible; fitted desc.
    face.classList.add('action', 'act-' + card.action);
    const nm = ACTION_NAME[card.action] || { hero: esc(card.name) };
    const nameHTML = (nm.pre ? `<span class="pre">${esc(nm.pre)}</span>` : '') + `<span class="hero">${esc(nm.hero)}</span>`;
    face.innerHTML = PILL +
      `<div class="a-head">ACTION CARD</div>` +
      `<div class="a-emblem"><div class="emblem-circle"><div class="icon">${ACTION_ICON[card.action] || '⭐'}</div></div></div>` +
      `<div class="a-name">${nameHTML}</div>` +
      `<div class="a-desc">${ACTION_DESC[card.action] || ''}</div>`;
    return face;
  }

  // Compact "mini" property card for the zones — a solid color block so the
  // set color is readable at a glance (Pink vs Red were indistinguishable as
  // thin top stripes). Wildcards keep the rainbow fill.
  function renderMini(card, color) {
    const m = elNew('div', 'mini' + (card.type === T.PROPERTY_WILD ? ' wild' : ''));
    const bar = elNew('div', 'mini-bar');
    if (card.type !== T.PROPERTY_WILD) bar.style.background = `var(--c-${color})`;
    m.append(bar);
    return m;
  }

  /* ==========================================================================
   * HumanAgent — delegates each decision to the UI.
   * ========================================================================*/
  class HumanAgent {
    constructor(ui) { this.ui = ui; this.name = 'You'; }
    chooseMove(view, legal) { return this.ui.promptMove(view, legal); }
    respondToAction(view, ctx) { return this.ui.promptJSN(view, ctx); }
    choosePayment(view, ctx) { return this.ui.promptPayment(view, ctx); }
    chooseDiscards(view, count) { return this.ui.promptDiscards(view, count); }
    assignWildColor(view, card, valid) { return this.ui.promptWildColor(view, card, valid); }
  }

  /* ==========================================================================
   * BusinessDealUI
   * ========================================================================*/
  class BusinessDealUI {
    constructor() {
      this.aiDelay = 900;
      this._pendingMove = null;
      this._bubbles = {};
      this.$ = (id) => document.getElementById(id);
      this.$('pass-btn').addEventListener('click', () => this._passClicked());
      this.$('new-game').addEventListener('click', () => this.showSetup());
    }

    /* ---- setup chooser -------------------------------------------------- */
    showSetup() {
      // Dismiss the win overlay first — it shares the setup's z-index and sits
      // later in the DOM, so if left up it covers the sheet and swallows taps
      // (the "Play Again is a dead-end" bug).
      const win = this.$('winner'); win.classList.remove('show'); win.innerHTML = '';
      document.getElementById('app').classList.remove('game-over');
      this._closeDetail(); this._closeOverlay();

      let chosen = this._lastNumAI || 3;     // remember the last setup
      let diff = this._lastDiff || 'normal';
      const root = this.$('setup');
      const render = () => {
        root.innerHTML =
          '<div class="scrim"></div><div class="sheet">' +
          "<h3>Matt's Monopoly</h3><p>How many AI opponents?</p>" +
          '<div class="count-row">' +
          [1, 2, 3, 4].map(n => `<button class="count-btn${n === chosen ? ' sel' : ''}" data-n="${n}">${n}</button>`).join('') +
          '</div><p style="margin-top:14px">Difficulty</p><div class="count-row">' +
          ['easy', 'normal', 'hard'].map(d => `<button class="count-btn diff${d === diff ? ' sel' : ''}" data-d="${d}" style="width:auto;padding:0 16px;font-size:15px">${d[0].toUpperCase() + d.slice(1)}</button>`).join('') +
          '</div><button class="cta" id="start-btn">Start Game</button>' +
          `<div class="setup-version">${APP_VERSION}</div></div>`;
        root.querySelectorAll('.count-btn[data-n]').forEach(b =>
          b.addEventListener('click', () => { chosen = +b.dataset.n; render(); }));
        root.querySelectorAll('.count-btn[data-d]').forEach(b =>
          b.addEventListener('click', () => { diff = b.dataset.d; render(); }));
        this.$('start-btn').addEventListener('click', () => { root.classList.remove('show'); this.newGame(chosen, diff); });
        root.querySelector('.scrim').addEventListener('click', () => { if (this.game) root.classList.remove('show'); });
      };
      render();
      root.classList.add('show');
    }

    /* ---- lifecycle ----------------------------------------------------- */
    newGame(numAI, difficulty) {
      this._closeDetail(); this._closeOverlay();
      this.$('setup').classList.remove('show');
      this.$('winner').classList.remove('show');
      this._pendingMove = null; this._bubbles = {};
      this.difficulty = difficulty || 'normal';
      this._lastNumAI = numAI; this._lastDiff = this.difficulty;   // for Play Again

      const players = [{ name: 'You', agent: new HumanAgent(this) }];
      for (let i = 0; i < numAI; i++) {
        players.push({
          name: AI_NAMES[i % AI_NAMES.length],
          agent: new AI.AIAgent({ name: AI_NAMES[i], difficulty: this.difficulty }),
        });
      }
      this.game = new Game({ verbose: false, players });
      this.meta = players.map((p, i) => ({
        avatar: i === 0 ? '🧑' : AI_AVATARS[(i - 1) % AI_AVATARS.length],
        tint: i === 0 ? '#0f59c8' : OPP_TINTS[(i - 1) % OPP_TINTS.length],
      }));

      this.game.onTurnStart = async (pl) => {
        this._bubbles = {}; this._seenLogs = this.game.logs.length; this.render();
        if (pl.id === 0) {
          const m = this._lastLog().match(/draws (\d+)/);
          this.toast(m ? `Your turn — you drew ${m[1]}` : 'Your turn — tap a card');
        } else {
          // A clear "AI's turn" beat so attacks don't land on you with no warning,
          // and a moment to review your board after your own turn ends.
          this.toast(`${pl.name}'s turn…`);
          await delay(850);
        }
      };
      this.game.onAfterPlay = async (pl, mv) => {
        const fresh = this.game.logs.slice(this._seenLogs); this._seenLogs = this.game.logs.length;
        if (pl.id !== 0) {
          this._bubbles[pl.id] = this._narrate(mv); this.render();
          await this._announceAIMove(pl, mv, fresh);   // clear beat for attacks; toast otherwise
        } else {
          this.toast(this._humanFeedback(mv, fresh)); this.render();
        }
      };
      // Narrate every Just Say No so the player understands why their JSN did
      // (or didn't) stick — e.g. the AI silently countering with its own JSN.
      this.game.onJsnPlayed = async (info) => {
        const who = info.responder.id === 0 ? 'You' : info.responder.name;
        this.toast(`${who} played Just Say No — ${info.actionCard.name} ${info.proceeds ? 'proceeds' : 'is cancelled'}!`);
        this.render();
        await delay(1500);
      };
      this.game.onTurnEnd = () => this.render();

      this.game.setup();
      this._seenLogs = this.game.logs.length;
      const app = document.getElementById('app');
      app.classList.add('playing'); app.classList.remove('game-over'); // reveal the board
      this.render();
      this.runLoop();
    }

    async runLoop() {
      const g = this.game;
      while (!g.winner) { await g.playTurn(); this.render(); }
      this.showWinner();
    }

    /* ======================================================================
     * Rendering
     * ====================================================================*/
    render() {
      const g = this.game; if (!g) return;
      const me = g.players[0];
      const myTurn = g.currentPlayerIndex === 0 && !g.winner;

      this._renderOpponents();
      this._renderTable();

      // me area
      this.$('me-area').classList.toggle('active', myTurn);
      this.$('me-avatar').textContent = this.meta[0].avatar;
      this.$('me-stats').innerHTML =
        `<span><span class="coin">M</span> ${this._bank(me)}M</span>` +
        `<span>${g.completeSetCount(me)}/3 sets · 🂠${me.hand.length}</span>`;
      this._renderZoneBank(this.$('me-bank'), me);
      this._renderZoneProps(this.$('me-props'), me);

      this._renderHand(me, myTurn);

      // pass button + play dots + explicit "plays left" label
      this.$('pass-btn').disabled = !this._pendingMove;
      const dots = this.$('play-dots'); dots.innerHTML = '';
      const left = myTurn ? g.playsRemaining : 0;
      for (let i = 0; i < 3; i++) dots.append(elNew('div', 'dot' + (i < left ? ' left' : '')));
      this.$('plays-label').textContent = myTurn ? `Plays left: ${left}` : '';
    }

    _bank(p) { return p.bank.reduce((s, c) => s + c.value, 0); }
    _lastLog() { const L = this.game.logs; return L.length ? L[L.length - 1] : ''; }

    _renderOpponents() {
      const g = this.game;
      const box = this.$('opponents'); box.innerHTML = '';
      for (let i = 1; i < g.players.length; i++) {
        const p = g.players[i];
        const active = g.currentPlayerIndex === i && !g.winner;
        const opp = elNew('div', 'opp' + (active ? ' active' : ''));
        const head = elNew('div', 'opp-head');
        head.style.background = this.meta[i].tint;
        // Name gets the full header width (bank moved to the meta row below) so
        // longer AI names don't truncate in the narrow 4-opponent layout.
        head.innerHTML =
          `<div class="opp-avatar">${this.meta[i].avatar}</div>` +
          `<div class="opp-name">${esc(p.name)}</div>`;
        opp.append(head);
        opp.append(elNew('div', 'opp-meta',
          `<span class="opp-bank"><span class="coin">M</span>${this._bank(p)}M</span>` +
          `<span>🂠×${p.hand.length}</span><span>${g.completeSetCount(p)}/3</span>`));
        const body = elNew('div', 'opp-body');
        this._appendSets(body, p);
        if (!Object.keys(p.properties).length) body.append(elNew('div', 'opp-empty', 'no property yet'));
        opp.append(body);
        if (this._bubbles[i]) opp.append(elNew('div', 'bubble', esc(this._bubbles[i])));
        box.append(opp);
      }
    }

    // Each owned set as a readable colored chip: COLOR NAME + count (e.g.
    // "PINK 2/3"). Far clearer at a glance than unlabeled mini-stacks, and it
    // puts the meaning on the property itself rather than a lone bank total.
    _appendSets(container, player) {
      Deck.allPropertyColors().forEach(color => {
        const grp = player.properties[color]; if (!grp) return;
        const req = REQ[color];
        const n = grp.cards.length;
        const complete = n >= req;
        const dark = LIGHT_BANDS.indexOf(color) === -1;
        const chip = elNew('div', 'set-chip' + (complete ? ' complete' : ''));
        chip.style.background = `var(--c-${color})`;
        if (!dark) chip.style.color = '#1a1a1a';
        const count = complete ? `${req}/${req}${n > req ? '+' + (n - req) : ''}` : `${n}/${req}`;
        chip.innerHTML =
          `<span class="sc-name">${esc(colorLabel(color))}</span>` +
          `<span class="sc-count">${count}${grp.house ? '🏠' : ''}${grp.hotel ? '🏨' : ''}</span>`;
        container.append(chip);
      });
    }
    _appendBank(container, player) {
      player.bank.slice().sort((a, b) => b.value - a.value).forEach(c => {
        container.append(elNew('div', 'bank-chip', `${c.value}M`));
      });
    }

    _renderZoneBank(zone, player) {
      zone.innerHTML = '<div class="zlabel">Bank</div>';
      if (!player.bank.length) return;
      this._appendBank(zone, player);
    }
    _renderZoneProps(zone, player) {
      zone.innerHTML = '<div class="zlabel">Properties</div>';
      this._appendSets(zone, player);
    }

    _renderTable() {
      const g = this.game;
      this.$('draw-pile').innerHTML =
        `<div class="cardback"><span>MATT'S</span><span>MONOPOLY</span></div><div class="count">×${g.deck.length}</div>`;
      const disc = this.$('discard-pile');
      const top = g.discard[g.discard.length - 1];
      disc.innerHTML = '';
      if (top) {
        const f = renderCardFace(top); f.style.setProperty('--fs', '5.9px'); f.style.cursor = 'default';
        disc.append(f);
        disc.append(elNew('div', 'count', `×${g.discard.length}`));
      } else {
        disc.append(elNew('div', 'empty'));
      }
    }

    _renderHand(me, interactive) {
      const handEl = this.$('hand'); handEl.innerHTML = '';
      const n = me.hand.length;
      const cards = [];
      me.hand.forEach(card => {
        const f = renderCardFace(card);
        if (interactive && this._pendingMove) f.addEventListener('click', () => this._openDetail(card.id));
        else f.style.cursor = 'default';
        handEl.append(f);
        cards.push(f);
      });
      if (!n) return;
      // Keep cards a READABLE size and overlap them into a fan to fit the width
      // (like the real app) — never shrink the text to illegibility, never
      // scroll sideways. Each card's left edge (its value pill) stays visible
      // and tappable; the rightmost card is fully shown.
      const W = (handEl.clientWidth || Math.min(window.innerWidth, 560)) - 16;
      const gap = 4, cardEm = 9.2;
      const fit = (W - (n - 1) * gap) / (n * cardEm);     // size that fits with NO overlap
      let fs = Math.max(6.6, Math.min(7.4, fit));         // floor 6.6 → overlap instead of shrinking
      let cardW = cardEm * fs;
      let total = n * cardW + (n - 1) * gap;
      let overlap = total > W ? (total - W) / (n - 1) : 0;
      // Visible left strip per overlapped card = (W - cardW)/(n-1). If a huge
      // hand makes that too thin to read/tap, ease the size down (to a hard floor).
      if (n > 1 && overlap > 0 && (W - cardW) / (n - 1) < 22) {
        cardW = Math.max(cardEm * 5.2, W - 22 * (n - 1));
        fs = Math.min(7.4, cardW / cardEm);
        cardW = cardEm * fs;
        total = n * cardW + (n - 1) * gap;
        overlap = total > W ? (total - W) / (n - 1) : 0;
      }
      cards.forEach((f, i) => {
        f.style.setProperty('--fs', fs + 'px');
        f.style.marginLeft = i === 0 ? '0' : (-overlap) + 'px';
        f.style.zIndex = String(i); // later cards on top so left strips stay tappable
      });
      handEl.style.justifyContent = overlap > 0 ? 'flex-start' : 'center';
    }

    _narrate(move) {
      if (move.type === 'bank') return 'Banked';
      if (move.type === 'property') return 'New property';
      if (move.type === 'rent') return 'Rent! Pay up';
      if (move.type === 'action') {
        return ({
          [A.DEAL_BREAKER]: 'Deal Breaker!', [A.SLY_DEAL]: 'Sly Deal!', [A.FORCED_DEAL]: 'Forced Deal!',
          [A.DEBT_COLLECTOR]: 'Pay 5M!', [A.BIRTHDAY]: "It's my birthday!", [A.PASS_GO]: 'Pass Go',
          [A.HOUSE]: 'House', [A.HOTEL]: 'Hotel',
        }[this._actionOfMove(move)] || 'Plays a card');
      }
      return '';
    }
    _actionOfMove(move) {
      // find the card in any hand/discard to know its action (best effort)
      for (const p of this.game.players) {
        const c = p.hand.find(x => x.id === move.cardId); if (c) return c.action;
      }
      const d = this.game.discard.find(x => x.id === move.cardId);
      return d ? d.action : null;
    }

    /** A short, friendly summary of the human's own resolved move, built from
     *  the deterministic engine logs produced during it. '' = no toast. */
    _humanFeedback(move, logs) {
      logs = logs || [];
      // Total money paid TO you across all targets this move.
      const collected = logs.reduce((s, l) => {
        const m = l.match(/pays You (\d+)M/); return s + (m ? +m[1] : 0);
      }, 0);
      const someoneOwed = logs.some(l => /(plays|charges|asking|demanding)/.test(l)) ||
                          /rent|action/.test(move.type);
      const nobodyPaid = collected === 0 && logs.some(l => /nothing to pay/.test(l));

      if (move.type === 'rent') {
        return collected > 0 ? `Collected ${collected}M in rent` : 'Rent — nobody could pay';
      }
      if (move.type === 'action') {
        switch (this._actionOfMove(move)) {
          case A.SLY_DEAL: {
            const m = logs.map(l => l.match(/steals (.+?) from/)).find(Boolean);
            return m ? `Stole ${m[1]}` : 'Stole a property';
          }
          case A.FORCED_DEAL: return 'Swapped a property';
          case A.DEAL_BREAKER: return move.targetColor ? `Took the ${CM[move.targetColor].label} set` : 'Stole a set';
          case A.DEBT_COLLECTOR: return collected > 0 ? `Collected ${collected}M` : 'Debt — nobody could pay';
          case A.BIRTHDAY: return collected > 0 ? `Birthday: collected ${collected}M` : 'Birthday — nobody could pay';
          case A.PASS_GO: return 'Pass Go — drew 2 cards';
          case A.HOUSE: return 'Added a House';
          case A.HOTEL: return 'Added a Hotel';
        }
      }
      return ''; // bank / property placements are self-evident on the board
    }

    /** Announce an AI move. Property-stealing actions against the human get a
     *  blocking "beat" (a clear OK modal) so you never lose a property between
     *  frames; everything else is a brief toast + the usual AI pause. */
    async _announceAIMove(pl, mv, fresh) {
      const atk = pl.name;
      let beat = null, m;
      for (const l of fresh) {
        if ((m = l.match(/steals (.+?) from You\b/))) beat = `${atk} played Sly Deal and took your ${m[1]}.`;
        else if ((m = l.match(/DEAL BREAKS You's (.+?) set/))) beat = `${atk} played Deal Breaker and took your ${m[1]} set!`;
        else if (/swaps properties with You\b/.test(l)) beat = `${atk} played Forced Deal and swapped a property with you.`;
      }
      if (beat) { return this._beat('You were attacked!', beat, this._cardOfMove(mv)); }
      // Charged you (rent/debt/birthday)? You already saw the payment screen.
      const paid = fresh.reduce((s, l) => { const x = l.match(/You pays .+? (\d+)M/); return s + (x ? +x[1] : 0); }, 0);
      if (paid > 0) { this.toast(`You paid ${paid}M to ${atk}`); return delay(this.aiDelay); }
      this.toast(this._lastLog());
      return delay(this.aiDelay);
    }

    /** The card an AI move played — now sitting on top of the discard pile. */
    _cardOfMove(move) {
      for (let i = this.game.discard.length - 1; i >= 0; i--) {
        if (this.game.discard[i].id === move.cardId) return this.game.discard[i];
      }
      return null;
    }

    /** A blocking acknowledgement modal — pauses the game until the user taps OK.
     *  Shows the offending card face when one is supplied (per-attack visual). */
    _beat(title, msg, card) {
      return new Promise(resolve => {
        const sheet = this._sheet(
          `<h3>${esc(title)}</h3><div class="beat-card"></div><p>${esc(msg)}</p>` +
          '<button class="cta" id="beat-ok">OK</button>');
        if (card) {
          const f = renderCardFace(card);
          f.style.setProperty('--fs', '12px'); f.style.cursor = 'default';
          sheet.querySelector('.beat-card').append(f);
        }
        sheet.querySelector('#beat-ok').addEventListener('click', () => { this._closeOverlay(); resolve(); });
      });
    }

    /* ======================================================================
     * Human move selection
     * ====================================================================*/
    promptMove(view, legal) {
      this._legal = legal; this._view = view;
      return new Promise(resolve => { this._pendingMove = { resolve }; this.render(); });
    }

    _passClicked() { if (this._pendingMove) this._resolveMove({ type: 'pass' }); }

    _resolveMove(move) {
      const p = this._pendingMove; this._pendingMove = null;
      this._closeDetail(); this._closeOverlay();
      if (p) p.resolve(move);
    }

    _openDetail(cardId) {
      if (!this._pendingMove) return;
      const card = this._view.me.hand.find(c => c.id === cardId);
      if (!card) return;
      const moves = this._legal.filter(m => m.cardId === cardId);
      const bankMove = moves.find(m => m.type === 'bank');
      const playMoves = moves.filter(m => m.type !== 'bank');
      // Flip applies only to two-color wilds (toggle between their two colors).
      // Multi-color "any" wilds aren't flipped — Play opens a color picker.
      const isWild = card.type === T.PROPERTY_WILD && !card.isMulti && card.colors.length > 1;
      const colors = card.type === T.PROPERTY_WILD ? card.colors : (card.color ? [card.color] : []);
      this._detail = { cardId, colorIdx: 0, colors, bankMove, playMoves, isWild, isMulti: card.type === T.PROPERTY_WILD && card.isMulti };
      this._drawDetail();
    }

    _drawDetail() {
      const d = this._detail;
      const card = this._view.me.hand.find(c => c.id === d.cardId);
      const root = this.$('card-detail');
      root.innerHTML = '<div class="scrim"></div>';
      const wrap = elNew('div', 'detail-wrap');
      // No dimmed half — Flip is gone, so show both colors of a wild at full
      // brightness (the dimming made the inactive half hard to read).
      wrap.append(renderCardFace(card));

      const acts = elNew('div', 'actions');
      const mkBtn = (cls, icon, label, enabled, fn) => {
        const b = elNew('button', 'act-btn ' + cls, `<span class="ic">${icon}</span><span class="lbl">${label}</span>`);
        b.disabled = !enabled;
        if (enabled) b.addEventListener('click', fn);
        return b;
      };
      // No Flip button: every wild (two-color AND any-color) picks its color in
      // the color-swatch picker on Play — Flip was redundant with that and
      // implied state it didn't keep.
      acts.append(mkBtn('bank', '🏦', 'Bank', !!d.bankMove, () => this._resolveMove(d.bankMove)));
      acts.append(mkBtn('play', '✔', 'Play', d.playMoves.length > 0, () => this._playFromDetail()));
      // "Close" just dismisses this card (returns to the hand). Ending the turn
      // is the board's big Pass button — two different actions, two names.
      acts.append(mkBtn('close', '✕', 'Close', true, () => this._closeDetail()));
      wrap.append(acts);
      // Explain a greyed-out Play so it doesn't look like a bug.
      if (d.playMoves.length === 0) {
        const reason = this._playDisabledReason(card);
        if (reason) wrap.append(elNew('div', 'detail-note', '✔ Play unavailable — ' + esc(reason)));
      }
      root.append(wrap);
      root.querySelector('.scrim').addEventListener('click', () => this._closeDetail());
      root.classList.add('show');
    }

    _playDisabledReason(card) {
      if (card.type === T.MONEY) return 'money is banked, not played.';
      if (card.type === T.RENT) return 'you don’t own any of this card’s colors yet.';
      if (card.type !== T.ACTION) return '';
      switch (card.action) {
        case A.JUST_SAY_NO: return 'it plays automatically when you’re attacked.';
        case A.DOUBLE_RENT: return 'play it together with a Rent card to double it.';
        case A.HOUSE: return 'needs a complete set with no house yet.';
        case A.HOTEL: return 'needs a complete set that already has a house.';
        case A.DEAL_BREAKER: return 'no opponent has a complete set to steal.';
        case A.SLY_DEAL:
        case A.FORCED_DEAL: return 'no opponent has a stealable property.';
        default: return 'it can’t be played right now.';
      }
    }

    _playFromDetail() {
      const d = this._detail;
      const card = this._view.me.hand.find(c => c.id === d.cardId);
      if (card.type === T.PROPERTY) {
        const mv = d.playMoves.find(m => m.type === 'property' && m.color === card.color) || d.playMoves[0];
        return this._resolveMove(mv);
      }
      // Every wildcard (two-color AND multi-color) is placed via an explicit
      // color picker with completion hints — no silent auto-assignment.
      if (card.type === T.PROPERTY_WILD) {
        if (d.playMoves.length === 1) return this._resolveMove(d.playMoves[0]);
        this._closeDetail();
        return this._showColorPicker(d.playMoves, 'Place wildcard as…');
      }
      // Swap/steal get guided pickers so the lists stay short and unambiguous.
      if (card.type === T.ACTION && card.action === A.FORCED_DEAL) {
        this._closeDetail(); return this._forcedDealFlow(d.playMoves);
      }
      if (card.type === T.ACTION && card.action === A.SLY_DEAL) {
        this._closeDetail(); return this._slyDealFlow(d.playMoves);
      }
      // Single legal play → do it; otherwise pick a target.
      if (d.playMoves.length === 1) return this._resolveMove(d.playMoves[0]);
      this._closeDetail();
      this._showTargets(d.playMoves);
    }

    /** Vertical, scrollable list picker with a sticky header. Each option is
     *  {label, win?, onPick}. A Cancel row is always appended. */
    _pickList(title, options, opts) {
      opts = opts || {};
      const root = this.$('overlay');
      root.innerHTML = '<div class="scrim"></div>';
      const sheet = elNew('div', 'sheet picker');
      sheet.append(elNew('h3', null, esc(title)));
      if (opts.subtitle) sheet.append(elNew('p', null, esc(opts.subtitle)));
      const list = elNew('div', 'pick-list');
      options.forEach(o => {
        const b = elNew('button', 'pick' + (o.win ? ' win' : ''), esc(o.label));
        b.addEventListener('click', o.onPick);
        list.append(b);
      });
      const cancel = elNew('button', 'pick ghost', 'Cancel');
      cancel.addEventListener('click', () => this._closeOverlay());
      list.append(cancel);
      sheet.append(list);
      root.append(sheet);
      root.querySelector('.scrim').addEventListener('click', () => this._closeOverlay());
      root.classList.add('show');
    }

    _showTargets(moves, title) {
      const seen = {};
      const options = moves.map(m => {
        const lbl = this._describeMove(this._view, m);
        // Distinguish any still-identical labels as a last resort.
        seen[lbl.text] = (seen[lbl.text] || 0) + 1;
        const label = seen[lbl.text] > 1 ? `${lbl.text} (${seen[lbl.text]})` : lbl.text;
        // Surface the useful choices first (winning, then completing a set),
        // so on a 10-color wild you don't scroll past junk to find them.
        const rank = lbl.win ? 0 : (/completes/.test(lbl.text) ? 1 : 2);
        return { label, win: lbl.win, rank, onPick: () => this._resolveMove(m) };
      });
      options.sort((a, b) => a.rank - b.rank);
      this._pickList(title || 'Choose a target', options);
    }

    /** Wildcard color picker — an actual grid of COLOR SWATCHES (not a text
     *  list), completing colors first, with a Cancel that's always reachable. */
    _showColorPicker(moves, title) {
      const me = this._view.me;
      const scored = moves.map(m => {
        const before = countOf(me.properties, m.color);
        const completes = before < REQ[m.color] && before + 1 >= REQ[m.color];
        const win = completes && me.completeSets + 1 >= 3;
        return { m, completes, win, rank: win ? 0 : completes ? 1 : 2 };
      }).sort((a, b) => a.rank - b.rank);

      const root = this.$('overlay');
      root.innerHTML = '<div class="scrim"></div>';
      const sheet = elNew('div', 'sheet swatch-sheet');
      sheet.append(elNew('h3', null, esc(title || 'Place wildcard as…')));
      const grid = elNew('div', 'swatch-grid');
      scored.forEach(({ m, completes, win }) => {
        const dark = LIGHT_BANDS.indexOf(m.color) === -1;
        const b = elNew('button', 'swatch' + (win ? ' win' : completes ? ' completes' : ''));
        b.style.background = `var(--c-${m.color})`;
        if (!dark) b.style.color = '#1a1a1a';
        b.innerHTML = `<span class="sw-name">${esc(colorLabel(m.color))}</span>` +
          (win ? '<span class="sw-tag">🏆 WINS</span>' : completes ? '<span class="sw-tag">✓ completes</span>' : '');
        b.addEventListener('click', () => this._resolveMove(m));
        grid.append(b);
      });
      sheet.append(grid);
      const cancel = elNew('button', 'cta swatch-cancel', 'Cancel');
      cancel.addEventListener('click', () => this._closeOverlay());
      sheet.append(cancel);
      root.append(sheet);
      root.querySelector('.scrim').addEventListener('click', () => this._closeOverlay());
      root.classList.add('show');
    }

    /** Describe a property a player holds: color/name, $value, set progress. */
    _propDesc(playerView, cardId) {
      for (const color of Object.keys(playerView.properties)) {
        const g = playerView.properties[color];
        const c = g.cards.find(x => x.id === cardId);
        if (!c) continue;
        const isWild = c.type === T.PROPERTY_WILD;
        const name = isWild
          ? (c.isMulti ? 'Wild' : c.colors.map(k => CM[k].label).join('/'))
          : CM[color].label;
        return { color, name, value: c.value, count: g.cards.length, req: REQ[color], isWild };
      }
      return null;
    }

    /** Two cards a player can't tell apart (same color, value, real/wild) are
     *  interchangeable for a steal/swap — keep only the first of each so the
     *  list isn't padded with indistinguishable "(2)" duplicates. */
    _dedupeMoves(moves, propOf) {
      const seen = new Set(), out = [];
      for (const m of moves) {
        const pd = propOf(m);
        const sig = pd ? `${pd.color}:${pd.value}:${pd.isWild ? 'w' : 'p'}` : Math.random();
        if (seen.has(sig)) continue;
        seen.add(sig); out.push(m);
      }
      return out;
    }

    /** Sly Deal: one step — pick which opponent property to steal. */
    _slyDealFlow(moves) {
      const me = this._view.me;
      const oppOf = (m) => this._view.opponents.find(o => o.id === m.targetPlayerId);
      const unique = this._dedupeMoves(moves, (m) => { const o = oppOf(m); return o && this._propDesc(o, m.targetCardId); });
      const options = unique.map(m => {
        const opp = oppOf(m);
        const pd = opp && this._propDesc(opp, m.targetCardId);
        let completes = false, win = false;
        if (pd) {
          const before = countOf(me.properties, pd.color);
          completes = before < REQ[pd.color] && before + 1 >= REQ[pd.color];
          win = completes && me.completeSets + 1 >= 3;
        }
        const label = pd
          ? `${opp.name} · ${pd.name} (${pd.value}M) [${pd.count}/${pd.req}]` +
            (win ? ' 🏆 WINS' : completes ? ' ✓ completes' : '')
          : 'Steal property';
        return { label, win, onPick: () => this._resolveMove(m) };
      });
      this._pickList('Steal which property?', options);
    }

    /** Forced Deal: two steps — take which of theirs, then give which of yours.
     *  Collapses the my×their combinatorial list into my+their short lists. */
    _forcedDealFlow(moves) {
      const me = this._view.me;
      const oppOf = (m) => this._view.opponents.find(o => o.id === m.targetPlayerId);
      // Group by the property to take, deduping interchangeable copies.
      const takeMap = new Map();
      moves.forEach(m => {
        const opp = oppOf(m);
        const pd = opp && this._propDesc(opp, m.targetCardId);
        const sig = pd ? `${m.targetPlayerId}:${pd.color}:${pd.value}:${pd.isWild ? 'w' : 'p'}` : 'x';
        if (!takeMap.has(sig)) takeMap.set(sig, []);
        takeMap.get(sig).push(m);
      });
      const options = [...takeMap.values()].map(list => {
        const m = list[0];
        const opp = oppOf(m);
        const pd = opp && this._propDesc(opp, m.targetCardId);
        let completes = false;
        if (pd) {
          const before = countOf(me.properties, pd.color);
          completes = before < REQ[pd.color] && before + 1 >= REQ[pd.color];
        }
        const label = pd
          ? `Take ${opp.name}'s ${pd.name} (${pd.value}M)` + (completes ? ' ✓ completes' : '')
          : 'Take property';
        return { label, win: false, onPick: () => this._forcedDealGive(list) };
      });
      this._pickList('Forced Deal — take which?', options);
    }

    _forcedDealGive(moves) {
      const me = this._view.me;
      const unique = this._dedupeMoves(moves, (m) => this._propDesc(me, m.myCardId));
      const options = unique.map(m => {
        const pd = this._propDesc(me, m.myCardId);
        const label = pd
          ? `Give your ${pd.name} (${pd.value}M) [${pd.count}/${pd.req}]`
          : 'Give property';
        return { label, win: false, onPick: () => this._resolveMove(m) };
      });
      this._pickList('Forced Deal — give which?', options, { subtitle: 'You give one of yours in exchange.' });
    }

    _closeDetail() { const r = this.$('card-detail'); r.classList.remove('show'); r.innerHTML = ''; }
    _closeOverlay() { const r = this.$('overlay'); r.classList.remove('show'); r.innerHTML = ''; }

    _oppName(view, id) {
      const o = view.opponents.find(x => x.id === id);
      return o ? o.name : 'opponent';
    }
    _findProp(props, cardId) {
      for (const color of Object.keys(props)) if (props[color].cards.some(c => c.id === cardId)) return { color };
      return null;
    }

    _describeMove(view, move) {
      const me = view.me;
      const card = me.hand.find(c => c.id === move.cardId);
      if (move.type === 'property') {
        const before = countOf(me.properties, move.color);
        const completes = before < REQ[move.color] && before + 1 >= REQ[move.color];
        const win = completes && me.completeSets + 1 >= 3;
        return { text: CM[move.color].label + (win ? ' 🏆 WINS!' : completes ? ' ✓ completes' : ''), win };
      }
      if (move.type === 'rent') {
        const base = setRentUI(me.properties, move.color);
        const mult = Math.pow(2, (move.doubleCardIds || []).length);
        const who = move.targetPlayerId != null ? this._oppName(view, move.targetPlayerId) : 'all';
        return { text: `Rent ${CM[move.color].label}${mult > 1 ? ' ×2' : ''} → ${who} pays ${base * mult}M` };
      }
      if (move.type === 'action') {
        const who = move.targetPlayerId != null ? this._oppName(view, move.targetPlayerId) : null;
        switch (card.action) {
          case A.DEBT_COLLECTOR: return { text: `${who}: pay 5M` };
          case A.HOUSE: return { text: 'House → ' + CM[move.color].label };
          case A.HOTEL: return { text: 'Hotel → ' + CM[move.color].label };
          case A.SLY_DEAL: {
            const opp = view.opponents.find(o => o.id === move.targetPlayerId);
            const f = opp && this._findProp(opp.properties, move.targetCardId);
            return { text: `Steal ${f ? CM[f.color].label : 'property'} from ${who}` };
          }
          case A.FORCED_DEAL: {
            const opp = view.opponents.find(o => o.id === move.targetPlayerId);
            const t = opp && this._findProp(opp.properties, move.targetCardId);
            const m = this._findProp(me.properties, move.myCardId);
            return { text: `Give ${m ? CM[m.color].label : '?'}, take ${t ? CM[t.color].label : '?'} (${who})` };
          }
          case A.DEAL_BREAKER: {
            const win = (me.completeSets + 1 >= 3);
            return { text: `Deal Breaker: ${who}'s ${CM[move.targetColor].label}` + (win ? ' 🏆' : ''), win };
          }
        }
      }
      return { text: 'Play' };
    }

    /* ======================================================================
     * Reactive overlays
     * ====================================================================*/
    _sheet(html) {
      const root = this.$('overlay');
      root.innerHTML = '<div class="scrim"></div>';
      const sheet = elNew('div', 'sheet', html);
      root.append(sheet);
      root.classList.add('show');
      return sheet;
    }

    promptJSN(view, ctx) {
      const card = ctx.actionCard;
      const atkName = this._oppName(view, ctx.attackerId);
      return new Promise(resolve => {
        const sheet = this._sheet(
          `<h3>Just Say No?</h3><p>${ctx.responderRole === 'attacker'
            ? esc(atkName) + ' cancelled your ' + esc(card.name) + '. Counter it?'
            : esc(atkName) + ' played ' + esc(card.name) + ' against you. Cancel it?'}</p>` +
          '<div class="row"><button class="opt win" id="jsn-yes">Play Just Say No</button>' +
          '<button class="opt ghost" id="jsn-no">' + (ctx.responderRole === 'attacker' ? 'Let it cancel' : 'Allow it') + '</button></div>');
        sheet.querySelector('#jsn-yes').addEventListener('click', () => { this._closeOverlay(); resolve(true); });
        sheet.querySelector('#jsn-no').addEventListener('click', () => { this._closeOverlay(); resolve(false); });
      });
    }

    promptPayment(view, ctx) {
      const me = view.me;
      const completeColors = new Set(Object.keys(me.properties).filter(c => me.properties[c].cards.length >= REQ[c]));
      // Gather selectable assets, keeping the real card object so we can render
      // an authentic face for each (bank money, then property cards/buildings).
      const bankAssets = me.bank.filter(c => c.canPay !== false).map(c => ({ card: c, value: c.value }));
      const propAssets = [];
      Object.keys(me.properties).forEach(color => {
        const g = me.properties[color];
        const breaks = completeColors.has(color); // paying with this breaks a finished set
        g.cards.forEach(c => { if (c.canPay) propAssets.push({ card: c, value: c.value, breaks }); });
        if (g.house) propAssets.push({ card: g.house, value: g.house.value, breaks });
        if (g.hotel) propAssets.push({ card: g.hotel, value: g.hotel.value, breaks });
      });
      const all = bankAssets.concat(propAssets);
      const total = all.reduce((s, a) => s + a.value, 0);
      const required = Math.min(ctx.amount, total);
      const creditor = this._oppName(view, ctx.creditorId);
      const verb = ctx.reason === 'birthday' ? 'is asking' : ctx.reason === 'rent' ? 'charges' : 'is demanding';
      const forWhat = ctx.reason === 'birthday' ? ' for Birthday' : ctx.reason === 'rent' ? ' rent' : '';

      return new Promise(resolve => {
        const root = this.$('overlay');
        root.innerHTML = '';

        if (!all.length) {
          const sheet = this._sheet(`<h3>You owe ${ctx.amount}M to ${esc(creditor)}</h3>` +
            '<p>You have nothing on the table — you pay nothing.</p><button class="cta" id="ok">OK</button>');
          sheet.querySelector('#ok').addEventListener('click', () => { this._closeOverlay(); resolve([]); });
          return;
        }

        const selected = new Set();
        const screen = elNew('div', 'pay-screen');
        const banner = elNew('div', 'pay-banner',
          `<div class="main">${esc(creditor)} ${verb} ${ctx.amount}M${forWhat}.</div>` +
          '<div class="sub" id="pay-sub">Select cards worth the amount — no change given.</div>');

        // Scrollable middle: the charging card, then labelled bank + property rows.
        const scroll = elNew('div', 'pay-scroll');
        if (ctx.sourceCard) { const sc = renderCardFace(ctx.sourceCard); sc.classList.add('pay-source'); sc.style.cursor = 'default'; scroll.append(sc); }

        const refresh = () => {
          const s = all.filter(a => selected.has(a.card.id)).reduce((sum, a) => sum + a.value, 0);
          sel.textContent = `Selected ${s}M`;
          payBtn.disabled = s < required;
          banner.querySelector('#pay-sub').textContent = s >= required
            ? 'Tap Pay to settle up.' : `Need ${required}M (no change given).`;
        };
        const mkZone = (label, assets, emptyMsg) => {
          scroll.append(elNew('div', 'pay-zlabel', label));
          const zone = elNew('div', 'pay-zone');
          if (!assets.length) zone.append(elNew('div', 'zempty', emptyMsg));
          assets.forEach(a => {
            const wrap = elNew('div', 'pay-card' + (a.breaks ? ' breaks' : ''));
            wrap.append(renderCardFace(a.card));
            if (a.breaks) wrap.append(elNew('div', 'breaks-tag', '⚠ breaks set'));
            wrap.addEventListener('click', () => {
              if (selected.has(a.card.id)) { selected.delete(a.card.id); wrap.classList.remove('sel'); }
              else { selected.add(a.card.id); wrap.classList.add('sel'); }
              refresh();
            });
            zone.append(wrap);
          });
          scroll.append(zone);
        };
        mkZone('Bank', bankAssets, 'No bank cards');
        mkZone('Properties', propAssets, 'No properties — bank only');

        // Fixed footer so the controls never float over the board.
        const footer = elNew('div', 'pay-footer');
        const sel = elNew('div', 'pay-selected', 'Selected 0M');
        const payBtn = elNew('button', 'pay-go', 'Pay'); payBtn.disabled = true;
        const clearBtn = elNew('button', 'pay-clear', 'Clear');
        const btns = elNew('div', 'pay-actions'); btns.append(payBtn, clearBtn);
        footer.append(sel, btns);

        payBtn.addEventListener('click', () => { this._closeOverlay(); resolve([...selected]); });
        clearBtn.addEventListener('click', () => {
          selected.clear();
          screen.querySelectorAll('.pay-card.sel').forEach(e => e.classList.remove('sel'));
          refresh();
        });

        screen.append(banner, scroll, footer);
        root.append(screen);
        root.classList.add('show');
        refresh();
      });
    }

    promptDiscards(view, count) {
      const hand = view.me.hand.slice();
      return new Promise(resolve => {
        const selected = new Set();
        const sheet = this._sheet(
          `<h3>Discard ${count} card${count === 1 ? '' : 's'}</h3><p>You are over the 7-card limit.</p>` +
          '<div class="row" id="d-row"></div><button class="cta" id="d-go" disabled>Discard</button>');
        const row = sheet.querySelector('#d-row');
        const go = sheet.querySelector('#d-go');
        const refresh = () => { go.disabled = selected.size !== count; };
        hand.forEach(c => {
          const b = elNew('button', 'opt', esc(shortName(c)));
          b.addEventListener('click', () => {
            if (selected.has(c.id)) selected.delete(c.id);
            else { if (selected.size >= count) return; selected.add(c.id); }
            b.classList.toggle('sel', selected.has(c.id)); refresh();
          });
          row.append(b);
        });
        go.addEventListener('click', () => { this._closeOverlay(); resolve([...selected]); });
        refresh();
      });
    }

    promptWildColor(view, card, valid) {
      return new Promise(resolve => {
        const sheet = this._sheet('<h3>Place wildcard</h3><p>Assign it to one of your sets:</p><div class="row" id="w-row"></div>');
        const row = sheet.querySelector('#w-row');
        valid.forEach(color => {
          const b = elNew('button', 'opt', CM[color].label);
          b.style.borderBottom = `4px solid var(--c-${color})`;
          b.addEventListener('click', () => { this._closeOverlay(); resolve(color); });
          row.append(b);
        });
      });
    }

    /* ---- toast + winner ------------------------------------------------ */
    toast(msg) {
      if (!msg) return;
      const t = this.$('toast');
      t.innerHTML = `<div class="msg">${esc(msg)}</div>`;
      t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove('show'), 2600);
    }

    showWinner() {
      const w = this.game.winner;
      const root = this.$('winner');
      const sets = this.game.completeColors(w).map(c => CM[c].label).join(', ');
      root.innerHTML =
        '<div class="scrim"></div><div class="win-card">' +
        `<h1>${w.id === 0 ? 'You Win! 🎉' : esc(w.name) + ' wins'}</h1>` +
        `<p>Winning sets: ${esc(sets)}</p>` +
        '<button class="cta" id="again">Play Again</button></div>';
      root.querySelector('#again').addEventListener('click', () => this.showSetup());
      root.classList.add('show');
      // The board's bottom "New Game" sits under this overlay (dead tap); hide it
      // so "Play Again" is the single, working restart.
      document.getElementById('app').classList.add('game-over');
    }
  }

  /* ---- shared helpers --------------------------------------------------- */
  function countOf(props, color) { return props[color] ? props[color].cards.length : 0; }
  function shortName(card) {
    if (card.type === T.MONEY) return card.value + 'M';
    if (card.type === T.PROPERTY) return CM[card.color].label;
    if (card.type === T.PROPERTY_WILD) return card.isMulti ? 'Wild (any)' : card.colors.map(c => CM[c].label).join('/');
    return card.name;
  }
  function setRentUI(props, color) {
    const g = props[color];
    if (!g || !g.cards.length) return 0;
    const t = RENT[color];
    let r = t[Math.min(g.cards.length, t.length) - 1];
    if (g.cards.length >= REQ[color] && Deck.NO_BUILDING_COLORS.indexOf(color) === -1) {
      if (g.house) r += Deck.HOUSE_RENT_BONUS;
      if (g.hotel) r += Deck.HOTEL_RENT_BONUS;
    }
    return r;
  }

  return { BusinessDealUI, HumanAgent, renderCardFace };
});
