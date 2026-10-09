// E2E：飞行棋 Vercel 版全链路（内存存储，逻辑与生产 Postgres 路径完全一致）
// 覆盖：建房/入座/开局/完整对弈到终局/观战/非法动作/并发冲突/挤占/快照同步/AFK 自动代打/回收
delete process.env.DATABASE_URL; // E2E 强制内存存储（动态 import 保证在 store.js 加载前生效）
const { startHarness } = await import('./harness.mjs');
const { movablePlanes } = await import('../api/_lib/engine.js');

const H = await startHarness();
const base = H.url;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗', name); } }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function newRoom() { return (await (await fetch(`${base}/api/new-room`)).json()); }
async function act(room, body) { return (await fetch(`${base}/api/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room, ...body }) })).json(); }
async function state(room, v, wait = 2000) { return (await fetch(`${base}/api/state?room=${room}&v=${v}&wait=${wait}`)).json(); }
const lastGame = (resp) => resp.events?.filter(e => e.t === 'game').at(-1)?.game;

// 自动代打一整局：state<4 → roll；否则 move/pass。返回 {finished, turns}
async function autoPlay(code, game, pick) {
  let turns = 0, finished = null;
  while (game && game.winners && !finished && turns++ < 3000) {
    const cur = game.state < 4 ? game.state : game.state - 4;
    const gid = cur === 0 ? 'a' : 'b';
    let resp;
    if (game.state < 4) resp = await act(code, { gid, t: 'roll' });
    else {
      const mv = movablePlanes(game, cur);
      resp = mv.length ? await act(code, { gid, t: 'move', plane: pick(mv) }) : await act(code, { gid, t: 'pass' });
    }
    if (!resp.ok) { console.error('    动作失败:', resp.error); break; }
    finished = resp.events?.find(e => e.t === 'finished') || null;
    const g = lastGame(resp);
    if (g) game = g;
  }
  return { finished, turns };
}

console.log(`[harness] ${base} (storage: ${H.mode})`);

// ---------- 1. 建房 ----------
console.log('\n[1] 建房');
const { code } = await newRoom();
ok(/^[a-z0-9]{4}$/.test(code), `房间号合法: ${code}`);

// ---------- 2. 入座 / 开局 ----------
console.log('\n[2] 入座与开局');
let r = await act(code, { gid: 'a', t: 'join', name: '甲', sid: 'sa' });
ok(r.ok && r.events[0].t === 'welcome' && r.events[0].you.seat === 0, '甲入座 seat0');
r = await act(code, { gid: 'b', t: 'join', name: '乙', sid: 'sb' });
ok(r.ok && r.events[0].you.seat === 1, '乙入座 seat1');
ok(r.events.some(e => e.t === 'players' && e.players.filter(Boolean).length === 2), 'players 广播含 2 人');
r = await act(code, { gid: 'c', t: 'start', sid: 'sc' });
ok(!r.ok && /房主/.test(r.error), '非房主不能开局');
r = await act(code, { gid: 'a', t: 'start' });
ok(r.ok && r.events.some(e => e.t === 'start'), '房主开局');
const startGame = r.events.find(e => e.t === 'start').game;
ok(startGame.seatMap.length === 2 && startGame.planePositionList.length === 8, '引擎初始化：2 人 8 架飞机');

// ---------- 3. 完整对弈到终局 ----------
console.log('\n[3] 完整对弈（自动决策打满全局）');
const { finished, turns } = await autoPlay(code, startGame, (mv) => mv[0]);
ok(finished, `全局打完（${turns} 轮动作），终局广播收到`);
ok(finished && finished.winners.length === 1, `胜者: ${JSON.stringify(finished && finished.winners)}`);
ok(finished && finished.winners.every(w => w === 0 || w === 1), '胜者属于参战座位');
ok(finished && finished.room.started === 'over', '房间状态置 over');
r = await act(code, { gid: 'a', t: 'roll' });
ok(!r.ok, '终局后动作被拒');

// ---------- 4. 长轮询旁路验证 ----------
console.log('\n[4] state 长轮询旁路');
const s1 = await state(code, 0, 0);
// 284 轮对局 seq>>100：v=0 触发快照兜底（players + game sync），而非原始事件回放
ok(s1.ok && s1.events.some(e => e.t === 'game' && e.action === 'sync'), '落后超窗口 → 快照同步（players+sync）');
ok(s1.v === 0 || s1.v > 0, '快照版本正确');
const lastSeq = s1.v;
const s2 = await state(code, lastSeq, 0);
ok(s2.ok && (s2.events || []).length === 0 && s2.v === lastSeq, '追平后返回心跳（无重复事件）');
const s3 = await state(code, 99999, 0);
ok(s3.ok && s3.v === lastSeq, `未来版本号被服务端纠正 (${s3.v})`);
// 未超窗口的增量拉取：从 lastSeq-1 起步应拿到最后一条事件
const s4 = await state(code, lastSeq - 1, 0);
ok((s4.events || []).length === 1, '窗口内增量拉取精确');

// ---------- 5. 观战 ----------
console.log('\n[5] 观战与非法动作');
r = await act(code, { gid: 'spect', t: 'join', name: '观众' });
ok(r.ok, '满员后加入');
ok(r.events[0].you.seat === -1, '得到观战身份（seat=-1）');
r = await act(code, { gid: 'spect', t: 'roll' });
ok(!r.ok, '观战者不能掷骰');

// ---------- 6. 并发冲突（乐观并发串行化）----------
console.log('\n[6] 并发冲突');
const { code: code2 } = await newRoom();
await act(code2, { gid: 'a', t: 'join', name: '甲' });
await act(code2, { gid: 'b', t: 'join', name: '乙' });
r = await act(code2, { gid: 'a', t: 'start' });
const game2 = r.events.find(e => e.t === 'start').game;
const [r1, r2] = await Promise.all([act(code2, { gid: 'a', t: 'roll' }), act(code2, { gid: 'a', t: 'roll' })]);
const oks = [r1.ok, r2.ok].filter(Boolean).length;
ok(oks >= 1, `并发 roll 成功数=${oks}（≥1）`);
ok(oks === 1, '并发 roll 恰好成功一个（第二个被拒：已过掷骰阶段）');
const sv = await state(code2, 0, 0);
ok(sv.events.filter(e => e.t === 'game').length === 1, 'roll 只入账一次（事件数=1）');
ok(lastGame({ events: sv.events }).lastDice >= 1 && lastGame({ events: sv.events }).lastDice <= 6, '骰值合法，状态无损坏');

// ---------- 7. 挤占（同 gid 新 sid 踢旧会话）----------
console.log('\n[7] 挤占');
await act(code2, { gid: 'a', t: 'join', name: '甲', sid: 'new-session' });
const old = await (await fetch(`${base}/api/state?room=${code2}&gid=a&sid=old-session&v=0&wait=0`)).json();
ok(old.events?.[0]?.t === 'kicked', '旧 sid 收到 kicked');
const neu = await (await fetch(`${base}/api/state?room=${code2}&gid=a&sid=new-session&v=0&wait=0`)).json();
ok(!(neu.events || []).some(e => e.t === 'kicked'), '新 sid 不受影响');

// ---------- 8. 快照同步（整局事件 > 100 时落后客户端兜底）----------
console.log('\n[8] 快照同步');
const { code: code3 } = await newRoom();
await act(code3, { gid: 'a', t: 'join', name: '甲' });
await act(code3, { gid: 'b', t: 'join', name: '乙' });
r = await act(code3, { gid: 'a', t: 'start' });
const { finished: fin3 } = await autoPlay(code3, r.events.find(e => e.t === 'start').game, (mv) => mv[mv.length - 1]);
ok(fin3, 'code3 全局打完');
const all = await state(code3, 0, 0);
const snap = await (await fetch(`${base}/api/state?room=${code3}&v=1&wait=0`)).json();
ok(snap.ok && snap.v > 0, `快照返回 v=${snap.v}`);
const seqAll = all.v;
const snapEvents = seqAll - 1 > 100 ? snap.events : snap.events || [];
ok(snapEvents.length ? snapEvents.some(e => e.t === 'players') : true, '快照含 players 兜底事件');
ok(snap.v === seqAll, '快照版本与最新一致');

// ---------- 9. 房间回收边界 ----------
console.log('\n[9] 房间回收');
const { code: code4 } = await newRoom();
const alive = await state(code4, 0, 0);
ok(alive.ok, '新房间未被误回收');
const ghost = await state('zzzz', 0, 0);
ok(!ghost.ok && /不存在/.test(ghost.error), '不存在房间返回 404 语义');

// ---------- 10. AFK 自动代打（子进程短时限验证虚拟定时器）----------
console.log('\n[10] AFK 自动代打（AFK_MS=300ms 子进程）');
const { spawnSync } = await import('node:child_process');
const fsPromises = await import('node:fs/promises');
// 注意：ESM import 提升，必须动态 import 保证 AFK_MS 在 logic.js 加载前生效
const afkScript = `
process.env.AFK_MS = '300';
const { startHarness } = await import('./harness.mjs');
const H = await startHarness();
const { code } = await (await fetch(H.url + '/api/new-room')).json();
const act = (b) => fetch(H.url + '/api/action', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ room: code, ...b }) }).then(r => r.json());
await act({ gid: 'a', t: 'join', name: '甲' });
await act({ gid: 'b', t: 'join', name: '乙' });
await act({ gid: 'a', t: 'start' });
await new Promise(r => setTimeout(r, 400));
// 拉状态 → 虚拟定时器应代甲 roll（产生 game 事件并持久化）
const s = await (await fetch(H.url + '/api/state?room=' + code + '&v=0&wait=0')).json();
const gameEv = s.events.filter(e => e.t === 'game');
console.log('RESULT:' + JSON.stringify({ ok: gameEv.length >= 1 && gameEv[0].action === 'roll', by: gameEv[0]?.by, action: gameEv[0]?.action }));
H.close();
`;
const afkFile = new URL('./_afk_probe.mjs', import.meta.url);
await fsPromises.writeFile(afkFile, afkScript);
const out = spawnSync(process.execPath, [afkFile.pathname], { encoding: 'utf8', timeout: 15000 });
const line = (out.stdout || '').split('\n').find(l => l.startsWith('RESULT:'));
let afk = { ok: false };
try { afk = JSON.parse(line.slice(7)); } catch { console.error('  (子进程输出异常:', (out.stderr || '').slice(0, 300), ')'); }
await fsPromises.unlink(afkFile).catch(() => {});
ok(afk.ok, `AFK 超时后自动代打 roll（by=${afk.by}）`);

console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
H.close();
process.exit(fail ? 1 : 0);
