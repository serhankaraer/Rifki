// Oda: koltuklar, lobi, oyun oturumu, bot zamanlaması, bağlantı kopma / bot devralma.
// Taşıma (WebSocket) ve zamanlayıcı dışarıdan verilir (ctx) -> tamamen test edilebilir.
import { createGame, applyCommand, viewFor, RuleError } from '@rifki/engine';
import { createBot, createBotProfiles, TRAIT_KEYS, botStrength } from '@rifki/ai';
import { S2C, ERR, ServerError, nickKey } from './protocol.js';

const SEATS = 4;

export class Room {
  constructor(ctx, code) {
    this.ctx = ctx;
    this.code = code;
    this.phase = 'LOBBY'; // LOBBY | PLAYING | FINISHED
    this.seats = new Array(SEATS).fill(null);
    this.hostSeat = null;
    this.seedBase = ctx.random.hex(8);
    this.botCounter = 0;
    this.takeoverCounter = 0;
    this.state = null;
    this.commandLog = [];
    this.seq = 0;
    this.timer = null;
    this.timerKey = null;
    this.turnInfo = null;     // { seat, endsAt } insan hamle süresi
    this.pendingPause = 0;    // bir sonraki zamanlayıcıya eklenecek ek bekleme (Rıfkı el açma)
    this.subCounter = 0;
    this.idleTimer = null;
    this.finishTimer = null;
    this.destroyed = false;
  }

  // ---------- yardımcılar ----------
  get cfg() { return this.ctx.cfg; }
  humanSeats() { return this.seats.flatMap((m, i) => (m && m.kind === 'human' ? [i] : [])); }
  connectedHumans() { return this.humanSeats().filter((i) => this.seats[i].connId !== null).length; }
  allNames() { return this.seats.filter(Boolean).map((m) => (m.kind === 'human' ? m.nickname : m.profile.name)); }
  seatOf(connId) { return this.seats.findIndex((m) => m && m.kind === 'human' && m.connId === connId); }
  isBotControlled(seat) {
    const m = this.seats[seat];
    return !!m && (m.kind === 'bot' || m.control === 'bot');
  }

  publicSeat(m) {
    if (!m) return { kind: 'empty' };
    if (m.kind === 'bot') return { kind: 'bot', name: m.profile.name, gender: m.profile.gender, traits: { ...m.profile.traits }, strength: botStrength(m.profile.traits) };
    return { kind: 'human', nickname: m.nickname, connected: m.connId !== null, botControlled: m.control === 'bot' };
  }

  send(connId, msg) { if (connId !== null) this.ctx.send(connId, msg); }
  broadcast(msg) { for (const i of this.humanSeats()) this.send(this.seats[i].connId, msg); }

  broadcastState() {
    this.broadcast({ t: S2C.ROOM_STATE, code: this.code, phase: this.phase, hostSeat: this.hostSeat, seats: this.seats.map((m) => this.publicSeat(m)) });
  }

  sendView(seat, events = []) {
    const m = this.seats[seat];
    if (!m || m.kind !== 'human' || m.connId === null || !this.state) return;
    this.send(m.connId, { t: S2C.GAME_VIEW, seq: this.seq, view: viewFor(this.state, seat), events });
  }

  broadcastViews(events) {
    this.seq += 1;
    for (const i of this.humanSeats()) this.sendView(i, events);
  }

  seatEvent(event, seat, extra = {}) { this.broadcast({ t: S2C.SEAT_EVENT, event, seat, ...extra }); }

  // ---------- katılım ----------
  assertNickAvailable(nickname) {
    if (this.allNames().some((n) => nickKey(n) === nickKey(nickname))) throw new ServerError(ERR.NICKNAME_TAKEN);
  }

  addHuman(connId, nickname) {
    if (this.phase !== 'LOBBY') throw new ServerError(ERR.ROOM_IN_PROGRESS);
    const seat = this.seats.findIndex((m) => m === null);
    if (seat === -1) throw new ServerError(ERR.ROOM_FULL);
    this.assertNickAvailable(nickname);
    const token = this.ctx.random.hex(16);
    this.seats[seat] = { kind: 'human', nickname, token, connId, control: 'human', reclaim: false, left: false, takeoverTimer: null, bot: null };
    if (this.hostSeat === null) this.hostSeat = seat;
    this.ctx.registerToken(token, this);
    this.ctx.bindConn(connId, this, seat);
    this.send(connId, { t: S2C.ROOM_JOINED, code: this.code, seat, token, nickname, resumed: false });
    this.refreshIdle();
    this.broadcastState();
    return seat;
  }

  /** Bağlantısı kopan oyuncunun token ile dönüşü. */
  resume(connId, seat) {
    const m = this.seats[seat];
    if (m.connId !== null && m.connId !== connId) { // aynı oturum başka sekmeden: eskisini düşür
      this.send(m.connId, { t: S2C.ERROR, code: ERR.SESSION_REPLACED });
      this.ctx.unbindConn(m.connId);
      this.ctx.close?.(m.connId);
    }
    m.connId = connId;
    this.ctx.bindConn(connId, this, seat);
    if (m.takeoverTimer) { this.ctx.scheduler.clearTimeout(m.takeoverTimer); m.takeoverTimer = null; }
    if (m.control === 'bot') m.reclaim = true; // koltuk bir sonraki elin başında geri alınır
    this.send(connId, { t: S2C.ROOM_JOINED, code: this.code, seat, token: m.token, nickname: m.nickname, resumed: true });
    this.refreshIdle();
    this.broadcastState();
    this.seatEvent('RECONNECTED', seat, { botControlled: m.control === 'bot' });
    if (this.state) {
      this.sendView(seat);
      this.sendTurnTimer(connId);
    }
    this.schedule(); // oda boştaydı ve duraklatılmışsa devam eder
  }

  // ---------- bağlantı kopması / ayrılma ----------
  detach(connId) {
    const seat = this.seatOf(connId);
    if (seat === -1) return;
    const m = this.seats[seat];
    this.ctx.unbindConn(connId);
    if (this.phase === 'LOBBY') {
      this.removeHuman(seat);
      return;
    }
    m.connId = null;
    this.broadcastState();
    if (m.control === 'human' && !m.left) {
      this.seatEvent('DISCONNECTED', seat, { takeoverMs: this.cfg.takeoverMs });
      m.takeoverTimer = this.ctx.scheduler.setTimeout(() => this.takeover(seat), this.cfg.takeoverMs);
    }
    this.refreshIdle();
  }

  leave(connId) {
    const seat = this.seatOf(connId);
    if (seat === -1) throw new ServerError(ERR.NOT_IN_ROOM);
    const m = this.seats[seat];
    this.send(connId, { t: S2C.LEFT_ROOM });
    this.ctx.unbindConn(connId);
    if (this.phase === 'LOBBY') {
      this.removeHuman(seat);
      return;
    }
    // oyun sürerken ayrılan: bot hemen devralır, koltuk geri alınamaz
    m.connId = null;
    m.left = true;
    this.ctx.unregisterToken(m.token);
    this.seatEvent('LEFT', seat);
    this.takeover(seat);
    this.refreshIdle();
  }

  removeHuman(seat) {
    const m = this.seats[seat];
    this.ctx.unregisterToken(m.token);
    if (m.connId !== null) this.ctx.unbindConn(m.connId);
    this.seats[seat] = null;
    if (this.humanSeats().length === 0) { this.destroy(); return; }
    if (this.hostSeat === seat) this.hostSeat = this.humanSeats()[0];
    this.broadcastState();
  }

  takeover(seat) {
    const m = this.seats[seat];
    if (!m || m.kind !== 'human' || m.control === 'bot' || this.phase !== 'PLAYING') return;
    if (m.takeoverTimer) { this.ctx.scheduler.clearTimeout(m.takeoverTimer); m.takeoverTimer = null; }
    const base = createBotProfiles({ count: 1, seed: `${this.seedBase}:takeover:${seat}:${this.takeoverCounter++}` })[0];
    const profile = { ...base, id: `take-${seat}`, name: m.nickname };
    m.bot = createBot({ profile, seed: `${this.seedBase}:game`, simsScale: this.cfg.simsScale });
    m.control = 'bot';
    this.seatEvent('BOT_TOOK_OVER', seat);
    this.broadcastState();
    this.schedule();
  }

  // ---------- lobi ----------
  requireHost(connId) {
    const seat = this.seatOf(connId);
    if (seat === -1) throw new ServerError(ERR.NOT_IN_ROOM);
    if (seat !== this.hostSeat) throw new ServerError(ERR.NOT_HOST);
    if (this.phase !== 'LOBBY') throw new ServerError(ERR.NOT_IN_LOBBY);
    return seat;
  }

  makeBot(seat) {
    const profile = createBotProfiles({ count: 1, seed: `${this.seedBase}:bot:${this.botCounter++}`, takenNames: this.allNames() })[0];
    this.seats[seat] = { kind: 'bot', profile: { ...profile, id: `bot-${seat}` }, bot: null };
  }

  addBot(connId) {
    this.requireHost(connId);
    const seat = this.seats.findIndex((m) => m === null);
    if (seat === -1) throw new ServerError(ERR.ROOM_FULL);
    this.makeBot(seat);
    this.broadcastState();
  }

  removeBot(connId, seat) {
    this.requireHost(connId);
    if (!Number.isInteger(seat) || seat < 0 || seat >= SEATS || !this.seats[seat] || this.seats[seat].kind !== 'bot') {
      throw new ServerError(ERR.NOT_A_BOT_SEAT);
    }
    this.seats[seat] = null;
    this.broadcastState();
  }

  start(connId) {
    this.requireHost(connId);
    for (let i = 0; i < SEATS; i++) if (!this.seats[i]) this.makeBot(i); // boş koltukları botla doldur (insan >= 1 olduğundan en fazla 3 bot)
    const gameSeed = `${this.seedBase}:game`;
    for (const m of this.seats) if (m.kind === 'bot') m.bot = createBot({ profile: m.profile, seed: gameSeed, simsScale: this.cfg.simsScale });
    const { state, events } = createGame({ seed: gameSeed });
    this.state = state;
    this.commandLog = [];
    this.phase = 'PLAYING';
    this.broadcastState();
    this.broadcastViews(events);
    this.schedule();
  }

  // ---------- oyun ----------
  /** İnsan oyuncudan gelen oyun komutu. */
  command(connId, msg) {
    const seat = this.seatOf(connId);
    if (seat === -1) throw new ServerError(ERR.NOT_IN_ROOM);
    if (this.phase !== 'PLAYING') throw new ServerError(ERR.NOT_PLAYING);
    if (this.isBotControlled(seat)) throw new ServerError(ERR.SEAT_BOT_CONTROLLED);
    this.applyEngine({ ...msg, seat });
  }

  applyEngine(cmd) {
    let result;
    try {
      result = applyCommand(this.state, cmd);
    } catch (e) {
      if (e instanceof RuleError) throw new ServerError(e.code, e.detail);
      throw e;
    }
    this.state = result.state;
    this.commandLog.push(cmd);
    if (result.events.some((e) => e.type === 'HAND_DEALT')) this.returnControl();
    if (result.events.some((e) => e.type === 'REDEALT')) this.pendingPause = this.cfg.redealPauseMs;
    if (result.events.some((e) => e.type === 'GAME_ENDED')) {
      this.phase = 'FINISHED';
      this.broadcastState();
      this.finishTimer = this.ctx.scheduler.setTimeout(() => this.destroy(), this.cfg.finishedRoomMs);
    }
    this.broadcastViews(result.events);
    this.schedule();
  }

  // Yeni elin başında botun devraldığı koltukları insanlara geri ver
  returnControl() {
    this.seats.forEach((m, seat) => {
      if (m && m.kind === 'human' && m.control === 'bot' && m.reclaim && !m.left) {
        m.control = 'human';
        m.reclaim = false;
        m.bot = null;
        this.seatEvent('CONTROL_RETURNED', seat);
        this.broadcastState();
      }
    });
  }

  clearTimer() {
    if (this.timer) this.ctx.scheduler.clearTimeout(this.timer);
    this.timer = null;
    this.timerKey = null;
  }

  /** Sıradaki iş bota aitse (hamle ya da el arası geçiş) zamanlar. */
  schedule() {
    if (this.destroyed || this.phase !== 'PLAYING' || !this.state) return;
    // Bağlı insan kalmadıysa izleyen yok: botlar gecikmesiz oynayıp oyunu hızla bitirir (oda idle süresinde silinir)
    const fast = this.connectedHumans() === 0;
    const st = this.state;

    if (st.phase === 'HAND_SCORED') {
      const key = `next:${st.handNo}`;
      if (this.timerKey === key) return;
      this.clearTimer();
      this.timerKey = key;
      this.timer = this.ctx.scheduler.setTimeout(() => {
        this.timer = null; this.timerKey = null;
        this.applyEngine({ type: 'NEXT_HAND' });
      }, fast ? 0 : this.cfg.handPauseMs);
      return;
    }
    if (st.phase !== 'CONTRACT_SELECT' && st.phase !== 'PLAYING') { this.clearTimer(); this.turnInfo = null; return; }

    const seat = st.turn;
    const key = `${st.handNo}:${st.phase}:${st.redeals}:${st.hand.trickNo}:${st.hand.trick.plays.length}:${seat}`;
    if (this.timerKey === key) return;
    const pause = fast ? 0 : this.pendingPause;

    if (!this.isBotControlled(seat)) {
      this.clearTimer();
      this.turnInfo = null;
      const m = this.seats[seat];
      if (!m || m.connId === null) return; // bağlantısı kopmuş: devralma zamanlayıcısı çalışır
      const ms = pause + this.cfg.turnMs;
      this.pendingPause = 0;
      this.timerKey = key;
      this.turnInfo = { seat, endsAt: this.ctx.now() + ms };
      this.timer = this.ctx.scheduler.setTimeout(() => {
        this.timer = null; this.timerKey = null; this.turnInfo = null;
        this.substituteMove(seat);
      }, ms);
      this.sendTurnTimer();
      return;
    }
    this.clearTimer();
    this.turnInfo = null;

    const m = this.seats[seat];
    const bot = m.bot;
    const view = viewFor(st, seat);
    const cmd = bot.act(view);
    // Yasal tek kartı olan bot 1 sn'de oynar (düşünme süresini ezer)
    const single = st.phase === 'PLAYING' && view.legalCards?.length === 1;
    const think = single ? Math.round(this.cfg.singleCardMs * this.cfg.thinkDelayScale) : Math.round(bot.thinkDelayMs() * this.cfg.thinkDelayScale);
    const delay = fast ? 0 : Math.max(think, pause);
    this.pendingPause = 0;
    this.broadcast({ t: S2C.BOT_THINKING, seat, delayMs: delay });
    this.timerKey = key;
    this.timer = this.ctx.scheduler.setTimeout(() => {
      this.timer = null; this.timerKey = null;
      try {
        this.applyEngine(cmd);
      } catch (e) {
        this.ctx.log?.('bot komutu reddedildi', e);
        this.fallbackMove(seat);
      }
    }, delay);
  }

  sendTurnTimer(connId = null) {
    const t = this.turnInfo;
    if (!t) return;
    const msg = { t: S2C.TURN_TIMER, seat: t.seat, ms: Math.max(0, t.endsAt - this.ctx.now()) };
    if (connId !== null) this.send(connId, msg);
    else this.broadcast(msg);
  }

  /** Süresi biten insan oyuncunun yerine, oyundaki en yüksek puanlı botun karakteriyle bir hamle yapılır. */
  substituteProfile() {
    const bots = this.seats.flatMap((m, i) => (m && m.kind === 'bot' ? [i] : []));
    if (bots.length === 0) {
      return { id: 'sub', name: 'sub', gender: 'm', traits: Object.fromEntries(TRAIT_KEYS.map((k) => [k, 50])) };
    }
    const top = Math.max(...bots.map((i) => this.state.scores[i]));
    const tied = bots.filter((i) => this.state.scores[i] === top);
    const pick = tied[tied.length === 1 ? 0 : this.ctx.random.int(tied.length)];
    return this.seats[pick].profile;
  }

  substituteMove(seat) {
    if (this.destroyed || this.phase !== 'PLAYING' || !this.state || this.state.turn !== seat) return;
    if (this.isBotControlled(seat)) return;
    const profile = this.substituteProfile();
    const bot = createBot({ profile, seed: `${this.seedBase}:sub:${this.subCounter++}`, simsScale: this.cfg.simsScale });
    const cmd = bot.act(viewFor(this.state, seat));
    this.seatEvent('TIMEOUT_PLAY', seat);
    try {
      this.applyEngine(cmd);
    } catch (e) {
      this.ctx.log?.('yedek bot komutu reddedildi', e);
      this.fallbackMove(seat);
    }
  }

  // Bot beklenmedik bir şekilde yasadışı komut verirse oyun kilitlenmesin
  fallbackMove(seat) {
    const st = this.state;
    const v = viewFor(st, seat);
    if (v.selectable) {
      const contract = v.selectable.penalties[0] ?? 'KOZ';
      this.applyEngine({ type: 'CHOOSE_CONTRACT', seat, contract, trump: contract === 'KOZ' ? 'S' : undefined });
    } else if (v.legalCards) {
      this.applyEngine({ type: 'PLAY_CARD', seat, card: v.legalCards[0] });
    }
  }

  // ---------- yaşam döngüsü ----------
  refreshIdle() {
    if (this.destroyed) return;
    if (this.connectedHumans() === 0) {
      if (!this.idleTimer) this.idleTimer = this.ctx.scheduler.setTimeout(() => this.destroy(), this.cfg.idleRoomMs);
    } else if (this.idleTimer) {
      this.ctx.scheduler.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimer();
    for (const t of [this.idleTimer, this.finishTimer]) if (t) this.ctx.scheduler.clearTimeout(t);
    for (const m of this.seats) {
      if (m && m.kind === 'human') {
        if (m.takeoverTimer) this.ctx.scheduler.clearTimeout(m.takeoverTimer);
        this.ctx.unregisterToken(m.token);
        if (m.connId !== null) this.ctx.unbindConn(m.connId);
      }
    }
    this.ctx.removeRoom(this);
  }
}
