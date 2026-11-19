const path = require('path');

module.exports = {
    port: Number(process.env.PORT || 3001),
    jwtSecret: process.env.JWT_SECRET || 'ski-club-dev-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'ski',
        password: process.env.DB_PASSWORD || 'ski_secret_change_me',
        database: process.env.DB_NAME || 'ski_club',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4',
    },
    // 公开基础地址：用于生成图片访问 URL。小程序与网页在同一域下由 Nginx 反代。
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
};
