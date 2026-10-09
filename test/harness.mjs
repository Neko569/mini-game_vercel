// 本地 harness：用原生 http 把 api/_lib 处理器挂成服务（与 Vercel 路由同源同逻辑）
// 用法：startHarness(port?) → { url, close, mode }
import http from 'node:http';
import { handleNewRoom, handleAction, handleState } from '../api/_lib/api.js';
import { storageMode } from '../api/_lib/store.js';

export function startHarness(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const h = url.pathname === '/api/new-room' ? handleNewRoom
      : url.pathname === '/api/action' ? handleAction
      : url.pathname === '/api/state' ? handleState : null;
    if (!h) { res.writeHead(404); return res.end(); }
    // 兜底：任何异步异常都回 500，绝不悬挂客户端
    Promise.resolve(h(req, res)).catch((e) => {
      console.error('[harness:500]', e && (e.stack || e.message));
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'server error' })); }
      else res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close(), mode: storageMode });
    });
  });
}
