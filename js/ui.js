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

  const LIGHT_BANDS = ['lightblue', 'yellow', 'utility']; // need dark text on band

  // AI opponent flavor (names + avatar emoji + header tint).
  const AI_NAMES = ['NobleRep', 'Parker', 'JustVendor', 'Mogul Mae', 'Tycoon Tim', 'Baron Bo'];
  const AI_AVATARS = ['🧑‍💼', '👩‍💼', '🧔', '👨‍🦰', '👩‍🦱', '🧑'];
  const OPP_TINTS = ['#1f8a4c', '#1f5fc8', '#c0392b', '#7d3cc0', '#0e8f8f'];

  const ACTION_ICON = {
    deal_breaker: '💥', just_say_no: '🚫', pass_go: '➡️', forced_deal: '🔁',
    sly_deal: '🕵️', debt_collector: '💵', birthday: '🎂', double_rent: '✖️',
    house: '🏠', hotel: '🏨',
  };
  const ACTION_LABEL = {
    deal_breaker: 'DEAL BREAKER', just_say_no: 'JUST SAY NO!', pass_go: 'PASS GO',
    forced_deal: 'FORCED DEAL', sly_deal: 'SLY DEAL', debt_collector: 'DEBT COLLECTOR',
    birthday: "IT'S MY BIRTHDAY", double_rent: 'DOUBLE RENT', house: 'HOUSE', hotel: 'HOTEL',
  };
  const ACTION_DESC = {
    deal_breaker: 'Steal a complete set of properties.', just_say_no: 'Cancel an action played against you.',
    pass_go: 'Draw 2 extra cards.', forced_deal: 'Swap a property with another player.',
    sly_deal: 'Steal a property (not from a full set).', debt_collector: 'Force a player to pay you $5M.',
    birthday: 'All players give you $2M.', double_rent: 'Play with a rent card to double it.',
    house: 'Add to a full set: +$3M rent.', hotel: 'Add to a full set: +$4M rent.',
  };

  /* ==========================================================================
   * Card-face rendering (authentic Monopoly-Deal layout, em-scaled)
   * ========================================================================*/
  function rentLadder(color) {
    const t = RENT[color];
    return t.map((v, i) => `${i + 1}${i === t.length - 1 ? ' (full)' : ''}: <b>$${v}M</b>`).join('<br>');
  }
  function vchip(v) { return `<span class="vchip">$${v}<small>M</small></span>`; }

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

    if (card.type === T.MONEY) {
      face.classList.add('money', 'm' + card.value);
      face.innerHTML =
        `<div class="v-tl">${card.value}<small>M</small></div>` +
        `<div class="m-center"><div class="big">${card.value}</div><div class="unit">MILLION</div></div>` +
        `<div class="v-br">${card.value}<small>M</small></div>`;
      return face;
    }

    if (card.type === T.PROPERTY) {
      face.classList.add('property');
      const dark = LIGHT_BANDS.indexOf(card.color) === -1;
      face.innerHTML =
        `<div class="p-band" style="background:var(--c-${card.color})">` +
          `<div class="p-name" style="${dark ? '' : 'color:#1a1a1a;text-shadow:none'}">${esc(CM[card.color].label)}</div></div>` +
        `<div class="v-tl">${vchip(card.value)}</div>` +
        `<div class="p-body"><div class="p-ladder">${rentLadder(card.color)}</div></div>` +
        `<div class="v-br">${vchip(card.value)}</div>`;
      return face;
    }

    if (card.type === T.PROPERTY_WILD) {
      face.classList.add('wild');
      const bandStyle = card.isMulti
        ? 'background:linear-gradient(90deg,#e23b9a,#f08a1d,#f6cf2e,#2faa5d,#1f3a93)'
        : `background:linear-gradient(90deg,var(--c-${card.colors[0]}) 50%,var(--c-${card.colors[1]}) 50%)`;
      const body = card.isMulti
        ? '<div style="text-align:center;font-size:.95em;color:#333;margin-top:.4em">Use as <b>any color</b>.<br>No money value.</div>'
        : card.colors.map(c =>
            `<div class="wild-col"><b style="color:var(--c-${c})">${esc(CM[c].label)}</b> · ${rentLadder(c)}</div>`).join('');
      const chosen = opts.chosenColor ? `<div style="text-align:center;color:var(--c-${opts.chosenColor});font-weight:900;margin-top:.2em">→ ${esc(CM[opts.chosenColor].label)}</div>` : '';
      face.innerHTML =
        `<div class="p-band" style="${bandStyle}"></div>` +
        (card.canPay ? `<div class="v-tl">${vchip(card.value)}</div><div class="v-br">${vchip(card.value)}</div>` : '') +
        `<div class="p-body"><div class="wild-title">PROPERTY WILD CARD</div>${body}${chosen}</div>`;
      return face;
    }

    if (card.type === T.RENT) {
      face.classList.add('rent');
      face.innerHTML =
        `<div class="v-tl"><span class="ring">${card.value}</span></div>` +
        `<div class="a-head">RENT</div>` +
        `<div class="wheel" style="background:${rentWheelBg(card.colors)}"><span class="rent-lbl">RENT</span></div>` +
        `<div class="a-desc">${card.isWild ? 'Charge ONE player any color you own.' : 'Charge ALL players for ' + card.colors.map(c => CM[c].label).join(' / ') + '.'}</div>` +
        `<div class="v-br"><span class="ring">${card.value}</span></div>`;
      // ring style for rent corners
      face.querySelectorAll('.ring').forEach(r => { r.style.border = '.18em solid #b3261e'; r.style.borderRadius = '50%'; r.style.width = '1.9em'; r.style.height = '1.9em'; r.style.display = 'inline-flex'; r.style.alignItems = 'center'; r.style.justifyContent = 'center'; });
      return face;
    }

    // ACTION
    face.classList.add('action', 'act-' + card.action);
    face.innerHTML =
      `<div class="v-tl"><span class="ring">${card.value}</span></div>` +
      `<div class="a-head">ACTION CARD</div>` +
      `<div class="a-emblem"><div class="icon">${ACTION_ICON[card.action] || '⭐'}</div>` +
        `<div class="nm">${ACTION_LABEL[card.action] || esc(card.name)}</div></div>` +
      `<div class="a-desc">${ACTION_DESC[card.action] || ''}</div>` +
      `<div class="v-br"><span class="ring">${card.value}</span></div>`;
    return face;
  }

  // Compact "mini" property card for the zones.
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
      let chosen = 3;          // default: 3 AI opponents (4 players)
      let diff = 'normal';     // default difficulty
      const root = this.$('setup');
      const render = () => {
        root.innerHTML =
          '<div class="scrim"></div><div class="sheet">' +
          '<h3>Business Deal</h3><p>How many AI opponents?</p>' +
          '<div class="count-row">' +
          [1, 2, 3, 4].map(n => `<button class="count-btn${n === chosen ? ' sel' : ''}" data-n="${n}">${n}</button>`).join('') +
          '</div><p style="margin-top:14px">Difficulty</p><div class="count-row">' +
          ['easy', 'normal', 'hard'].map(d => `<button class="count-btn diff${d === diff ? ' sel' : ''}" data-d="${d}" style="width:auto;padding:0 16px;font-size:15px">${d[0].toUpperCase() + d.slice(1)}</button>`).join('') +
          '</div><button class="cta" id="start-btn">Start Game</button></div>';
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

      this.game.onTurnStart = (pl) => { this._bubbles = {}; this.render(); if (pl.id === 0) this.toast('Your turn — tap a card'); };
      this.game.onAfterPlay = async (pl, mv) => {
        if (pl.id !== 0) { this._bubbles[pl.id] = this._narrate(mv); this.toast(this._lastLog()); }
        this.render();
        if (pl.id !== 0) await delay(this.aiDelay);
      };
      this.game.onTurnEnd = () => this.render();

      this.game.setup();
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
        `<span><span class="coin">$</span> ${this._bank(me)}M</span>` +
        `<span>${g.completeSetCount(me)}/3 sets · 🂠${me.hand.length}</span>`;
      this._renderZoneBank(this.$('me-bank'), me);
      this._renderZoneProps(this.$('me-props'), me);

      this._renderHand(me, myTurn);

      // pass button + play dots
      this.$('pass-btn').disabled = !this._pendingMove;
      const dots = this.$('play-dots'); dots.innerHTML = '';
      const left = myTurn ? g.playsRemaining : 0;
      for (let i = 0; i < 3; i++) dots.append(elNew('div', 'dot' + (i < left ? ' left' : '')));
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
        head.innerHTML =
          `<div class="opp-avatar">${this.meta[i].avatar}</div>` +
          `<div class="opp-name">${esc(p.name)}</div>` +
          `<div class="opp-bank"><span class="coin">$</span>${this._bank(p)}M</div>`;
        opp.append(head);
        opp.append(elNew('div', 'opp-meta', `🂠 ×${p.hand.length} · ${g.completeSetCount(p)}/3`));
        const body = elNew('div', 'opp-body');
        this._appendSets(body, p);
        this._appendBank(body, p);
        opp.append(body);
        if (this._bubbles[i]) opp.append(elNew('div', 'bubble', esc(this._bubbles[i])));
        box.append(opp);
      }
    }

    _appendSets(container, player) {
      Deck.allPropertyColors().forEach(color => {
        const grp = player.properties[color]; if (!grp) return;
        const complete = grp.cards.length >= REQ[color];
        const sm = elNew('div', 'set-mini' + (complete ? ' complete' : ''));
        const stack = elNew('div', 'set-stack');
        grp.cards.forEach(c => stack.append(renderMini(c, color)));
        sm.append(stack);
        sm.append(elNew('div', 'set-count', `${grp.cards.length}/${REQ[color]}` + (grp.house ? ' 🏠' : '') + (grp.hotel ? '🏨' : '')));
        container.append(sm);
      });
    }
    _appendBank(container, player) {
      player.bank.slice().sort((a, b) => b.value - a.value).forEach(c => {
        container.append(elNew('div', 'bank-chip', '$' + c.value));
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
        `<div class="cardback">BUSINESS<br>DEAL</div><div class="count">×${g.deck.length}</div>`;
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
      const hand = this.$('hand'); hand.innerHTML = '';
      me.hand.forEach(card => {
        const f = renderCardFace(card);
        if (interactive && this._pendingMove) f.addEventListener('click', () => this._openDetail(card.id));
        else f.style.cursor = 'default';
        hand.append(f);
      });
    }

    _narrate(move) {
      if (move.type === 'bank') return 'Banked';
      if (move.type === 'property') return 'New property';
      if (move.type === 'rent') return 'Rent! Pay up';
      if (move.type === 'action') {
        return ({
          [A.DEAL_BREAKER]: 'Deal Breaker!', [A.SLY_DEAL]: 'Sly Deal!', [A.FORCED_DEAL]: 'Forced Deal!',
          [A.DEBT_COLLECTOR]: 'Pay $5M!', [A.BIRTHDAY]: "It's my birthday!", [A.PASS_GO]: 'Pass Go',
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
      const chosen = d.isWild ? d.colors[d.colorIdx] : null;
      root.innerHTML = '<div class="scrim"></div>';
      const wrap = elNew('div', 'detail-wrap');
      wrap.append(renderCardFace(card, { chosenColor: chosen }));

      const acts = elNew('div', 'actions');
      const mkBtn = (cls, icon, label, enabled, fn) => {
        const b = elNew('button', 'act-btn ' + cls, `<span class="ic">${icon}</span><span class="lbl">${label}</span>`);
        b.disabled = !enabled;
        if (enabled) b.addEventListener('click', fn);
        return b;
      };
      acts.append(mkBtn('flip', '🔄', 'Flip', d.isWild, () => { d.colorIdx = (d.colorIdx + 1) % d.colors.length; this._drawDetail(); }));
      acts.append(mkBtn('bank', '🏦', 'Bank', !!d.bankMove, () => this._resolveMove(d.bankMove)));
      acts.append(mkBtn('play', '✔', 'Play', d.playMoves.length > 0, () => this._playFromDetail()));
      acts.append(mkBtn('pass', '➜', 'Pass', true, () => this._resolveMove({ type: 'pass' })));
      wrap.append(acts);
      root.append(wrap);
      root.querySelector('.scrim').addEventListener('click', () => this._closeDetail());
      root.classList.add('show');
    }

    _playFromDetail() {
      const d = this._detail;
      const card = this._view.me.hand.find(c => c.id === d.cardId);
      if (card.type === T.PROPERTY) {
        const mv = d.playMoves.find(m => m.type === 'property' && m.color === card.color) || d.playMoves[0];
        return this._resolveMove(mv);
      }
      if (card.type === T.PROPERTY_WILD) {
        if (d.isWild) { // two-color: place to the flipped color
          const color = d.colors[d.colorIdx];
          const mv = d.playMoves.find(m => m.type === 'property' && m.color === color) || d.playMoves[0];
          return this._resolveMove(mv);
        }
        // multi-color: pick a color
        this._closeDetail();
        return this._showTargets(d.playMoves, 'Place wildcard as…');
      }
      // Single legal play → do it; otherwise pick a target.
      if (d.playMoves.length === 1) return this._resolveMove(d.playMoves[0]);
      this._closeDetail();
      this._showTargets(d.playMoves);
    }

    _showTargets(moves, title) {
      const root = this.$('overlay');
      root.innerHTML = '<div class="scrim"></div>';
      const sheet = elNew('div', 'sheet');
      sheet.append(elNew('h3', null, title || 'Choose a target'));
      const row = elNew('div', 'row');
      const seen = {};
      moves.forEach(m => {
        const lbl = this._describeMove(this._view, m);
        // Distinguish identical labels (e.g. two Red cards from the same player).
        seen[lbl.text] = (seen[lbl.text] || 0) + 1;
        const text = seen[lbl.text] > 1 ? `${lbl.text} (${seen[lbl.text]})` : lbl.text;
        const b = elNew('button', 'opt' + (lbl.win ? ' win' : ''), esc(text));
        b.addEventListener('click', () => this._resolveMove(m));
        row.append(b);
      });
      const cancel = elNew('button', 'opt ghost', 'Cancel');
      cancel.addEventListener('click', () => this._closeOverlay());
      row.append(cancel);
      sheet.append(row);
      root.append(sheet);
      root.querySelector('.scrim').addEventListener('click', () => this._closeOverlay());
      root.classList.add('show');
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
        return { text: `Rent ${CM[move.color].label}${mult > 1 ? ' ×2' : ''} → ${who} pays $${base * mult}M` };
      }
      if (move.type === 'action') {
        const who = move.targetPlayerId != null ? this._oppName(view, move.targetPlayerId) : null;
        switch (card.action) {
          case A.DEBT_COLLECTOR: return { text: `${who}: pay $5M` };
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
      // Gather selectable assets, keeping the real card object so we can render
      // an authentic face for each (bank money, then property cards/buildings).
      const bankAssets = me.bank.filter(c => c.canPay !== false).map(c => ({ card: c, value: c.value }));
      const propAssets = [];
      Object.keys(me.properties).forEach(color => {
        const g = me.properties[color];
        g.cards.forEach(c => { if (c.canPay) propAssets.push({ card: c, value: c.value }); });
        if (g.house) propAssets.push({ card: g.house, value: g.house.value });
        if (g.hotel) propAssets.push({ card: g.hotel, value: g.hotel.value });
      });
      const all = bankAssets.concat(propAssets);
      const total = all.reduce((s, a) => s + a.value, 0);
      const required = Math.min(ctx.amount, total);
      const creditor = this._oppName(view, ctx.creditorId);
      const verb = ctx.reason === 'birthday' ? 'is asking' : ctx.reason === 'rent' ? 'charges' : 'is demanding';
      const forWhat = ctx.reason === 'birthday' ? ' for Birthday' : ctx.reason === 'rent' ? ' rent' : '';

      return new Promise(resolve => {
        const root = this.$('overlay');
        root.innerHTML = '<div class="scrim"></div>';

        if (!all.length) {
          const sheet = this._sheet(`<h3>You owe $${ctx.amount}M to ${esc(creditor)}</h3>` +
            '<p>You have nothing on the table — you pay nothing.</p><button class="cta" id="ok">OK</button>');
          sheet.querySelector('#ok').addEventListener('click', () => { this._closeOverlay(); resolve([]); });
          return;
        }

        const selected = new Set();
        const screen = elNew('div', 'pay-screen');
        const banner = elNew('div', 'pay-banner',
          `<div class="main">${esc(creditor)} ${verb} $${ctx.amount}M${forWhat}.</div>` +
          '<div class="sub" id="pay-sub">Select cards worth the requested amount (no change given).</div>');
        const mid = elNew('div', 'pay-mid');
        if (ctx.sourceCard) mid.append(renderCardFace(ctx.sourceCard));
        const sel = elNew('div', 'pay-selected', 'Selected $0M');
        const actions = elNew('div', 'pay-actions');
        const payBtn = elNew('button', 'pay-go', 'Pay'); payBtn.disabled = true;
        const clearBtn = elNew('button', 'pay-clear', 'Clear');
        actions.append(payBtn, clearBtn);
        mid.append(sel, actions);

        const zones = elNew('div', 'pay-zones');
        const bankZone = elNew('div', 'pay-zone');
        const propZone = elNew('div', 'pay-zone');
        if (!bankAssets.length) bankZone.append(elNew('div', 'zempty', 'No bank cards'));
        if (!propAssets.length) propZone.append(elNew('div', 'zempty', 'No properties'));
        zones.append(bankZone, propZone);

        const sum = () => all.filter(a => selected.has(a.card.id)).reduce((s, a) => s + a.value, 0);
        const refresh = () => {
          const s = sum();
          sel.textContent = `Selected $${s}M`;
          payBtn.disabled = s < required;
          banner.querySelector('#pay-sub').textContent = s >= required
            ? 'Now you can pay the amount.'
            : `Select cards worth ≥ $${required}M (no change given).`;
        };
        const addAsset = (a, zone) => {
          const f = renderCardFace(a.card);
          f.addEventListener('click', () => {
            if (selected.has(a.card.id)) { selected.delete(a.card.id); f.classList.remove('sel'); }
            else { selected.add(a.card.id); f.classList.add('sel'); }
            refresh();
          });
          zone.append(f);
        };
        bankAssets.forEach(a => addAsset(a, bankZone));
        propAssets.forEach(a => addAsset(a, propZone));

        payBtn.addEventListener('click', () => { this._closeOverlay(); resolve([...selected]); });
        clearBtn.addEventListener('click', () => {
          selected.clear();
          screen.querySelectorAll('.cardface.sel').forEach(e => e.classList.remove('sel'));
          refresh();
        });

        screen.append(banner, mid, zones);
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
    }
  }

  /* ---- shared helpers --------------------------------------------------- */
  function countOf(props, color) { return props[color] ? props[color].cards.length : 0; }
  function shortName(card) {
    if (card.type === T.MONEY) return '$' + card.value + 'M';
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
