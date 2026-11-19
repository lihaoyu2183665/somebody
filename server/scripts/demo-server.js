/* 网页维护后台「演示模式」：把云端导出的真实数据快照加载进内存，
   提供可交互的后台界面。仅用于本地预览/演示，非生产后端。
   生产请按 README 使用 MySQL + src/index.js。

   运行：node scripts/demo-server.js
   地址：http://localhost:3001/admin
   账号：admin / admin123                                             */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const snapshot = require('../data/cloud-export.json');

const PORT = Number(process.env.PORT || 3001);
const DEMO_USER = 'admin';
const DEMO_PASS = 'admin123';
const SECRET = 'ski-club-demo-only-secret';

const TABLES = [
  'members', 'carpool_posts', 'carpool_signups', 'coach_bookings',
  'coach_slots', 'coaches', 'gear_items', 'trip_activities',
  'trip_price_options', 'trip_orders', 'club_payment_settings',
];
const db = {};
TABLES.forEach(t => { db[t] = JSON.parse(JSON.stringify(snapshot[t] || [])); });

const ok = (res, data) => res.json({ data, error: null });
const fail = (res, message, status = 400) => res.status(status).json({ data: null, error: { message } });

function sign(payload) {
  const body = Buffer.from(JSON.stringify(Object.assign(payload, {
    exp: Date.now() + 30 * 24 * 3600 * 1000,
  }))).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}
function bearer(req) {
  const h = req.headers.authorization || '';
  return h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- 登录态 ----
app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== DEMO_USER || password !== DEMO_PASS) return fail(res, '账号或密码错误（演示账号：admin / admin123）');
  return ok(res, { token: sign({ u: username }), username });
});
app.get('/api/auth/session', (req, res) => {
  const p = verify(bearer(req));
  return ok(res, p ? { username: p.u, demo: true } : null);
});

// 除登录外，所有 API 都要求演示 token。
app.use('/api', (req, res, next) => {
  const p = verify(bearer(req));
  if (!p) return fail(res, '登录已过期，请重新登录', 401);
  req.admin = p;
  next();
});

// ---- 数据总览 ----
app.get('/api/stats/overview', (req, res) => {
  const names = ['members', 'carpool_posts', 'carpool_signups', 'coaches',
    'coach_slots', 'coach_bookings', 'gear_items', 'trip_activities',
    'trip_price_options', 'trip_orders'];
  const counts = {};
  names.forEach(t => { counts[t] = db[t].length; });
  const roleMap = {};
  db.members.forEach(m => {
    const k = (m.role || 'member') + '|' + (m.status || 'draft');
    roleMap[k] = (roleMap[k] || 0) + 1;
  });
  const roles = Object.keys(roleMap).map(k => {
    const [role, status] = k.split('|');
    return { role, status, n: roleMap[k] };
  });
  const orders = db.trip_orders;
  const revenue = {
    total: orders.reduce((s, o) => s + (Number(o.amount) || 0), 0),
    paidCount: orders.filter(o => o.payment_status === 'paid').length,
    unpaidCount: orders.filter(o => o.payment_status !== 'paid').length,
  };
  return ok(res, { counts, roles, revenue, generatedAt: new Date().toISOString() });
});

// ---- 通用表查询 / 修改 / 删除 ----
function tableOf(req) {
  const t = req.params.table;
  return db[t] ? t : null;
}
app.get('/api/data/:table', (req, res) => {
  const t = tableOf(req);
  if (!t) return fail(res, '未知数据表：' + req.params.table, 404);
  return ok(res, db[t].slice());
});
app.put('/api/data/:table/:id', (req, res) => {
  const t = tableOf(req);
  if (!t) return fail(res, '未知数据表', 404);
  const row = db[t].find(r => String(r.id) === String(req.params.id));
  if (!row) return fail(res, '记录不存在', 404);
  Object.assign(row, req.body || {});
  return ok(res, row);
});
app.delete('/api/data/:table/:id', (req, res) => {
  const t = tableOf(req);
  if (!t) return fail(res, '未知数据表', 404);
  const i = db[t].findIndex(r => String(r.id) === String(req.params.id));
  if (i < 0) return fail(res, '记录不存在', 404);
  db[t].splice(i, 1);
  return ok(res, { deleted: true });
});

// ---- 会员审核 / 角色 / 删除（含超管保护） ----
app.post('/api/members/review/:id', (req, res) => {
  const m = db.members.find(r => String(r.id) === String(req.params.id));
  if (!m) return fail(res, '会员不存在', 404);
  if (m.role === 'super_admin') return fail(res, '高级管理员不可被审核');
  m.status = (req.body || {}).status === 'active' ? 'active' : 'rejected';
  m.review_note = (req.body || {}).note || '';
  m.reviewed_at = new Date().toISOString();
  return ok(res, m);
});
app.post('/api/members/role/:id', (req, res) => {
  const m = db.members.find(r => String(r.id) === String(req.params.id));
  if (!m) return fail(res, '会员不存在', 404);
  const role = (req.body || {}).role;
  if (!['member', 'coach', 'admin'].includes(role)) return fail(res, '角色不合法');
  if (m.role === 'super_admin') return fail(res, '高级管理员角色不可更改');
  if (role === 'admin' && db.members.some(r => r.role === 'super_admin')) {
    // 演示模式下不限制管理员数量，仅提示超管唯一性约束已在生产后端实现。
  }
  m.role = role;
  if (role === 'admin' || role === 'coach') m.status = 'active';
  m.review_note = '';
  return ok(res, m);
});
app.delete('/api/members/:id', (req, res) => {
  const i = db.members.findIndex(r => String(r.id) === String(req.params.id));
  if (i < 0) return fail(res, '会员不存在', 404);
  if (db.members[i].role === 'super_admin') return fail(res, '高级管理员不可删除');
  db.members.splice(i, 1);
  return ok(res, { deleted: true });
});

// ---- 收款配置 / 订单收款 ----
app.get('/api/payment/settings', (req, res) => ok(res, db.club_payment_settings[0] || {}));
app.put('/api/payment/settings', (req, res) => {
  if (!db.club_payment_settings[0]) db.club_payment_settings.push({ id: 1 });
  Object.assign(db.club_payment_settings[0], req.body || {}, { updated_at: new Date().toISOString() });
  return ok(res, db.club_payment_settings[0]);
});
app.post('/api/payment/order/:id/paid', (req, res) => {
  const o = db.trip_orders.find(r => String(r.id) === String(req.params.id));
  if (!o) return fail(res, '订单不存在', 404);
  const paid = !!(req.body || {}).paid;
  o.payment_status = paid ? 'paid' : 'unpaid';
  o.paid_at = paid ? new Date().toISOString() : null;
  return ok(res, o);
});

app.use('/api', (req, res) => fail(res, '演示模式不支持该接口：' + req.path, 404));

// ---- 静态页面 + 演示模式提示条 ----
const publicDir = path.join(__dirname, '..', 'public');
function sendPage(res) {
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const banner = '<div style="position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7c3aed;color:#fff;text-align:center;padding:8px 12px;font:13px/1.5 system-ui,sans-serif">'
    + '演示模式 · 数据来自云端导出快照，仅存于本机内存（刷新即还原） · 演示账号 admin / admin123 · 正式使用请配置 MySQL 后运行 src/index.js</div>';
  html = html.replace('</body>', banner + '</body>');
  res.type('html').send(html);
}
app.get('/admin', (req, res) => sendPage(res));
app.get('/', (req, res) => sendPage(res));
app.use(express.static(publicDir));

app.listen(PORT, '127.0.0.1', () => {
  console.log('滑雪俱乐部网页后台（演示模式）已启动：http://localhost:' + PORT + '/admin');
  console.log('演示账号：' + DEMO_USER + ' / ' + DEMO_PASS);
});
