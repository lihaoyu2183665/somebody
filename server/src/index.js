const express = require('express');
const path = require('path');
const config = require('./config');
const { attachAccess } = require('./auth');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 所有 /api 请求都先解析登录态与会员档案（替代 RLS 的身份上下文）。
app.use('/api', attachAccess);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/members', require('./routes/members'));
app.use('/api/data', require('./routes/data'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/stats', require('./routes/stats'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 上传的静态图片。
app.use('/uploads', express.static(config.uploadDir));

// 网页管理后台（原生 HTML/CSS/JS）。
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// 统一错误处理。
app.use((err, req, res, next) => {
    console.error('[server error]', err && err.message);
    if (res.headersSent) return next(err);
    res.status(500).json({ data: null, error: { message: (err && err.message) || '服务器错误' } });
});

if (require.main === module) {
    app.listen(config.port, () => {
        console.log(`滑雪俱乐部后端已启动：http://localhost:${config.port}`);
    });
}

module.exports = app;
