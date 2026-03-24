/**
 * ============================================================================
 *
 *   TaprootAgro — 傻瓜式部署指南（零代码操作）
 *
 *   总耗时: ~30 分钟 | 不需要写任何代码
 *
 * ============================================================================
 *
 *   ① 代码如有问题可以在线修复。1TB流量可覆盖300万用户，CDN成本
 *     约20美金。所以最重要是快速把 PWA/App 推广到农户手机上。
 *
 *   ② 如果你短时间搞不定后端设置，先在内置的内容管理器里编辑信息，
 *     生成二维码/App，先去占位子。
 *
 *   ③ Good Luck!
 *
 *   ————————————————————————————————————————————————————————————————————
 *
 *   ① Code issues can be fixed online anytime. 1 TB of CDN traffic
 *     covers ~3 million users, costing only about $20. So the most
 *     important thing is to get your PWA/App onto farmers' phones
 *     as fast as possible.
 *
 *   ② If you can't set up the backend right away, start by editing
 *     content in the built-in Config Manager, generate a QR code / APK,
 *     and get your spot first — claim your market before anyone else.
 *
 *   ③ Good Luck!
 *
 * ============================================================================
 *
 *   总览 — 你要做的事：
 *
 *     第 1 步：部署 Supabase 后端（数据库 + API）
 *     第 2 步：部署 PWA 网站上线（全球可访问）
 *     第 3 步：在 GitHub 上一键构建 Android APK（中国地区直接做app吧，国内对pwa运行支持太差了）
 *
 *   如何更新内容（包括所有个性化设置）：
 *
 *     在 Cursor 里打开本仓库 → 编辑 ConfigManagerPage / taprootagrosetting/*.json
 *       （用 AI 对话改文案，或本地 npm run dev 后在浏览器里用内置「配置管理器」表单编辑）
 *       → 提交并推送到 GitHub → 自动部署到 Cloudflare Pages / Vercel / Netlify / EdgeOne
 *       → 农户手机约 1 分钟内自动更新
 *
 *     就这么简单。在 Cursor 里改完推送一次，所有人都收到更新。
 *
 * ============================================================================
 */


// ============================================================================
//
//   第 1 步：部署 SUPABASE 后端
//   ~15 分钟 | 创建你的数据库 + API + 认证
//
// ============================================================================
/**
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │  Supabase 有三种部署方式，选一个：                                 │
 *   │                                                                    │
 *   │  方案 A: Supabase 官方云（supabase.com）                          │
 *   │          → 最快上手，5 分钟搞定                                   │
 *   │                                                                    │
 *   │  方案 B: 自购服务器 + Supabase Docker                             │
 *   │          → 数据本地化，完全自主可控                               │
 *   │                                                                    │
 *   │  方案 C: 阿里云 PolarDB Supabase                                  │
 *   │          → 数据云托管，全托管免运维                               │
 *   │                                                                    │
 *   │  三种方案和 TaprootAgro 的兼容性完全一样。                         │
 *   │  唯一区别是你在配置管理器里填的 URL 和 Key 不同。                  │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   方案 A：Supabase 官方云（最快上手）
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   1.1A  注册 Supabase 账号
 *   ─────────────────────────
 *     ① 打开 https://supabase.com → 用 GitHub 注册（推荐）
 *     ② 点击 "New Project"
 *     ③ 名字随便取（比如 "harvest-backend"）
 *     ④ 数据库密码：设一个，一定保存好（之后看不到了！）
 *     ⑤ 区域：选离你农户最近的
 *       （东南亚选新加坡，南亚选孟买，等等）
 *     ⑥ 点击 "Create new project" → 等 2 分钟
 *
 *     连接信息（在 Dashboard → Settings → API 找到）：
 *       Project URL:  https://xxxxxxxx.supabase.co
 *       Anon Key:     eyJhbGciOiJ...
 *
 *     → 跳到下面「三种方案都走到这里」继续。
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   方案 B：自购服务器 + Supabase Docker（数据本地化）
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   为什么自建？
 *     - 数据完全存在你自己的服务器上，主权在握
 *     - 部分国家法律要求数据本地化存储
 *     - 任何云服务商都可以（腾讯云、阿里云、AWS、Azure 等）
 *
 *   1.1B  购买云服务器（任意服务商）
 *   ──────────────────────────────────
 *     推荐配置：
 *       - 系统：Ubuntu 22.04 LTS
 *       - 规格：4核 8GB 内存，60GB SSD（最低要求）
 *       - 任意服务商均可：腾讯云轻量应用服务器、阿里云 ECS、
 *         AWS Lightsail、DigitalOcean、Hetzner 等
 *
 *   1.2B  安装 Supabase（4 条命令）
 *   ─────────────────────────────────
 *     SSH 连接到你的服务器，依次运行：
 *
 *     ```bash
 *     # 1. 安装 Docker
 *     curl -fsSL https://get.docker.com | sh
 *     sudo systemctl enable docker && sudo systemctl start docker
 *
 *     # 2. 拉取 Supabase Docker 配置
 *     git clone --depth 1 https://github.com/supabase/supabase
 *     cd supabase/docker
 *
 *     # 3. 创建配置文件
 *     cp .env.example .env
 *
 *     # 4. 一键启动
 *     docker compose up -d
 *     ```
 *
 *     等约 2 分钟。打开：http://你的服务器IP:8000
 *
 *   1.3B  安全设置（重要！）
 *   ─────────────────────────
 *     编辑 .env 文件 — 一定要改这些默认值：
 *
 *       POSTGRES_PASSWORD=你的强密码
 *       JWT_SECRET=至少32位的随机字符串
 *       DASHBOARD_USERNAME=admin
 *       DASHBOARD_PASSWORD=你的后台密码
 *
 *     然后重新生成 API 密钥：
 *       打开 https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
 *       用你的 JWT_SECRET 生成 ANON_KEY 和 SERVICE_ROLE_KEY。
 *       写入 .env，然后重启：
 *
 *     ```bash
 *     docker compose down && docker compose up -d
 *     ```
 *
 *   1.4B  配置 HTTPS（推荐）
 *   ─────────────────────────
 *     把域名指向你的服务器 IP，然后用任意方式配 SSL：
 *       - Cloudflare 代理（最简单 — 开启橙色云朵即可）
 *       - 你的云服务商提供的免费 SSL 证书服务
 *       - Certbot: sudo apt install certbot && sudo certbot --standalone
 *
 *     连接信息：
 *       Supabase URL:  https://api.你的域名.com
 *       Anon Key:      （.env 文件里的 ANON_KEY）
 *
 *     → 跳到下面「三种方案都走到这里」继续。
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   方案 C：阿里云 PolarDB Supabase（全托管云服务）
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   为什么选 PolarDB Supabase？
 *     - 全托管 — 不需要维护任何服务器
 *     - 在阿里云控制台一键部署
 *     - 包含数据库、认证、API、实时引擎 — 所有组件齐全
 *     - 和 Supabase 官方 API 完全一样，代码零改动
 *
 *   1.1C  部署 PolarDB Supabase
 *   ─────────────────────────────
 *     ① 打开阿里云控制台
 *       搜索 "PolarDB Supabase" → 点击「立即部署」
 *     ② 按向导操作 — 选择地域、确认资源
 *     ③ 等约 5 分钟完成创建
 *     ④ 在控制台获取 Supabase URL + Anon Key
 *
 *     详细步骤参见：
 *       阿里云文档：「Supabase 一站式构建云上应用」
 *
 *     连接信息：
 *       Supabase URL:  （从 PolarDB Supabase 控制台获取）
 *       Anon Key:      （从 PolarDB Supabase 控制台获取）
 *
 *     → 继续下面的步骤。
 *
 *
 *   ══════════════════════════════════════════════════════════════════════
 *   三种方案都走到这里 — 继续下面的步骤
 *   ══════════════════════════════════════════════════════════════════════
 *
 *   1.5  运行数据库初始化脚本
 *   ──────────────────────────
 *     ① 在 Supabase 后台，点左侧 "SQL Editor"
 *     ② 点 "New query"
 *     ③ 打开 /developer/distributor.sql（一次执行 = 001+002 合并），或依次执行
 *        /supabase/migrations/001_init.sql 与 002_dealer_contacts.sql
 *     ④ 全选复制 → 粘贴到 SQL Editor → 点 "Run"
 *     ⑤ 看到 "Success" 就完成了！
 *
 *     这一步自动创建了所有表、触发器、辅助函数及经销商相关表。
 *
 *
 *   1.6  部署 Edge Functions（3 个函数）
 *   ──────────────────────────────────────
 *     方案 A（Supabase 官方云）：用 CLI 命令
 *       ```
 *       supabase login
 *       supabase link --project-ref 你的项目ID
 *       supabase functions deploy server
 *       supabase functions deploy chat-token
 *       supabase functions deploy ai-vision-proxy
 *       ```
 *
 *     方案 B/C（自建 / PolarDB）：复制函数文件到 Docker
 *
 *       只需要 3 个小文件 — 不用把整个 PWA 仓库 clone 到服务器。
 *       在你自己的电脑上（有 PWA 项目的那台）执行：
 *
 *       ```bash
 *       # 在你的电脑上 — 把 3 个文件发到服务器：
 *       scp supabase/functions/server/index.tsx      root@你的服务器IP:~/server.tsx
 *       scp supabase/functions/chat-token/index.tsx   root@你的服务器IP:~/chat-token.tsx
 *       scp supabase/functions/ai-vision-proxy/index.tsx root@你的服务器IP:~/ai-vision-proxy.tsx
 *       ```
 *
 *       然后 SSH 到服务器，把文件放到正确位置：
 *
 *       ```bash
 *       # 在服务器上：
 *       cd ~/supabase/docker
 *       mkdir -p volumes/functions/{server,chat-token,ai-vision-proxy}
 *       mv ~/server.tsx          volumes/functions/server/index.tsx
 *       mv ~/chat-token.tsx      volumes/functions/chat-token/index.tsx
 *       mv ~/ai-vision-proxy.tsx volumes/functions/ai-vision-proxy/index.tsx
 *       docker compose restart functions
 *       ```
 *
 *       另一种方法：在 GitHub 网页上打开文件，复制内容，
 *       SSH 到服务器后用 nano/vim 粘贴进去。效果一样。
 *
 *     不想装 CLI？让你的技术人员帮你跑一次这几条命令就行。
 *
 *
 *   1.7  设置密钥（API Key）— 可选
 *   ──────────────────────────────────
 *     在 Supabase 后台 → Project Settings → Edge Functions → Secrets：
 *
 *     ┌───────────────────────────┬────────────────────────────────────────┐
 *     │  密钥名称                 │  在哪里获取                            │
 *     ├───────────────────────────┼────────────────────────────────────────┤
 *     │  TENCENT_IM_APP_ID       │  腾讯云 IM 控制台                      │
 *     │  TENCENT_IM_SECRET_KEY   │  腾讯云 IM 控制台                      │
 *     ├───────────────────────────┼────────────────────────────────────────┤
 *     │  AI_PROVIDER             │  "qwen" 或 "gemini" 或 "openai"       │
 *     │  AI_API_KEY              │  通义千问 / Google AI / OpenAI 密钥    │
 *     └───────────────────────────┴────────────────────────────────────────┘
 *
 *     注意：IM 和 AI 密钥是可选的。不填也能用，只是进入演示模式。
 *
 *
 *   1.8  保存你的 Supabase 连接信息
 *   ─────────────────────────────────────────────────
 *       Project URL:  https://xxxxxxxx.supabase.co    ← 复制
 *       Anon Key:     eyJhbGciOiJ...                  ← 复制
 *
 *     你需要把这些信息填进 Cursor 里的 ConfigManagerPage 或 taprootagrosetting/backend.json
 *     （参见下面第 2 步更新流程）。
 */


// ============================================================================
//
//   第 2 步：部署 PWA 网站上线
//   ~5 分钟 | 推送到 GitHub → 自动部署 → 农户自动收到更新
//
// ============================================================================
/**
 *
 *   更新推送链路的工作原理：
 *
 *     ┌──────────────┐     ┌──────────┐     ┌──────────────────────────┐
 *     │    Cursor    │────▶│  GitHub  │────▶│ Cloudflare Pages /       │
 *     │ （编辑+推送） │推送 │ （仓库） │自动 │ Vercel / Netlify / EdgeOne│
 *     └──────────────┘     └──────────┘     └────────────┬─────────────┘
 *                                                         │ 自动更新
 *                                                         ▼
 *                                                ┌─────────────────┐
 *                                                │  农户的手机      │
 *                                                │ （PWA 或 APK）   │
 *                                                └─────────────────┘
 *
 *     在 Cursor 里改完、commit、push，已连接的托管平台会自动构建。
 *     约 1 分钟内网站更新；农户下次打开即可（浏览器 PWA 或 APK 内 WebView）。
 *
 *
 *   2.0  在 Cursor 里编辑（接近「可视化」的流程）
 *   ────────────────────────────────────────────
 *     ① 文件 → 打开文件夹 → 选择 TaprootAgro PWA 仓库根目录
 *     ② 改品牌、文章、商城数据：打开 taprootagrosetting/*.json，
 *        或 src/app/components/ConfigManagerPage.tsx（后台设置界面）
 *     ③ 本地预览：终端执行 npm install && npm run dev → 浏览器打开本地地址；
 *        用内置 **配置管理器**（密码 taprootagro）表单改 —— 对非开发仍是最快的「可视化」方式
 *     ④ 左侧「源代码管理」→ 暂存 → 填写说明 → 推送
 *        （或终端：git add -A && git commit -m "更新配置" && git push）
 *
 *     按 Cmd/Ctrl+L 打开 Cursor 聊天，可直接说：「把应用名改成 XXX」，
 *     按建议应用修改，不必死记 JSON 路径。
 *
 *
 *   2.1  推送到 GitHub → 连接托管平台
 *   ───────────────────────────────────
 *     代码已在 GitHub 后，在下列托管中选 **一个** 连接（每次 push 自动构建）：
 *
 *     ┌──────────────────────────────────────────────────────────────────┐
 *     │                                                                  │
 *     │  方案 A: Vercel（推荐 — 最简单）                                │
 *     │    ① https://vercel.com → "Add New Project" → 导入 GitHub 仓库 │
 *     │    ② Framework 选 Vite → 点 "Deploy" → 等 1-2 分钟 → 完成     │
 *     │    ③ 你的网址: https://your-project.vercel.app                 │
 *     │    以后每次 git push 都在 60 秒内自动部署。                      │
 *     │                                                                  │
 *     ├──────────────────────────────────────────────────────────────────┤
 *     │                                                                  │
 *     │  方案 B: Netlify                                                │
 *     │    ① https://netlify.com → "Add new site" → 导入 GitHub        │
 *     │    ② 构建命令: npm run build | 发布目录: dist                   │
 *     │    ③ 你的网址: https://your-project.netlify.app                │
 *     │                                                                  │
 *     ├──────────────────────────────────────────────────────────────────┤
 *     │                                                                  │
 *     │  方案 C: 腾讯云 EdgeOne Pages                                   │
 *     │    ① EdgeOne 控制台 → 创建项目 → 关联 GitHub 仓库              │
 *     │    ② 构建命令: npm run build | 输出目录: dist                   │
 *     │    ③ 绑定自定义域名                                            │
 *     │    优势：亚洲地区 CDN 较快                                      │
 *     │                                                                  │
 *     ├──────────────────────────────────────────────────────────────────┤
 *     │                                                                  │
 *     │  方案 D: Cloudflare Pages（全球 CDN、免费额度友好）             │
 *     │    ① https://dash.cloudflare.com → Workers 和 Pages → 创建      │
 *     │       应用程序 → Pages → 连接到 Git                            │
 *     │    ② 选择 GitHub 仓库 + 生产分支（如 main）                     │
 *     │    ③ 框架预设选 Vite，或手动填写：                             │
 *     │       构建命令: npm run build                                   │
 *     │       构建输出目录: dist                                        │
 *     │    ④ 若需环境变量：在 Pages 项目 → 设置 → 环境变量，名称与本地   │
 *     │       .env 里 VITE_* 一致                                       │
 *     │    ⑤ 部署 → 得到 https://<项目名>.pages.dev                     │
 *     │    每次 git push 会触发新构建（约 1～2 分钟）                    │
 *     │    自定义域名：Pages 项目 → 自定义域名 → 按提示添加 CNAME         │
 *     │                                                                  │
 *     └──────────────────────────────────────────────────────────────────┘
 *
 *     部署完成后，PWA 就上线了！
 *     农户用任何浏览器打开即可使用，还能「添加到桌面」。
 *
 */


// ============================================================================
//
//   第 3 步：在 GitHub 上一键构建 Android APK
//   ~10 分钟 | 不需要安装任何软件
//
// ============================================================================
/**
 *
 *   3.1  Fork 打包仓库（只需做一次）
 *   ──────────────────────────────────
 *     ① 打开: https://github.com/user/taprootagro-builder
 *        （把 "user" 换成实际的 GitHub 账号）
 *     ② 点右上角 "Fork" → "Create fork"
 *
 *
 *   3.2  运行构建（填 3 个字段，点 1 个按钮）
 *   ──────────────────────────────────────────────
 *     ① 在你 Fork 的仓库 → "Actions" 选项卡
 *     ② 左侧点 "Build Android App"
 *     ③ 点右侧 "Run workflow" 下拉按钮 → 填写：
 *
 *       ┌────────────────────────────────────────────────────────────┐
 *       │   App 显示名称:      丰收助手                              │
 *       │   Android 包名:      com.harvest.helper                   │
 *       │   PWA 源码仓库地址:  https://github.com/you/your-pwa      │
 *       │   版本号:            1.0.0                                 │
 *       └────────────────────────────────────────────────────────────┘
 *
 *     ④ 点击 "Run workflow" → 等 8-12 分钟
 *
 *
 *   3.3  下载 APK
 *   ───────────────
 *     ① 点完成的构建任务（绿色 ✓）→ 往下翻到 "Artifacts"
 *     ② 下载 ZIP，里面有：
 *
 *       你的App.apk          ← 安装到安卓手机
 *       你的App.aab          ← 上传到 Google Play
 *       release.keystore     ← 签名密钥 — 一定要保存!!
 *       keystore-info.txt    ← 密码信息 — 一定要保存!!
 *
 *
 *   3.4  ⚠ 重要：一定要保存签名密钥
 *   ──────────────────────────────────
 *     release.keystore + keystore-info.txt 必须永久保存。
 *     没有它们就无法在应用商店更新你的 App。
 *
 *     最佳做法：存为 GitHub Secret，以后自动使用：
 *       ① 你的打包仓库 → Settings → Secrets → Actions
 *       ② 添加密钥: KEYSTORE_BASE64 = (release.keystore 的 base64 编码)
 *       ③ 添加密钥: KEYSTORE_PASS   = (keystore-info.txt 里的密码)
 *
 *     base64 编码方法：
 *       Mac/Linux:  base64 release.keystore
 *       Windows:    certutil -encode release.keystore tmp.b64
 *
 *
 *   3.5  分发 APK 给农户
 *   ──────────────────────
 *     方式 A：微信/WhatsApp/邮件/U盘发送 .apk → 点击安装
 *     方式 B：上传 .aab 到 Google Play 商店（$25 一次性费用）
 *     方式 C：放到你的网站上 → 分享下载链接
 *
 *
 *   3.6  什么时候需要重新构建？
 *   ────────────────────────────
 *     ❌ 不需要重建：内容更新 — 在 Cursor 或网页里用配置管理器改完，
 *        推送到 GitHub，约 1 分钟内自动部署
 *
 *     ✅ 需要重建：更换 App 图标、改包名、加新原生功能、大版本升级
 *
 */


// ============================================================================
//
//   速查流程图
//
// ============================================================================
/**
 *
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                                                                       │
 *   │   首次部署（做一次，约 30 分钟）                                       │
 *   │                                                                       │
 *   │   ① Supabase: 建项目 → 跑 SQL → 部署函数                            │
 *   │   ② 托管平台: 关联 GitHub 仓库 → Vercel/Netlify/EdgeOne             │
 *   │   ③ GitHub: Fork 打包仓库 → 跑 Action → 下载 APK                    │
 *   │                                                                       │
 *   ├───────────────────────────────────────────────────────────────────────┤
 *   │                                                                       │
 *   │   内容和配置更新                                                      │
 *   │                                                                       │
 *   │   Cursor → ConfigManagerPage / taprootagrosetting/*.json / 聊天        │
 *   │     → 推送到 GitHub → Cloudflare Pages / Vercel / Netlify / EdgeOne   │
 *   │     → 所有用户（PWA + APK）约 1 分钟内自动更新                        │
 *   │                                                                       │
 *   │   就这么简单。在 Cursor 里改完推送一次，所有人都收到更新。              │
 *   │                                                                       │
 *   ├───────────────────────────────────────────────────────────────────────┤
 *   │                                                                       │
 *   │   代码更新（结构性改动、修复 bug）                                     │
 *   │                                                                       │
 *   │   Cursor → 推送到 GitHub → 同上 CDN 自动部署                          │
 *   │     → 所有用户（PWA + APK）约 1 分钟内自动更新                        │
 *   │                                                                       │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 */


// ============================================================================
//
//   常见问题
//
// ============================================================================
/**
 *
 *   问：我需要会写代码吗？
 *   答：不需要。网页或本地跑起来后，用内置 **配置管理器**（表单）即可；
 *      或在 Cursor 里用 Chat 说「把轮播标题改成…」再推送。
 *
 *   问：我需要编辑 JSON 文件吗？
 *   答：不必须。高级用户可在 Cursor 里改 taprootagrosetting/*.json 做批量修改。
 *
 *   问：内容更新怎么到达农户？
 *   答：在配置管理器保存（或在 Cursor 提交 JSON）→ 推送到 GitHub →
 *      Cloudflare Pages / Vercel 等自动构建 → 约 1 分钟后网站更新。
 *      农户下次打开就能看到。PWA 和 APK 内都一样。
 *
 *   问：Supabase 三种方案该选哪个？
 *   答：方案 A（官方云）：最快上手，免费版支持约 5 万月活。
 *      方案 B（自建服务器）：需要数据存在自己服务器上时选这个。
 *      方案 C（阿里云 PolarDB）：全托管免运维，不用管服务器。
 *      三种方案用同一套 API — 切换只需要改 URL 和 Key。
 *
 *   问：费用是多少？
 *   答：Supabase 官方云免费版：约 5 万月活用户。每月 $0。
 *      自建服务器：看配置，约 $10-30/月。
 *      阿里云 PolarDB：按量付费。
 *      Vercel / Cloudflare Pages 免费版：大多数应用够用。每月 $0。
 *      CDN：付费档约 $20 / 1TB（可覆盖约 300 万用户）。
 *
 *   问：多个人能同时用配置管理器吗？
 *   答：可以。任何知道密码 "taprootagro" 的人都能进入。
 *      系统有乐观锁机制防止冲突。
 *
 *   问：改错了怎么办？
 *   答：每次保存都自动创建备份。回滚方法：
 *      打开 Supabase SQL Editor → SELECT rollback_config(N);
 *      其中 N 是你想恢复到的版本号。
 *
 *   问：自建的 Supabase 怎么更新？
 *   答：SSH → cd supabase/docker → docker compose pull → docker compose up -d
 *      约 2 分钟完成，零停机。
 *
 */