// API 处理层 —— 与平台解耦（Vercel 路由文件只是薄壳；本地 harness 直接复用本文件）
// 端点：
//   GET  /api/new-room            → {code, game}（幂等新建，复刻 worker 同名端点）
//   POST /api/action  {room,gid,sid?,t,...} → {ok, events:[...]}（动作 + 响应调用者的事件）
//   GET  /api/state?room&gid&sid&v&wait    → 长轮询（≤25s）：版本增量 / 快照同步 / 挤占通知
import { store, storageMode, genRoomCode, newRoomDoc } from './store.js';
import { applyAction, processTimeouts, isRecyclable, snapshotEvents } from './logic.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(body);
}

function cleanCode(raw) {
  const c = String(raw || '').toLowerCase();
  return /^[a-z0-9]{4}$/.test(c) ? c : null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 读 + 惰性定时 + 回收（读写共用入口）----------
// 返回 {doc} 或 {gone:true}（不存在/已回收）
async function loadLive(code, { mutate = false } = {}) {
  const doc = await store.load(code);
  if (!doc) return { gone: true };
  if (isRecyclable(doc, Date.now())) {
    await store.destroy(code);
    return { gone: true };
  }
  const before = doc.seq;
  processTimeouts(doc, Date.now());
  // 虚拟定时器产生了事件 → 持久化（乐观并发；冲突即放弃，调用方下轮循环自然拿到新版本）
  if (mutate && doc.seq !== before) await store.save(code, doc, before);
  return { doc };
}

// ---------- GET /api/new-room ----------
export async function handleNewRoom(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  for (let i = 0; i < 8; i++) {
    const code = genRoomCode();
    if (await store.exists(code)) continue;
    const doc = newRoomDoc(code);
    await store.create(code, doc);
    return json(res, { code, game: 'fxq' });
  }
  return json(res, { error: '房间号分配失败，稍后再试' }, 500);
}

// ---------- POST /api/action ----------
export async function handleAction(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return json(res, { ok: false, error: 'method not allowed' }, 405);
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 64 * 1024) req.destroy(); });
  req.on('end', async () => {
    let m; try { m = JSON.parse(body); } catch { return json(res, { ok: false, error: 'bad json' }, 400); }
    const code = cleanCode(m.room);
    if (!code) return json(res, { ok: false, error: '房间号非法' }, 400);
    try {
      // 乐观并发重试：serverless 多实例下动作串行化的关键
      for (let attempt = 0; attempt < 4; attempt++) {
        const doc = await store.load(code);
        if (!doc) return json(res, { ok: false, error: '房间不存在' }, 404);
        processTimeouts(doc, Date.now());
        const expectSeq = doc.seq;
        const { resp, events, changed } = applyAction(doc, m);
        if (m.t === 'ping') return json(res, { ok: true, events: resp });
        if (await store.save(code, doc, expectSeq)) {
          return json(res, { ok: true, events: [...resp, ...events] });
        }
        await sleep(30 + Math.random() * 60); // 冲突：退避后重读重放
      }
      return json(res, { ok: false, error: '太热闹了，稍后再试' }, 503);
    } catch (e) {
      return json(res, { ok: false, error: (e && e.message) || String(e) });
    }
  });
}

// ---------- GET /api/state（长轮询）----------
export async function handleState(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const code = cleanCode(url.searchParams.get('room'));
  if (!code) return json(res, { ok: false, error: '房间号非法' }, 400);
  const gid = String(url.searchParams.get('gid') || '');
  const sid = String(url.searchParams.get('sid') || '');
  let v = parseInt(url.searchParams.get('v') || '0', 10) || 0;
  const rawWait = url.searchParams.get('wait');
  const wait = rawWait == null ? 25000 : Math.min(Math.max(parseInt(rawWait, 10) || 0, 0), 25000);
  const deadline = Date.now() + wait;
  let lastSeq = 0;

  while (true) {
    const { doc, gone } = await loadLive(code, { mutate: true });
    if (gone) return json(res, { ok: false, error: '房间不存在' }, 404);
    lastSeq = doc.seq;

    // 挤占：同 gid 出现更新的 sid → 立即通知旧会话退出（复刻 close 4000）
    if (gid && sid && doc.sids[gid] && doc.sids[gid] !== sid) {
      return json(res, { ok: true, v: doc.seq, events: [{ t: 'kicked', reason: 'duplicate' }] });
    }

    const events = doc.log.filter(e => e.v > v);
    if (events.length > 0) {
      // 客户端落后超过日志保留窗口 → 快照同步兜底
      if (doc.seq - v > 100) {
        return json(res, { ok: true, v: doc.seq, events: snapshotEvents(doc) });
      }
      return json(res, { ok: true, v: doc.seq, events });
    }
    if (Date.now() >= deadline) break;
    await sleep(Math.min(700, Math.max(deadline - Date.now(), 50))); // DB 每秒 ~1.4 次轻查询，免费额度绰绰有余
  }
  // 超时：返回服务端当前版本（纠正客户端的未来/漂移版本号，兼当心跳保活）
  return json(res, { ok: true, v: lastSeq });
}
