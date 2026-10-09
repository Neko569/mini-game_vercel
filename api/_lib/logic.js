// 飞行棋房间逻辑 —— Serverless 化移植（源：fxq-cf/src/room-base.js + room.js）
// 核心差异：WS/DO → 纯函数状态机 + 事件日志（版本号 seq）+ 虚拟定时器
//   - 广播 → log 追加事件，客户端长轮询按 seq 增量拉取
//   - DO alarm / 自动托管 → 惰性虚拟定时器：每次读写前 processTimeouts() 补算
//   - 空座位托管 → 每次动作后 autoEmptyTurns()（与 CF 版逐行为一致）
import { initGame, rollDice, movePlane, penalty, movablePlanes } from './engine.js';

const COLORS = ['#f43f5e', '#3b82f6', '#22c55e', '#eab308']; // 红蓝绿黄
const MAX_SEATS = 4;
const LOG_KEEP = 100; // 事件日志保留条数（超出后靠 snapshot 同步兜底）

export const AFK_MS = +(process.env.AFK_MS || 60_000);        // 轮到你后的出牌时限（虚拟定时器）
export const RECYCLE_MS = +(process.env.RECYCLE_MS || 10 * 60_000); // 全员离开后房间回收时限

export function newRoomDoc(code) {
  return {
    code,
    seq: 0,                    // 版本号 = 已发事件总数（乐观并发 + 增量同步基准）
    log: [],                   // 最近事件 [{v, t, ...}]（v 即事件版本）
    seats: Array(MAX_SEATS).fill(null), // [{gid,name,avatar,connected,joinedAt}]
    spectators: {},            // gid → {name,avatar}
    sids: {},                  // gid → 最新会话 id（挤占旧标签页，复刻 close 4000 语义）
    owner: null,
    started: false,            // false | true | 'over'
    game: null,
    winners: [],
    deadline: 0,               // 当前行动方 AFK 截止时间（epoch ms；0=无计时）
    lastActive: Date.now(),    // 回收判定基准
  };
}

// ---------- 基础视图 ----------
export function seatOf(doc, gid) { return doc.seats.findIndex(s => s && s.gid === gid); }

export function playerList(doc) {
  return doc.seats.map((s, i) => s ? {
    seat: i, name: s.name, avatar: s.avatar, connected: s.connected,
    owner: doc.owner === s.gid,
    color: COLORS[i],
  } : null);
}

export function roomView(doc) {
  const v = { code: doc.code, owner: doc.owner, players: playerList(doc), started: doc.started, winners: doc.winners };
  if (doc.game) v.game = doc.game; // app.js 依赖 room.game 渲染（CF 版 viewGame 等价）
  return v;
}

// 快照同步事件（客户端大幅落后 / 重连时的全量兜底）
export function snapshotEvents(doc) {
  const out = [{ v: doc.seq, t: 'players', players: playerList(doc) }];
  if (doc.game) { // 对局中与终局都发棋盘快照（over 时重连也要能看终局画面）
    out.push({ v: doc.seq, t: 'game', action: 'sync', by: -1, game: doc.game, movable: doc.started === true ? movableOf(doc) : [] });
  }
  return out;
}

function push(doc, ev) { doc.log.push({ v: ++doc.seq, ...ev }); if (doc.log.length > LOG_KEEP) doc.log.splice(0, doc.log.length - LOG_KEEP); }
function movableOf(doc) { return doc.game && doc.game.state >= 4 ? movablePlanes(doc.game, doc.game.state - 4) : []; }
function touch(doc, now) { doc.lastActive = now; }
function armDeadline(doc, now) { doc.deadline = doc.started === true ? now + AFK_MS : 0; }

// ---------- 终局判定（与官方 bot 一致：winners >= 活跃人数-1）----------
function afterAction(doc, now, action, seat) {
  autoEmptyTurns(doc);
  const activePlayers = doc.game.seatMap.length;
  if (doc.game.winners.length >= activePlayers - 1) {
    doc.started = 'over';
    doc.winners = doc.game.winners.slice();
    doc.deadline = 0;
    push(doc, { t: 'finished', winners: doc.winners, game: doc.game, room: roomView(doc) });
    return;
  }
  armDeadline(doc, now);
  push(doc, { t: 'game', action, by: seat, game: doc.game, movable: movableOf(doc) });
}

// 空座位托管：引擎 state 轮到没人坐的槽位时自动掷骰+移动（逐行为移植 room.js）
function autoEmptyTurns(doc) {
  if (!doc.game || doc.started !== true) return;
  const seatMap = new Set(doc.game.seatMap);
  let guard = 0;
  while (guard++ < 40) {
    const g = doc.game;
    const p = g.state;
    if (p < 4 && seatMap.has(p) && !doc.seats[p]) {
      doc.game = rollDice(g, p);
      if (doc.game.sixTimes >= 3) doc.game = penalty(doc.game, p);
      continue;
    }
    if (g.state >= 4) {
      const q = g.state - 4;
      if (seatMap.has(q) && !doc.seats[q]) {
        const mv = movablePlanes(g, q);
        if (mv.length) doc.game = movePlane(g, q, mv[Math.floor(Math.random() * mv.length)]);
        else doc.game = penalty(g, q);
        continue;
      }
    }
    break;
  }
}

// ---------- 虚拟定时器：AFK 自动代打（无 alarm()，靠读写时惰性补算）----------
export function processTimeouts(doc, now) {
  let steps = 0;
  while (doc.started === true && doc.game && doc.deadline > 0 && now > doc.deadline && steps++ < 50) {
    const g = doc.game;
    if (g.state < 4) {
      const p = g.state;
      doc.game = rollDice(g, p);
      if (doc.game.sixTimes >= 3) doc.game = penalty(doc.game, p);
      const seat = p;
      afterAction(doc, now, 'roll', seat); // 内部会再 armDeadline / 判终局
    } else {
      const q = g.state - 4;
      const mv = movablePlanes(g, q);
      doc.game = mv.length ? movePlane(g, q, mv[Math.floor(Math.random() * mv.length)]) : penalty(g, q);
      afterAction(doc, now, mv.length ? 'move' : 'pass', q);
    }
  }
}

// ---------- 房间回收（惰性：读时判定）----------
export function isRecyclable(doc, now) {
  const anyLive = doc.seats.some(s => s && s.connected) || Object.keys(doc.spectators || {}).length > 0;
  return !anyLive && now - doc.lastActive > RECYCLE_MS;
}

// ---------- 动作处理（返回给调用者的事件走 resp；广播事件走 log）----------
// msg: {t, gid, sid?, name?, avatar?, ...payload}
export function applyAction(doc, msg, now = Date.now()) {
  const t = String(msg.t || '');
  const gid = String(msg.gid || '');
  if (!gid) throw new Error('缺少 gid');
  touch(doc, now);

  // 输入消毒（与 CF 版一致）
  const cleanName = (raw) => (String(raw || '玩家')).replace(/[<>&"']/g, '').slice(0, 16) || '玩家';
  const cleanAvatar = (raw) => {
    raw = String(raw || '');
    if (!raw || raw.length > 600) return '';
    if (!/^(data:image\/[a-z0-9.+-]+;|https:\/\/)/i.test(raw)) return '';
    if (/["'`<>\s\\]/.test(raw)) return '';
    return raw;
  };

  const before = doc.seq;
  const resp = [];

  switch (t) {
    case 'join': {
      const tag = { name: cleanName(msg.name), avatar: cleanAvatar(msg.avatar) };
      // 挤占：同 gid 旧会话标记（其长轮询发现 sid 不匹配即退出，复刻 close 4000）
      if (msg.sid) doc.sids[gid] = String(msg.sid).slice(0, 64);
      let seat = seatOf(doc, gid);
      if (seat >= 0) {
        doc.seats[seat].connected = true; // 断线重连：座位复活
        doc.seats[seat].name = tag.name;
        doc.seats[seat].avatar = tag.avatar;
      } else {
        seat = doc.seats.findIndex(s => !s);
        if (seat >= 0) {
          doc.seats[seat] = { gid, ...tag, connected: true, joinedAt: now };
          if (!doc.owner) doc.owner = gid;
        } else {
          if (Object.keys(doc.spectators).length >= 50) throw new Error('观战人数已达上限');
          doc.spectators[gid] = tag;
        }
      }
      resp.push({ t: 'welcome', you: { seat, gid }, room: roomView(doc) });
      push(doc, { t: 'players', players: playerList(doc) });
      if (doc.started === true && doc.game) {
        resp.push({ t: 'game', action: 'sync', by: -1, game: doc.game, movable: movableOf(doc) });
      }
      break;
    }
    case 'start': {
      if (doc.owner !== gid) throw new Error('只有房主可以开始');
      const players = doc.seats.filter(Boolean);
      if (players.length < 2) throw new Error('至少 2 名玩家');
      doc.seats = players.slice(0, MAX_SEATS); // 座位压缩到前排
      doc.game = initGame(doc.seats.length);
      doc.game.seatMap = doc.seats.map((_, i) => i);
      doc.started = true;
      doc.winners = [];
      push(doc, { t: 'start', room: roomView(doc), game: doc.game });
      armDeadline(doc, now);
      break;
    }
    case 'roll': {
      if (doc.started !== true) throw new Error('游戏未开始');
      const seat = seatOf(doc, gid);
      if (seat < 0) throw new Error('观战中');
      if (doc.game.state !== seat) throw new Error('还没轮到你');
      doc.game = rollDice(doc.game, seat);
      if (doc.game.sixTimes >= 3) doc.game = penalty(doc.game, seat); // 三连 6 惩罚（引擎自动）
      afterAction(doc, now, 'roll', seat);
      break;
    }
    case 'move': {
      if (doc.started !== true) throw new Error('游戏未开始');
      const seat = seatOf(doc, gid);
      if (seat < 0) throw new Error('观战中');
      const g = doc.game;
      if (g.state !== 4 + seat) throw new Error('未到移动阶段');
      const movable = movablePlanes(g, seat);
      if (!movable.includes(msg.plane)) throw new Error('该飞机无法移动');
      doc.game = movePlane(g, seat, msg.plane);
      afterAction(doc, now, 'move', seat);
      break;
    }
    case 'pass': {
      if (doc.started !== true) throw new Error('游戏未开始');
      const seat = seatOf(doc, gid);
      if (seat < 0) throw new Error('观战中');
      const g = doc.game;
      if (g.state !== 4 + seat) throw new Error('未到移动阶段');
      if (movablePlanes(g, seat).length > 0) throw new Error('你有可移动的飞机');
      doc.game = penalty(g, seat);
      afterAction(doc, now, 'pass', seat);
      break;
    }
    case 'chat': {
      const text = String(msg.text || '').slice(0, 200);
      if (!text) break;
      const seat = seatOf(doc, gid);
      const name = seat >= 0 ? doc.seats[seat].name : (doc.spectators[gid] || {}).name || '观战';
      push(doc, { t: 'chat', seat, name, text });
      break;
    }
    case 'leaveSeat': {
      const seat = seatOf(doc, gid);
      if (seat < 0 || doc.started === true) break;
      doc.seats[seat] = null;
      if (doc.owner === gid) doc.owner = (doc.seats.find(s => s) || {}).gid || null;
      push(doc, { t: 'players', players: playerList(doc) });
      break;
    }
    case 'leave': {
      const seat = seatOf(doc, gid);
      if (seat >= 0 && doc.seats[seat]) doc.seats[seat].connected = false; // 座位保留（可重连复活）
      else delete doc.spectators[gid];
      delete doc.sids[gid];
      push(doc, { t: 'players', players: playerList(doc) });
      break;
    }
    case 'ping': {
      resp.push({ t: 'pong' });
      break;
    }
    default:
      throw new Error('未知动作: ' + t);
  }

  return { resp, events: doc.log.filter(e => e.v > before), changed: doc.seq !== before || t === 'ping' };
}
