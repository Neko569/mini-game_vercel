import { handleState } from './_lib/api.js';
export const maxDuration = 30; // 长轮询挂起上限 25s + 余量
export default async function handler(req, res) { return handleState(req, res); }
