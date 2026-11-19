let TOKEN = localStorage.getItem('ski_admin_token') || '';
let CURRENT_VIEW = 'overview';
let CURRENT_TABLE = '';
let TABLE_CACHE = [];
let EDIT_ID = null;

const $ = id => document.getElementById(id);

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
}

async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, Object.assign({}, options, {
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  }));
  return res.json();
}

function loginErr(msg) { $('loginErr').textContent = msg || ''; }

async function login(event) {
  event.preventDefault();
  loginErr('');
  const res = await api('/api/auth/admin-login', {
    method: 'POST',
    body: { username: $('loginUser').value.trim(), password: $('loginPass').value },
  });
  if (res.error) return loginErr(res.error.message);
  TOKEN = res.data.token;
  localStorage.setItem('ski_admin_token', TOKEN);
  enterApp();
}

function logout() {
  TOKEN = ''; localStorage.removeItem('ski_admin_token');
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
}

function enterApp() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  loadView('overview');
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.view) loadView(btn.dataset.view);
    else if (btn.dataset.table) loadTable(btn.dataset.table);
  });
});

async function loadView(view) {
  CURRENT_VIEW = view; CURRENT_TABLE = '';
  $('viewTitle').textContent = ({ overview: '数据总览', members: '会员管理', settings: '收款配置' })[view] || view;
  $('topInfo').textContent = '';
  if (view === 'overview') return renderOverview();
  if (view === 'members') return loadTable('members');
  if (view === 'settings') return renderSettings();
}

async function renderOverview() {
  const res = await api('/api/stats/overview');
  if (res.error) return toast(res.error.message);
  const d = res.data;
  const names = { members: '会员', carpool_posts: '拼车信息', carpool_signups: '拼车报名', coaches: '教练', coach_slots: '可约时段', coach_bookings: '课程预约', gear_items: '二手装备', trip_activities: '参团活动', trip_price_options: '价格档位', trip_orders: '参团订单' };
  const metrics = Object.keys(names).map(k =>
    `<div class="metric"><div class="label">${names[k]}</div><div class="num">${d.counts[k]}</div></div>`).join('');
  const maxCount = Math.max(1, ...Object.values(d.counts));
  const bars = Object.keys(names).map(k =>
    `<div class="bar-row"><span class="bar-label">${names[k]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(d.counts[k]/maxCount*100)}%"></div></div><span class="bar-num">${d.counts[k]}</span></div>`).join('');
  const roleText = d.roles.map(r => `${r.role}/${r.status}: ${r.n}`).join('　');
  $('content').innerHTML = `
    <div class="metrics">${metrics}</div>
    <div class="panel"><h3>数据分布</h3>${bars}</div>
    <div class="panel"><h3>会员构成</h3><p class="muted">${roleText || '暂无会员'}</p>
      <p>订单总额：<b>¥${d.revenue.total.toFixed(2)}</b>　已支付 ${d.revenue.paidCount} 单　待支付 ${d.revenue.unpaidCount} 单</p>
      <p class="muted">统计时间：${d.generatedAt}</p></div>`;
}

const TABLE_TITLES = {
  members: '会员管理', carpool_posts: '滑雪搭子', trip_activities: '俱乐部参团',
  coaches: '教练平台', gear_items: '二手交易', trip_orders: '参团订单',
  carpool_signups: '拼车报名', coach_bookings: '课程预约',
};

// 各表列定义（key, 标题, 类型）
const COLUMNS = {
  members: [
    ['id','ID'],['display_name','昵称'],['real_name','姓名'],['phone','手机'],['gender','性别'],
    ['role','角色'],['status','状态'],['snow_level','滑雪水平'],['terms_agreed_at','协议签署'],['created_at','注册时间'],
  ],
  carpool_posts: [['id','ID'],['title','标题'],['kind','类型'],['resort','雪场'],['depart_time','出发'],['seats','座位'],['contact','联系'],['review_status','审核'],['created_at','发布']],
  trip_activities: [['id','ID'],['title','活动'],['resort','雪场'],['depart_time','出发'],['capacity','名额'],['is_official','官方'],['review_status','审核'],['created_at','发布']],
  coaches: [['id','ID'],['name','姓名'],['title','头衔'],['years','教龄'],['price_per_hour','时薪'],['review_status','审核'],['created_at','发布']],
  gear_items: [['id','ID'],['title','装备'],['category','分类'],['price','价格'],['status','状态'],['review_status','审核'],['created_at','发布']],
  trip_orders: [['id','ID'],['trip_id','活动'],['option_name','档位'],['amount','金额'],['participant_name','报名人'],['participant_phone','手机'],['payment_status','支付'],['created_at','报名']],
  carpool_signups: [['id','ID'],['post_id','信息'],['owner_name','报名人'],['seats','人数'],['contact','联系'],['created_at','报名']],
  coach_bookings: [['id','ID'],['coach_id','教练'],['contact_name','预约人'],['contact_phone','手机'],['level','水平'],['status','状态'],['created_at','预约']],
};

async function loadTable(table) {
  CURRENT_VIEW = 'table'; CURRENT_TABLE = table;
  $('viewTitle').textContent = TABLE_TITLES[table] || table;
  const search = $('tableSearch') ? $('tableSearch').value : '';
  const res = await api(`/api/data/${table}?options=${encodeURIComponent(JSON.stringify({ limit: 1000 }))}`);
  if (res.error) return toast(res.error.message);
  TABLE_CACHE = res.data || [];
  renderTable(table, search);
}

function renderTable(table, search = '') {
  const cols = COLUMNS[table] || [];
  let rows = TABLE_CACHE;
  if (search) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  const head = cols.map(c => `<th>${c[1]}</th>`).join('') + '<th>操作</th>';
  const body = rows.map(r => `<tr>${cols.map(c => `<td>${cell(r[c[0]], c[0])}</td>`).join('')}<td>${actions(table, r)}</td></tr>`).join('');
  $('content').innerHTML = `
    <div class="toolbar">
      <input id="tableSearch" placeholder="搜索..." value="${search.replace(/"/g,'&quot;')}">
      <button class="btn" onclick="loadTable('${table}')">刷新</button>
      <span class="muted">共 ${rows.length} 条</span>
    </div>
    <div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length+1}">暂无数据</td></tr>`}</tbody></table></div>`;
  $('tableSearch').addEventListener('input', e => {
    clearTimeout(renderTable._t);
    renderTable._t = setTimeout(() => renderTable(table, e.target.value), 200);
  });
  $('tableSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loadTable(table); });
}

function cell(value, key) {
  if (value === null || value === undefined || value === '') return '<span class="muted">-</span>';
  if (key === 'review_status') {
    const cls = value === 'approved' ? 'green' : value === 'rejected' ? 'red' : 'amber';
    const txt = value === 'approved' ? '通过' : value === 'rejected' ? '驳回' : '待审核';
    return `<span class="tag ${cls}">${txt}</span>`;
  }
  if (key === 'payment_status') return `<span class="tag ${value==='paid'?'green':'amber'}">${value==='paid'?'已付':'未付'}</span>`;
  if (key === 'status') {
    const cls = ['active','open','approved','on_sale','paid'].includes(value) ? 'green' : ['draft','pending'].includes(value) ? 'amber' : 'gray';
    return `<span class="tag ${cls}">${value}</span>`;
  }
  if (key === 'role') return `<span class="tag blue">${roleText(value)}</span>`;
  if (key === 'is_official') return value ? '<span class="tag blue">官方</span>' : '-';
  if (key === 'terms_agreed_at') return '<span class="tag green">已签署</span>';
  const s = String(value);
  return s.length > 22 ? s.slice(0, 22) + '…' : s;
}

function roleText(role) { return ({ super_admin: '高级管理员', admin: '管理员', coach: '教练', member: '会员' })[role] || role; }

function actions(table, row) {
  if (table === 'members') {
    if (row.role === 'super_admin') return '<span class="muted">最高权限</span>';
    let html = '';
    if (row.status === 'pending' || row.status === 'draft') {
      html += `<button class="btn sm" onclick="reviewMember(${row.id},'active')">通过</button> `;
      html += `<button class="btn sm" onclick="reviewMember(${row.id},'rejected')">驳回</button> `;
    }
    html += `<select class="btn sm" onchange="setRole(${row.id},this.value)" style="max-width:96px">
      <option value="">改角色</option>
      <option value="member" ${row.role==='member'?'selected':''}>会员</option>
      <option value="coach" ${row.role==='coach'?'selected':''}>教练</option>
      <option value="admin" ${row.role==='admin'?'selected':''}>管理员</option>
    </select> `;
    html += `<button class="btn sm danger" onclick="delMember(${row.id})">删除</button>`;
    return html;
  }
  if (['carpool_posts','coaches','gear_items','trip_activities'].includes(table)) {
    const rev = row.review_status === 'approved'
      ? `<button class="btn sm" onclick="reviewContent('${table}',${row.id},'rejected')">下架</button>`
      : `<button class="btn sm" onclick="reviewContent('${table}',${row.id},'approved')">通过</button>`;
    return `${rev} <button class="btn sm danger" onclick="delRow('${table}',${row.id})">删除</button>`;
  }
  if (table === 'trip_orders') {
    const pay = row.payment_status === 'paid'
      ? `<button class="btn sm" onclick="setPaid(${row.id},false)">撤销收款</button>`
      : `<button class="btn sm" onclick="setPaid(${row.id},true)">确认收款</button>`;
    return `${pay} <button class="btn sm danger" onclick="delRow('${table}',${row.id})">删除</button>`;
  }
  return `<button class="btn sm danger" onclick="delRow('${table}',${row.id})">删除</button>`;
}

async function reviewMember(id, status) {
  const res = await api(`/api/members/review/${id}`, { method: 'POST', body: { status, note: '' } });
  if (res.error) return toast(res.error.message);
  toast('审核已更新'); loadTable('members');
}
async function setRole(id, role) {
  if (!role) return;
  const res = await api(`/api/members/role/${id}`, { method: 'POST', body: { role } });
  if (res.error) { toast(res.error.message); return loadTable('members'); }
  toast('角色已更新'); loadTable('members');
}
async function delMember(id) {
  if (!confirm('确认删除该会员档案？此操作不可恢复。')) return;
  const res = await api(`/api/members/${id}`, { method: 'DELETE' });
  if (res.error) return toast(res.error.message);
  toast('已删除'); loadTable('members');
}
async function reviewContent(table, id, status) {
  const res = await api(`/api/data/${table}/${id}`, { method: 'PUT', body: { review_status: status } });
  if (res.error) return toast(res.error.message);
  toast('审核状态已更新'); loadTable(table);
}
async function delRow(table, id) {
  if (!confirm('确认删除这条记录？此操作不可恢复。')) return;
  const res = await api(`/api/data/${table}/${id}`, { method: 'DELETE' });
  if (res.error) return toast(res.error.message);
  toast('已删除'); loadTable(table);
}
async function setPaid(id, paid) {
  const res = await api(`/api/payment/order/${id}/paid`, { method: 'POST', body: { paid } });
  if (res.error) return toast(res.error.message);
  toast(paid ? '已确认收款' : '已撤销收款'); loadTable('trip_orders');
}

async function renderSettings() {
  const res = await api('/api/payment/settings');
  if (res.error) return toast(res.error.message);
  const d = res.data || {};
  $('content').innerHTML = `
    <div class="panel" style="max-width:640px"><h3>收款配置</h3>
      <div class="field"><label>收款人名称</label><input id="s_payee_name" value="${esc(d.payee_name)}"></div>
      <div class="field"><label>收款账号</label><input id="s_payee_account" value="${esc(d.payee_account)}"></div>
      <div class="field"><label>联系方式</label><input id="s_contact" value="${esc(d.contact)}"></div>
      <div class="field"><label>线下付款说明</label><textarea id="s_offline_note">${esc(d.offline_note)}</textarea></div>
      <div class="field"><label>支付接入说明</label><textarea id="s_gateway_note">${esc(d.gateway_note)}</textarea></div>
      <div class="field"><label><input type="checkbox" id="s_online" ${d.online_enabled?'checked':''} style="width:auto"> 开启线上收款</label></div>
      <button class="btn primary" onclick="saveSettings()">保存配置</button>
    </div>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
async function saveSettings() {
  const body = {
    payee_name: $('s_payee_name').value, payee_account: $('s_payee_account').value,
    contact: $('s_contact').value, offline_note: $('s_offline_note').value,
    gateway_note: $('s_gateway_note').value, online_enabled: $('s_online').checked,
  };
  const res = await api('/api/payment/settings', { method: 'PUT', body });
  if (res.error) return toast(res.error.message);
  toast('配置已保存');
}

function closeModal() { $('modal').classList.add('hidden'); }

// 启动时校验已有 token
if (TOKEN) {
  api('/api/auth/session').then(res => {
    if (res.data) enterApp(); else logout();
  });
}
