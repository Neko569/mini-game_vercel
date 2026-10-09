/* game-client（Vercel/Serverless 版）—— 与 CF 版同接口的 HTTP 长轮询传输层
 * 接口不变：gameClient({ path, profile, onMsg, onStatus }) → { send, close, closed }
 * 平台差异：Serverless 无 WS 长连接，改用：
 *   - send()    → POST /api/action（响应里携带直接回复 + 广播事件）
 *   - 收消息    → GET /api/state 长轮询（服务端挂起 ≤25s，有新事件立即返回）
 *   - 心跳      → 长轮询超时返回即心跳（无死连接问题，serverless 无常驻连接）
 *   - 断线重连  → fetch 失败指数退避，重连后从上次版本号续传（不丢事件）
 *   - 挤占      → 服务端发现同 gid 新 sid，推送 {t:'kicked'}（复刻 close 4000）
 */
export function gameClient({ path, profile, onMsg, onStatus }) {
  const ROOM = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
  const SID = crypto.randomUUID();
  const gid = profile.gid;
  let v = 0;
  let closed = false;
  let everConnected = false;
  let pollAbort = null;

  function deliver(resp) {
    if (!resp || closed) return;
    if (resp.ok === false) { onMsg({ t: 'error', msg: resp.error || '操作失败' }); return; }
    for (const ev of (resp.events || [])) {
      if (ev.t === 'kicked') {
        closed = true;
        if (onStatus) onStatus('kicked');
        return;
      }
      if (ev.v != null) {
        if (ev.v <= v) continue; // 去重：POST 响应与长轮询可能重叠
        v = ev.v;
      }
      onMsg(ev);
    }
  }

  async function post(body) {
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: ROOM, gid, sid: SID, ...body }),
    });
    return r.json();
  }

  async function pollLoop() {
    while (!closed) {
      pollAbort = new AbortController();
      try {
        const r = await fetch(`/api/state?room=${ROOM}&gid=${encodeURIComponent(gid)}&sid=${SID}&v=${v}&wait=25000`,
          { signal: pollAbort.signal });
        if (!r.ok) throw new Error('state ' + r.status);
        deliver(await r.json());
      } catch (e) {
        if (closed) return;
        if (e && e.name === 'AbortError') continue;
        scheduleReconnect();
        return;
      }
    }
  }

  function scheduleReconnect() {
    if (closed) return;
    if (onStatus) onStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** Math.min((scheduleReconnect.n = (scheduleReconnect.n || 0) + 1), 4), 15000)
      + Math.floor(Math.random() * 300);
    setTimeout(async () => {
      if (closed) return;
      try {
        // 重连 = 重新 join（座位复活 + 补发 sync）—— 语义与 CF 版一致
        const resp = await post({ t: 'join', name: profile.name, avatar: profile.avatar });
        scheduleReconnect.n = 0;
        if (onStatus) onStatus(everConnected ? 'reconnected' : 'connected');
        everConnected = true;
        deliver(resp);
        pollLoop();
      } catch { scheduleReconnect(); }
    }, delay);
  }

  async function connect() {
    try {
      const resp = await post({ t: 'join', name: profile.name, avatar: profile.avatar });
      if (resp && resp.ok === false) {
        onMsg({ t: 'error', msg: resp.error || '加入失败' });
        return;
      }
      if (onStatus) onStatus(everConnected ? 'reconnected' : 'connected');
      everConnected = true;
      deliver(resp);
      pollLoop();
    } catch { scheduleReconnect(); }
  }

  connect();
  return {
    send(obj) { if (!closed) post(obj).then(deliver).catch(() => {}); },
    close() {
      closed = true;
      try { pollAbort && pollAbort.abort(); } catch {}
      post({ t: 'leave' }).catch(() => {}); // 尽力通知（座位转离线，可重连复活）
    },
    get closed() { return closed; },
  };
}
