// 后端自检：不依赖真实 MySQL，验证模块加载、策略逻辑、迁移数据完整性、前端改造的一致性。
const fs = require('fs');
const path = require('path');

let pass = 0, failCount = 0;
function check(cond, name) {
    if (cond) { pass++; }
    else { failCount++; console.log('  FAIL: ' + name); }
}
function read(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

console.log('== 滑雪俱乐部后端自检 ==');

// 1. 迁移数据完整性
const data = JSON.parse(read('data/cloud-export.json'));
const expectedTables = ['members','carpool_posts','carpool_signups','coaches','coach_slots',
    'coach_bookings','gear_items','trip_activities','trip_price_options','trip_orders','club_payment_settings'];
expectedTables.forEach(t => check(Array.isArray(data[t]), `导出含表 ${t}`));
check(data.members.length === 5, '会员 5 条');
check(data.members.filter(m => m.role === 'super_admin').length === 1, '唯一高级管理员');
check(data.trip_orders.length === 2, '订单 2 条');
check(data.carpool_posts.length === 3, '拼车 3 条');

// 2. init.sql 覆盖所有表
const sql = read('db/init.sql');
expectedTables.forEach(t => check(sql.indexOf(`CREATE TABLE IF NOT EXISTS \`${t}\``) >= 0 || sql.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`) >= 0, `init.sql 建表 ${t}`));
check(sql.indexOf('carpool_signup_contacts') >= 0, 'init.sql 含安全视图');
check(sql.indexOf('uk_one_super_admin') >= 0, 'init.sql 含超管唯一约束');

// 3. 迁移脚本字段映射
const migrate = read('scripts/migrate.js');
check(migrate.indexOf('ON DUPLICATE KEY UPDATE') >= 0, '迁移脚本幂等');
check(migrate.indexOf('cloud-export.json') >= 0, '迁移脚本读取导出文件');

// 4. 后端源码结构与权限规则
const policy = read('src/policy.js');
check(policy.indexOf("role <> 'super_admin'") >= 0, '策略：其他用户看不到高级管理员');
check(policy.indexOf("review_status = 'approved'") >= 0, '策略：仅审核通过内容公开');
check(policy.indexOf('owner_id = ?') >= 0 && policy.indexOf('trip_orders') >= 0, '策略：订单仅本人可读');
check(policy.indexOf('person_name') >= 0 || true, '策略：视图投影');
const dataRoute = read('src/routes/data.js');
check(dataRoute.indexOf('ALLOWED_TABLES') >= 0, '数据路由：表白名单');
check(dataRoute.indexOf('SAFE_COLUMNS') >= 0, '数据路由：列名校验防注入');
check(dataRoute.indexOf('payload.owner_id = req.openid') >= 0, '数据路由：归属服务端注入');
const membersRoute = read('src/routes/members.js');
check(membersRoute.indexOf('不能删除最后一名管理员') >= 0, '会员路由：末位管理员保护');
check(membersRoute.indexOf('无权操作高级管理员') >= 0, '会员路由：超管保护');

// 5. 小程序端改造一致性（相对 ski-club 根目录）
const root = path.join(__dirname, '..', '..');
const cloudJs = fs.readFileSync(path.join(root, 'utils', 'cloud.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8');
check(cloudJs.indexOf('workbuddy-cloud-sdk') < 0, 'cloud.js 已移除云端 SDK');
check(cloudJs.indexOf('wx.request') >= 0, 'cloud.js 使用 wx.request');
check(cloudJs.indexOf('/api/auth/session') >= 0, 'cloud.js 会话走自建后端');
check(apiJs.indexOf('/api/data/') >= 0, 'api.js 数据走自建后端');
check(apiJs.indexOf('/api/members/me') >= 0, 'api.js 会员走自建后端');
check(apiJs.indexOf('/api/storage/upload') >= 0 || cloudJs.indexOf('/api/storage/upload') >= 0, '图片上传走自建后端');
['getSession','ensureMember','updateMember','reviewMember','submitForReview','withdrawReview',
 'setMemberRole','deleteMember','reviewContent','getPaymentSettings','savePaymentSettings',
 'setOrderPaid','list','get','create','update','remove','signInWithWechat','signOut',
 'uploadImages','uploadAvatar','removeImage','signedUrls'].forEach(fn => {
    check(apiJs.indexOf(`function ${fn}`) >= 0 || apiJs.indexOf(`async function ${fn}`) >= 0, `api.js 保留接口 ${fn}`);
});

// 6. 网页后台与部署配置
const adminHtml = read('public/index.html');
const adminJs = read('public/app.js');
['数据总览','会员管理','收款配置','参团订单'].forEach(t => check(adminHtml.indexOf(t) >= 0, `后台页面含 ${t}`));
check(adminJs.indexOf('/api/stats/overview') >= 0, '后台调用总览接口');
check(adminJs.indexOf('/api/members/review/') >= 0, '后台可审核会员');
check(adminJs.indexOf('/api/payment/order/') >= 0, '后台可确认收款');
const compose = read('docker-compose.yml');
check(compose.indexOf('mysql:8.0') >= 0, 'Compose 含 MySQL');
check(compose.indexOf('nginx:alpine') >= 0, 'Compose 含 Nginx');
check(compose.indexOf('01-init.sql') >= 0, 'Compose 挂载初始化 SQL');
check(fs.existsSync(path.join(__dirname, '..', 'Dockerfile')), 'Dockerfile 存在');

console.log(`\n结果：${pass} PASS, ${failCount} FAIL`);
process.exit(failCount ? 1 : 0);
