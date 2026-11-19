const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireLogin } = require('../auth');

const router = express.Router();
const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
        cb(null, `${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: config.maxUploadBytes },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        cb(null, allowed.includes(file.mimetype));
    },
});

function publicUrl(filename) {
    const base = config.publicBaseUrl.replace(/\/$/, '');
    return `${base}/uploads/${filename}`;
}

// 图片上传：返回可持久保存的路径（文件名）。
router.post('/upload', requireLogin, upload.single('file'), (req, res) => {
    if (!req.file) return res.json(fail('图片上传失败或类型不支持'));
    return res.json(ok(req.file.filename));
});

// 批量签名地址：兼容云端 signedUrls(paths) 的调用方式。
router.post('/signed-urls', (req, res) => {
    const paths = (req.body || {}).paths || [];
    const urls = paths.map(p => {
        if (!p) return '';
        if (p.startsWith('preset:') || /^https?:\/\//i.test(p)) return p;
        return publicUrl(path.basename(p));
    });
    return res.json(ok(urls));
});

// 删除图片对象。
router.delete('/remove', requireLogin, (req, res) => {
    const p = (req.body || {}).path || '';
    if (!p || p.startsWith('preset:') || /^https?:\/\//i.test(p)) return res.json(ok(true));
    const target = path.join(config.uploadDir, path.basename(p));
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return res.json(ok(true));
});

module.exports = router;
