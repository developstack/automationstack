# node-agent —— 浏览器农场的实机节点守护进程

把一台**普通电脑**（你的 Mac、机房里的一台 Linux、办公室角落那台旧主机）接进浏览器农场，
让平台可以在它上面开浏览器、跑会话。

它是什么形状，一句话：**一个出站 WebSocket 壳，里面装着 `@automationstack/browser-slots`。**
节点**不监听任何端口**——连接永远由节点主动发起，平台要用浏览器的哪个端口，就在这条已建立的
连接上开一条流（隧道），agent 在本机 `127.0.0.1` 上把它接到浏览器。所以：

- 执行机不需要公网 IP，不需要端口映射，不需要在防火墙上开洞；
- 执行机只需要能**出网**访问平台地址（一条 443 的 WebSocket 就够）；
- 平台永远连不到执行机上除浏览器之外的任何东西。

---

## 一、在那台机器上要装什么

只有两条路，选一条。

### 路线 A：拷一个产物过去（推荐，执行机上不用装 pnpm、不用有仓库）

在**开发机**上打包：

```bash
pnpm install
pnpm --filter node-agent build
# 产物：apps/node-agent/dist/index.mjs（约 350 KB，单文件）
```

产物里已经打进了 workspace 内的包（browser-slots / farm-node-protocol / env）以及
`ws`、`zod`。**唯一打不进去的是 `dockerode`**：它经 ssh2 依赖一个原生 `.node`
文件，打包器解析不了。所以执行机上要这样摆：

```bash
mkdir node-agent && cd node-agent
cp .../apps/node-agent/dist/index.mjs .
npm install dockerode@4.0.12      # 产物唯一的外部依赖，local-only 的节点也要装
node -v                           # v22 或更高（本仓库开发用 24）
node index.mjs
```

> `dockerode` 即使你只打算用 local 后端也得装：能力探测本身要 import 它。
> 不想在执行机上跑 npm，就把开发机上装好的 `node_modules/` 一起拷过去。

### 路线 B：在执行机上直接跑仓库

需要 Node.js ≥ 22 与 pnpm 11：

```bash
corepack enable && corepack prepare pnpm@11.17.0 --activate
git clone <仓库地址> && cd automationstack
pnpm install
pnpm --filter node-agent dev     # 或 build 之后 pnpm --filter node-agent start
```

### 浏览器本身

agent 不负责装浏览器，它只负责**启动**浏览器。所以这台机器上还得有：

- **local 后端**（直接在这台机器上起进程）：装好 Chrome 或 Chromium；
  如果要跑 webdriver 模式的会话，再装一个 `chromedriver`。
  两者都可以留给 agent 自动探测，探不到再用 `NODE_AGENT_CHROME_BIN` /
  `NODE_AGENT_CHROMEDRIVER_BIN` 指路。
- **docker 后端**（每个会话一个容器）：装好 Docker，并让当前用户能访问
  `/var/run/docker.sock`（Linux 上通常是把用户加进 `docker` 组）。
  浏览器镜像要**事先在这台机器上准备好**（见文末「已知契约缺口」第 2 条）。

---

## 二、在平台上把这个节点登记出来

1. 用管理员账号打开平台，进 **「节点」** 页（`/nodes`）。
2. 新建节点，填：
   - **名字**：写得能认出是哪台机器（`mac-mini-办公室`、`ci-linux-01`）。全平台唯一。
   - **后端**：`local` 还是 `docker`。**这一项必须和那台机器的真实情况一致**——
     登记成 docker 但机器上没有可用的 daemon，agent 握手之后会立刻报错退出（见下）。
   - **槽位上限**：这台机器最多同时跑几个浏览器。
3. 保存之后页面会显示一串 `as_node_…` 的凭据，**只显示这一次**（库里只存哈希）。
   现在就把它拷走。丢了就删掉这个节点重建一个。

---

## 三、配置

在执行机上，agent 启动时会读**当前工作目录**的 `.env`（也可以直接用真正的环境变量，
systemd / launchd 场景推荐后者）。最少三行：

```bash
NODE_AGENT_FARM_URL=https://farm.example.com
NODE_AGENT_TOKEN=as_node_xxxxxxxxxxxxxxxxxxxxxxxx
NODE_AGENT_WORK_DIR=/var/lib/automationstack-node-agent   # 可省，默认走系统临时目录
```

`NODE_AGENT_FARM_URL` 填的是**你在浏览器里访问平台用的那个 http(s) 地址**，
agent 自己把它转成 `ws(s)://…/nodes/connect`——不用你手写 ws。
⚠️ 生产环境必须是 `https`：节点凭据的明文在握手第一帧里，明文 `ws` 等于把它发在网上。

全部变量与各自的默认值见同目录的 [`.env.example`](./.env.example)。

---

## 四、启动，以及怎么看出「连上了」

```bash
node index.mjs          # 路线 A
# 或 pnpm --filter node-agent start   # 路线 B
```

一次正常的启动，日志长这样（时间戳与 `[node-agent]` 前缀省略）：

```
node-agent 0.1.0 启动，平台入口 wss://farm.example.com/nodes/connect
本机可用后端：local、docker
启动清扫：local 后端没有存量槽位
已接入平台：节点 mac-mini-办公室（0b1e…），后端 local，槽位上限 4
```

**最后那行 `已接入平台：…` 就是「连上了」的判据。** 出现它之后：

- 平台的节点页会把这台机器画成在线（心跳每 30 秒一拍，平台按 90 秒的窗口判离线，
  也就是允许连丢三拍）；
- 这台机器开始接受调度，可以被分配会话。

启动清扫那两行也值得看一眼：agent **每次启动都会无条件清掉本机的存量槽位**。
理由是——上一个 agent 已经死了，隧道跟着死了，那些槽位在平台眼里早就不存在了，
留在本机的只能是孤儿。所以看到「清掉 N 个孤儿槽位」不是出问题，是在收拾上次的残局。

### 几种常见的失败，以及它们意味着什么

| 日志 | 意思 | 怎么办 |
| --- | --- | --- |
| `平台拒绝握手：…` 然后**退出（码 1）** | 平台**看过凭据之后**拒的：token 不对、节点被停用、版本太老 | 重连没有意义，按提示改配置或在平台上重建节点 |
| `此节点在平台上登记为 docker 后端，但本机探测不到 Docker daemon…` 然后退出 | 平台登记的后端和这台机器的真实能力对不上 | 要么在这台机器上把 Docker 弄可用，要么把平台上这个节点改成 `local` |
| `连接失败…，1500ms 后重连（第 2 次）` | **网络**层面的失败（平台没起来、断网、反代 502） | 不用管，agent 会自己指数退避重连（上限 30 秒一次），网络一好就自动接回来 |
| `连接本机 127.0.0.1:9222 失败（流 …）` | 平台想用某个浏览器端口，但它已经没了（浏览器崩了） | 通常伴随会话失败；看该会话的日志 |

### 停止

`Ctrl-C` 或 `kill`（SIGINT / SIGTERM）：agent 会**先把本机所有活动槽位释放掉**再退出，
看到 `已停止` 或 `已停止，槽位已全部释放`（取决于信号到的时候它是在连着还是在等重连）
就是干净收尾了。再按一次会立刻硬退——那一次不保证槽位收干净，留下的浏览器进程要自己清。

同样的释放动作在**断线**时也会做一次：连接一断，那些会话在平台那边立刻会被判 `node_lost`，
本机再留着浏览器进程纯粹是泄漏。

### 让它开机自启

agent 自己不做守护（不 fork、不写 pidfile）：这种事交给系统的服务管理器最省心。
Linux 上写一个 systemd unit（`Restart=always`、`Environment=NODE_AGENT_*`），
macOS 上写一个 launchd plist（`KeepAlive`）即可。进程退出码的含义：
`0` = 正常停止，`1` = 不可重试的失败（凭据/后端/配置问题，**别自动重启，先看日志**）。

---

## 五、这个进程在本机上到底动了什么

- **网络**：只有一条出站 WebSocket 到平台；本机 `127.0.0.1` 上的连接（连浏览器）由它发起。
  **不监听任何端口。**
- **磁盘**：只写 `NODE_AGENT_WORK_DIR` 下面的东西（浏览器 profile、槽位元数据、日志）。
- **进程**：local 后端下起 Chrome/chromedriver；docker 后端下起容器。
  两者都登记在句柄表里，释放/到期/断线/关停时统一收掉。

---

## 六、已知契约缺口

前两条已经在包里修掉了（下面留着，是因为它们解释了现在的形状为什么是这样）：

1. ~~`browser-slots` 的报错文案硬编码 `FARM_*` 变量名~~ **已修**。
   变量名现在由调用方给：`LocalSlotProviderOptions.binaryEnvNames`
   （`BinaryEnvNames`）一路传到 `resolveChromeBinary` /
   `resolveChromedriverBinary` 的错误文案里。farm 传 `FARM_*`，本 agent 在
   `src/provider-factory.ts` 传 `NODE_AGENT_*`。包里**不给默认值**：默认值会把
   「多半是错的那个名字」重新变成真相源。agent 侧原先那个字符串替换补丁
   （`rewriteBinaryHint`）已删。

2. ~~协议的 `acquire` 参数里没有 `image`~~ **已修**。
   `acquireParams` 现在有必填的 `image`，farm 从库里的 `farm_browsers.image`
   原样透传，节点**原样交给 docker 后端**（`src/slot-table.ts`），local 后端按契约
   忽略它。节点这边原先那个按命名约定拼镜像名的 `imageForBrowser` 已删——
   真相已经下发，再留一份猜测就是第二真相源。

3. **孤儿槽位的日志读不出来。**
   `readLogs` 只挂在 `AcquiredSlot` 句柄上，`SlotProvider` 没有 `readLogsById`。
   于是上一个 agent 留下的槽位，日志在被清扫掉之前也没人能读。
   当前的缓解是启动时无条件清扫（反正那些槽位已经没用了），代价是**它们的日志一并没了**；
   要事后取证，得给 `SlotProvider` 加一个按 id 读日志的方法。

---

## 七、开发

```bash
pnpm --filter node-agent check-types
pnpm vitest --project node-agent
```

用例分两层：纯逻辑单测（端口解析、能力探测降级、退避序列、满载拒绝）；
以及一组**行为用例**——在同一个进程里起一个假 farm（真 `WebSocketServer` + 同一个 mux 包）
和一个假 `SlotProvider`，把 `hello → helloAck → acquire → 隧道搬字节 → release → 断线全量释放`
整条链路真跑一遍。假的只有 farm 的业务侧和槽位后端，WebSocket 与 TCP 都是真的。
