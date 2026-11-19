/* 一体化后端服务（本地联调 / 演示）：把云端导出的真实快照加载进内存，
   用同一进程、同一份数据、同一套权限策略，同时支撑——
     · 小程序前端：微信登录 / 会员建档 / 数据 CRUD / 图片 / 收款
     · 网页维护后台：总览 / 审核 / 改角色 / 收款确认 / 配置
   两端通过不同登录入口接入，但共享 openid + member 体系与同一份内存数据，
   因此后台改动会立即体现在小程序，反之亦然。

   仅用于本地联调 / 演示；生产请用 MySQL + src/index.js。

   运行：node scripts/demo-server.js
   小程序地址：http://<本机IP>:3001    网页后台：http://<本机IP>:3001/admin
   后台账号：admin / demo1234                                            */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const snapshot = require('../data/cloud-export.json');
const policy = require('../src/policy');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const SECRET = process.env.JWT_SECRET || 'ski-club-demo-only-secret';
const JWT_EXPIRES = '30d';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'demo1234';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '') || ('http://127.0.0.1:' + PORT);

const TABLES = [
  'members', 'carpool_posts', 'carpool_signups', 'coach_bookings',
  'coach_slots', 'coaches', 'gear_items', 'trip_activities',
  'trip_price_options', 'trip_orders', 'club_payment_settings',
];
const db = {};
TABLES.forEach(t => { db[t] = JSON.parse(JSON.stringify(snapshot[t] || [])); });
const ALLOWED = TABLES.filter(t => t !== 'club_payment_settings').concat(['carpool_signup_contacts']);

const ok = (res, data) => res.json({ data, error: null });
const fail = (res, message, status = 400) => res.status(status).json({ data: null, error: { message } });
const now = () => new Date().toISOString();

function nextId(table) {
  const max = db[table].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  return max + 1;
}

// ---------- 登录态 ----------
function signToken(openid) {
  return jwt.sign({ sub: openid }, SECRET, { expiresIn: JWT_EXPIRES });
}
function openidFrom(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  try {
    const p = jwt.verify(m[1].trim(), SECRET);
    return p && p.sub ? p.sub : null;
  } catch (e) { return null; }
}
function codeToOpenid(code) {
  if (!code || typeof code !== 'string') throw new Error('缺少登录 code');
  if (code.indexOf('wx:') === 0) return code;
  return 'wx:dev_' + crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
}

// 计算 access：形状与 utils/guard.js / src/auth.js 一致。
function loadAccess(openid) {
  const member = openid ? db.members.find(m => m.owner_id === openid) : null;
  let state = 'guest';
  if (member) {
    if ((member.role === 'admin' || member.role === 'super_admin') && member.status === 'active') state = 'admin';
    else if (member.status === 'active') state = 'active';
    else state = member.status || 'draft';
  }
  const isAdmin = state === 'admin';
  const isSuperAdmin = isAdmin && member && member.role === 'super_admin';
  const isCoach = state === 'active' && member && member.role === 'coach';
  const allowed = state === 'active' || state === 'admin';
  return {
    openid: openid || '', state, member: member || null,
    isAdmin, isSuperAdmin, isCoach,
    canCoach: isAdmin || isCoach,
    canView: allowed, canPublish: allowed,
  };
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 所有 /api 请求解析登录态（两种登录入口在此之前处理）。
app.use('/api', (req, res, next) => {
  req.openid = openidFrom(req);
  req.access = loadAccess(req.openid);
  next();
});

// ---------- 登录入口 ----------
app.post('/api/auth/wechat-login', (req, res) => {
  try {
    const openid = codeToOpenid((req.body || {}).code);
    const token = signToken(openid);
    return ok(res, { token, user: { id: openid, name: '' } });
  } catch (e) { return fail(res, e.message || '微信登录失败'); }
});
app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return fail(res, '账号或密码错误（演示账号：' + ADMIN_USER + ' / ' + ADMIN_PASS + '）');
  }
  const superAdmin = db.members.find(m => m.role === 'super_admin');
  const openid = superAdmin ? superAdmin.owner_id : 'wx:admin';
  return ok(res, { token: signToken(openid), user: { id: openid, name: '俱乐部管理员' } });
});
app.get('/api/auth/session', (req, res) => {
  if (!req.openid) return ok(res, null);
  return ok(res, {
    token: (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
    user: { id: req.openid, name: req.access.member ? req.access.member.display_name : '' },
    member: req.access.member,
  });
});
app.post('/api/auth/logout', (req, res) => ok(res, true));

// ---------- 会员 ----------
app.post('/api/members/ensure', (req, res) => {
  if (!req.openid) return fail(res, '请先登录', 401);
  let m = db.members.find(x => x.owner_id === req.openid);
  if (m) return ok(res, m);
  const first = db.members.length === 0;
  const name = (req.body || {}).name || '雪友';
  m = {
    id: nextId('members'), owner_id: req.openid, owner_name: name, display_name: name,
    phone: '', snow_level: 'beginner', role: first ? 'super_admin' : 'member',
    status: first ? 'active' : 'draft', created_at: now(), review_note: null,
  };
  db.members.push(m);
  return ok(res, m);
});
app.get('/api/members/me', (req, res) => {
  if (!req.openid) return fail(res, '请先登录', 401);
  return ok(res, req.access.member || null);
});
const SELF_EDITABLE = new Set([
  'display_name', 'owner_name', 'phone', 'snow_level', 'real_name', 'id_card_no',
  'gender', 'avatar', 'review_note', 'terms_agreed_at', 'status',
]);
app.patch('/api/members/me', (req, res) => {
  if (!req.openid) return fail(res, '请先登录', 401);
  const m = req.access.member;
  if (!m) return fail(res, '请先注册会员', 404);
  Object.keys(req.body || {}).forEach(k => {
    let v = req.body[k];
    if (!SELF_EDITABLE.has(k)) return;
    if (k === 'status' && !['draft', 'pending'].includes(v)) return;
    m[k] = v;
  });
  return ok(res, m);
});
app.post('/api/members/review/:id', (req, res) => {
  if (!req.access.isAdmin) return fail(res, '仅管理员可用', 403);
  const m = db.members.find(r => String(r.id) === String(req.params.id));
  if (!m) return fail(res, '会员不存在', 404);
  if (m.role === 'super_admin' && !req.access.isSuperAdmin) return fail(res, '无权操作高级管理员');
  const status = (req.body || {}).status;
  if (!['active', 'rejected', 'pending'].includes(status)) return fail(res, '非法审核状态');
  m.status = status;
  m.review_note = (req.body || {}).note || null;
  m.reviewed_at = now();
  return ok(res, m);
});
app.post('/api/members/role/:id', (req, res) => {
  if (!req.access.isAdmin) return fail(res, '仅管理员可用', 403);
  const m = db.members.find(r => String(r.id) === String(req.params.id));
  if (!m) return fail(res, '会员不存在', 404);
  if (m.role === 'super_admin') return fail(res, '高级管理员角色不可更改');
  const role = (req.body || {}).role;
  if (!['member', 'coach', 'admin'].includes(role)) return fail(res, '非法角色');
  m.role = role;
  if (role === 'admin' || role === 'coach') { m.status = 'active'; m.review_note = null; }
  return ok(res, m);
});
app.delete('/api/members/:id', (req, res) => {
  if (!req.access.isAdmin) return fail(res, '仅管理员可用', 403);
  const i = db.members.findIndex(r => String(r.id) === String(req.params.id));
  if (i < 0) return fail(res, '会员不存在', 404);
  if (db.members[i].role === 'super_admin') return fail(res, '高级管理员不可删除');
  db.members.splice(i, 1);
  return ok(res, { removed: 1 });
});

// ---------- 数据访问（内存版权限过滤，等价 policy.js 的 SQL 版）----------
function readVisible(table, access) {
  const uid = access.openid || '';
  const admin = !!access.isAdmin;
  let rows = (db[table] || []).slice();
  switch (table) {
    case 'members':
      if (admin && access.isSuperAdmin) return rows;
      if (admin) return rows.filter(r => r.role !== 'super_admin' || r.owner_id === uid);
      if (!uid) return [];
      return rows.filter(r => r.owner_id === uid || r.role !== 'super_admin');
    case 'carpool_signup_contacts': return rows;
    case 'carpool_posts': case 'coaches': case 'coach_slots': case 'gear_items': case 'trip_activities':
      if (admin) return rows;
      if (!uid) return rows.filter(r => r.review_status === 'approved');
      return rows.filter(r => r.review_status === 'approved' || r.owner_id === uid);
    case 'carpool_signups':
      if (admin) return rows;
      if (!uid) return [];
      return rows.filter(r => r.owner_id === uid || db.carpool_posts.some(p => p.id === r.post_id && p.owner_id === uid));
    case 'coach_bookings':
      if (admin) return rows;
      if (!uid) return [];
      return rows.filter(r => r.owner_id === uid || db.coaches.some(c => c.id === r.coach_id && c.owner_id === uid));
    case 'trip_orders':
      if (admin) return rows;
      if (!uid) return [];
      return rows.filter(r => r.owner_id === uid);
    case 'trip_price_options': return rows;
    case 'club_payment_settings': return admin ? rows : [];
    default: return null;
  }
}
function rowVisible(table, row, access) {
  if (!row) return false;
  const uid = access.openid || '';
  if (table === 'carpool_signup_contacts') return true;
  if (table === 'trip_price_options') return true;
  if (table === 'club_payment_settings') return !!access.isAdmin;
  if (access.isAdmin && table === 'members' && access.isSuperAdmin) return true;
  return readVisible(table, access).some(r => String(r.id) === String(row.id));
}
function applyOptions(rows, options) {
  let out = rows.slice();
  const filters = (options && options.filters) || [];
  filters.forEach(f => {
    if (!f || !f.column) return;
    if (f.method === 'in' && Array.isArray(f.value)) out = out.filter(r => f.value.includes(r[f.column]));
    else out = out.filter(r => r[f.column] === f.value);
  });
  const col = (options && options.order) || 'created_at';
  const asc = !!(options && options.ascending);
  out.sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av === bv) return 0;
    const x = av == null ? '' : av, y = bv == null ? '' : bv;
    return (x > y ? 1 : -1) * (asc ? 1 : -1);
  });
  const limit = Math.min(Number((options && options.limit) || 1000), 2000);
  return out.slice(0, limit);
}
app.get('/api/data/:table', (req, res) => {
  const t = req.params.table;
  if (ALLOWED.indexOf(t) < 0) return fail(res, '未知数据表', 404);
  let options = {};
  try { options = req.query.options ? JSON.parse(req.query.options) : {}; } catch (e) { options = {}; }
  let rows = readVisible(t, req.access);
  if (rows === null) return fail(res, '未知数据表', 404);
  rows = applyOptions(rows, options).map(r => policy.projectRow(t, r, req.access));
  return ok(res, rows);
});
app.get('/api/data/:table/:id', (req, res) => {
  const t = req.params.table;
  if (ALLOWED.indexOf(t) < 0) return fail(res, '未知数据表', 404);
  const row = (db[t] || []).find(r => String(r.id) === String(req.params.id));
  if (!rowVisible(t, row, req.access)) return ok(res, null);
  return ok(res, policy.projectRow(t, row, req.access));
});
app.post('/api/data/:table', (req, res) => {
  const t = req.params.table;
  if (ALLOWED.indexOf(t) < 0 || t === 'carpool_signup_contacts') return fail(res, '未知数据表', 404);
  if (!req.openid) return fail(res, '请先登录', 401);
  if (!req.access.canView) return fail(res, '需管理员审核通过后才能使用', 403);
  const perm = policy.canCreate(t, req.access);
  if (!perm.ok) return fail(res, perm.reason);
  const payload = Object.assign({}, req.body || {});
  delete payload.id; delete payload.super_admin_key;
  if (policy.forceOwner(t)) payload.owner_id = req.openid;
  const row = Object.assign({ id: nextId(t), created_at: now() }, payload);
  if (t === 'members' || t === 'club_payment_settings') return fail(res, '该表不支持直接新增');
  db[t].push(row);
  return ok(res, row);
});
app.put('/api/data/:table/:id', (req, res) => {
  const t = req.params.table;
  if (ALLOWED.indexOf(t) < 0 || t === 'carpool_signup_contacts') return fail(res, '未知数据表', 404);
  if (!req.openid) return fail(res, '请先登录', 401);
  const row = (db[t] || []).find(r => String(r.id) === String(req.params.id));
  if (!row) return fail(res, '记录不存在', 404);
  const patch = Object.assign({}, req.body || {});
  const perm = policy.canUpdate(t, row, req.access, patch);
  if (!perm.ok) return fail(res, perm.reason);
  delete patch.id; delete patch.owner_id; delete patch.super_admin_key;
  Object.assign(row, patch);
  return ok(res, row);
});
app.delete('/api/data/:table/:id', (req, res) => {
  const t = req.params.table;
  if (ALLOWED.indexOf(t) < 0 || t === 'carpool_signup_contacts') return fail(res, '未知数据表', 404);
  if (!req.openid) return fail(res, '请先登录', 401);
  const row = (db[t] || []).find(r => String(r.id) === String(req.params.id));
  if (!row) return fail(res, '记录不存在', 404);
  const perm = policy.canDelete(t, row, req.access);
  if (!perm.ok) return fail(res, perm.reason);
  const i = db[t].indexOf(row);
  db[t].splice(i, 1);
  return ok(res, { removed: 1 });
});

// ---------- 收款 ----------
app.get('/api/payment/settings', (req, res) => ok(res, db.club_payment_settings[0] || {}));
app.put('/api/payment/settings', (req, res) => {
  if (!req.access.isAdmin) return fail(res, '仅管理员可用', 403);
  if (!db.club_payment_settings[0]) db.club_payment_settings.push({ id: 1 });
  Object.assign(db.club_payment_settings[0], req.body || {}, { updated_at: now() });
  return ok(res, db.club_payment_settings[0]);
});
app.post('/api/payment/order/:id/paid', (req, res) => {
  if (!req.access.isAdmin) return fail(res, '仅管理员可用', 403);
  const o = db.trip_orders.find(r => String(r.id) === String(req.params.id));
  if (!o) return fail(res, '订单不存在', 404);
  const paid = !!(req.body || {}).paid;
  o.payment_status = paid ? 'paid' : 'unpaid';
  o.paid_at = paid ? now() : null;
  return ok(res, o);
});

// ---------- 总览 ----------
app.get('/api/stats/overview', (req, res) => {
  if (!req.access.isAdmin) return fail(res, '仅管理员可用', 403);
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
  return ok(res, {
    counts, roles,
    revenue: {
      total: orders.reduce((s, o) => s + (Number(o.amount) || 0), 0),
      paidCount: orders.filter(o => o.payment_status === 'paid').length,
      unpaidCount: orders.filter(o => o.payment_status !== 'paid').length,
    },
    generatedAt: now(),
  });
});

// ---------- 图片 ----------
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    cb(null, Date.now() + '_' + Math.floor(Math.random() * 100000) + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/api/storage/upload', (req, res, next) => {
  if (!req.openid) return fail(res, '请先登录', 401);
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, '图片上传失败或类型不支持');
  return ok(res, req.file.filename);
});
app.post('/api/storage/signed-urls', (req, res) => {
  const paths = (req.body || {}).paths || [];
  return ok(res, paths.map(p => {
    if (!p) return '';
    if (p.indexOf('preset:') === 0 || /^https?:\/\//i.test(p)) return p;
    return PUBLIC_BASE_URL + '/uploads/' + path.basename(p);
  }));
});
app.delete('/api/storage/remove', (req, res) => {
  const p = (req.body || {}).path || '';
  if (p && p.indexOf('preset:') !== 0 && !/^https?:\/\//i.test(p)) {
    const target = path.join(uploadDir, path.basename(p));
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  return ok(res, true);
});
app.use('/uploads', express.static(uploadDir));

app.use('/api', (req, res) => fail(res, '一体化演示服务不支持该接口：' + req.path, 404));

// ---------- 网页后台 ----------
const publicDir = path.join(__dirname, '..', 'public');
function sendPage(res) {
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const banner = '<div style="position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7c3aed;color:#fff;text-align:center;padding:8px 12px;font:13px/1.5 system-ui,sans-serif">'
    + '一体化演示服务 · 小程序与后台共享同一份内存数据（刷新即还原） · 后台账号 ' + ADMIN_USER + ' / ' + ADMIN_PASS + '</div>';
  html = html.replace('</body>', banner + '</body>');
  res.type('html').send(html);
}
app.get('/admin', (req, res) => sendPage(res));
app.get('/', (req, res) => sendPage(res));
app.use(express.static(publicDir));

app.listen(PORT, HOST, () => {
  console.log('滑雪俱乐部一体化服务（本地联调/演示）已启动');
  console.log('  小程序 API  : http://<本机IP>:' + PORT + '/api');
  console.log('  网页后台    : http://<本机IP>:' + PORT + '/admin');
  console.log('  后台账号    : ' + ADMIN_USER + ' / ' + ADMIN_PASS);
  console.log('  监听        : ' + HOST + ':' + PORT);
});
