# 滑雪俱乐部自建后端

替代原 WorkBuddy Cloud 的 Node.js 后端：**Express + MySQL 8 + JWT**，附带原生网页维护后台，Docker Compose 一键部署。

## 目录

```
server/
  src/                 后端源码
    index.js           入口与路由装配
    config.js          配置（读环境变量）
    db.js              MySQL 连接池 + 行规整
    auth.js            JWT / 微信登录 / 权限上下文
    policy.js          数据访问策略（替代云端 RLS）
    routes/            auth / members / data / payment / storage / stats
  db/init.sql          建表 + 安全视图 + 超管唯一约束
  data/cloud-export.json  云端数据快照（迁移源，已加入 .gitignore）
  scripts/migrate.js   数据迁移脚本
  scripts/selftest.js  自检脚本
  public/              网页维护后台（原生 HTML/CSS/JS）
  nginx/nginx.conf     反向代理配置
  Dockerfile / docker-compose.yml
```

## 启动（Docker Compose，推荐）

1. 复制环境变量模板并按需修改密码与域名：
   ```bash
   cp .env.example .env
   ```
   重点修改：`JWT_SECRET`、`ADMIN_PASSWORD`、`DB_PASSWORD`、`DB_ROOT_PASSWORD`、`PUBLIC_BASE_URL`、`WX_APPID` / `WX_SECRET`。

2. 启动：
   ```bash
   docker compose up -d
   ```
   MySQL 首次启动会自动执行 `db/init.sql` 建表。

3. 导入云端数据（在宿主机执行一次；容器已启动后）：
   ```bash
   npm install
   DB_HOST=127.0.0.1 DB_PORT=3306 npm run migrate
   ```
   > 端口映射：若要从宿主机连容器 MySQL，需在 compose 的 db 服务加 `ports: ["3306:3306"]`，或改用 `docker compose exec db mysql ...` 在容器内执行迁移。

4. 访问：
   - 维护后台：`http://服务器域名/admin`（默认账号 `admin` / `skiclub2026`）
   - 健康检查：`http://服务器域名/api/health`
   - 小程序：`utils/cloud.js` 里的 `BASE_URL` 改为 `http://服务器域名`

## 本地开发（无 Docker）

```bash
npm install
# 准备一个 MySQL 8 数据库，导入 db/init.sql
cp .env.example .env   # 修改 DB_* 与 JWT_SECRET
npm run migrate        # 导入云端数据
npm start              # 监听 3001
```

## 微信登录说明

- 配置 `WX_APPID` + `WX_SECRET` 后，走微信官方 `code2session`，openid 规范为 `wx:<openid>`。
- 未配置时进入**兼容模式**：`code` 以 `wx:` 开头则原样作为 openid（迁移后的老用户凭此恢复身份）；否则用 code 的稳定哈希生成 `wx:dev_xxx`（本地联调用）。
- 迁移数据里的 `owner_id` 均为 `wx:xxx` 格式，与上述规则一致，老用户身份不会丢。

## 权限模型（替代数据库 RLS）

| 规则 | 实现位置 |
| --- | --- |
| 高级管理员唯一且对其他用户隐身 | `policy.js` + `members.super_admin_key` 唯一索引 |
| 未审核内容不对外展示 | `policy.js` 的 `readFilter` |
| 报名人三要素视图 | `init.sql` 的 `carpool_signup_contacts` |
| 订单仅本人 / 管理员可读 | `policy.js` |
| owner_id 服务端注入，前端不可伪造 | `routes/data.js` |
| 末位管理员不可删 / 不可自删 | `routes/members.js` |
| 管理员审核 / 提权 / 收款确认 | `routes/members.js` / `routes/payment.js` |

## 自检

```bash
npm test    # 79 项结构与策略断言，无需真实 MySQL
```

## 安全提示

- 生产环境务必替换所有默认密码与 `JWT_SECRET`。
- `data/cloud-export.json` 含真实个人敏感信息，已加入 `.gitignore`，**切勿提交或外传**。
- 建议用 Nginx + Let's Encrypt 配置 HTTPS（小程序要求 HTTPS），本仓库的 nginx 配置预留了 443 端口与 certbot 目录。
