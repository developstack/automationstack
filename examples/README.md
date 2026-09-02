# 示例：把自动化测试的结论接进 automationstack

这个目录下的每一份示例都是**能真跑起来的最小工程**，不是文档里的代码片段。
它们要证明的是同一件事：

> 你已有的自动化测试，不用改测试本身，就能把结论写进平台的测试任务里；
> 而且每一轮上报之后，你手里都有一张**对账单**，能逐条说清哪些写进去了、
> 哪些没有、以及为什么。

| 示例 | 语言 / 运行器 | 状态 |
| --- | --- | --- |
| [`nodejs/`](./nodejs) | Node.js + 内置 `node:test` | ✅ 可跑 |
| [`python/`](./python) | Python + pytest 插件 | ✅ 可跑 |
| [`jdk/`](./jdk) | Java + JUnit 5 | ✅ 可跑 |
| [`farm-selenium/`](./farm-selenium) | Node.js + selenium-webdriver | 🚧 phase4 浏览器农场 |
| [`farm-playwright/`](./farm-playwright) | Node.js + playwright-core（CDP） | 🚧 phase4 浏览器农场 |

前三份示例用的是**同一套种子数据、同一个对账单契约**，只是语言不同。
先看哪一份都行。

后两份（`farm-*`）证明的是另一件事，别和上面三份混在一起看：它们不上报结论，
而是把**浏览器本身**搬到平台上跑——脚本改一行连接地址，浏览器就在平台按会话
拉起的一次性容器里执行，平台顺带把网络、console、截图录下来。

## 这些示例证明了什么

1. **SDK 不绑测试框架。** node 那份用的是内置 runner，连测试框架都没装。
   「事件流 → 结果数组」的搬运代码留在示例仓库里，换框架时改的是那三十行，
   不用等 SDK 发版。
2. **归属只认 `sourceRef`。** 代码里没有任何办法指定「写进哪个测试任务」——
   平台按用例的 sourceRef 反查，一条结果可以同时落进多个未提交的任务。
3. **一轮测试只发一个请求。** 结果全程攒在内存里，跑完一次 `POST /ingest/executions`。
   不做任何预检（不存在「先查有哪些任务再决定报什么」这回事）。
4. **对账单是逐条的，不是一句「成功」。** 写进去的、因已有人工结论而跳过的、
   项目里根本没这条用例的、有用例但没被任何未提交任务收着的——四类分开列，
   一条不省略。
5. **一条都没写进去时，进程非零退出。** CI 里最危险的失败不是红，是绿着
   但什么都没写。每份示例都带一个入口专门演示这条路径。

## 共同前置

下面五步对三份示例都一样，做一次即可。

### 1. 起数据库

Postgres 需要在 `5432` 上跑着：

```bash
pg_isready                     # 期望：accepting connections
```

如果没起——**这台机器上的 Postgres 是 Homebrew 装的，不是 docker**：

```bash
brew services start postgresql@18
```

⚠️ 仓库根的 `package.json` 里有个 `db:start`，那条是 `docker compose up -d postgres`，
只在用 docker 那套的机器上有意义，别照着跑。

### 2. 装依赖 + 建库结构

```bash
pnpm install
pnpm db:migrate
```

### 3. 种演示数据，拿 token

```bash
pnpm db:seed-automation-demo
```

它是**幂等的**，重复跑不会造出第二份演示项目。跑完会打印一个演示项目、
一批用例、两个**未提交**的测试任务（没有未提交的任务，就没有任何东西能接收
上报结论），以及一段可以直接抄进 `.env` 的内容：

```
───────── examples/nodejs 的 .env（token 明文仅此一次可见）─────────
AS_BASE_URL=http://localhost:3000
AS_PROJECT=<演示项目的 id>
AS_TOKEN=<token 明文>
```

**token 明文只在这一刻出现一次。** 库里只存 SHA-256 哈希——不是可逆密文，
也不是可以「解开」的东西，任何接口都取不回明文。丢了就再跑一次种子脚本
生成一个新的。

⚠️ 别把这三行写进任何进版本库的文件。每份示例都有 `.env.example` 作为模板，
真实值只放在本机被 gitignore 的 `.env` 里。

### 4. 起服务端

```bash
pnpm dev:server
```

默认监听 `http://localhost:3000`。健康检查：

```bash
curl -s http://localhost:3000/health
```

### 5. 跑示例

进对应目录，照那份 README 走。

## 这些示例是怎么进工作区的

`examples/*` 在**两个地方**登记过：

- `pnpm-workspace.yaml` 的 `packages:` —— pnpm 实际读的是这一份，
  示例里的 `"@automationstack/sdk": "workspace:*"` 能解析，靠的就是它。
- 根 `package.json` 的 `"workspaces"` —— pnpm 根本不看这个字段，
  这里保持同步纯粹是为了别的工具（npm / yarn，以及一批照着这个字段
  找工作区的编辑器和 CI 插件）读到的不是一份缺了 examples 的清单。

改一处就得改另一处，否则「pnpm 下好好的、换个工具就找不到包」这类问题
会很难查。（JSON 里没法写注释，所以这段说明放在这儿。）

## 关于附件（截图 / 日志）

失败用例带的附件走「预签名 → PUT → 登记」三步，需要服务端配好对象存储（R2）。
**没配也不会让上报失败**：服务端返回 `storageConfigured: false`，SDK 跳过附件、
把结论正常写进去，并在对账单旁边说明这次降级。示例默认就跑在这种降级状态下，
你会在输出里看到相应说明——那是预期行为，不是出错。
