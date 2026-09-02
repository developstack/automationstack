# Selenium × 浏览器设备农场

这份示例回答一个问题：**已有的 Selenium 脚本，要改多少才能跑在平台的浏览器里？**

答案是一行 remote URL，外加一个装 token 的 capability：

```js
const options = new chrome.Options();
options.set("as:options", { token: AS_TOKEN, projectId: AS_PROJECT });

const driver = await new Builder()
  .forBrowser(Browser.CHROME)
  .usingServer("http://localhost:3002/wd/hub") // ← 只有这一行是新的
  .setChromeOptions(options)
  .build();
```

浏览器不在你机器上跑，也不需要你装 chromedriver：平台按会话拉起一个一次性
Docker 容器，跑完即毁，**永无脏 profile**。

## 跑起来

前提：

1. 平台的 farm 服务在跑（本地 `pnpm dev:farm`，或 `docker compose up farm`）；
2. farm 所连的 Docker daemon 上已经有浏览器镜像：`scripts/build-browser-images.sh`；
3. 手里有一个项目 API token（`as_live_` 开头）和项目 ID——接入指南页能直接抄。

```bash
cp .env.example .env    # 填 AS_TOKEN / AS_PROJECT
pnpm install
pnpm --filter @automationstack/example-farm-selenium start
```

跑通的输出是一行 `✅ 标题断言通过：Example Domain`。

## 没有 Docker？用本机 Chrome

farm 侧设 `FARM_PROVIDER=local`，会话就跑在本机的一次性 Chrome profile 上，不要镜像、
不要 daemon；WebDriver 这条路径还需要一个与本机 Chrome **同主版本**的 chromedriver
（`brew install --cask chromedriver`，装在别处就用 `FARM_CHROMEDRIVER_BIN` 指过去）。
脚本这边一个字都不用改；想亲眼看见窗口就再加 `FARM_LOCAL_HEADLESS=false`。

## 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `AS_TOKEN` | 是 | 项目 API token，同时决定「你是谁」与「在哪个项目下」 |
| `AS_PROJECT` | 是 | 项目 ID（uuid），token 的主人必须是该项目成员 |
| `AS_FARM_URL` | 否 | farm 的 WebDriver 端点，默认 `http://localhost:3002/wd/hub` |
| `AS_NODE` | 否 | 点名跑在哪台执行机（实机节点）上，填节点名；`local` = 平台本机的内建来源。留空 = 平台自己挑；点不中会明确报错，不会悄悄换一台 |

## 几件容易踩的事

- **`as:options` 不会进容器。** farm 在转发给上游 chromedriver 之前把它整个剥掉，
  token 不落进容器环境、也不进 driver 日志。
- **别自己设 `--remote-debugging-port` 之类的启动参数。** 平台要用那个端口挂录制，
  它会自己注入；你再设一遍只会撞车。
- **`driver.quit()` 要走到。** 它对应 WebDriver 的 `DELETE session`，是平台收尾录制、
  销毁容器、释放并发槽位的信号。漏了也不会永远占着——空闲超时会兜底，
  但要等满 `FARM_SESSION_IDLE_TIMEOUT_MS`（默认两分钟）。
- **并发超上限会被拒。** 全局并发满了（`FARM_MAX_SESSIONS`，默认 8）时，
  新会话拿到的是 `503` + `Retry-After`，不排队——排队会让 selenium 那个很短的
  new-session 超时语义变得难以预期。
