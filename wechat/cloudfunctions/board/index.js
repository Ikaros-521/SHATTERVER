/**
 * 全服榜云函数(参考实现,见 docs/wechat-cloud-leaderboard.md)。
 *
 * 单函数按 data.action 分发:submit / list / myRank / rename。
 * 身份一律取 cloud.getWXContext().OPENID(调用方可信,客户端不可伪造)。
 * 返回值恒为 {ok:true,...} 或 {ok:false,reason},客户端据此映射四语文案。
 *
 * 注意:本目录是服务端部署物,不属于游戏的运行时依赖(游戏零 npm 依赖的约定不受影响)。
 * 内容安全:昵称内容过滤在客户端完成(编码词表),这里只做最小收敛;明文词表不得出现在
 * 任何进提审包的位置。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const boards = db.collection('boards');

/** 各榜允许的取值;window 的周/日值由服务端时钟推导。 */
const BOARDS = new Set(['overall', 'endless', 'campaign', 'abyss']);
const WINDOWS = new Set(['all', 'week', 'day']);

const SCORE_MAX = 1e15;
const NICK_MAX = 12;
/** 同一 openid 两次 submit 的最小间隔;正常游玩(一局一交)撞不上。 */
const SUBMIT_MIN_INTERVAL_MS = 2000;
/** list 的行数上限;客户端 tab 一次至多展示这些。 */
const LIST_LIMIT_MAX = 50;

/** ISO 周键,如 2026-W48;与自然日键一起构成 window 的取值域。 */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function windowKeys(now) {
  const day = now.toISOString().slice(0, 10);
  return { all: 'all', week: isoWeek(now), day };
}

/** window 参数('all'|'week'|'day')换算成集合里的具体键。 */
function windowValue(requested, now) {
  const keys = windowKeys(now);
  return keys[WINDOWS.has(requested) ? requested : 'all'];
}

function toInt(value, max) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(max, Math.max(0, n));
}

/** 昵称最小收敛:trim、去控制字符、截断。内容过滤在客户端。 */
function sanitizeNick(raw) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NICK_MAX);
}

/** 查当前玩家在一个榜一个窗口的文档;keep-best 写入的后盾。 */
async function findMine(openid, board, windowKey) {
  const found = await boards
    .where({ _openid: openid, board, window: windowKey })
    .limit(1)
    .get();
  return found.data[0] || null;
}

/** rank = 比我分高的人数 + 1;total = 该榜该窗口的总人数。 */
async function rankOf(board, windowKey, score) {
  const [above, total] = await Promise.all([
    boards.where({ board, window: windowKey, score: _.gt(score) }).count(),
    boards.where({ board, window: windowKey }).count(),
  ]);
  return { rank: above.total + 1, total: total.total };
}

/** keep-best 写入;返回是否落笔。 */
async function upsertBest(openid, board, windowKey, nick, score, streak, now) {
  const mine = await findMine(openid, board, windowKey);
  if (mine && mine.score >= score) return false;
  const patch = { nick, score, streak, at: now.getTime() };
  if (mine) await boards.doc(mine._id).update({ data: patch });
  else await boards.add({ data: { _openid: openid, board, window: windowKey, ...patch } });
  return true;
}

async function submit(openid, data, now) {
  const score = toInt(data.score, SCORE_MAX);
  if (score <= 0) return { ok: false, reason: 'invalid' };
  const streak = toInt(data.streak, 1e6);

  const overallAll = await findMine(openid, 'overall', 'all');
  if (overallAll && now.getTime() - overallAll.at < SUBMIT_MIN_INTERVAL_MS) {
    return { ok: false, reason: 'rate-limited' };
  }

  const nick = sanitizeNick(data.nickname);
  const keys = windowKeys(now);
  // overall 写三个窗口;mode 板与 abyss 板只写总榜窗口。一次调用,全部 keep-best。
  const targets = [
    ['overall', keys.all],
    ['overall', keys.week],
    ['overall', keys.day],
    [data.mode === 'campaign' ? 'campaign' : 'endless', keys.all],
  ];
  if (data.difficulty === 'abyss') targets.push(['abyss', keys.all]);
  for (const [board, windowKey] of targets) {
    await upsertBest(openid, board, windowKey, nick, score, streak, now);
  }

  const rank = await rankOf('overall', keys.all, score);
  return { ok: true, ...rank };
}

async function list(data, now) {
  const board = BOARDS.has(data.board) ? data.board : 'overall';
  const windowKey = windowValue(data.window, now);
  const limit = Math.min(LIST_LIMIT_MAX, Math.max(1, toInt(data.limit, LIST_LIMIT_MAX)));
  const found = await boards
    .where({ board, window: windowKey })
    .orderBy('score', 'desc')
    .limit(limit)
    .get();
  const total = await boards.where({ board, window: windowKey }).count();
  // 名次按查询序推导;并列分同名次。
  let rank = 0;
  let prev = -1;
  const entries = [];
  for (const doc of found.data) {
    if (prev !== doc.score) rank += 1;
    prev = doc.score;
    entries.push({ rank, nickname: doc.nick || '', score: doc.score, streak: doc.streak || 0 });
  }
  return { ok: true, entries, total: total.total };
}

async function myRank(openid, data, now) {
  const board = BOARDS.has(data.board) ? data.board : 'overall';
  const windowKey = windowValue(data.window, now);
  const mine = await findMine(openid, board, windowKey);
  if (!mine) return { ok: true, ranked: false, rank: 0, score: 0, total: 0 };
  const rank = await rankOf(board, windowKey, mine.score);
  return { ok: true, ranked: true, rank: rank.rank, score: mine.score, total: rank.total };
}

async function rename(openid, data) {
  const nick = sanitizeNick(data.nickname);
  if (nick.length < 1) return { ok: false, reason: 'invalid' };
  // 只更新已存在的文档;新玩家的昵称随第一次 submit 落库。
  await boards.where({ _openid: openid }).update({ data: { nick } });
  return { ok: true, nickname: nick };
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { ok: false, reason: 'invalid' };
  const now = new Date();
  try {
    switch (event.action) {
      case 'submit':
        return await submit(openid, event, now);
      case 'list':
        return await list(event, now);
      case 'myRank':
        return await myRank(openid, event, now);
      case 'rename':
        return await rename(openid, event);
      default:
        return { ok: false, reason: 'invalid' };
    }
  } catch (error) {
    console.error('board action failed', event.action, error);
    return { ok: false, reason: 'error' };
  }
};
