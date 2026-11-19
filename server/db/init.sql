-- 滑雪俱乐部自建后端 · MySQL 8 初始化脚本
-- 表结构与云端 PostgreSQL 一一对应，便于数据迁移与前端零改造。
-- 时间统一以 DATETIME(6) 存 UTC，后端序列化为 ISO 字符串。

CREATE DATABASE IF NOT EXISTS ski_club DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ski_club;

-- ---------------------------------------------------------------------------
-- 会员
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  owner_id        VARCHAR(255) NOT NULL,
  owner_name      VARCHAR(255) NULL,
  display_name    VARCHAR(255) NULL,
  phone           VARCHAR(64)  NULL,
  snow_level      VARCHAR(32)  NULL DEFAULT 'beginner',
  role            VARCHAR(32)  NOT NULL DEFAULT 'member',
  status          VARCHAR(32)  NOT NULL DEFAULT 'draft',
  created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  review_note     TEXT         NULL,
  reviewed_at     DATETIME(6)  NULL,
  reviewed_by     VARCHAR(255) NULL,
  avatar          VARCHAR(512) NULL,
  real_name       VARCHAR(128) NULL,
  id_card_no      VARCHAR(64)  NULL,
  gender          VARCHAR(16)  NULL,
  submitted_at    DATETIME(6)  NULL,
  deactivated_at  DATETIME(6)  NULL,
  deactivated_by  VARCHAR(255) NULL,
  deactivation_reason TEXT     NULL,
  terms_agreed_at DATETIME(6)  NULL,
  -- 部分唯一索引的 MySQL 实现：仅 super_admin 行产生非 NULL 值，其余为 NULL（可重复）。
  super_admin_key TINYINT(1)   GENERATED ALWAYS AS (CASE WHEN role = 'super_admin' THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_members_owner (owner_id),
  UNIQUE KEY uk_one_super_admin (super_admin_key),
  KEY idx_members_status (status),
  KEY idx_members_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 滑雪搭子：拼车 / 拼搭子
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carpool_posts (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  owner_id      VARCHAR(255) NOT NULL,
  owner_name    VARCHAR(255) NULL,
  kind          VARCHAR(32)  NOT NULL DEFAULT 'carpool',
  title         VARCHAR(255) NOT NULL,
  resort        VARCHAR(255) NULL,
  depart_time   VARCHAR(64)  NOT NULL,
  return_time   VARCHAR(64)  NOT NULL,
  depart_place  VARCHAR(255) NOT NULL,
  return_place  VARCHAR(255) NULL,
  transport     VARCHAR(128) NOT NULL,
  seats         INT          NOT NULL DEFAULT 1,
  fee_rule      TEXT         NULL,
  itinerary     TEXT         NULL,
  contact       VARCHAR(255) NULL,
  status        VARCHAR(32)  NOT NULL DEFAULT 'open',
  created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  review_status VARCHAR(32)  NOT NULL DEFAULT 'pending',
  review_note   TEXT         NULL,
  reviewed_at   DATETIME(6)  NULL,
  reviewed_by   VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_carpool_post_owner (owner_id),
  KEY idx_carpool_post_review (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carpool_signups (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  owner_id   VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NULL,
  post_id    BIGINT      NOT NULL,
  seats      INT         NOT NULL DEFAULT 1,
  note       TEXT        NULL,
  contact    VARCHAR(255) NULL,
  status     VARCHAR(32) NOT NULL DEFAULT 'joined',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_carpool_signup_post (post_id),
  KEY idx_carpool_signup_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 安全视图：普通正式会员只能看到报名人的姓名 / 电话 / 性别三要素，
-- 且排除高级管理员（role <> 'super_admin'）。替代云端 PostgreSQL 同名视图。
CREATE OR REPLACE VIEW carpool_signup_contacts AS
SELECT
  s.id            AS id,
  s.post_id       AS post_id,
  s.owner_id      AS owner_id,
  s.seats         AS seats,
  s.contact       AS contact,
  s.status        AS status,
  s.created_at    AS created_at,
  CASE WHEN m.role = 'super_admin' THEN NULL ELSE m.real_name END     AS person_name,
  CASE WHEN m.role = 'super_admin' THEN NULL ELSE m.phone END         AS person_phone,
  CASE WHEN m.role = 'super_admin' THEN NULL WHEN m.gender = 'male' THEN '男'
       WHEN m.gender = 'female' THEN '女' ELSE NULL END                AS person_gender
FROM carpool_signups s
LEFT JOIN members m ON m.owner_id = s.owner_id
WHERE m.role IS NULL OR m.role <> 'super_admin';

-- ---------------------------------------------------------------------------
-- 教练平台
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coaches (
  id             BIGINT      NOT NULL AUTO_INCREMENT,
  owner_id       VARCHAR(255) NOT NULL,
  owner_name     VARCHAR(255) NULL,
  name           VARCHAR(128) NOT NULL,
  avatar         VARCHAR(512) NULL,
  title          VARCHAR(255) NULL,
  certificates   TEXT         NULL,
  years          INT          NOT NULL DEFAULT 0,
  resort         VARCHAR(255) NULL,
  specialties    TEXT         NULL,
  price_per_hour DECIMAL(12,2) NOT NULL DEFAULT 0,
  bio            TEXT         NULL,
  contact        VARCHAR(255) NULL,
  status         VARCHAR(32)  NOT NULL DEFAULT 'active',
  created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  review_status  VARCHAR(32)  NOT NULL DEFAULT 'pending',
  review_note    TEXT         NULL,
  reviewed_at    DATETIME(6)  NULL,
  reviewed_by    VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_coach_owner (owner_id),
  KEY idx_coach_review (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coach_slots (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  owner_id      VARCHAR(255) NOT NULL,
  coach_id      BIGINT      NOT NULL,
  date          VARCHAR(32) NOT NULL,
  start_time    VARCHAR(32) NOT NULL,
  end_time      VARCHAR(32) NOT NULL,
  resort        VARCHAR(255) NULL,
  capacity      INT         NOT NULL DEFAULT 1,
  status        VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  review_note   TEXT        NULL,
  reviewed_at   DATETIME(6) NULL,
  reviewed_by   VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_slot_coach (coach_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coach_bookings (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  owner_id      VARCHAR(255) NOT NULL,
  owner_name    VARCHAR(255) NULL,
  coach_id      BIGINT      NOT NULL,
  slot_id       BIGINT      NULL,
  slot_text     VARCHAR(255) NULL,
  contact_name  VARCHAR(128) NULL,
  contact_phone VARCHAR(64)  NULL,
  level         VARCHAR(64)  NULL,
  note          TEXT         NULL,
  status        VARCHAR(32)  NOT NULL DEFAULT 'booked',
  created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_booking_coach (coach_id),
  KEY idx_booking_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 二手交易
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gear_items (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  owner_id       VARCHAR(255) NOT NULL,
  owner_name     VARCHAR(255) NULL,
  title          VARCHAR(255) NOT NULL,
  category       VARCHAR(128) NOT NULL,
  condition_type VARCHAR(32)  NOT NULL DEFAULT 'used',
  price          DECIMAL(12,2) NOT NULL DEFAULT 0,
  original_price DECIMAL(12,2) NULL,
  description    TEXT         NULL,
  images         TEXT         NOT NULL DEFAULT '[]',
  trade_place    VARCHAR(255) NULL,
  contact        VARCHAR(255) NULL,
  status         VARCHAR(32)  NOT NULL DEFAULT 'on_sale',
  created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  review_status  VARCHAR(32)  NOT NULL DEFAULT 'pending',
  review_note    TEXT         NULL,
  reviewed_at    DATETIME(6)  NULL,
  reviewed_by    VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_gear_owner (owner_id),
  KEY idx_gear_review (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 俱乐部参团
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_activities (
  id             BIGINT      NOT NULL AUTO_INCREMENT,
  owner_id       VARCHAR(255) NOT NULL,
  owner_name     VARCHAR(255) NULL,
  title          VARCHAR(255) NOT NULL,
  resort         VARCHAR(255) NULL,
  depart_time    VARCHAR(64) NOT NULL,
  return_time    VARCHAR(64) NOT NULL,
  depart_place   VARCHAR(255) NOT NULL,
  gather_place   VARCHAR(255) NOT NULL,
  transport      VARCHAR(128) NOT NULL,
  fee_note       TEXT        NULL,
  itinerary      TEXT        NULL,
  capacity       INT         NOT NULL DEFAULT 20,
  deadline       VARCHAR(64) NULL,
  is_official    TINYINT(1)  NOT NULL DEFAULT 0,
  status         VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  review_status  VARCHAR(32) NOT NULL DEFAULT 'pending',
  review_note    TEXT        NULL,
  reviewed_at    DATETIME(6) NULL,
  reviewed_by    VARCHAR(255) NULL,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'offline',
  payment_note   TEXT        NULL,
  PRIMARY KEY (id),
  KEY idx_trip_review (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trip_price_options (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  trip_id    BIGINT      NOT NULL,
  name       VARCHAR(128) NOT NULL,
  price      DECIMAL(12,2) NOT NULL DEFAULT 0,
  note       TEXT        NULL,
  capacity   INT         NOT NULL DEFAULT 0,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_option_trip (trip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trip_orders (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  owner_id            VARCHAR(255) NOT NULL,
  owner_name          VARCHAR(255) NULL,
  trip_id             BIGINT       NOT NULL,
  option_id           BIGINT       NULL,
  option_name         VARCHAR(128) NULL,
  unit_price          DECIMAL(12,2) NULL,
  quantity            INT          NOT NULL DEFAULT 1,
  amount              DECIMAL(12,2) NULL,
  contact_name        VARCHAR(128) NULL,
  contact_phone       VARCHAR(64)  NULL,
  note                TEXT         NULL,
  status              VARCHAR(32)  NOT NULL DEFAULT 'pending',
  created_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  payment_method      VARCHAR(32)  NOT NULL DEFAULT 'offline',
  payment_status      VARCHAR(32)  NOT NULL DEFAULT 'unpaid',
  out_trade_no        VARCHAR(128) NULL,
  payment_note        TEXT         NULL,
  paid_at             DATETIME(6)  NULL,
  paid_by             VARCHAR(255) NULL,
  participant_name    VARCHAR(128) NULL,
  participant_id_card VARCHAR(64)  NULL,
  participant_phone   VARCHAR(64)  NULL,
  participant_gender  VARCHAR(16)  NULL,
  PRIMARY KEY (id),
  KEY idx_order_trip (trip_id),
  KEY idx_order_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS club_payment_settings (
  id            INT          NOT NULL DEFAULT 1,
  payee_name    VARCHAR(128) NULL,
  payee_account VARCHAR(255) NULL,
  contact       VARCHAR(255) NULL,
  offline_note  TEXT         NULL,
  gateway_note  TEXT         NULL,
  online_enabled TINYINT(1)  NOT NULL DEFAULT 0,
  updated_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_by    VARCHAR(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
