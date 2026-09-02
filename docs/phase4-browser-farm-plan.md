# Phase 4 — 浏览器设备农场（farm）：统一 Selenium / Playwright 的会话编排与执行记录

> 基线：`f618eb9`（分支 `feat/run-case-stepped-verdicts-and-panel`），2026-08-31。
> 状态：**待评审**。本文是设计方案，不是执行清单；行号一律不引用，只引用文件路径。
> 前置阅读：`docs/phase3-automation-plan.md`（token / ingest / 幂等回执，本方案大量复用其决策）。

## 0. 一句话

参考 Selenoid：用户请求 → 平台按会话拉起一次性 Docker 浏览器容器 → 代理
Selenium（WebDriver/HTTP）与 Playwright（CDP/WebSocket）两种协议到**同一套 Chromium
镜像** → 平台自己以 CDP 第二客户端挂上去录制 network / console / 截图 → 会话与产物
落库，可在 web 端回看，并（后续）与执行台 / automation_executions 联动。

## 1. 目标与非目标

**目标（本 phase 交付）**

1. 一个新的独立服务 `apps/farm`：会话调度、Docker 容器编排、双协议数据面代理。
2. Selenium 用户改一行 remote URL、Playwright 用户改用 `connectOverCDP()`，即可把
   现有脚本跑在平台容器里，**两者共享同一浏览器镜像目录**。
3. 平台侧统一录制：网络请求（HAR）、console 日志、结束截图，落 R2，web 端可查。
4. 会话生命周期完整：配额、排队拒绝、空闲超时、最长寿命、孤儿容器回收、崩溃自愈。

**非目标（明确后置，见 §9 Phase E 与 §11）**

- Firefox / WebKit（Playwright 私有协议与原生浏览器不可合一，将来按分栈镜像提供）。
- 视频录制（Xvfb + ffmpeg sidecar）。
- Playwright `run-server` 版本矩阵、外部真实设备/浏览器节点注册、K8s Provider、
  farm 多副本。
- 平台生成 Playwright 官方格式 trace（那是客户端能力，平台只能收附件）。

## 2. 决策记录

- **D1 v1 只做 Chromium。**「一套浏览器喂两种协议」只有 Chromium 能干净做到：
  chromedriver 吃 WebDriver，同一个二进制暴露 CDP 吃 Playwright。Firefox 必须用
  Playwright 魔改构建才能被 Playwright 驱动，与 geckodriver 驱动的原生版无法合一，
  强行统一投入产出极差。
- **D2 Playwright 只支持 `connectOverCDP()`，且只支持 `ws://` 直连形态。**
  `run-server` 要求客户端/服务端 Playwright 版本严格一致，多租户下是版本矩阵地狱；
  CDP 协议足够稳定，客户端版本基本解耦。`ws://` 直连（而非 http 发现）让 farm 不必
  代理 `/json/version` 的 HTTP 发现步骤——升级握手时才拉容器。
- **D3 farm 是独立 app（`apps/farm`，端口 3002），不并入 `apps/server`。**
  理由：① 需要挂 `/var/run/docker.sock`，权限边界应与主 server 隔离；② 工作负载是
  长连接反向代理（WS 常驻 + HTTP 高频转发），与 CRUD API 的伸缩/超时模型不同；
  ③ 主 server 的 RealtimeBus 本就是单进程 EventEmitter，farm 并入也拿不到跨进程
  广播的好处。同 monorepo 复用 `packages/db` 仓储层与 `packages/api/src/auth/bearer.ts`。
- **D4 观测层挂在 CDP 上，属于平台，不属于测试框架。** farm 对每个会话再开一条
  CDP 连接（CDP 支持多客户端并连），Selenium 会话与 Playwright 会话产出**同一种
  记录格式、同一个回看 UI**。Selenium 用户免费获得它的框架根本没有的 trace 能力。
- **D5 单一自建镜像、双模式 entrypoint。** 镜像内锁死 chromium + 对应版本
  chromedriver。`MODE=webdriver` 起 chromedriver（:4444），`MODE=cdp` 直接起
  chromium `--headless=new --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0`。
  WebDriver 模式下 farm 向 capabilities 注入 `--remote-debugging-port=9222`，让
  recorder 也能挂上去。
- **D6 路由表在 farm 内存，生命周期与产物入 Postgres。** v1 farm 单副本，
  sessionId → 容器端点的映射不落库（避免每次转发查库）；DB 行是审计与 UI 数据源。
  farm 启动时对账：`running` 但容器已不存在的行标记 `failed(reason=orphaned)`。
- **D7 鉴权复用 `as_live_*` bearer token，不进 oRPC context。** 沿袭 phase3 的
  决策（bearer 故意不并入 `createContext`，见 `packages/api/src/context.ts` 的注释）：
  farm 与 `/ingest`、`/mcp` 同类，是机器调用方，直接调
  `packages/api/src/auth/bearer.ts` 的 `resolveUserFromBearer`。
  传递方式：WebDriver 放 `alwaysMatch["as:options"] = { token, projectId }`（转发
  上游前**剥除**，token 不得进入容器与 driver 日志）；CDP 放 URL 查询参数
  `?token=...&projectId=...`。
- **D8 v1 录制范围 = 网络事件 NDJSON→HAR + console NDJSON + 导航/收尾截图
  + 容器 stdout/stderr。** 事件先按 NDJSON 追加写本地临时文件（会话崩溃也保得住
  已录部分），finalize 时用纯函数组装 HAR。不引第三方 HAR 库（转换逻辑简单且要
  可测），录屏（视频）后置。细节见 §5.5。
- **D9 web UI 用 React Query `refetchInterval` 轮询，不扩 realtime 协议。**
  realtime bus 是主 server 进程内的，farm 的事件到不了它。会话列表 3s 轮询在 v1
  完全够用；将来要推送再评估 pg NOTIFY 桥接，届时才动
  `packages/api/src/realtime/protocol.ts` 的 `invalidateEntity` 枚举与 web 的
  `map-invalidate.ts`。
- **D10 容器端口用随机 host port 发布（HostConfig.PortBindings HostPort=0）。**
  macOS Docker Desktop 无法从宿主直连容器 IP，本地开发必须走端口发布；生产 Linux
  可直连容器 IP 省一跳。Provider 接口里把「会话端点」抽象成 `{ wdUrl, cdpUrl }`，
  两种模式都实现，env 开关。
- **D11 配额 v1 = 全局并发上限（env）+ 超限直接 503 拒绝（带 Retry-After），不排队。**
  排队意味着客户端超时语义变复杂（selenium 默认 new session 超时很短），先拒绝，
  排队与每项目配额列后置。
- **D12 产物存储复用 R2 附件通道。** farm 走
  `packages/api/src/lib/ingest/attachment-uploads.ts` 同一套 R2 写入（服务端直传，
  不经 presign 绕圈）；产物元数据落 `farm_session_artifacts` 表，不复用
  `test_run_attachments`（挂载点不同：那张表挂 run，这张挂 session）。
- **D13 LocalProvider：本地 Chrome 进程作为第二个 SlotProvider（`FARM_PROVIDER=local`）。**
  动机有二：无 Docker 的开发机也能起真会话；provider 之上的全链路（双协议代理、
  recorder、finalize、产物、UI）借此获得第一次真实 e2e。实现是 §12「租借-重置-归还」
  的单机退化版：每会话 spawn chromedriver（webdriver）或 Chrome（cdp），临时
  user-data-dir 即租约，杀进程树 + 删目录即归还。Docker 的容器 label 在这里的等价物是
  **槽位目录约定** `FARM_WORK_DIR/local-slots/<sessionId>/`（meta.json 记
  expires_at/pid）——farm 失忆后 reaper 靠扫目录照样回收，真相源在文件系统不在内存。
  随之而来的一个契约扩展：`AcquiredSlot.cdpDebugPort`。容器里 CDP 端口写死 9222 是
  因为每容器独享网络命名空间；本地多会话共享宿主端口空间，必须每槽位一个随机端口，
  能力注入（`--remote-debugging-port`）从槽位取值，DockerProvider 恒返 9222 保持不变。
  范围裁定：仅 Chrome（chromedriver 需与本地 Chrome 主版本匹配，缺失时报错给出安装
  指引）；Safari 因无 CDP（recorder 全瞎）、safaridriver 单会话、Playwright 驱动不了
  真 Safari，三条硬伤，仅在明确接受降级后才作为 webdriver-only 目录项接入，本期不做。
- **D14 实机节点全量落地：一切浏览器来源都是节点（见 §12，取代原预研）。**
  node-agent 出站 WS 单连接复用控制面与数据面（零入站端口，弃用 ssh/mTLS 远程
  daemon 路线），槽位后端复用抽包后的 LocalProvider/DockerProvider——Docker 不是
  独立通道，是节点的一种后端；farm 内建 provider 收编为伪节点，统一调度
  （`as:options.node` 钉选 + 利用率最低优先）。

## 3. 总体架构

```
 Selenium 客户端                Playwright 客户端
  RemoteWebDriver(               chromium.connectOverCDP(
   "http://farm:3002/wd/hub",     "ws://farm:3002/cdp?token=as_live_x&projectId=p1")
   caps + as:options)                    │
        │ HTTP (W3C WebDriver)           │ WebSocket (CDP)
        ▼                                ▼
┌─────────────────────────────── apps/farm (:3002) ───────────────────────────────┐
│  auth(bearer) → quota → scheduler                                               │
│     │                                                                           │
│     ├─ DockerProvider(dockerode) ── 创建/销毁容器，label as.farm.session=<id>    │
│     │                                                                           │
│  ┌──▼──────────── 每会话 ────────────────────────────────────────────┐          │
│  │  wd-proxy   : /wd/hub/session/{sid}/* → 容器:4444（重写 sessionId）│          │
│  │  cdp-proxy  : WS 双向管道 → 容器:9222/devtools/browser/<guid>      │          │
│  │  recorder   : 第二条 CDP 连接 → Network/Runtime/Page 事件 → NDJSON │          │
│  │  timers     : 空闲超时 / 最长寿命                                  │          │
│  └───────────────────────────────────────────────────────────────────┘          │
│  finalize: 停 recorder → NDJSON→HAR → 截图 → 上传 R2 → 落库 → 杀容器             │
│  reaper  : 周期扫 label 容器，杀过期/无主；启动时 DB 对账                         │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │ packages/db 仓储层（读写 farm_* 表）
                                    ▼
      Postgres ◄── packages/api farm 路由（控制面：列表/详情/杀会话/浏览器目录）
                        ▲
                   apps/web：会话列表（轮询）、会话详情（HAR 表格/console/截图）、
                             接入指南页（生成两种协议的连接示例代码）
```

每个容器一次性使用：一个会话 = 一个容器，结束即销毁，永无脏状态（Selenoid 的
核心遗产）。

## 4. 数据模型

新文件（全部走 `packages/db/src/schema/` + barrel `index.ts` 注册）：

**`schema/farm-enums.ts`**

- `farm_session_protocol = ["webdriver", "cdp"]`
- `farm_session_status = ["starting", "running", "finishing", "completed", "failed", "timed_out", "killed"]`
- `farm_artifact_kind = ["har", "console", "screenshot", "container_log", "client_trace"]`
  （`container_log` 为容器 stdout/stderr；`client_trace` 预留给用户补传的
  Playwright 官方 trace）

**`schema/farm-browsers.ts`** — 浏览器目录（Selenoid 的 browsers.json 进 DB，换来管理 UI）

| 列 | 说明 |
| --- | --- |
| id, browser(`chromium`), version(`"140"`) | 唯一约束 (browser, version) |
| image | 如 `automationstack-browser-chromium:140` |
| isDefault, enabled | 未指定版本时选 default |
| createdAt / updatedAt | |

**`schema/farm-sessions.ts`**

| 列 | 说明 |
| --- | --- |
| id (uuid) | 即对外的 platform sessionId |
| projectId → projects, userId → users, apiTokenId → api_tokens | 谁、以哪个 token、在哪个项目下开的 |
| protocol, browser, version, image | 快照，目录后续改动不影响历史 |
| status, statusReason | reason 如 `idle_timeout` / `orphaned` / `client_disconnect` |
| containerId | 审计 + 对账用 |
| requestedCapabilities jsonb | WebDriver 原始 caps（**剥除 token 后**存） |
| label | 客户端可选传入的人类可读名（`as:options.name`） |
| createdAt / startedAt / finishedAt | starting→running→终态 三个时间点 |

**`schema/farm-session-artifacts.ts`**

| 列 | 说明 |
| --- | --- |
| id, sessionId → farm_sessions | |
| kind, storageKey(R2), sizeBytes, contentType | |
| meta jsonb | 如 HAR 的 entry 数、截图尺寸 |

仓储层新增 `repositories/farm-browser-repository.ts`、`farm-session-repository.ts`、
`farm-session-artifact-repository.ts`——**farm 与 api 都只经仓储层碰库**（本仓铁律）。

迁移：`pnpm --filter @automationstack/db exec drizzle-kit generate` 产 `0014_*.sql`；
CI 不跑迁移，**本地必须手动 `exec drizzle-kit migrate`**，否则 farm 路由全 500。
项目未上线、无存量数据，迁移不需要回填。

## 5. `apps/farm` 服务设计

### 5.1 目录结构

```
apps/farm/
  src/
    index.ts              # Hono 入口：/wd/hub/*、/cdp(WS 升级)、/health
    config.ts             # env 解析（经 @automationstack/env 扩展）
    auth.ts               # 从 caps / query 提取 token → resolveUserFromBearer → 项目成员校验
    scheduler.ts          # 配额闸门 + 会话注册表（内存 Map<sessionId, LiveSession>）
    session.ts            # LiveSession 状态机 + 空闲/寿命计时器 + finalize
    provider/
      types.ts            # SlotProvider 接口：acquire(image)→{wdUrl?, cdpUrl, containerId}, release
      docker.ts           # dockerode 实现（D10 两种端点模式）
    wd/
      proxy.ts            # WebDriver 数据面：create-session 特殊处理 + 透明转发
      capabilities.ts     # as:options 提取/剥除、debugging-port 注入（纯函数，重点单测）
    cdp/
      proxy.ts            # WS 升级 → 拉容器 → 取 browser target guid → 双向管道
    recorder/
      client.ts           # 第二条 CDP 连接，Target.setAutoAttach 扁平模式跟踪页面
      sink.ts             # NDJSON 追加写（会话工作目录）
      har.ts              # NDJSON → HAR 1.2（纯函数，重点单测）
    finalize.ts           # 产物组装上传（复用 attachment-uploads 的 R2 客户端）+ 落库 + 杀容器
    reaper.ts             # 启动对账 + 周期孤儿扫描（docker label 过滤）
```

### 5.2 会话状态机

```
            acquire 失败/镜像不存在
starting ────────────────────────────▶ failed
   │ 容器 ready（探活通过）
   ▼
running ──空闲超时──▶ finishing ──▶ timed_out
   │  ──寿命上限──▶ finishing ──▶ timed_out
   │  ──客户端 DELETE session / WS 关闭──▶ finishing ──▶ completed
   │  ──控制面 kill──▶ finishing ──▶ killed
   ▼
finishing 分两段：
  ① 容器存活期收尾（限时 10s）：收尾截图 → container.logs() → 向上游转发
     DELETE（WebDriver）→ 停 recorder；
  ② **立刻 release 容器释放槽位**，之后才异步组 HAR / 上传 R2 / 落产物行。
容器回收永远不等网络上传——R2 抖动不得占用并发槽位；上传失败重试 3 次，最终
失败在 statusReason 补记 artifacts_upload_failed。整个 finishing 幂等：reaper
与正常路径可能并发进入，用内存状态 + DB 条件更新双保险。
```

计时器：`FARM_SESSION_IDLE_TIMEOUT_MS`（默认 120s；WebDriver 每次转发重置，CDP 以
WS 存活为准不设空闲）与 `FARM_SESSION_MAX_LIFETIME_MS`（默认 30min，两协议都有，
防挂死会话吃满配额）。

### 5.3 WebDriver 数据面

1. `POST /wd/hub/session`：解析 caps → `capabilities.ts` 提取并**剥除** `as:options`
   → 鉴权（token → 用户 → `projectId` 成员校验，复用 `project-scope` 逻辑）→ 配额
   → 选镜像（caps 的 `browserName`/`browserVersion` 对 farm_browsers 目录）→
   acquire 容器（MODE=webdriver）→ 探活 `GET /status` 直到 ready（上限 30s）→
   注入 `goog:chromeOptions.args += ["--remote-debugging-port=9222"]` 后向容器转发
   create-session → 拿到上游 sessionId → 生成平台 sessionId（即 DB 行 id）→
   **重写响应体中的 `value.sessionId`** 为平台 id → 启动 recorder（连容器 9222）。
2. 其余 `/wd/hub/session/{platformId}/**`：查内存注册表 → 重写路径为上游 sessionId
   → 透明转发（含二进制 body，如截图）→ 重置空闲计时器。未知 id 返回标准
   WebDriver `invalid session id` 错误体。
3. `DELETE /wd/hub/session/{platformId}`：先向上游转发 DELETE，再走 finalize。

客户端视角只改一行：

```python
driver = webdriver.Remote(
    command_executor="http://localhost:3002/wd/hub",
    options=opts)  # opts.set_capability("as:options", {"token": AS_TOKEN, "projectId": AS_PROJECT})
```

### 5.4 CDP 数据面

1. 客户端 `chromium.connectOverCDP("ws://localhost:3002/cdp?token=...&projectId=...&browser=chromium&version=140")`。
2. farm 在 WS 升级回调里：鉴权 → 配额 → acquire 容器（MODE=cdp）→ 请求容器
   `http://<endpoint>/json/version` 拿 `webSocketDebuggerUrl`（browser-level target
   guid）→ 与容器建立上游 WS → 双向逐帧管道（不解析、不改写 CDP 帧）→ 同时
   recorder 以第二条连接挂同一容器。
3. 客户端 WS 关闭（正常 `browser.close()` 或断线）即触发 finalize。

注意：升级握手必须在 CORS 中间件之前注册——本仓 `apps/server/src/index.ts` 已有
同样的注册顺序注释，farm 沿用同一模式。

### 5.5 Recorder：log / network 的具体抓法

**挂载与时序。** 容器 ready 后，recorder 请求容器 `http://<endpoint>:9222/json/version`
拿 `webSocketDebuggerUrl`，建立 browser-level CDP 连接（CDP 允许多客户端，与
chromedriver / Playwright 客户端互不干扰）。随后：

1. `Target.setAutoAttach({ autoAttach: true, flatten: true, waitForDebuggerOnStart: false })`
   —— 自动附着现有与后续所有 page / iframe / worker target，扁平协议下所有事件
   走同一条 WS，按 `sessionId` 分流；
2. 对每个附着 target 启用四个域：`Network.enable`、`Runtime.enable`、
   `Page.enable`、`Log.enable`。

关键时序：WebDriver 模式下浏览器由 chromedriver 在 create-session 期间才启动，
9222 在转发**之前**并不存在——正确顺序是「转发 create-session → 附着 recorder →
再向客户端返回响应」。客户端收到响应前发不出首个导航，因此不漏录。（实现期修正：
本文初稿把附着写在转发之前，那个时序做不到。）CDP 模式无此约束：先附着 recorder，
再放行客户端 WS 管道。

**网络（→ HAR）。** 四类事件按 requestId 关联：

| 事件 | 取什么 |
| --- | --- |
| `Network.requestWillBeSent` | url / method / headers / postData（截断 4KB）/ initiator / 时间戳；`redirectResponse` 存在时按 HAR 规范拆独立 entry |
| `Network.responseReceived` | status / headers / mimeType / `response.timing`（dns、connect、ssl、send、wait 各段） |
| `Network.loadingFinished` | `encodedDataLength`（传输字节数）、结束时间戳 → 总耗时 |
| `Network.loadingFailed` | `errorText`、是否 canceled → entry 标失败 |

响应体 v1 **不抓**：`Network.getResponseBody` 的 body 在 target 内存里，页面一跳
就没了，体积也不可控；HAR 只含头与计时，足够排查绝大多数问题。「按 content-type
白名单 + 大小上限抓小响应体」留作后续开关。`*ExtraInfo` 系列（原始头 / cookie
细节）v1 不订阅。

**log 三个来源。** 前两个走 CDP，第三个走 Docker：

- `Runtime.consoleAPICalled`：type + 参数（RemoteObject 只取 `value` /
  `description`，**不**递归拉取对象图）+ 栈顶帧 + 时间戳；
- `Runtime.exceptionThrown`（未捕获异常，含完整栈）与 `Log.entryAdded`
  （浏览器级条目：网络错误、安全告警、deprecation——console API 覆盖不到的部分）；
- 容器 stdout/stderr（chromedriver 与 chromium 自身日志）：finalize 时
  `container.logs()` 一次性拉取，存为 `container_log` 产物。浏览器崩溃类问题
  主要靠它定位。

**时间轴锚点与截图。** 主 frame 的 `Page.frameNavigated` 记入事件流：既作 HAR 的
pages 分段，也给 console 流做上下文分隔。每次主 frame 导航触发一张
`Page.captureScreenshot`（节流 ≥2s、每会话上限 20 张），会话结束前再补一张收尾图
（WebDriver 的 DELETE session 在**转发上游之前**截；CDP 模式 `browser.close()` 时
浏览器已在退出、收尾图可能拿不到，靠导航截图兜底）——v1 没有视频，但由此得到一条
穷人版 filmstrip。

**落盘与产物。** 每个事件经归一化层（每事件类型一个纯函数，只挑上表字段，防超大
header 撑爆磁盘）→ 追加写 `FARM_WORK_DIR/<sessionId>/events.ndjson`。finalize：
NDJSON → `har.ts` 纯函数组装 HAR 1.2 → `har.json` / `console.ndjson` / 截图若干 /
`container.log` 上传 R2 → `farm_session_artifacts` 落行 → 删本地目录。

**故障语义。** recorder 断线不杀会话——观测挂了不影响执行；重连一次，仍失败则
statusReason 记 `recorder_detached`，产物标注不完整。反向亦然：会话被杀时，已录的
NDJSON 照常 finalize，半程记录也上传。

**为什么不用客户端侧方案。** Selenium 的 `goog:loggingPrefs` performance log 是
chromedriver 专属且需用户脚本主动开启，Playwright 路径没有对应物；平台侧 CDP
recorder 对两种协议一视同仁、用户零改动——这正是 D4 的意义。

### 5.6 容器编排与回收

- dockerode 连 `FARM_DOCKER_HOST` 指定的 daemon：本地 socket 路径（默认）、
  `ssh://user@host`（推荐的远程形态，B 机不暴露任何 Docker 端口）或
  `tcp://host:2376` + 双向 TLS（**严禁**明文 2375，Docker API 即宿主 root）。
  daemon 在哪台机器、镜像就构建/加载在哪台。farm 与 daemon 分离部署（farm 在 A、
  容器全在 B）时走 published-port + `FARM_ADVERTISE_HOST=<B 内网 IP>`；注意 A↔B
  延迟会进每条 WebDriver 命令（协议啰嗦，逐命令 HTTP 往返），要求同机房/同 VPC。
  多台执行机的近期路径是静态 daemon 列表 + 挑最闲调度（纯配置扩展），远期是
  Phase E 的节点 agent 注册——都收敛在 SlotProvider 接口后面。
- 容器统一打 label：`as.farm.session=<sessionId>`、`as.farm.managed=true`、
  `as.farm.expires_at=<epoch 秒（创建时刻 + 最长寿命）>`。reaper 判杀**只凭
  label**，不依赖内存注册表或 DB 可用——farm 内存丢了、DB 挂了，过期容器照收。
- 资源限制：`--shm-size=2g`（Chromium 硬需求）、内存/CPU 上限 env 可配。
- reaper 每 60s：`docker ps --filter label=as.farm.managed` 与内存注册表比对，
  杀「有容器无注册」的孤儿；farm 启动时反向对账 DB（§2 D6）。
- 关停（SIGTERM）：停止接受新会话 → 给存量会话 10s 走 finalize → 强杀余量。
  模式抄 `apps/server/src/jobs/boss.ts` 的优雅关停写法。

## 6. 浏览器镜像

`docker/browsers/chromium/`（新目录，进主仓）：

- `Dockerfile`：debian-slim + 固定版本 chromium + 严格同版本 chromedriver +
  字体（CJK 必装，测试对象是中文产品）+ 非 root 用户。
- `entrypoint.sh`：`MODE=webdriver` → `chromedriver --port=4444 --allowed-ips= --allowed-origins=*`；
  `MODE=cdp` → `chromium --headless=new --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 ...`。
- tag 约定 `automationstack-browser-chromium:<major>`，与 farm_browsers.image 对应；
  构建脚本进 `scripts/build-browser-images.sh`，v1 手动构建，不进 CI。

已评估未采用：`selenium/standalone-chrome`（拖整套 Grid，CDP 暴露别扭）、
`selenoid/vnc_chrome`（版本陈旧）。自建镜像 30 行以内，可控性完胜。

## 7. 控制面：packages/api 路由 + web UI

**`packages/api/src/routers/farm.ts`**（拆 `farm-browsers.ts` / `farm-sessions.ts`
两个 Procedures 对象合并，沿 testRuns 的拆分惯例）：

- `farm.sessions.list`（项目内，分页 + 状态过滤，`requireProjectMember`）
- `farm.sessions.get`（含 artifacts 清单与下载 URL）
- `farm.sessions.kill`（控制面强杀：置 DB 意向标记，farm 的 reaper 下一拍执行——
  控制面与 farm 是两个进程，不直接互调；v1 接受 ≤60s 延迟，后续要即时再加内网
  HTTP 通道）
- `farm.browsers.list / create / update / remove`（目录管理，`adminProcedure`）

**apps/web 新增**：

- `routes/projects/$projectId/sessions/index.tsx` — 会话列表，运行中的行 3s 轮询；
  列：状态、协议、浏览器、发起人、时长、label。
- `routes/projects/$projectId/sessions/$sessionId.tsx` — 详情：基本信息 + 网络请求
  表格（HAR 解析渲染：方法/URL/状态/耗时/大小，失败行标红）+ console 流（复用
  执行台事件流的展示组件风格）+ 截图 + 产物下载。
- 接入指南页（挂在项目设置或 sessions 页内）：按当前用户 token 生成 Selenium
  （Python/Java/Node）与 Playwright 三段可复制示例。**照抄 agent-setup 的既有做法**
  （`agent-setup-panel.tsx` + md 模板 + 占位符替换），不要另起一套文档渲染。

## 8. 配置与部署变更

- `packages/env`：`FARM_PORT=3002`、`FARM_DOCKER_HOST`、`FARM_ADVERTISE_HOST`、`FARM_WORK_DIR`、
  `FARM_MAX_SESSIONS=8`、`FARM_SESSION_IDLE_TIMEOUT_MS`、`FARM_SESSION_MAX_LIFETIME_MS`、
  `FARM_ENDPOINT_MODE=published-port|container-ip`；web 侧 `VITE_FARM_URL`
  （接入指南展示用，注意它与 `VITE_SERVER_URL` 一样是**构建期烘焙**，compose 与
  `.github/workflows/ci.yml` 要同步）。`.env.example` 同步。
- `docker-compose.yml`：新增 `farm` 服务（`apps/farm/Dockerfile`，挂
  `/var/run/docker.sock`，depends_on postgres healthy，3002 发布到宿主供测试脚本
  连接）。farm 起的浏览器容器是 **compose 之外的 sibling 裸容器**（走宿主 socket
  由宿主 daemon 创建；不用 DinD——要 privileged、镜像缓存独立，明确不采用）。
  两个推论：① 浏览器镜像存在于**宿主** daemon，构建脚本是宿主侧部署步骤；
  ② 挂 socket 等于宿主 root 等价权限，这是 D3 里 farm 独立于主 server 的原因之一。
- 网络按部署形态二选一（即 `FARM_ENDPOINT_MODE`）：**容器化部署**时浏览器容器挂进
  compose 网络（新 env `FARM_DOCKER_NETWORK`），farm 走容器 IP 直连 4444/9222，
  浏览器容器不发布宿主端口；**本地开发**（farm `pnpm dev` 跑宿主，macOS 连不通
  容器 IP）时浏览器容器发布随机宿主端口，farm 连 localhost。published-port 是
  本地开发专用妥协，不是生产路径。
- 本地开发：`dev:farm` script + turbo task；Postgres 是 Homebrew 起的（不是
  compose），farm 只需 Docker Desktop 在跑。
- **无 Docker 的本地开发**（D13）：`FARM_PROVIDER=local` 直接 spawn 本地 Chrome，
  相关 env：`FARM_PROVIDER=docker|local`（默认 docker）、`FARM_CHROME_BIN`（默认按
  平台探测）、`FARM_CHROMEDRIVER_BIN`（默认查 PATH，仅 webdriver 模式需要，主版本须
  与 Chrome 匹配）、`FARM_LOCAL_HEADLESS`（默认 true；设 false 有头跑，可旁观脚本
  执行，这是 local 模式独有的调试甜头）。

## 9. 实施阶段与验收

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| **A 骨架 + WebDriver 通** | schema/迁移/仓储、farm 服务骨架、chromium 镜像、DockerProvider、WebDriver 数据面、超时与 reaper | `examples/farm-selenium/`（selenium-webdriver Node 脚本）经 farm 全程跑通并正常退出；会话行状态流转正确；kill -9 farm 后重启，孤儿容器与 DB 行均被收敛 |
| **B CDP 通** | WS 升级路径、cdp-proxy、两协议统一进 scheduler | `examples/farm-playwright/` 用 `connectOverCDP` 跑通；同一镜像同时服务 A/B 两个 example；并发超 `FARM_MAX_SESSIONS` 时第 N+1 个会话拿到 503 |
| **C 录制 + UI** | recorder、HAR 组装、R2 上传、farm 路由、会话列表/详情页、接入指南页 | 任一协议跑完的会话，详情页能看到网络表格、console、截图；HAR 下载可被 Chrome DevTools 导入 |
| **D 平台联动 + 管理** | `as:options.executionId` 关联 `automation_executions`（报告页从用例跳会话录制）、浏览器目录管理 UI、每项目并发配额列 | SDK 上报的一次自动化执行，能从执行台点进对应 farm 会话回放 |
| **E 后置项** | 视频（Xvfb+ffmpeg）、Firefox/WebKit 分栈镜像、外部节点注册（SlotProvider 第二实现）、pg NOTIFY 推送、多副本 | 各自单独立项，不在本文展开 |

A、B、C 各自独立可合并、可演示；D 开始碰 phase2/3 的存量领域，届时单独出细化计划。

## 10. 测试策略

- **纯函数重点单测**（vitest，与本仓 `lib/` 的惯例一致）：`capabilities.ts`
  （as:options 提取/剥除/args 注入的各种 caps 形状）、`har.ts`（NDJSON→HAR，含
  乱序/丢帧事件）、会话状态机（非法迁移拒绝、finalize 幂等）。
- **Provider 接口注入假实现**：scheduler / session 生命周期测试不碰真 Docker。
- **e2e 走 examples/**：两个 example 脚本即冒烟测试，本地手跑；CI 不跑（需要
  docker socket 与镜像构建，成本先不背，`/health` 级别的启动测试可进 CI）。

## 11. 风险与遗留问题

1. **`--remote-debugging-address=0.0.0.0` 仅 headless 可用**；将来上 Xvfb 有头模式
   录视频时，需容器内 socat 把 0.0.0.0:9222 转发到 127.0.0.1——镜像 entrypoint 预留。
2. **chromedriver 对未知端口占用的竞态**：注入固定 9222 端口在单会话单容器模型下
   无冲突，但若将来一容器多会话（不计划做），此设计作废。
3. **WebDriver 响应体中除 create-session 外也可能出现 sessionId**（个别客户端读
   `capabilities` 回显）——v1 只重写 create-session 响应，遇到兼容性问题再扩。
4. **farm 单副本是明确的单点**：会话是短命资源，farm 崩溃 = 存量会话报废（可接受，
   reaper 自愈），但期间不能开新会话。多副本需要路由表外置（Redis 或 DB 心跳），
   与 realtime bus 的单进程问题同属一次「水平扩展」立项。
5. **配额被同项目多 token 摊薄的公平性**、**排队**：v1 不做，观察真实使用再说。
6. **执行台联动的归属语义**（一个 farm 会话对应一批 case 还是一条 case）：Phase D
   前必须先定，倾向「会话 ↔ automation_execution 多对一，粒度对齐 SDK 的一次上报」。


## 12. 实机节点（外部执行机）设计（D14，已落地）

> 本节从「预研」升格为正式设计。统一模型一句话：**一切浏览器来源都是节点**——
> 节点上既可 spawn 本机 Chrome（LocalProvider 后端），也可调本机 Docker 起容器
> （DockerProvider 后端）；farm 本机的内建 provider 收编为「伪节点」参与同一套
> 调度。会话状态机、双协议代理、recorder、finalize、配额**原样复用**：观测层
> 只依赖「一个 CDP 端点」，这是 SlotProvider 抽象的全部意义。

**连接模型：一条出站 WS，控制面+数据面复用。** 节点跑 `apps/node-agent`，
**主动外连** `wss://farm/nodes/connect`——节点零入站端口、零公网暴露，NAT /
办公网内可用，明确**不用** ssh/公钥、不用 docker tcp+mTLS（`parseDockerHost`
的 tcp 分支保留为「明确连不上」的哨兵）。线协议在
`packages/farm-node-protocol`：二进制帧（1 字节帧型 + 4 字节 streamId），
CONTROL 帧承载 zod 校验的 JSON（hello/heartbeat/call/result/openStream），
DATA/STREAM_CLOSE 帧做字节管道。**数据面隧道**：farm 侧 NodeProvider 为每个
槽位起本机回环监听转进隧道，`AcquiredSlot` 返回的仍是 `http://127.0.0.1:*`
——SlotProvider 契约一字不改，上层无感知。

**槽位后端复用。** provider 实现抽为 `packages/browser-slots`，farm（内建）与
node-agent（远端）用同一份 LocalProvider/DockerProvider 代码；「槽位目录即
label」的对账约定（D13）在节点上原样成立，agent 重启时无条件清扫本地槽位
（旧 agent 死则隧道必死，存量槽位必为孤儿）。

**注册与鉴权。** 新表 `farm_nodes`（name 唯一、token 哈希沿 api_tokens 模式、
backend=local|docker、maxSlots、enabled、last_seen_at）；节点 token 前缀
`as_node_`，创建/轮换时明文只显示一次。管理页（admin）建节点、看在线状态
（心跳 30s 落 last_seen_at，90s 判 offline）、启停、轮换、删除。

**调度。** 候选源 = 内建伪节点（容量 FARM_MAX_SESSIONS）+ 在线且 enabled 的
节点；`as:options.node`（节点名）钉选，否则按利用率最低挑，平局取内建。
全满维持既有 503 语义。

**超时与失联。** 两级各自强制：agent 本地计时（网络分区自救）+ farm 租约 TTL
（reaper 经 RPC 聚合各节点 listManaged，套用同一套过期/孤儿逻辑）。WS 断开 →
该节点 running 会话立即判 `failed(reason=node_lost)`（数据面隧道已随连接死，
不存在"还活着"的会话）；agent 重连后先本地清扫再报到。复位失败的槽位标
quarantined 退出调度——绝不归还脏槽位。

**后置项。** farm_browsers 目录与节点能力（browser+version 上报）的归一匹配、
移动端真机（Appium 系）、多 farm 副本（对账按实例分片）。

### 12.9 落地状态（2026-09-01）

全链路已实现并通过真机 e2e（backend=local，farm 与 node-agent 同机）：协议包
`farm-node-protocol`（帧/控制/RPC/mux，55 测）、槽位包 `browser-slots`（自 farm
抽出）、`apps/node-agent`（出站 WS、启动无条件清扫、心跳 30s、断线先释放槽位）、
farm 侧 `/nodes/connect` + CompositeProvider（内建伪节点保留名 `local`、
`as:options.node` 点名、占用率最低选源、平局归内建、node_lost 无宽限）、管理面
`farm.nodes.*` + `/nodes` 页（token 一次性展示、保留名拒收、backend 不可改）。
e2e 逼出的关键修复：`local-runtime` 收尸轮询定时器 `unref()` 导致清扫路径上
进程静默退出（致命）；源码直出包 src/ 下 `.js` 编译产物会被 vitest 优先解析
造成假绿（已加 `.gitignore` 护栏）。

仍未验证/待办：docker 后端真机路径（本机无 Docker）、90s 心跳过期判离线的
墙钟路径、node-agent 守护进程方案（launchd/systemd）、readiness 探活经隧道
产生的 WARN 日志噪音、AcquireSlotInput 直带 browserName/browserVersion 以
消灭 image 字符串反解。

### 12.10 能力统一（2026-09-01，已落地）

模型转向：**节点是主体，浏览器是节点上报的能力**。hello 携带 `capabilities`
（browser-slots 的 detect-browsers 真机探测：chromium 系带版本，Safari 探到但
`available:false` 引 D13）；`detectCapabilities` RPC 支持重探（web 节点页按钮 →
`refresh_requested_at` 标志位 → reaper 消费）。能力落库（farm_nodes.capabilities
jsonb，迁移 0016）仅供展示，调度判据是内存注册表活值。调度先按能力筛源再按
占用率：local 源对自报能力匹配（家族等价 chrome/chromium/edge→chromium、
latest 通配、版本前缀），docker 源以镜像库（原「浏览器」页，已降级改述）为真相
并从中取 image（协议 image 已放宽可空，local 源传 null）；内建伪节点同样自报
（local 探测 / docker 引目录）。两句人话错误：点名源不满足、全网无源满足。

待办：docker 源筛选恒真（未拉镜像的机器靠 acquire 失败兜底）、内建能力只在
启动探一次、重探消费无退避、版本无 >=/择优语义。
