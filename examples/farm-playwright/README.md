# Playwright × 浏览器设备农场

Playwright 这边的接法是 `connectOverCDP()`：

```js
const browser = await chromium.connectOverCDP(
  "ws://localhost:3002/cdp?token=as_live_xxx&projectId=<uuid>&browser=chromium"
);
```

浏览器跑在平台按会话拉起的一次性容器里，你本机不需要装任何浏览器
（所以这份示例依赖的是 `playwright-core` 而不是 `playwright`——后者的
install 会去下载一整套浏览器，而这里一个都用不上）。

## 为什么是 CDP 而不是 `connect()`

`connect()` 走 Playwright 的 `run-server`，要求**客户端与服务端 Playwright 版本
严格一致**。多租户下那是一个版本矩阵地狱：平台升一次，所有人跟着升。
CDP 协议稳定得多，你这边升级 Playwright 基本不需要平台跟着动。

代价说清楚：CDP 路线只支持 Chromium（Firefox / WebKit 的 Playwright 驱动是私有
协议，没法和原生浏览器合一），平台侧也拿不到 Playwright 官方格式的 trace——
平台自己录的是网络（HAR）、console 和截图，两种协议的用户看到的是同一套记录。

## 跑起来

前提：

1. farm 服务在跑（本地 `pnpm dev:farm`，或 `docker compose up farm`）；
2. farm 所连的 Docker daemon 上已经有浏览器镜像：`scripts/build-browser-images.sh`；
3. 手里有项目 API token（`as_live_` 开头）与项目 ID——接入指南页能直接抄。

```bash
cp .env.example .env    # 填 AS_TOKEN / AS_PROJECT
pnpm install
pnpm --filter @automationstack/example-farm-playwright start
```

跑通的输出是一行 `✅ 标题断言通过：Example Domain`。

## 没有 Docker？用本机 Chrome

farm 侧设 `FARM_PROVIDER=local`，会话就跑在本机的一次性 Chrome profile 上，不要镜像、
不要 daemon，也**不要 chromedriver**（那是 WebDriver 那条路径才用的东西）。
脚本这边一个字都不用改；想亲眼看见窗口就再加 `FARM_LOCAL_HEADLESS=false`。

## 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `AS_TOKEN` | 是 | 项目 API token |
| `AS_PROJECT` | 是 | 项目 ID（uuid），token 的主人必须是该项目成员 |
| `AS_FARM_CDP_URL` | 否 | farm 的 CDP 端点，默认 `ws://localhost:3002/cdp`（注意是 `ws://`，不是 `http://`） |
| `AS_NODE` | 否 | 点名跑在哪台执行机（实机节点）上，填节点名；`local` = 平台本机的内建来源。留空 = 平台自己挑；点不中会明确报错，不会悄悄换一台 |

## 几件容易踩的事

- **地址是 `ws://` 直连形态**，不是 `http://` 的发现形态：平台在 WS 升级的那一刻
  才去拉容器，没有可供 `GET /json/version` 探问的常驻浏览器。
- **复用默认 context。** `browser.contexts()[0]` 就是容器里那个现成的上下文；
  `newContext()` 也能用，只是会在同一个会话里多开一个 incognito 上下文，
  录制看起来会混在一起。
- **`browser.close()`（或直接断开）是会话结束的信号**，平台据此收尾录制并销毁容器。
- **并发超上限（`FARM_MAX_SESSIONS`，默认 8）时握手会被拒**，不排队。
