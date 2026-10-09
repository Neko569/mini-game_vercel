/* 飞行棋客户端 — 原生 JS + canvas（棋盘几何取自官方坐标函数） */
import { boardCoord, movablePlanes } from './engine.js';
import { svgDie, svgTrophy, avatarURI } from '/assets/icons.js';
import { gameClient } from '/assets/game-client.js';

const $ = (s) => document.querySelector(s);
const COLORS = ['#f43f5e', '#3b82f6', '#22c55e', '#eab308'];
const CN = ['红', '蓝', '绿', '黄'];
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/* ---------- profile / URL ---------- */
const qs = new URLSearchParams(location.search);
const profile = JSON.parse(localStorage.getItem('fxq_profile') || '{}');
if (qs.get('name')) profile.name = qs.get('name');
if (qs.get('avatar')) profile.avatar = qs.get('avatar');
if (!profile.gid) profile.gid = crypto.randomUUID();
profile.name = (profile.name || '').slice(0, 16) || '玩家';
localStorage.setItem('fxq_profile', JSON.stringify(profile));
const ROOM = (qs.get('room') || '').toLowerCase();

/* ---------- state ---------- */
let ws = null, mySeat = -1, roomView = null, game = null, movable = [];
let players = [];

/* ---------- lobby ---------- */
function showLobby() {
  $('#game').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
  $('#lobby-name').value = profile.name;
  if (profile.avatar) $('#lobby-avatar').src = profile.avatar;
  $('#btn-create').onclick = async () => {
    profile.name = $('#lobby-name').value.slice(0, 16) || '玩家';
    localStorage.setItem('fxq_profile', JSON.stringify(profile));
    const r = await fetch('/api/new-room').then(r => r.json());
    location.href = '/fxq?room=' + r.code;
  };
  $('#btn-join').onclick = () => {
    const code = $('#lobby-code').value.trim().toLowerCase();
    if (!/^[a-z0-9]{4}$/.test(code)) { $('#lobby-msg').textContent = '房间号为 4 位字母数字'; return; }
    profile.name = $('#lobby-name').value.slice(0, 16) || '玩家';
    localStorage.setItem('fxq_profile', JSON.stringify(profile));
    location.href = '/fxq?room=' + code;
  };
}

/* ---------- websocket（共用模块：心跳保活 + 断线无限重连） ---------- */
function connect() {
  ws = gameClient({
    path: '/ws/fxq/' + ROOM,
    profile,
    onMsg: handle,
    onStatus: (s) => {
      if (s === 'reconnecting') toast('连接断开，正在重连…', true);
      else if (s === 'reconnected') toast('已重新连接，对局已恢复');
      else if (s === 'full') toast('房间已满', true);
      else if (s === 'kicked') toast('你的账号在其他窗口连接，本窗口已退出', true);
    },
  });
}
function send(obj) { ws && ws.send(obj); }

function handle(m) { try { handleInner(m); } catch (e) { console.error('handler error', m.t, e); } }
function handleInner(m) {
  switch (m.t) {
    case 'welcome':
      mySeat = m.you.seat;
      roomView = m.room; players = m.room.players; game = m.room.game;
      enterGame(); renderPlayers(); renderAll(); updateUI();
      chatSys(mySeat >= 0 ? `已入座 ${mySeat + 1} 号位` : '观战模式');
      break;
    case 'players':
      players = m.players; if (roomView) roomView.players = m.players;
      renderPlayers(); updateUI();
      break;
    case 'start':
      roomView = m.room; game = m.room.game; players = m.room.players;
      if (mySeat < 0) mySeat = m.room.players.findIndex(p => p && p.name === profile.name);
      chatSys('游戏开始！'); renderAll(); updateUI();
      break;
    case 'game':
      game = m.game; movable = m.movable || [];
      if (m.action === 'roll') { diceAnim(m.game.lastDice); chatSys(`${seatName(m.by)} 掷出 ${m.game.lastDice}`); }
      if (m.action === 'move') chatSys(`${seatName(m.by)} 移动了飞机`);
      if (m.action === 'penalty') chatSys(`${seatName(m.by)} 三连 6 被罚回`);
      renderAll(); updateUI();
      break;
    case 'finished':
      game = m.game; roomView = m.room; players = m.room.players;
      const names = m.winners.map(s => seatName(s)).join('、');
      chatSys(`🏆 终局排名：${names || '无人完成'}`);
      showBanner(`🏆 ${names || '对局结束'}`, false);
      renderAll(); updateUI();
      break;
    case 'chat': chatLine(m.name, m.text, m.seat); break;
    case 'error': toast(m.msg, true); break;
  }
}
function seatName(seat) { const p = players[seat]; return p ? p.name : `空位${seat + 1}`; }

/* ---------- game page ---------- */
function enterGame() {
  $('#lobby').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#btn-start').onclick = () => send({ t: 'start' });
  $('#btn-roll').onclick = () => send({ t: 'roll' });
  $('#btn-leave').onclick = () => { try { ws && ws.close(1000); } catch {} location.href = '/'; };
  $('#btn-chat').onclick = () => {
    const v = $('#chat-input').value.trim();
    if (v) { send({ t: 'chat', text: v.slice(0, 200) }); $('#chat-input').value = ''; }
  };
  $('#chat-input').onkeydown = (e) => { if (e.key === 'Enter') $('#btn-chat').click(); };
  $('#room-code').textContent = ROOM.toUpperCase();
  $('#room-code').onclick = () => copyInvite();
}
function copyInvite() {
  const url = `${location.origin}/?room=${ROOM}&name=${encodeURIComponent(profile.name)}` +
    (profile.avatar ? `&avatar=${encodeURIComponent(profile.avatar)}` : '');
  navigator.clipboard?.writeText(url).then(() => toast('邀请链接已复制'), () => toast(url));
}

function renderPlayers() {
  const box = $('#players');
  box.innerHTML = (players || []).map((p, i) => p ? `
    <div class="player ${p.connected ? '' : 'off'} ${i === mySeat ? 'me' : ''}">
      <span class="dot" style="background:${COLORS[i]}"></span>
      <img class="pavatar" src="${esc(p.avatar) || avatarURI(p.gid || p.name || i, p.name)}" alt="" onerror="this.src=avatarURI(p.gid || p.name || i, p.name)">
      <span class="pname">${esc(p.name)}</span>
      ${p.owner ? '<span class="badge">房主</span>' : ''}
      <span class="conn">${p.connected ? '' : '离线'}</span>
    </div>` : `<div class="player empty"><span class="dot" style="background:${COLORS[i]}"></span>${CN[i]}方 · 空位</div>`
  ).join('');
}

function updateUI() {
  const started = roomView?.started === true;
  const over = roomView?.started === 'over';
  const iAmOwner = players.some(p => p && p.owner && p.seat === mySeat);
  $('#btn-start').classList.toggle('hidden', !(iAmOwner && (!started || over)));
  $('#btn-start').textContent = over ? '再来一局' : '开始游戏';

  const canRoll = started && game && game.state === mySeat;
  $('#btn-roll').disabled = !canRoll;

  let hint = '';
  if (!started) hint = '等待房主开始… 支持断线重连';
  else if (over) hint = '对局结束，房主可再来一局';
  else if (mySeat < 0) hint = '观战中';
  else if (game.state === mySeat) hint = '轮到你掷骰子！';
  else if (game.state === 4 + mySeat) hint = '掷出 ' + game.lastDice + ' 点，点击高亮飞机移动';
  else hint = '';
  $('#action-hint').textContent = hint;

  const tb = $('#turn-banner');
  if (started && !over && game) {
    const turn = game.state;
    const actor = turn >= 4 ? turn - 4 : turn;
    let text = `等待 ${seatName(actor)} 行动…`;
    if (mySeat >= 0 && turn === mySeat) { text = '轮到你掷骰子 🎲'; tb.classList.add('me'); }
    else if (mySeat >= 0 && turn === 4 + mySeat) { text = `掷出 ${game.lastDice} 点，点击高亮飞机移动`; tb.classList.add('me'); }
    else tb.classList.remove('me');
    tb.innerHTML = esc2(text).replace(/🎲/g, svgDie(1, 15).replace('<svg ', '<svg style="vertical-align:-2px" ')); tb.classList.remove('hidden');
  } else tb.classList.add('hidden');

  if (game && started) {
    $('#dice').innerHTML = svgDie(Math.max(1, Math.min(6, game.lastDice || 1)), 44);
  } else $('#dice').innerHTML = svgDie(1, 44);
}

function diceAnim(n) {
  const d = $('#dice');
  d.classList.remove('rolling'); void d.offsetWidth; d.classList.add('rolling');
  setTimeout(() => { d.innerHTML = svgDie(Math.max(1, Math.min(6, n || 1)), 44); }, 380);
}
function esc2(t) { return String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function showBanner(text, me) {
  const tb = $('#turn-banner');
  tb.innerHTML = esc2(text).replace(/\u{1F3C6}/gu, svgTrophy(16)).replace(/🎲/g, svgDie(1, 15).replace('<svg ', '<svg style="vertical-align:-2px" ')); tb.classList.remove('hidden'); tb.classList.toggle('me', !!me);
}

/* ---------- board rendering（几何来自官方坐标函数） ---------- */
const canvas = $('#board'), ctx = canvas.getContext('2d');
const CX = 320, CY = 320, SC = 3.6;

function rot(x, y, p) { // 逆时针 p*90°
  const a = p * Math.PI / 2;
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
// 官方几何：RING[i]=pos i 的坐标（p0 帧）；STRETCH[51..56]；HOME[i]=第 i 架飞机的机位
const RING = {}; for (let i = 1; i <= 52; i++) RING[i] = boardCoord(0, i);
const STRETCH = {}; for (let i = 51; i <= 56; i++) STRETCH[i] = boardCoord(0, i);
const HOME = {}; for (let i = 0; i < 4; i++) HOME[i] = boardCoord(i, 0);
const CENTER = boardCoord(0, 57);

function planeFrame(p, t) { // 玩家 p 第 t 架的机位（p0 帧）
  const pos = game ? (game.planePositionList[4 * p + t] ?? 0) : 0;
  if (pos === 0) return HOME[t];
  if (pos > 57) return CENTER; // 弹回显示在终点附近
  if (pos >= 51) return STRETCH[Math.min(56, pos)];
  return RING[pos];
}

function renderAll() {
  ctx.clearRect(0, 0, 640, 640);
  // 棋盘底
  ctx.save(); ctx.translate(CX, CY); ctx.scale(SC, SC);
  // 环形 52 格
  for (let i = 1; i <= 52; i++) {
    const [x, y] = RING[i];
    cell(x, y, '#2c3852');
  }
  // 各家起飞格 + 冲刺道 + 基地
  for (let p = 0; p < 4; p++) {
    // 起飞格
    const [tx, ty] = rot(RING[1][0], RING[1][1], p);
    cell(tx, ty, COLORS[p]);
    // 冲刺道（51..56）
    for (let i = 51; i <= 56; i++) {
      const [x, y] = rot(STRETCH[i][0], STRETCH[i][1], p);
      cell(x, y, COLORS[p], 0.55);
    }
    // 基地
    const [hx, hy] = rot(-68, 68, p);
    ctx.globalAlpha = 0.25; ctx.fillStyle = COLORS[p];
    roundRect(hx - 13, hy - 13, 26, 26, 5); ctx.fill();
    ctx.globalAlpha = 1;
    // 名字标签
    const [nx, ny] = rot(-68, 88, p);
    ctx.fillStyle = '#8b97ad'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText((players[p] ? players[p].name : CN[p]).slice(0, 8), nx, ny);
  }
  // 中心
  cell(CENTER[0], CENTER[1], '#39466b', 1, 7);
  ctx.restore();

  // 飞机
  if (game) {
    for (let p = 0; p < 4; p++) {
      const nPlanes = game.planePositionList.length / 4;
      if (p >= nPlanes) break;
      for (let t = 0; t < 4; t++) {
        const f = planeFrame(p, t);
        const [x, y] = rot(f[0], f[1], p);
        const idx = 4 * p + t;
        const isMovable = movable.includes(idx) && mySeat >= 0 && game.state === 4 + mySeat;
        drawPlane(x, y, COLORS[p], isMovable, t);
      }
    }
  }
  // 高亮可移动提示（棋盘上方文字已在 updateUI）
}
function cell(x, y, color, alpha = 1, r = 2.2) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  roundRect(x - 2.4, y - 2.4, 4.8, 4.8, r); ctx.fill();
  ctx.globalAlpha = 1;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawPlane(x, y, color, highlight, t) {
  ctx.save(); ctx.translate(CX, CY); ctx.scale(SC, SC); ctx.translate(x, y);
  if (highlight) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 6; }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  // SVG 风格小飞机（路径绘制）
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.moveTo(0, -3.6); ctx.lineTo(1.1, -0.6); ctx.lineTo(3.4, 0.8); ctx.lineTo(3.4, 1.8);
  ctx.lineTo(1.0, 1.2); ctx.lineTo(0.7, 2.6); ctx.lineTo(1.9, 3.4); ctx.lineTo(1.9, 4.0);
  ctx.lineTo(-1.9, 4.0); ctx.lineTo(-1.9, 3.4); ctx.lineTo(-0.7, 2.6); ctx.lineTo(-1.0, 1.2);
  ctx.lineTo(-3.4, 1.8); ctx.lineTo(-3.4, 0.8); ctx.lineTo(-1.1, -0.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* 点击选飞机 */
canvas.addEventListener('click', (e) => {
  if (!game || mySeat < 0 || game.state !== 4 + mySeat) return;
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const bx = (px - CX) / SC, by = (py - CY) / SC;
  for (const idx of movable) {
    const p = Math.floor(idx / 4), t = idx % 4;
    const f = planeFrame(p, t);
    const [x, y] = rot(f[0], f[1], p);
    if ((bx - x) ** 2 + (by - y) ** 2 < 25) { send({ t: 'move', plane: idx }); return; }
  }
});

/* ---------- chat ---------- */
function chatLine(name, text, seat) {
  const div = document.createElement('div');
  div.className = 'chat-line';
  div.innerHTML = `<b style="color:${seat >= 0 && seat < 4 ? COLORS[seat] : '#8b97ad'}">${esc(name)}</b> ${esc(text)}`;
  pushChat(div);
}
function chatSys(text) {
  const div = document.createElement('div');
  div.className = 'chat-line sys';
  div.textContent = text;
  pushChat(div);
}
function pushChat(div) {
  const log = $('#chat-log');
  log.appendChild(div);
  while (log.children.length > 80) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* debug */
window.__dbg = () => ({ mySeat, roomView, game, movable, players });

/* boot */
if (ROOM && /^[a-z0-9]{4}$/.test(ROOM)) connect();
else showLobby();
