# TaprootAgro Supabase 后端部署教程

> 最后更新: 2026-03-17  
> 适用于: TaprootAgro PWA v1.x  
> 前置条件: Node.js 18+, Git, Supabase CLI (`npm i -g supabase`)

---

## 目录

- [架构总览](#架构总览)
- [方案一: Supabase 官方云 (推荐)](#方案一-supabase-官方云-推荐)
- [方案二: 腾讯云部署](#方案二-腾讯云部署)
- [方案三: Google Cloud 部署](#方案三-google-cloud-部署)
- [附录A: Edge Function 端点清单](#附录a-edge-function-端点清单)
- [附录B: 数据库表结构](#附录b-数据库表结构)
- [附录C: Secrets 密钥速查表](#附录c-secrets-密钥速查表)
- [附录D: PWA 前端配置对接](#附录d-pwa-前端配置对接)
- [附录E: 常见问题排查](#附录e-常见问题排查)

---

## 架构总览

```
PWA 前端 (React)
    |
    |  HTTPS (anonKey in headers)
    v
Supabase Edge Functions (Deno)        <-- 本教程部署目标
    |-- /server/*          统一后端 (认证、配置同步、用户档案)
    |-- /chat-token/*      IM Token 生成 (腾讯IM / CometChat)
    |-- /ai-vision-proxy   AI 视觉分析代理 (通义千问 / Gemini / OpenAI)
    |-- /jpush-proxy       极光推送代理 (可选)
    |-- /getui-proxy       个推代理 (可选)
    |
    v
PostgreSQL (Supabase 托管)
    |-- app_config          远程配置表 (单行 JSONB)
    |-- config_history      配置版本历史 (回滚用)
    |-- user_profiles       用户档案表
```

### 前端调用模式

```
所有请求 = {supabaseUrl}/functions/v1/{functionName}/{path}

Headers:
  apikey: {supabaseAnonKey}           // Supabase 网关路由 (公开)
  Authorization: Bearer {JWT或anonKey} // 用户身份 / 匿名
  Content-Type: application/json
```

### 安全模型

- **前端只持有 `anonKey`** (公开密钥, 可安全放前端)
- **所有表启用 RLS**, 策略锁定为 `service_role only`
- **Edge Function 内部使用 `SUPABASE_SERVICE_ROLE_KEY`** 操作数据库
- **IM/AI/推送的 Secret Key 全部存 Edge Function Secrets**, 前端绝不接触

---

## 方案一: Supabase 官方云 (推荐)

> 最简单、最快、免费额度足够开发测试  
> 官网: https://supabase.com  
> 免费额度: 2个项目, 500MB数据库, 50K月Edge Function调用

### 第1步: 创建项目

1. 访问 https://supabase.com/dashboard 登录 (GitHub / 邮箱)
2. 点击 **New Project**
3. 填写:
   - **Name**: `taprootagro-prod` (或你的白标名)
   - **Database Password**: 记住此密码 (后续不再显示)
   - **Region**: 选择离目标用户最近的区域
     - 东南亚用户 → `Singapore`
     - 非洲用户 → `Frankfurt` 或 `Mumbai`
     - 南美用户 → `Sao Paulo`
4. 点击 **Create new project**, 等待 ~2分钟初始化

### 第2步: 创建数据库表

1. 进入 Dashboard → **SQL Editor**
2. 点击 **New query**
3. 复制粘贴 `/supabase/migrations/001_init.sql` 的全部内容:

```sql
-- ============================================================================
-- TaprootAgro PWA — Database Schema (v1)
-- ============================================================================

-- 1. app_config — 远程配置存储
CREATE TABLE IF NOT EXISTS app_config (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  config      JSONB NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_service_role_only"
  ON app_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO app_config (id, config, version)
VALUES ('main', '{}', 1)
ON CONFLICT (id) DO NOTHING;

-- 2. config_history — 配置版本历史
CREATE TABLE IF NOT EXISTS config_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config      JSONB NOT NULL,
  version     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  note        TEXT
);

ALTER TABLE config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_history_service_role_only"
  ON config_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. user_profiles — 用户档案
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_service_role_only"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
  ON user_profiles (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_history_version
  ON config_history (version DESC);

CREATE INDEX IF NOT EXISTS idx_config_history_created
  ON config_history (created_at DESC);
```

4. 点击 **Run** 执行
5. 看到 "Success. No rows returned" 即表示成功

### 第3步: 部署 Edge Functions

在本地 PWA 源码仓库根目录执行:

```bash
# 1. 登录 Supabase CLI
supabase login

# 2. 关联远程项目 (从 Dashboard > Settings > General 获取 Reference ID)
supabase link --project-ref YOUR_PROJECT_REF

# 3. 部署统一后端函数
supabase functions deploy server --no-verify-jwt

# 4. 部署 IM Token 函数 (如果使用聊天功能)
supabase functions deploy chat-token --no-verify-jwt

# 5. 部署 AI 视觉代理函数 (如果使用 AI 分析功能)
supabase functions deploy ai-vision-proxy --no-verify-jwt
```

> `--no-verify-jwt` 表示函数自己处理认证逻辑, 不依赖 Supabase 网关的 JWT 校验。

### 第4步: 设置 Secrets (密钥)

> **什么是 Secrets?** 就是存在服务器上的密码, 前端看不到、用户看不到, 只有 Edge Function 代码能读取。

**方法A: 在网页上设置 (推荐新手)**

1. 打开 Supabase Dashboard
2. 左侧菜单点 **Edge Functions**
3. 点击任意一个函数名 (如 `server`)
4. 点 **Manage Secrets** 按钮
5. 逐个添加下面需要的密钥

**方法B: 用命令行设置**

```bash
supabase secrets set 密钥名=密钥值
```

---

#### 4.1 自动注入的密钥 (不用管)

以下 3 个由 Supabase 自动设置, **你不需要手动添加**:

| 密钥名 | 说明 |
|--------|------|
| `SUPABASE_URL` | 你的项目 URL |
| `SUPABASE_ANON_KEY` | 公开 Key |
| `SUPABASE_SERVICE_ROLE_KEY` | 管理员 Key |

#### 4.2 聊天功能密钥 — chat-token 函数需要

> 只需设置你选择的那一家, 不需要两家都设。

**如果选择腾讯云 IM:**

| 密钥名 | 在哪里获取 | 示例 |
|--------|-----------|------|
| `TENCENT_IM_APP_ID` | [腾讯云 IM 控制台](https://console.cloud.tencent.com/im) → 应用列表 → SDKAppID | `1400123456` |
| `TENCENT_IM_SECRET_KEY` | 同上页面 → 点应用名 → 基本信息 → 密钥 | `a1b2c3d4e5f6...` |

```bash
# 命令行设置示例
supabase secrets set TENCENT_IM_APP_ID=1400123456
supabase secrets set TENCENT_IM_SECRET_KEY=a1b2c3d4e5f6...
```

**如果选择 CometChat:**

| 密钥名 | 在哪里获取 | 示例 |
|--------|-----------|------|
| `COMETCHAT_APP_ID` | [CometChat Dashboard](https://app.cometchat.com) → 你的应用 → Credentials | `12345abcde` |
| `COMETCHAT_AUTH_KEY` | 同上页面 → Auth Key (REST API Key) | `abcdef1234567890...` |
| `COMETCHAT_REGION` | 同上页面 → 创建应用时选的区域 | `us` 或 `eu` 或 `in` |

```bash
supabase secrets set COMETCHAT_APP_ID=12345abcde
supabase secrets set COMETCHAT_AUTH_KEY=abcdef1234567890...
supabase secrets set COMETCHAT_REGION=us
```

#### 4.3 AI 视觉分析密钥 — ai-vision-proxy 函数需要

> 三选一即可。推荐通义千问 (国内用户) 或 Gemini (海外用户, 有免费额度)。

| 密钥名 | 说�� | 必填? |
|--------|------|-------|
| `AI_PROVIDER` | 选择 AI 提供商: `qwen` 或 `gemini` 或 `openai` | **必填** |
| `AI_API_KEY` | 所选提供商的 API Key | **必填** |
| `AI_BASE_URL` | 自定义 API 地址 (用自建代理时才填) | 选填 |
| `AI_MODEL_ID` | 自定义模型 ID (不填则用默认) | 选填 |

**提供商对照表 — 去哪里申请 Key:**

| `AI_PROVIDER` 值 | 提供商 | 申请地址 | 默认模型 | 免费额度 |
|------------------|--------|---------|---------|---------|
| `qwen` | 通义千问 | [DashScope 控制台](https://dashscope.console.aliyun.com/) | `qwen-vl-plus` | 有免费调用额度 |
| `gemini` | Google Gemini | [Google AI Studio](https://aistudio.google.com/apikey) | `gemini-2.0-flash` | 免费层每分钟 15 次 |
| `openai` | OpenAI | [OpenAI Platform](https://platform.openai.com/api-keys) | `gpt-4o` | 无免费层, 按量付费 |

```bash
# 示例: 使用通义千问
supabase secrets set AI_PROVIDER=qwen
supabase secrets set AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 示例: 使用 Gemini
supabase secrets set AI_PROVIDER=gemini
supabase secrets set AI_API_KEY=AIzaSy...

# 示例: 使用 OpenAI
supabase secrets set AI_PROVIDER=openai
supabase secrets set AI_API_KEY=sk-proj-...
```

#### 4.4 推送通知密钥 (可选, 暂未实现)

```bash
# 极光推送
supabase secrets set JPUSH_APP_KEY=xxx JPUSH_MASTER_SECRET=xxx
# 个推
supabase secrets set GETUI_APP_ID=xxx GETUI_APP_KEY=xxx GETUI_MASTER_SECRET=xxx
```

### 第5步: 获取前端配置凭据

进入 Dashboard → **Settings** → **API**:

| 字段 | 位置 | 示例 |
|------|------|------|
| **Project URL** | `URL` 区块 | `https://abcdefgh.supabase.co` |
| **Anon Key** | `anon` `public` | `eyJhbGciOiJIUzI1NiIs...` |

> **Service Role Key 不要放前端!** 它只在 Edge Function 内部自动注入使用。

### 第6步: 配置 PWA 前端

**方式A: ConfigManager UI (推荐)**

打开 PWA → 设置 → 后端配置:
1. 填入 **Supabase URL** 和 **Anon Key**
2. 开启 **启用后端代理**
3. 选择 IM 服务商, 填入对应 App ID
4. 点击 **测试连接** 验证
5. 保存

**方式B: 环境变量 (.env)**

```bash
# .env (开发环境)
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

**方式C: 配置文件 (白标部署)**

编辑 `/taprootagrosetting/backend.json`:
```json
{
  "backendProxyConfig": {
    "supabaseUrl": "https://abcdefgh.supabase.co",
    "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIs...",
    "edgeFunctionName": "server",
    "enabled": true,
    "chatProvider": "tencent-im",
    "imMode": "im-provider-direct",
    "tencentAppId": "你的SDKAppID",
    "cometchatAppId": "",
    "cometchatRegion": "us"
  }
}
```

### 第7步: 验证部署

```bash
# 测试 health 端点
curl -i https://abcdefgh.supabase.co/functions/v1/server/health \
  -H "apikey: 你的anon_key"

# 预期返回: 200 OK + {"status":"ok"}

# 测试 config 端点
curl -i https://abcdefgh.supabase.co/functions/v1/server/config \
  -H "apikey: 你的anon_key" \
  -H "Authorization: Bearer 你的anon_key"

# 预期返回: 200 OK + {"config":{}, "version":1, ...}
```

---

## 方案二: 腾讯云部署

> 适用于: 中国大陆用户、需要 ICP 备案、要求国内低延迟  
> 两种子方案: A) 腾讯云 Supabase 托管  B) 腾讯云 SCF + CDB 自建

### 方案2A: 腾讯云 CloudBase + Supabase 架构

> 腾讯云暂未提供 Supabase 原生托管, 但可以用 **CloudBase 云函数** 替代 Edge Functions,
> **TDSQL-C (PostgreSQL 兼容)** 替代 Supabase PostgreSQL。

#### 架构映射

| Supabase 组件 | 腾讯云替代 | 说明 |
|---------------|-----------|------|
| Edge Functions | CloudBase 云函数 / SCF | Deno → Node.js 18 |
| PostgreSQL | TDSQL-C PostgreSQL | 完全兼容 |
| Auth | 自建 JWT / 腾讯云身份认证 | 需要改造 |
| Dashboard | 腾讯云控制台 | — |

#### 第1步: 创建腾讯云资源

```bash
# 安装腾讯云 CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 创建环境
tcb env:create --alias taprootagro-prod
```

#### 第2步: 创建数据库

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com)
2. 搜索 **TDSQL-C PostgreSQL** → 创建实例
   - **计费模式**: Serverless (按量计费, 自动暂停)
   - **地域**: 与云函数同地域 (如 `ap-guangzhou`)
   - **版本**: PostgreSQL 14+
3. 创建完成后获取连接信息:
   - 内网地址: `10.0.x.x:5432`
   - 用户名: `root`
   - 密码: 你设置的密码
4. 连接数据库, 执行 `001_init.sql` 建表脚本 (同方案一第2步)

#### 第3步: 改造 Edge Function → SCF 云函数

Edge Function 是 Deno 运行时, 腾讯云 SCF 使用 Node.js。核心改造点:

```javascript
// ---- 原 Supabase Edge Function (Deno) ----
import { createClient } from 'jsr:@supabase/supabase-js@2';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

// ---- 改造为腾讯云 SCF (Node.js) ----
const { Client } = require('pg');
const client = new Client({
  host: process.env.PG_HOST,       // TDSQL-C 内网地址
  port: 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: { rejectUnauthorized: false }
});

exports.main_handler = async (event, context) => {
  await client.connect();
  const path = event.path;           // /server/health, /server/config, etc.
  const method = event.httpMethod;
  const body = JSON.parse(event.body || '{}');

  // ... 路由逻辑与原 Edge Function 一致 ...

  await client.end();
  return { statusCode: 200, body: JSON.stringify(result) };
};
```

#### 第4步: 配置 API 网关

1. 腾讯云控制台 → **API 网关** → 创建服务
2. 创建 API:
   - 路径: `/functions/v1/server/{path+}`
   - 后端: 对接到 SCF 云函数
   - 认证: 免认证 (函数内部校验 apikey header)
3. 发布到 **release** 环境
4. 获取访问地址: `https://service-xxx.gz.apigw.tencentcs.com`

#### 第5步: 设置环境变量

SCF 控制台 → 函数管理 → 环境变量:

```
PG_HOST=10.0.x.x
PG_PORT=5432
PG_USER=root
PG_PASSWORD=你的密码
PG_DATABASE=taprootagro
TENCENT_IM_SDKAPPID=你的SDKAppID
TENCENT_IM_SECRET_KEY=你的SecretKey
QWEN_API_KEY=你的通义千问Key
```

#### 第6步: PWA 前端配置

```json
{
  "backendProxyConfig": {
    "supabaseUrl": "https://service-xxx.gz.apigw.tencentcs.com",
    "supabaseAnonKey": "你生成的公开API Key",
    "edgeFunctionName": "server",
    "enabled": true
  }
}
```

> **注意**: 腾讯云方案下 `supabaseUrl` 实际是 API 网关地址, `supabaseAnonKey` 是你自定义的
> API Key (用于网关鉴权), 不是 Supabase 原生的 anon key。前端代码无需修改,
> 因为它只使用 URL + Key 组合来拼接请求。

---

### 方案2B: 腾讯云直接运行 Supabase (Docker Self-Hosted)

> 适用于: 需要完整 Supabase 功能且愿意自运维

#### 第1步: 创建 CVM 服务器

1. 腾讯云控制台 → **云服务器 CVM** → 新建
   - **镜像**: Ubuntu 22.04 LTS
   - **配置**: 2核4G 起步 (生产建议 4核8G)
   - **磁盘**: 50GB SSD
   - **安全组**: 开放 80, 443, 8000 (Supabase API), 54322 (Supabase Studio)

2. SSH 登录服务器

#### 第2步: 安装 Docker + Supabase

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt install -y docker-compose-plugin

# 克隆 Supabase Docker
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# 复制环境配置
cp .env.example .env
```

#### 第3步: 配置 .env

```bash
nano .env
```

必须修改的字段:

```env
# ---- 必改 ----
POSTGRES_PASSWORD=你的超强密码至少32位
JWT_SECRET=你的JWT密钥至少32位随机字符串
ANON_KEY=用JWT_SECRET生成的anon_key
SERVICE_ROLE_KEY=用JWT_SECRET生成的service_role_key
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=你的Dashboard密码

# ---- 生成 JWT Keys 的方法 ----
# 访问 https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
# 或使用命令:
# npx @supabase/generate-keys --jwt-secret "你的JWT_SECRET"

# ---- 域名 (生产环境) ----
SITE_URL=https://你的域名.com
API_EXTERNAL_URL=https://api.你的域名.com
```

#### 第4步: 启动

```bash
docker compose up -d

# 检查状态
docker compose ps

# 所有服务应显示 "running"
```

#### 第5步: 配置 Nginx 反向代理 + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# 创建 Nginx 配置
sudo tee /etc/nginx/sites-available/supabase << 'EOF'
server {
    listen 80;
    server_name api.你的域名.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/supabase /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请 HTTPS 证书
sudo certbot --nginx -d api.你的域名.com
```

#### 第6步: 建表 + 部署函数

```bash
# 连接到自托管 PostgreSQL
psql "postgresql://postgres:你的密码@localhost:5432/postgres"

# 粘贴执行 001_init.sql (内容同方案一第2步)

# 部署 Edge Functions
supabase functions deploy server \
  --project-ref local \
  --no-verify-jwt
```

#### 第7步: PWA 前端配置

```json
{
  "backendProxyConfig": {
    "supabaseUrl": "https://api.你的域名.com",
    "supabaseAnonKey": "你生成的ANON_KEY",
    "enabled": true
  }
}
```

---

## 方案三: Google Cloud 部署

> 适用于: 全球用户、需要 GCP 生态集成、已有 GCP 账号  
> 两种子方案: A) GCP 上自托管 Supabase  B) Cloud Run + Cloud SQL 原生架构

### 方案3A: GCP Cloud Run 自托管 Supabase

> 最小化运维, 利用 Cloud Run 的 Serverless 自动扩缩

#### 第1步: 准备 GCP 项目

```bash
# 安装 gcloud CLI
# https://cloud.google.com/sdk/docs/install

# 登录并创建项目
gcloud auth login
gcloud projects create taprootagro-prod --name="TaprootAgro"
gcloud config set project taprootagro-prod

# 启用必要的 API
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

#### 第2步: 创建 Cloud SQL PostgreSQL

```bash
# 创建实例
gcloud sql instances create taprootagro-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-southeast1 \
  --storage-type=SSD \
  --storage-size=10GB

# 设置 root 密码
gcloud sql users set-password postgres \
  --instance=taprootagro-db \
  --password="你的强密码"

# 创建数据库
gcloud sql databases create taprootagro \
  --instance=taprootagro-db
```

#### 第3步: 执行建表脚本

```bash
# 连接到 Cloud SQL
gcloud sql connect taprootagro-db --user=postgres --database=taprootagro

# 在 psql 中粘贴执行 001_init.sql (内容同方案一第2步)
# 注意: Cloud SQL 没有 auth.users 表, user_profiles 的外键需要调整:
```

**Cloud SQL 版建表脚本调整:**

```sql
-- user_profiles 不引用 auth.users (GCP 没有 Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     TEXT PRIMARY KEY,              -- 改为 TEXT, 不引用 auth.users
  profile     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 不可用 (不是 Supabase PostgreSQL), 改用函数级鉴权
-- 其余表正常创建, 去掉 RLS 相关语句
```

#### 第4步: 创建 Secret Manager 密钥

```bash
# 数据库连接
echo -n "你的强密码" | gcloud secrets create PG_PASSWORD --data-file=-

# IM Secrets
echo -n "你的SDKAppID" | gcloud secrets create TENCENT_IM_SDKAPPID --data-file=-
echo -n "你的SecretKey" | gcloud secrets create TENCENT_IM_SECRET_KEY --data-file=-

# AI Secrets
echo -n "你的Key" | gcloud secrets create QWEN_API_KEY --data-file=-
```

#### 第5步: 改造 Edge Function → Cloud Run 服务

创建 `cloud-run/server/` 目录:

```dockerfile
# cloud-run/server/Dockerfile
FROM node:18-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
```

```javascript
// cloud-run/server/index.js
const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Cloud SQL 连接 (通过 Unix Socket)
const pool = new Pool({
  host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
  user: 'postgres',
  password: process.env.PG_PASSWORD,
  database: 'taprootagro',
});

// API Key 校验中间件
app.use((req, res, next) => {
  const apikey = req.headers['apikey'];
  if (apikey !== process.env.ANON_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
});

// ---- 端点实现 (与 Edge Function 逻辑一致) ----

app.get('/functions/v1/server/health', (req, res) => {
  res.json({ status: 'ok', region: process.env.GOOGLE_CLOUD_REGION });
});

app.get('/functions/v1/server/config', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT config, version, updated_at FROM app_config WHERE id = 'main'"
  );
  if (rows.length === 0) return res.json({ data: null });
  const row = rows[0];
  res.json({ config: row.config, version: row.version, updatedAt: row.updated_at });
});

app.post('/functions/v1/server/config', async (req, res) => {
  const { config, expectedVersion } = req.body;
  // ... 乐观锁逻辑 (同 Edge Function) ...
});

// ... 其他端点 ...

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

#### 第6步: 部署到 Cloud Run

```bash
cd cloud-run/server

# 构建并部署
gcloud run deploy taprootagro-server \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars "ANON_KEY=你生成的公开Key" \
  --set-secrets "PG_PASSWORD=PG_PASSWORD:latest,TENCENT_IM_SECRET_KEY=TENCENT_IM_SECRET_KEY:latest,QWEN_API_KEY=QWEN_API_KEY:latest" \
  --add-cloudsql-instances taprootagro-prod:asia-southeast1:taprootagro-db \
  --set-env-vars "CLOUD_SQL_CONNECTION_NAME=taprootagro-prod:asia-southeast1:taprootagro-db"

# 获取服务 URL
gcloud run services describe taprootagro-server \
  --region asia-southeast1 \
  --format 'value(status.url)'
# 输出: https://taprootagro-server-xxxxx-as.a.run.app
```

#### 第7步: PWA 前端配置

```json
{
  "backendProxyConfig": {
    "supabaseUrl": "https://taprootagro-server-xxxxx-as.a.run.app",
    "supabaseAnonKey": "你生成的公开Key",
    "edgeFunctionName": "server",
    "enabled": true
  }
}
```

---

### 方案3B: GCP 上 Docker 自托管 Supabase (完整版)

> 与方案2B (腾讯云 Docker) 流程基本一致, 区别是服务器在 GCP。

```bash
# 创建 GCE 实例
gcloud compute instances create supabase-host \
  --machine-type=e2-medium \
  --zone=asia-southeast1-b \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --tags=http-server,https-server

# 开放防火墙
gcloud compute firewall-rules create allow-supabase \
  --allow tcp:80,tcp:443,tcp:8000

# SSH 登录后, 安装步骤同方案2B第2~6步
gcloud compute ssh supabase-host --zone=asia-southeast1-b
```

---

## 附录A: Edge Function 端点清单

| 函数名 | 端点 | 方法 | 说明 |
|--------|------|------|------|
| `server` | `/server/health` | GET | 健康检查 |
| `server` | `/server/send-code` | POST | 发送 OTP 验证码 |
| `server` | `/server/auth` | POST | 验证 OTP + 返回 JWT |
| `server` | `/server/oauth-exchange` | POST | OAuth 授权码交换 |
| `server` | `/server/profile` | GET | 获取用户档案 |
| `server` | `/server/profile` | POST | 保存用户档案 |
| `server` | `/server/config` | GET | 读取远程配置 |
| `server` | `/server/config` | POST | 写入远程配置 (乐观锁) |
| `server` | `/server/config/history` | GET | 查询配置历史版本列表 |
| `server` | `/server/config/rollback` | POST | 回滚到指定历史版本 |
| `chat-token` | `/chat-token/health` | GET | 健康检查 (显示支持的 IM 提供商) |
| `chat-token` | `/chat-token/token` | POST | 生成 IM Token (腾讯 UserSig / CometChat authToken) |
| `ai-vision-proxy` | `/ai-vision-proxy/health` | GET | 健康检查 (显示当前 AI 提供商和模型) |
| `ai-vision-proxy` | `/ai-vision-proxy` | POST | AI 分析 (图片分析 / 文字追问 / 语音追问, 自动识别) |

> **chat-token/token POST 请求体**: `{ "uid": "用户ID", "provider": "tencent-im 或 cometchat" }`
>
> **ai-vision-proxy POST 请求体** 三种模式:
> - 图片分析: `{ "image": "base64图片", "detections": [...], "modelId": "可选" }`
> - 文字追问: `{ "followUp": true, "userMessage": "问题", "previousAnalysis": "上文" }`
> - 语音追问: `{ "voiceFollowUp": true, "audio": "base64音频", "previousAnalysis": "上文" }`

## 附录B: 数据库表结构

| 表名 | 主键 | 用途 | RLS |
|------|------|------|-----|
| `app_config` | `id` (TEXT, 固定 'main') | 远程配置 (单行 JSONB) | service_role only |
| `config_history` | `id` (BIGINT, 自增) | 配置版本历史 | service_role only |
| `user_profiles` | `user_id` (UUID → auth.users) | 用户档案 | service_role only |

## 附录C: Secrets 密钥速查表

> 标 "自动" 的不需要手动设置。标 "按需" 的只需设置你用到的那个提供商。

| 密钥名 | 哪个函数用 | 说明 | 必填? |
|--------|-----------|------|-------|
| `SUPABASE_URL` | server | 项目 URL | 自动 |
| `SUPABASE_ANON_KEY` | server | 公开 Key | 自动 |
| `SUPABASE_SERVICE_ROLE_KEY` | server | 管理员 Key (操作数据库) | 自动 |
| `TENCENT_IM_APP_ID` | chat-token | 腾讯 IM SDKAppID (数字) | 按需 |
| `TENCENT_IM_SECRET_KEY` | chat-token | 腾讯 IM 密钥 (生成 UserSig) | 按需 |
| `COMETCHAT_APP_ID` | chat-token | CometChat App ID | 按需 |
| `COMETCHAT_AUTH_KEY` | chat-token | CometChat REST API Key | 按需 |
| `COMETCHAT_REGION` | chat-token | CometChat 区域 (us/eu/in) | 按需 |
| `AI_PROVIDER` | ai-vision-proxy | AI 提供商: `qwen`/`gemini`/`openai` | 按需 |
| `AI_API_KEY` | ai-vision-proxy | 所选 AI 提供商的 API Key | 按需 |
| `AI_BASE_URL` | ai-vision-proxy | 自定义 API 地址 (默认不填) | 选填 |
| `AI_MODEL_ID` | ai-vision-proxy | 自定义模型 ID (默认不填) | 选填 |

## 附录D: PWA 前端配置对接

PWA 前端通过以下字段连接后端:

```typescript
// useHomeConfig.tsx → BackendProxyConfig
interface BackendProxyConfig {
  supabaseUrl: string;       // 后端 URL (Supabase 或兼容网关)
  supabaseAnonKey: string;   // 公开 API Key
  edgeFunctionName: string;  // 默认 "server"
  enabled: boolean;          // 启用开关
  chatProvider: 'tencent-im' | 'cometchat';
  imMode: 'im-provider-direct';
  tencentAppId: string;      // 腾讯 IM SDKAppID (公开)
  cometchatAppId: string;    // CometChat App ID (公开)
  cometchatRegion: string;   // CometChat 区域
}
```

**配置优先级**: ConfigManager UI > localStorage > .env > backend.json

## 附录E: 常见问题排查

### Q1: 测试连接返回 "连接成功但未找到 app_config 表"

执行 001_init.sql 建表脚本, 确认 SQL Editor 返回 "Success"。

### Q2: Edge Function 返回 401

检查请求 headers 是否包含 `apikey: {anon_key}`。Supabase 网关用 `apikey` header 路由请求。

### Q3: 腾讯云/GCP 方案下 "supabaseUrl" 填什么?

填 API 网关地址 / Cloud Run 服务 URL, 只要 URL 路径格式兼容 `/functions/v1/{functionName}/{path}` 即可。前端代码不区分真 Supabase 还是兼容网关。

### Q4: 如何迁移方案? (比如从 Supabase 官方迁到腾讯云)

1. 导出数据库: `pg_dump` 从源数据库
2. 导入到目标数据库: `psql < dump.sql`
3. 重新部署 Edge Functions (或改造为对应云函数)
4. 前端只需修改 `supabaseUrl` 和 `supabaseAnonKey`

### Q5: 需要 ICP 备案吗?

- Supabase 官方云 (海外): 不需要备案, 但中国大陆访问可能较慢
- 腾讯云方案: 如果使用自定义域名且服务器在国内, 需要备案
- GCP 方案: 海外节点不需要, 但国内访问可能受影响