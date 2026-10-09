/* fxq-cf 美术资源：全部内联 SVG，无外部依赖（风格参考 game.hullqin.cn 扁平明快风） */

const H = (w, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${w}" height="${w}" ${extra} aria-hidden="true">${body}</svg>`;

/* ---------- 通用 ---------- */
export const svgTrophy = (w = 18) => H(w, `
  <path d="M7 4h10v2h3v2a4 4 0 0 1-4 4h-.35A5.5 5.5 0 0 1 13 14.9V17h2.5a1 1 0 0 1 1 1v2h-9v-2a1 1 0 0 1 1-1H11v-2.1A5.5 5.5 0 0 1 8.35 12H8a4 4 0 0 1-4-4V6h3V4z" fill="#FFC93C" stroke="#E8A400" stroke-width="1"/>
  <path d="M7 6H5.5v2A2.5 2.5 0 0 0 8 10.5M17 6h1.5v2A2.5 2.5 0 0 1 16 10.5" fill="none" stroke="#E8A400" stroke-width="1.2"/>
  <rect x="8" y="19.5" width="8" height="1.6" rx=".8" fill="#E8A400"/>`);

export const svgCrown = (w = 14) => H(w, `
  <path d="M4 18 3 8l4.5 3L12 5l4.5 6L21 8l-1 10z" fill="#FFD54A" stroke="#D9A400" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="12" cy="4" r="1.4" fill="#FF6B81"/><circle cx="3.2" cy="7" r="1.1" fill="#4FC3F7"/><circle cx="20.8" cy="7" r="1.1" fill="#4FC3F7"/>`);

export const svgSpark = (w = 12) => H(w, `
  <path d="M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z" fill="#FFE066" stroke="#F2B705" stroke-width=".8"/>`);

/* ---------- 骰子（1-6 点，白色圆角面 + 黑点） ---------- */
const PIPS = {
  1: [[12, 12]],
  2: [[7.5, 7.5], [16.5, 16.5]],
  3: [[7.5, 7.5], [12, 12], [16.5, 16.5]],
  4: [[7.5, 7.5], [16.5, 7.5], [7.5, 16.5], [16.5, 16.5]],
  5: [[7.5, 7.5], [16.5, 7.5], [12, 12], [7.5, 16.5], [16.5, 16.5]],
  6: [[7.5, 6.5], [16.5, 6.5], [7.5, 12], [16.5, 12], [7.5, 17.5], [16.5, 17.5]],
};
export const svgDie = (n, w = 40) => {
  const k = Math.max(1, Math.min(6, n | 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${w}" height="${w}" aria-hidden="true">
    <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#fff" stroke="#c9d2e0" stroke-width="1.2"/>
    ${PIPS[k].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#243040"/>`).join('')}
  </svg>`;
};

/* ---------- 大厅游戏徽标（48 viewBox） ---------- */
const EM = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">${body}</svg>`;

export const EMBLEM = {
  fxq: EM(`
    <circle cx="24" cy="24" r="21" fill="#E8F4FF"/>
    <circle cx="24" cy="24" r="21" fill="none" stroke="#BBDEFB" stroke-width="2"/>
    <path d="M14 30c0-2 1-4 3-5l4-10c.5-1.2 2-1.2 2.5 0l2.5 6.5 7-3c1.4-.6 2.8.8 2.2 2.2l-3.5 7.5c2 1 4 2.8 4 2.8z" fill="#1E88E5"/>
    <path d="M21 25l3.5-9c.4-1 1.8-1 2.2 0l2.2 6z" fill="#64B5F6"/>
    <circle cx="31" cy="27" r="1.6" fill="#fff"/>
    <path d="M12 33h24" stroke="#90CAF9" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="4 3"/>`),
  gobang: EM(`
    <rect x="4" y="4" width="40" height="40" rx="6" fill="#F5DEB3" stroke="#D9B988" stroke-width="2"/>
    <path d="M12 4v40M20 4v40M28 4v40M36 4v40M4 12h40M4 20h40M4 28h40M4 36h40" stroke="#D9B988" stroke-width="1"/>
    <circle cx="28" cy="20" r="5.5" fill="#1a1a1a"/><circle cx="27" cy="18.5" r="1.4" fill="#555"/>
    <circle cx="20" cy="28" r="5.5" fill="#fff" stroke="#c8c8c8" stroke-width="1"/><circle cx="18.6" cy="26.6" r="1.3" fill="#eee"/>
    <circle cx="36" cy="36" r="5.5" fill="#1a1a1a"/><circle cx="35" cy="34.5" r="1.4" fill="#555"/>`),
  uno: EM(`
    <rect x="8" y="4" width="26" height="40" rx="5" fill="#E53935" stroke="#B71C1C" stroke-width="2" transform="rotate(-8 21 24)"/>
    <ellipse cx="21" cy="24" rx="9" ry="14" fill="#fff" transform="rotate(-8 21 24)"/>
    <text x="21" y="29" font-family="Arial Black,Arial" font-size="12" font-weight="900" fill="#E53935" text-anchor="middle" transform="rotate(-8 21 24)">UNO</text>
    <rect x="18" y="6" width="26" height="40" rx="5" fill="#E53935" stroke="#B71C1C" stroke-width="2" transform="rotate(7 31 26)"/>
    <ellipse cx="31" cy="26" rx="9" ry="14" fill="#fff" transform="rotate(7 31 26)"/>
    <text x="31" y="31" font-family="Arial Black,Arial" font-size="12" font-weight="900" fill="#E53935" text-anchor="middle" transform="rotate(7 31 26)">UNO</text>`),
  planes: EM(`
    <rect x="4" y="4" width="40" height="40" rx="6" fill="#263238" stroke="#37474F" stroke-width="2"/>
    <path d="M10 4v40M18 4v40M26 4v40M34 4v40M4 12h40M4 20h40M4 28h40M4 36h40" stroke="#37474F" stroke-width="1"/>
    <path d="M24 10l3.2 11.5L38 25l-10.8 2.2L28 38l-4-7-4 7 .8-10.8L10 25l10.8-3.5z" fill="#FF7043" stroke="#F4511E" stroke-width="1"/>
    <circle cx="24" cy="24" r="2.2" fill="#FFE0B2"/>`),
  davinci: EM(`
    <rect x="10" y="3" width="28" height="18" rx="4" fill="#42A5F5" stroke="#1565C0" stroke-width="1.5" transform="rotate(-6 24 12)"/>
    <text x="24" y="16.5" font-size="10" font-weight="800" fill="#fff" text-anchor="middle" transform="rotate(-6 24 12)">8</text>
    <rect x="10" y="15" width="28" height="18" rx="4" fill="#EF5350" stroke="#B71C1C" stroke-width="1.5"/>
    <text x="24" y="28.5" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">?</text>
    <rect x="10" y="27" width="28" height="18" rx="4" fill="#66BB6A" stroke="#2E7D32" stroke-width="1.5" transform="rotate(6 24 36)"/>
    <text x="24" y="40.5" font-size="10" font-weight="800" fill="#fff" text-anchor="middle" transform="rotate(6 24 36)">J</text>`),
  kittens: EM(`
    <circle cx="24" cy="30" r="14" fill="#37474F" stroke="#263238" stroke-width="2"/>
    <path d="M31 20c1-4 4-6 4-6M35 14l3-1M35 14l1-3" stroke="#FF7043" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="39" cy="12" r="2.6" fill="#FFB74D"/><circle cx="39" cy="12" r="1.2" fill="#FFF3E0"/>
    <circle cx="19" cy="27" r="2.4" fill="#E8F4FF"/><circle cx="29" cy="27" r="2.4" fill="#E8F4FF"/>
    <path d="M22.5 33.5a2.5 2.5 0 0 0 3 0" stroke="#E8F4FF" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M10 26l8-3M10 32l8 1M38 26l-8-3M38 32l-8 1" stroke="#ECEFF1" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M17 16.5L20 21M31 16.5L28 21" stroke="#263238" stroke-width="2.4" stroke-linecap="round"/>`),
};

/* ---------- 爆炸猫卡牌图标（24 viewBox） ---------- */
export const KCARD = {
  boom: H(24, `<circle cx="11" cy="14" r="7.5" fill="#37474F"/><circle cx="8.5" cy="11.5" r="2" fill="#546E7A"/>
    <path d="M15.5 9.5c1-3 3.5-4 3.5-4" stroke="#FF7043" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M16.5 8.5c.5-1.5 2-2 2-2" stroke="#FFB74D" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <circle cx="19" cy="4.5" r="1.8" fill="#FFB74D"/>`),
  defuse: H(24, `<rect x="3" y="9" width="18" height="11" rx="2" fill="#EF5350"/>
    <rect x="9" y="6" width="6" height="4" rx="1" fill="#B71C1C"/>
    <rect x="3" y="13" width="18" height="2" fill="#FFCDD2"/>
    <circle cx="7" cy="17.5" r="1.4" fill="#FFEBEE"/><circle cx="12" cy="17.5" r="1.4" fill="#FFEBEE"/><circle cx="17" cy="17.5" r="1.4" fill="#FFEBEE"/>`),
  skip: H(24, `<path d="M6 5l9 7-9 7z" fill="#42A5F5"/><rect x="16" y="5" width="3" height="14" rx="1.2" fill="#42A5F5"/>`),
  attack: H(24, `<path d="M4 4l7.5 7.5M4 4v3M4 4h3M20 4l-7.5 7.5M20 4v3M20 4h-3" stroke="#78909C" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 18l8-8 2 2-8 8zM18 18l-2-2 2-2 2 2z" fill="#B0BEC5"/><circle cx="6.5" cy="18.5" r="2.2" fill="#78909C"/>`),
  favor: H(24, `<circle cx="12" cy="8" r="5" fill="#FFB74D"/>
    <path d="M8 15h8a3 3 0 0 1 3 3v3H5v-3a3 3 0 0 1 3-3z" fill="#42A5F5"/>
    <path d="M9.5 7.5a2.5 2.5 0 0 1 5 0" stroke="#E65100" stroke-width="1.3" fill="none" stroke-linecap="round"/>`),
  shuffle: H(24, `<path d="M3 7h4c5 0 5 10 10 10h4M3 17h4c2 0 3.2-1.5 4.4-3.3M21 17l-3-3M21 17l-3 3M13 10.3C14.2 8.5 15.4 7 17.4 7H21" stroke="#AB47BC" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 7l-3-3M21 7l-3 3" stroke="#AB47BC" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  seefuture: H(24, `<circle cx="12" cy="12" r="7.5" fill="#4FC3F7"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="#0288D1" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="3" fill="#01579B"/><circle cx="10.8" cy="10.8" r="1" fill="#B3E5FC"/>
    <path d="M4 20c2-2 4-3 8-3s6 1 8 3" stroke="#0288D1" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
  bottom: H(24, `<path d="M12 3v11M12 14l-4.5-4.5M12 14l4.5-4.5" stroke="#26A69A" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="4" y="17" width="16" height="3.4" rx="1.7" fill="#26A69A"/>`),
  nope: H(24, `<circle cx="12" cy="12" r="9" fill="#EF5350"/><circle cx="12" cy="12" r="9" fill="none" stroke="#B71C1C" stroke-width="1.5"/>
    <path d="M6 6l12 12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="7.5" y="10.5" width="9" height="3" rx="1.5" fill="#fff" opacity=".9"/>`),
};

/* ---------- 头像：本地生成（扁平小宠物，按 gid 确定性） ---------- */
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const MOUTHS = [
  `<path d="M26 38a3.5 3.5 0 0 0 6 0" stroke="#5D4037" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  `<circle cx="29" cy="38.5" r="2.2" fill="#5D4037"/>`,
  `<path d="M25.5 38h7" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round"/>`,
];
const EYES = [
  `<circle cx="24" cy="31" r="2" fill="#333"/><circle cx="34" cy="31" r="2" fill="#333"/>`,
  `<path d="M22 31a2 2 0 0 0 4 0M32 31a2 2 0 0 0 4 0" stroke="#333" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  `<circle cx="24" cy="31" r="2.2" fill="#333"/><circle cx="34" cy="31" r="2.2" fill="#333"/>
   <circle cx="24.7" cy="30.3" r=".7" fill="#fff"/><circle cx="34.7" cy="30.3" r=".7" fill="#fff"/>`,
];
const EAR_SETS = [
  `<path d="M18 20l-2-8 7 4zM40 20l2-8-7 4z" fill="currentColor"/>`,          // 猫耳
  `<ellipse cx="18" cy="16" rx="4" ry="8" fill="currentColor"/><ellipse cx="40" cy="16" rx="4" ry="8" fill="currentColor"/>`, // 兔耳
  `<circle cx="17" cy="18" r="5" fill="currentColor"/><circle cx="41" cy="18" r="5" fill="currentColor"/>`, // 圆耳
];
export function avatarURI(gid, name = '') {
  const h = hash32(String(gid || name || 'anon'));
  const hue = h % 360, style = (h >>> 9) % 3, eye = (h >>> 11) % 3, mouth = (h >>> 13) % 3;
  const bg = `hsl(${hue},70%,86%)`, body = `hsl(${hue},60%,62%)`, dark = `hsl(${hue},45%,46%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 58 58">
    <rect width="58" height="58" rx="14" fill="${bg}"/>
    <g fill="${dark}">${EAR_SETS[style].replaceAll('currentColor', dark)}</g>
    <circle cx="29" cy="32" r="15" fill="${body}"/>
    ${EYES[eye]}${MOUTHS[mouth]}
    <ellipse cx="19.5" cy="35.5" rx="2.4" ry="1.5" fill="hsl(${hue},75%,78%)"/>
    <ellipse cx="38.5" cy="35.5" rx="2.4" ry="1.5" fill="hsl(${hue},75%,78%)"/>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* 五子棋石子 */
export const svgStone = (w = 14, black = true) => H(w, black
  ? `<circle cx="12" cy="12" r="9" fill="#1a1a1a"/><circle cx="9.5" cy="9.5" r="2.2" fill="#555"/>`
  : `<circle cx="12" cy="12" r="9" fill="#fff" stroke="#c8c8c8" stroke-width="1.2"/><circle cx="9.5" cy="9.5" r="2" fill="#eee"/>`);

/* 黑白棋徽标 */
export const EMBLEM_REVERSI = EM(`
  <rect x="4" y="4" width="40" height="40" rx="6" fill="#1B5E20" stroke="#2E7D32" stroke-width="2"/>
  <path d="M14 4v40M24 4v40M34 4v40M4 14h40M4 24h40M4 34h40" stroke="#2E7D32" stroke-width="1.2"/>
  <circle cx="19" cy="19" r="7" fill="#111"/><circle cx="16.5" cy="16.5" r="1.8" fill="#444"/>
  <circle cx="29" cy="29" r="7" fill="#fff" stroke="#c8c8c8" stroke-width="1"/><circle cx="26.5" cy="26.5" r="1.6" fill="#eee"/>
  <circle cx="29" cy="19" r="2.4" fill="#fff" opacity=".85"/><circle cx="19" cy="29" r="2.4" fill="#111" opacity=".85"/>`);

EMBLEM.reversi = EMBLEM_REVERSI;
