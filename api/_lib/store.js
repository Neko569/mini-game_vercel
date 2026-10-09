// 存储适配层 —— 双实现，同一接口
//   Postgres（生产：Vercel + Neon/Supabase 免费 Postgres；DATABASE_URL 注入）
//   Memory（本地 E2E / 无 DB 环境自动降级）
// 接口：load(code) → doc|null；save(code, doc, expectSeq) → true|false（乐观并发冲突返回 false）
//       create(code, doc) → bool；destroy(code)；exists(code)
// 乐观并发：UPDATE ... WHERE seq = expectSeq —— serverless 多实例并发的原子性底线
import { newRoomDoc } from './logic.js';

// 兼容两种注入名：DATABASE_URL（手动/通用）与 POSTGRES_URL（Vercel Neon 集成自动注入）
const USE_PG = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);

// ---------- Postgres（postgres.js 直连任意 PG，Neon/Supabase/RDS 通吃）----------
let _sql = null;
let _ready = null;
async function ready() {
  if (_ready) return _ready;
  const { default: Postgres } = await import('postgres'); // 延迟加载：无 DB 环境不引驱动
  _sql = Postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL, { max: 3, prepare: false });
  _ready = _sql`CREATE TABLE IF NOT EXISTS fxq_rooms (
    code TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    doc JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  return _ready;
}

const pgStore = {
  async load(code) {
    await ready();
    const rows = await _sql`SELECT doc FROM fxq_rooms WHERE code = ${code}`;
    return rows.length ? rows[0].doc : null;
  },
  async save(code, doc, expectSeq) {
    await ready();
    const rows = await _sql`
      UPDATE fxq_rooms SET seq = ${doc.seq}, doc = ${JSON.stringify(doc)}::jsonb, updated_at = now()
      WHERE code = ${code} AND seq = ${expectSeq}
      RETURNING code`;
    return rows.length > 0;
  },
  async create(code, doc) {
    await ready();
    await _sql`INSERT INTO fxq_rooms (code, seq, doc) VALUES (${code}, ${doc.seq}, ${JSON.stringify(doc)}::jsonb) ON CONFLICT (code) DO NOTHING`;
    return true;
  },
  async destroy(code) { await ready(); await _sql`DELETE FROM fxq_rooms WHERE code = ${code}`; },
  async exists(code) {
    await ready();
    const rows = await _sql`SELECT 1 FROM fxq_rooms WHERE code = ${code}`;
    return rows.length > 0;
  },
};

// ---------- Memory（E2E / 降级）----------
const mem = new Map();
const memStore = {
  async load(code) {
    const e = mem.get(code);
    return e ? JSON.parse(JSON.stringify(e.doc)) : null;
  },
  async save(code, doc, expectSeq) {
    const e = mem.get(code);
    if (!e || e.doc.seq !== expectSeq) return false;
    e.doc = JSON.parse(JSON.stringify(doc));
    return true;
  },
  async create(code, doc) {
    if (mem.has(code)) return false;
    mem.set(code, { doc: JSON.parse(JSON.stringify(doc)) });
    return true;
  },
  async destroy(code) { mem.delete(code); },
  async exists(code) { return mem.has(code); },
};

export const store = USE_PG ? pgStore : memStore;
export const storageMode = USE_PG ? 'postgres' : 'memory';

// 房间号：4 位小写字母数字（去除易混淆 0/1/o/l）
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function genRoomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export { newRoomDoc };
