-- ============================================================================
-- TaprootAgro — Distributor 后端数据库一键脚本 (合并 001_init + 002)
-- 文件名: developer/distributor.sql
--
-- 与 supabase/migrations/ 中顺序一致:
--   • 001_init.sql        — app_config / config_history / user_profiles + 触发器 + 种子
--   • 002_dealer_contacts.sql — dealer_contacts / dealer_ledger
--
-- 用法: Supabase Dashboard → SQL Editor → 粘贴全文 → Run
--       或: supabase db push（若 migrations 已包含同名变更则勿重复执行）
--
-- 部署 Edge Function 见: developer/SUPABASE_CN.md（方案一 第3步）
-- ============================================================================

-- ============================================================================
-- TaprootAgro PWA — Supabase 一键部署脚本 (v2)
-- ============================================================================
--
-- 使用方法：
--   1. 打开 Supabase Dashboard → SQL Editor
--   2. 粘贴本文件全部内容
--   3. 点击 Run — 完成！
--
-- 本脚本创建：
--   ✅ 3 张表 (app_config, config_history, user_profiles)
--   ✅ RLS 策略 (所有表锁定为 service_role，前端无法直接访问)
--   ✅ 3 个触发器 (自动版本递增、自动更新时间戳、自动历史快照)
--   ✅ 5 个辅助函数 (方便在 Dashboard 中管理内容)
--   ✅ 种子数据 (完整的出厂默认配置)
--   ✅ 索引 (优化查询性能)
--
-- 架构设计：
--   ┌─────────────────────────────────────────────────────────┐
--   │  你在 Dashboard 中编辑 app_config.config (JSONB)        │
--   │          ↓ 触发器自动执行                                │
--   │  1. version 自动 +1                                     │
--   │  2. updated_at 自动更新                                 │
--   │  3. 旧版本自动写入 config_history                        │
--   │          ↓                                              │
--   │  用户打开 APP / 切回前台                                 │
--   │          ↓                                              │
--   │  GET /server/config → 发现 version 变大 → 更新客户端    │
--   └─────────────────────────────────────────────────────────┘
--
-- 安全模型：
--   - 所有表启用 RLS，策略锁定为 service_role
--   - 前端 anonKey 无法直接读写任何表
--   - 所有数据访问通过 Edge Function (service_role) 中转
--   - Dashboard 编辑使用 postgres 角色，不受 RLS 限制
--
-- ============================================================================


-- ============================================================================
-- 0. 清理旧版本（如果存在）— 幂等执行
-- ============================================================================
-- 如果你重复运行本脚本，先删除旧的触发器和函数避免冲突。
-- 表使用 IF NOT EXISTS，不会丢数据。

DROP TRIGGER IF EXISTS trg_app_config_auto_version ON app_config;
DROP TRIGGER IF EXISTS trg_app_config_auto_history ON app_config;
DROP FUNCTION IF EXISTS fn_app_config_auto_version();
DROP FUNCTION IF EXISTS fn_app_config_auto_history();
DROP FUNCTION IF EXISTS update_config_section(TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS get_config_section(TEXT);
DROP FUNCTION IF EXISTS rollback_config(INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_config_overview();
DROP FUNCTION IF EXISTS search_config(TEXT);


-- ============================================================================
-- 1. app_config — 远程配置存储（单行 JSONB）
-- ============================================================================
-- 核心表：整个 APP 的配置存在一行 JSONB 中。
-- 你在 Dashboard 的 Table Editor 里点击 config 列即可编辑。
--
-- 列说明：
--   id          — 固定为 'main'，保证单行
--   config      — 完整配置 JSONB（文章、商品、品牌、直播等所有内容）
--   version     — 版本号（触发器自动递增，用于客户端判断是否有更新）
--   updated_at  — 最后修改时间（触发器自动更新）
--   updated_by  — 谁修改的（可选，手动填写或 Edge Function 自动填）

CREATE TABLE IF NOT EXISTS app_config (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  config      JSONB NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- RLS: 只允许 service_role（Edge Function 用 service_role 调用，绕过 RLS）
-- Dashboard 用 postgres 角色编辑，也不受 RLS 限制
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'app_config_service_role_only'
  ) THEN
    CREATE POLICY "app_config_service_role_only"
      ON app_config FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ============================================================================
-- 2. config_history — 配置版本历史（自动快照）
-- ============================================================================
-- 每次 app_config 被修改，触发器自动将旧版本插入这里。
-- 用于：查看历史变更、回滚到任意版本。
--
-- 列说明：
--   id          — 自增主键
--   config      — 该版本的完整配置快照
--   version     — 对应的版本号
--   created_at  — 快照创建时间
--   created_by  — 谁触发的修改
--   note        — 备注（如 "Dashboard 编辑"、"回滚到 v3"）

CREATE TABLE IF NOT EXISTS config_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config      JSONB NOT NULL,
  version     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT,
  note        TEXT
);

ALTER TABLE config_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config_history' AND policyname = 'config_history_service_role_only'
  ) THEN
    CREATE POLICY "config_history_service_role_only"
      ON config_history FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ============================================================================
-- 3. user_profiles — 用户资料存储
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'user_profiles_service_role_only'
  ) THEN
    CREATE POLICY "user_profiles_service_role_only"
      ON user_profiles FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ============================================================================
-- 4. 索引
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
  ON user_profiles (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_history_version
  ON config_history (version DESC);

CREATE INDEX IF NOT EXISTS idx_config_history_created
  ON config_history (created_at DESC);


-- ============================================================================
-- 5. 触发器 — 自动版本递增 + 自动时间戳
-- ============================================================================
-- 核心机制：你在 Dashboard 改了 config 列的内容 → 触发器自动：
--   1. version + 1
--   2. updated_at = now()
-- 这样客户端下次拉取时发现 version 变大，就会用新内容。

CREATE OR REPLACE FUNCTION fn_app_config_auto_version()
RETURNS TRIGGER AS $$
BEGIN
  -- 只在 config 列实际发生变化时递增版本
  IF OLD.config IS DISTINCT FROM NEW.config THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_config_auto_version
  BEFORE UPDATE ON app_config
  FOR EACH ROW
  EXECUTE FUNCTION fn_app_config_auto_version();


-- ============================================================================
-- 6. 触发器 — 自动历史快照
-- ============================================================================
-- 每次 config 被修改，自动将【修改前的旧版本】保存到 config_history。
-- 这样你永远可以回滚到任何一个历史版本。

CREATE OR REPLACE FUNCTION fn_app_config_auto_history()
RETURNS TRIGGER AS $$
BEGIN
  -- 只在 config 列实际发生变化时写历史
  IF OLD.config IS DISTINCT FROM NEW.config THEN
    INSERT INTO config_history (config, version, created_by, note)
    VALUES (
      OLD.config,
      OLD.version,
      COALESCE(NEW.updated_by, 'dashboard'),
      'Auto-snapshot before v' || NEW.version
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_config_auto_history
  AFTER UPDATE ON app_config
  FOR EACH ROW
  EXECUTE FUNCTION fn_app_config_auto_history();


-- ============================================================================
-- 7. 辅助函数 — 在 Dashboard SQL Editor 中管理内容
-- ============================================================================

-- -------------------------------------------------------
-- 7a. update_config_section — 更新配置的某个区块
-- -------------------------------------------------------
-- 用法示例（在 SQL Editor 中运行）：
--
--   -- 更新文章列表：
--   SELECT update_config_section('articles', '[
--     {"id":1,"title":"新文章标题","author":"作者","views":"999","category":"种植","date":"今天","content":"文章内容..."}
--   ]'::jsonb);
--
--   -- 更新品牌信息：
--   SELECT update_config_section('appBranding', '{
--     "logoUrl": "https://...",
--     "appName": "MyFarm",
--     "slogan": "Smart farming"
--   }'::jsonb);
--
--   -- 更新货币符号：
--   SELECT update_config_section('currencySymbol', '"$"'::jsonb);
--

CREATE OR REPLACE FUNCTION update_config_section(
  section_key TEXT,
  section_value JSONB,
  editor_name TEXT DEFAULT 'dashboard'
)
RETURNS TABLE(new_version INTEGER, updated_at TIMESTAMPTZ) AS $$
BEGIN
  UPDATE app_config
  SET
    config = jsonb_set(config, ARRAY[section_key], section_value),
    updated_by = editor_name
  WHERE id = 'main';

  RETURN QUERY
    SELECT ac.version, ac.updated_at
    FROM app_config ac
    WHERE ac.id = 'main';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_config_section IS
'更新配置中的某个区块。触发器会自动递增 version 并保存历史快照。
用法: SELECT update_config_section(''articles'', ''[...]''::jsonb);';


-- -------------------------------------------------------
-- 7b. get_config_section — 读取配置的某个区块
-- -------------------------------------------------------
-- 用法：
--   SELECT get_config_section('articles');
--   SELECT get_config_section('appBranding');
--   SELECT get_config_section('liveStreams');
--

CREATE OR REPLACE FUNCTION get_config_section(section_key TEXT)
RETURNS JSONB AS $$
  SELECT config -> section_key FROM app_config WHERE id = 'main';
$$ LANGUAGE sql;

COMMENT ON FUNCTION get_config_section IS
'读取配置中某个区块的 JSON。用法: SELECT get_config_section(''articles'');';


-- -------------------------------------------------------
-- 7c. rollback_config — 回滚到历史版本
-- -------------------------------------------------------
-- 用法：
--   -- 先查看历史版本列表：
--   SELECT version, created_at, note FROM config_history ORDER BY version DESC LIMIT 20;
--
--   -- 回滚到版本 3：
--   SELECT rollback_config(3);
--

CREATE OR REPLACE FUNCTION rollback_config(
  target_version INTEGER,
  editor_name TEXT DEFAULT 'dashboard-rollback'
)
RETURNS TABLE(new_version INTEGER, rolled_back_to INTEGER) AS $$
DECLARE
  snapshot_config JSONB;
BEGIN
  -- 查找目标版本的快照
  SELECT ch.config INTO snapshot_config
  FROM config_history ch
  WHERE ch.version = target_version
  ORDER BY ch.created_at DESC
  LIMIT 1;

  IF snapshot_config IS NULL THEN
    RAISE EXCEPTION 'Version % not found in config_history', target_version;
  END IF;

  -- 写回 app_config（触发器会自动递增 version 并保存当前版本到历史）
  UPDATE app_config
  SET
    config = snapshot_config,
    updated_by = editor_name
  WHERE id = 'main';

  RETURN QUERY
    SELECT ac.version, target_version
    FROM app_config ac
    WHERE ac.id = 'main';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rollback_config IS
'回滚到历史版本。当前版本会自动保存到 config_history。
用法: SELECT rollback_config(3);';


-- -------------------------------------------------------
-- 7d. get_config_overview — 查看配置概览
-- -------------------------------------------------------
-- 快速查看每个配置区块有多少条目。
-- 用法：SELECT * FROM get_config_overview();
--

CREATE OR REPLACE FUNCTION get_config_overview()
RETURNS TABLE(
  section TEXT,
  item_count TEXT,
  preview TEXT
) AS $$
DECLARE
  cfg JSONB;
BEGIN
  SELECT config INTO cfg FROM app_config WHERE id = 'main';

  RETURN QUERY
  SELECT
    k.key::TEXT AS section,
    CASE
      WHEN jsonb_typeof(k.value) = 'array' THEN jsonb_array_length(k.value)::TEXT || ' items'
      WHEN jsonb_typeof(k.value) = 'object' THEN (SELECT count(*)::TEXT || ' keys' FROM jsonb_object_keys(k.value) AS _)
      ELSE jsonb_typeof(k.value)
    END AS item_count,
    left(k.value::TEXT, 80) AS preview
  FROM jsonb_each(cfg) AS k(key, value)
  ORDER BY k.key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_config_overview IS
'查看配置概览：每个区块的类型和条目数。用法: SELECT * FROM get_config_overview();';


-- -------------------------------------------------------
-- 7e. search_config — 全文搜索配置内容
-- -------------------------------------------------------
-- 在配置 JSON 中搜索关键词（不区分大小写）。
-- 用法：SELECT * FROM search_config('小麦');
--

CREATE OR REPLACE FUNCTION search_config(keyword TEXT)
RETURNS TABLE(
  section TEXT,
  matched_content TEXT
) AS $$
DECLARE
  cfg JSONB;
BEGIN
  SELECT config INTO cfg FROM app_config WHERE id = 'main';

  RETURN QUERY
  SELECT
    k.key::TEXT AS section,
    left(k.value::TEXT, 200) AS matched_content
  FROM jsonb_each(cfg) AS k(key, value)
  WHERE k.value::TEXT ILIKE '%' || keyword || '%'
  ORDER BY k.key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_config IS
'在配置中搜索关键词。用法: SELECT * FROM search_config(''小麦'');';


-- ============================================================================
-- 8. 种子数据 — 出厂默认配置
-- ============================================================================
-- 插入完整的出厂配置。如果行已存在则不覆盖（ON CONFLICT DO NOTHING）。
-- 如果你想重置为出厂配置，先 DELETE FROM app_config; 再重新运行本段。

INSERT INTO app_config (id, config, version, updated_by)
VALUES (
  'main',
  '{
    "banners": [
      {
        "id": 1,
        "url": "https://images.unsplash.com/photo-1702896781457-1d4f69aebf7e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080",
        "alt": "农业田野风光",
        "title": "智慧农业新时代",
        "content": "探索现代农业的无限可能，从智能种植到精准管理，TaprootAgro引领农业革命。"
      },
      {
        "id": 2,
        "url": "https://images.unsplash.com/photo-1673200692829-fcdb7e267fc1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080",
        "alt": "农场作物收割",
        "title": "丰收季节",
        "content": "见证丰收的喜悦，TaprootAgro提供全面的农业解决方案，帮助您实现丰收。"
      },
      {
        "id": 3,
        "url": "https://images.unsplash.com/photo-1591530712751-96e6f5ad73ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080",
        "alt": "绿色植物种植",
        "title": "绿色生态农业",
        "content": "拥抱绿色生态，TaprootAgro致力于可持续农业发展，提供环保的种植方案。"
      }
    ],

    "navigation": [
      {"id": 1, "icon": "ScanLine", "title": "病虫识别", "subtitle": "AI智能检测"},
      {"id": 2, "icon": "Bot", "title": "AI助手", "subtitle": "智能问答"},
      {"id": 3, "icon": "Calculator", "title": "收益统计", "subtitle": "数据分析"},
      {"id": 4, "icon": "MapPin", "title": "农田地图", "subtitle": "位置管理"}
    ],

    "liveStreams": [
      {
        "id": 1,
        "title": "水稻种植技术讲解",
        "viewers": "1234",
        "thumbnail": "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400",
        "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
      },
      {
        "id": 2,
        "title": "有机蔬菜栽培经验分享",
        "viewers": "856",
        "thumbnail": "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400",
        "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
      }
    ],

    "articles": [
      {
        "id": 1,
        "title": "春季小麦施肥管理要点",
        "author": "农业专家",
        "views": "1.2k",
        "category": "种植技术",
        "date": "2天前",
        "content": "春季是小麦生长的关键时期...",
        "thumbnail": "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400"
      },
      {
        "id": 2,
        "title": "玉米病虫害综合防治技术",
        "author": "植保专家",
        "views": "856",
        "category": "病虫害",
        "date": "3天前",
        "content": "玉米常见病虫害包括...",
        "thumbnail": "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400"
      },
      {
        "id": 3,
        "title": "西非加纳农业10周年纪念日",
        "author": "土壤专家",
        "views": "642",
        "category": "施肥管理",
        "date": "5天前",
        "content": "科学施肥是提高作物产量的关键...",
        "thumbnail": "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"
      },
      {
        "id": 4,
        "title": "水稻育秧期温湿度控制技巧",
        "author": "种植达人",
        "views": "923",
        "category": "栽培技术",
        "date": "1周前",
        "content": "育秧期的温湿度控制直接影响...",
        "thumbnail": "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400"
      },
      {
        "id": 5,
        "title": "现代化智能温室大棚建设方案",
        "author": "设施农业专家",
        "views": "1.5k",
        "category": "设施农业",
        "date": "3天前",
        "content": "智能温室大棚通过物联网技术...",
        "thumbnail": "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"
      },
      {
        "id": 6,
        "title": "蔬菜种植中的水肥一体化技术应用",
        "author": "灌溉专家",
        "views": "789",
        "category": "灌溉技术",
        "date": "4天前",
        "content": "水肥一体化是现代农业的重要技术...",
        "thumbnail": "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400"
      },
      {
        "id": 7,
        "title": "果树修剪与整形关键技术要领",
        "author": "果树专家",
        "views": "1.1k",
        "category": "果树管理",
        "date": "6天前",
        "content": "果树修剪是果树栽培管理的重要环节...",
        "thumbnail": "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400"
      }
    ],

    "videoFeed": {
      "title": "农业短视频",
      "description": "观看最新农业技术视频",
      "videoSources": []
    },

    "homeIcons": {
      "aiAssistantIconUrl": "",
      "aiAssistantLabel": "",
      "statementIconUrl": "",
      "statementLabel": "",
      "liveCoverUrl": "",
      "liveTitle": "",
      "liveBadge": ""
    },

    "currencySymbol": "¥",

    "marketPage": {
      "categories": [
        {"id": "herbicide", "name": "除草剂", "subCategories": ["苗前苗后", "苗前", "苗中"]},
        {"id": "insecticide", "name": "杀虫剂", "subCategories": ["接触性", "内吸性", "胃毒性"]},
        {"id": "fungicide", "name": "杀菌剂", "subCategories": ["保护性", "治疗性", "复合型"]},
        {"id": "fertilizer", "name": "肥料", "subCategories": ["氮肥", "磷肥", "钾肥"]}
      ],
      "products": [
        {"id": 1, "name": "强效除草剂 500ml", "image": "https://placehold.co/400x400/10b981/ffffff?text=TAPROOTAGRO", "price": "¥68", "category": "herbicide", "subCategory": "苗前苗后", "description": "强效除草剂", "stock": 100},
        {"id": 2, "name": "生态除草剂 1L", "image": "https://placehold.co/400x400/10b981/ffffff?text=TAPROOTAGRO", "price": "¥52", "category": "herbicide", "subCategory": "苗前", "description": "环保生态除草剂", "stock": 80},
        {"id": 5, "name": "接触型杀虫剂 600ml", "image": "https://placehold.co/400x400/10b981/ffffff?text=TAPROOTAGRO", "price": "¥78", "category": "insecticide", "subCategory": "接触性", "description": "接触即死，快速见效", "stock": 110},
        {"id": 11, "name": "保护型杀菌剂 500ml", "image": "https://placehold.co/400x400/10b981/ffffff?text=TAPROOTAGRO", "price": "¥68", "category": "fungicide", "subCategory": "保护性", "description": "预防病害", "stock": 90},
        {"id": 17, "name": "高纯度氮肥 10kg", "image": "https://placehold.co/400x400/10b981/ffffff?text=TAPROOTAGRO", "price": "¥125", "category": "fertilizer", "subCategory": "氮肥", "description": "促进叶片生长", "stock": 150}
      ],
      "advertisements": [
        {
          "id": 1,
          "image": "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400",
          "title": "农业技术培训",
          "content": "TaprootAgro 2026年春季农业技术培训班正式开放报名！"
        }
      ]
    },

    "appBranding": {
      "logoUrl": "",
      "appName": "TaprootAgro",
      "slogan": "To be the taproot of smart agro."
    },

    "desktopIcon": {
      "appName": "TaprootAgro",
      "icon192Url": "",
      "icon512Url": ""
    },

    "filing": {
      "icpNumber": "",
      "icpUrl": "",
      "policeNumber": "",
      "policeUrl": ""
    },

    "chatContact": {
      "name": "",
      "avatar": "",
      "subtitle": "TaprootAgro授权店",
      "imUserId": "",
      "imProvider": "tencent-im",
      "channelId": "",
      "phone": "",
      "storeId": "",
      "verifiedDomains": []
    },

    "userProfile": {
      "name": "",
      "avatar": ""
    },

    "aboutUs": {
      "title": "关于我们",
      "content": "我们是一家专注于农业技术的公司，致力于提供最先进的农业解决方案。"
    },

    "privacyPolicy": {
      "title": "隐私政策",
      "content": "我们尊重并保护所有使用我们服务的用户的隐私。"
    },

    "termsOfService": {
      "title": "用户协议",
      "content": "欢迎使用我们的服务！"
    },

    "aiModelConfig": {
      "modelUrl": "",
      "labelsUrl": "",
      "enableLocalModel": false
    },

    "cloudAIConfig": {
      "enabled": false,
      "providerName": "通义千问",
      "edgeFunctionName": "ai-vision-proxy",
      "modelId": "qwen-vl-plus",
      "systemPrompt": "",
      "maxTokens": 512
    },

    "pushConfig": {
      "vapidPublicKey": "",
      "pushApiBase": "",
      "enabled": false
    },

    "pushProvidersConfig": {
      "activeProvider": "webpush",
      "webpush": {"enabled": false, "vapidPublicKey": "", "pushApiBase": ""},
      "fcm": {"enabled": false, "apiKey": "", "projectId": "", "appId": "", "messagingSenderId": "", "vapidKey": ""},
      "onesignal": {"enabled": false, "appId": "", "safariWebId": ""},
      "jpush": {"enabled": false, "appKey": "", "masterSecret": "", "channel": "", "pushApiBase": ""},
      "getui": {"enabled": false, "appId": "", "appKey": "", "masterSecret": "", "pushApiBase": ""}
    },

    "loginConfig": {
      "socialProviders": {
        "wechat": false,
        "google": false,
        "facebook": false,
        "apple": false,
        "alipay": false,
        "twitter": false,
        "line": false
      },
      "oauthCredentials": {
        "wechat": {"appId": ""},
        "google": {"clientId": ""},
        "facebook": {"appId": ""},
        "apple": {"serviceId": "", "teamId": "", "keyId": ""},
        "alipay": {"appId": ""},
        "twitter": {"apiKey": ""},
        "line": {"channelId": ""}
      },
      "enablePhoneLogin": true,
      "enableEmailLogin": true,
      "defaultLoginMethod": "phone"
    },

    "liveShareConfig": {
      "enabled": false,
      "shareUrl": "",
      "shareTitle": "TaprootAgro直播",
      "shareText": "",
      "shareImgUrl": "",
      "wxJsSdkEnabled": false,
      "wxAppId": "",
      "wxSignatureApi": ""
    },

    "liveNavigationConfig": {
      "enabled": false,
      "latitude": "",
      "longitude": "",
      "address": "",
      "coordSystem": "wgs84",
      "baiduMap": true,
      "amapMap": true,
      "googleMap": true,
      "appleMaps": true,
      "waze": true
    }
  }'::jsonb,
  1,
  'init-script'
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 9. 种子历史记录 — 记录初始版本
-- ============================================================================

INSERT INTO config_history (config, version, created_by, note)
SELECT config, version, 'init-script', 'Initial seed configuration'
FROM app_config
WHERE id = 'main'
  AND NOT EXISTS (SELECT 1 FROM config_history WHERE version = 1);


-- ============================================================================
-- 完成！
-- ============================================================================
--
-- 🎉 部署完成！接下来：
--
-- ┌─────────────────────────────────────────────────────────────────────┐
-- │  第一步：部署 Edge Function                                         │
-- │  运行: supabase functions deploy server                            │
-- │                                                                     │
-- │  第二步：在 PWA ConfigManagerPage 中配置连接                         │
-- │  填入: Supabase URL + Anon Key                                     │
-- │  点击: 测试连接                                                     │
-- │                                                                     │
-- │  第三步：开始管理内容！                                              │
-- │  在 Dashboard > Table Editor > app_config 中编辑 config 列          │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- 常用 SQL 命令速查：
--
--   -- 查看配置概览
--   SELECT * FROM get_config_overview();
--
--   -- 读取某个区块
--   SELECT get_config_section('articles');
--   SELECT get_config_section('appBranding');
--
--   -- 更新文章列表
--   SELECT update_config_section('articles', '[{"id":1,"title":"新标题",...}]'::jsonb);
--
--   -- 更新品牌名
--   SELECT update_config_section('appBranding', '{"logoUrl":"","appName":"MyFarm","slogan":"Smart"}'::jsonb);
--
--   -- 搜索配置内容
--   SELECT * FROM search_config('小麦');
--
--   -- 查看历史版本
--   SELECT version, created_at, note FROM config_history ORDER BY version DESC LIMIT 20;
--
--   -- 回滚到版本 N
--   SELECT rollback_config(3);
--
--   -- 查看当前版本号
--   SELECT version, updated_at, updated_by FROM app_config WHERE id = 'main';
--
-- ============================================================================

-- ============================================================================
-- 以下为原 002_dealer_contacts.sql（经销商联系人 + 账本）
-- ============================================================================

-- ============================================================================
-- TaprootAgro — Migration 002: dealer_contacts + dealer_ledger
-- ============================================================================
-- Adds:
--   1. dealer_contacts  — stores each dealer's farmer contacts (QR scan bind)
--   2. dealer_ledger    — stores each dealer's full ledger data (JSON blob)
--
-- Usage:
--   1. Paste into Supabase Dashboard → SQL Editor → Run
--   2. Or apply via CLI: supabase db push
-- ============================================================================

-- ========================
-- 1. dealer_contacts
-- ========================

CREATE TABLE IF NOT EXISTS dealer_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farmer_name   TEXT NOT NULL DEFAULT '',
  farmer_avatar TEXT DEFAULT '',
  im_user_id    TEXT NOT NULL,
  im_provider   TEXT NOT NULL DEFAULT 'tencent-im',
  channel_id    TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  store_id      TEXT DEFAULT '',
  pinyin        TEXT DEFAULT '',
  is_muted      BOOLEAN DEFAULT false,
  bound_at      TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dealer_id, im_user_id)
);

ALTER TABLE dealer_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dealer_contacts'
      AND policyname = 'dealer_contacts_service_role_only'
  ) THEN
    CREATE POLICY "dealer_contacts_service_role_only"
      ON dealer_contacts FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dealer_contacts_dealer
  ON dealer_contacts(dealer_id);

CREATE INDEX IF NOT EXISTS idx_dealer_contacts_updated
  ON dealer_contacts(updated_at DESC);

CREATE OR REPLACE FUNCTION fn_dealer_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dealer_contacts_updated_at ON dealer_contacts;
CREATE TRIGGER trg_dealer_contacts_updated_at
  BEFORE UPDATE ON dealer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION fn_dealer_contacts_updated_at();

-- ========================
-- 2. dealer_ledger
-- ========================
-- One row per dealer, JSONB column stores the entire LedgerState.
-- Version column enables optimistic locking from the client.

CREATE TABLE IF NOT EXISTS dealer_ledger (
  dealer_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dealer_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dealer_ledger'
      AND policyname = 'dealer_ledger_service_role_only'
  ) THEN
    CREATE POLICY "dealer_ledger_service_role_only"
      ON dealer_ledger FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dealer_ledger_updated
  ON dealer_ledger(updated_at DESC);
