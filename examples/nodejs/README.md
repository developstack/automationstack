# Node 示例：把上报当「切面」，而不是当一层包装

这份示例回答的是一个很具体的问题：**怎么把 `@automationstack/sdk` 接进一个已经存在的测试仓库，而不去动那些测试。**

判据只有一条，硬得没有商量：

> **`tests/` 底下的文件里，一行 SDK 都不出现。**
> 不 import `@automationstack/sdk` 的上报入口、不继承它的类、不包 wrapper、不写 try/catch 去存截图。

上报只从**每个框架自己的官方扩展位**挂进去：

| 框架 | 官方扩展位 | 这份示例里的实现 |
| --- | --- | --- |
| `node:test` | `--test-reporter=<file>` | `adapters/node-test-reporter.ts` |
| vitest | `test.reporters[]` | `adapters/vitest-reporter.ts` |
| WebdriverIO | `reporters[]` + `services[]` | `adapters/wdio-reporter.ts` + `adapters/wdio-service.ts` |

三个扩展位长得完全不一样，这正是这份示例存在的理由——这段接线**注定要留在你自己的仓库里**，SDK 替不了你写。

---

## 跑起来

前提：平台在本机跑着，种子数据已经灌好（`pnpm db:seed-automation-demo` 会打印下面三个值）。

```bash
cp .env.example .env    # 填 AS_BASE_URL / AS_PROJECT / AS_TOKEN
pnpm install
```

`.env` 里是**真 token**，它已经在 `.gitignore` 里。示例读它的唯一方式是 `node --env-file-if-exists=.env`——代码里既不 `dotenv`，也不打印它。

```bash
pnpm test:node            # node:test
pnpm test:vitest          # vitest
pnpm test:wdio            # WebdriverIO + 真无头 Chrome，两个 worker 进程
pnpm report:empty-write   # 「一条都没写进去 → 退出码 1」的演示
```

四条命令**都会以退出码 1 结束**，而且都是故意的：前三条各有一条设计成红的用例（见下），第四条演示的就是非零退出本身。

---

## 目录

```
examples/nodejs
├── adapters/                    ← 切面。三个框架各一份接线
│   ├── node-test-reporter.ts
│   ├── vitest-reporter.ts
│   ├── wdio-reporter.ts         ← 跑在 worker 里：只攒 + 落盘
│   └── wdio-service.ts          ← 跑在总控里：回捡 + 唯一一次 finish()
├── src/                         ← 上报链路的公共部分
│   ├── report-run.ts            ← 全仓唯一 new AutomationStackReporter() 的地方
│   ├── failure-artifacts.ts     ← 失败现场（截图 + 日志）
│   ├── source-ref.ts            ← 从用例标题里抠 [AUTO-XXX-NNN]
│   ├── wdio-spool.ts            ← wdio 的跨进程汇聚通道
│   ├── ci-idempotency-key.ts    ← 把 CI 的 job id 折成合法 UUID
│   └── attachment-channel.ts    ← 附件通道三段探针（presign / 直传 / 登记）
├── tests/                       ← 零 SDK 痕迹
│   ├── node/                    ← 配置解析、幂等键派生、附件 presign
│   ├── vitest/                  ← 对账单合并与渲染、附件直传
│   ├── wdio/                    ← 请求体契约、路由存在性、附件登记（真浏览器打真服务）
│   └── empty-write/             ← 「全绿但一条没写进去」的演示
├── wdio.config.ts
├── vitest.config.ts
└── tsconfig.json
```

TypeScript **不编译**：Node 24 的类型擦除直接跑源码，所以相对 import 一律写全 `./foo.ts`。`pnpm check-types` 只做 `tsc --noEmit`。

---

## 被测的是什么

这份示例里没有假的「购物车」「登录页」，也没有 `assert.equal("耳机", "耳机")` 这种自说自话的用例。**被测对象是这个仓库里真实存在的代码**：

- `resolveReporterConfig` —— 配置解析（末尾斜杠、显式参数优先、缺 token 立刻抛）
- `deriveBatchIdempotencyKey` —— 分批幂等键派生，以及 node / python / java 三语言前缀的互不碰撞
- `mergeReceipts` / `formatReceiptLines` —— 多批对账单的合并与渲染
- `buildExecutionRequests` —— 请求体的截断与契约上限
- `INGEST_*_ROUTE` 四条路由常量 —— 拿真浏览器打**此刻真跑着的服务**
- `/ingest/attachments/{presign,register}` —— 附件通道的三段，打的是真服务端

用例标题里的 `[AUTO-XXX-NNN]` 就是平台上的 sourceRef，切面靠它把结果归位。五条种子用例在每一轮里各自演一种服务端行为：

| sourceRef | 这一轮会发生什么 |
| --- | --- |
| `AUTO-LOGIN-001` | 通过，写进任务 |
| `AUTO-CART-002` | **失败**，带截图 + 完整日志两个附件 |
| `AUTO-PAY-003` | 跳过（理由写在用例上方，不是一句 TODO） |
| `AUTO-REPORT-004` | 服务端判「已有人工结论 → 跳过」 |
| `AUTO-SEARCH-005` | 服务端判「越界」 |

### 那条红是真的红，红在环境上

红的用例只有一条 sourceRef：`AUTO-CART-002`，三个框架各认领**附件通道的一段**。

| 框架 | 认领哪一段 | 此刻的结果 |
| --- | --- | --- |
| node:test | `presign` 能不能签出直传 URL | 红：`storageConfigured=false` |
| vitest | 拿签好的 URL 真的 `PUT` 上去 | 红：卡在上一段，一件都没签出来 |
| WebdriverIO | `register` 回执，附件行真的存在 | 红：同上 |

它们的期望——**「这套环境的附件通道此刻是通的」**——出处在 `docs/phase3-automation-plan.md` 的「附件」验收组：五条里四条至今是 `[ ]`，后面那段「未验证项（2026-08-25）」写得很直白：

> 这台开发服务端的 R2 没配，`presign` 一律返回 `storageConfigured: false`，所以示例每次都只走到**降级分支**……预签名 PUT、`register` 回执、分块上传在真实服务端上**都没跑过**，只有单元测试里的假 transport 覆盖。

所以这条红是**诚实的**：它不说 SDK 有 bug，它说的是「这几个勾还没资格打」。R2 一配好，三条自己会转绿，那几个 `[ ]` 也就有了依据。

失败信息全程是服务端自己的原话（`附件存储（R2）未配置，本轮附件未上传；结论已照常写入`），一个字没替它改写。

> **刻意没做的事**：不拿「SDK 不校验幂等键」「`mergeReceipts` 只留第一个 `executionId`」「`MAX_INGEST_SOURCE_REF_LENGTH` 不本地 clamp」去凑红——那三件在 `packages/sdk-node/src/` 的注释里都写明了取舍理由，断言它们「应该反过来」等于在示例里说自家 SDK 有三个 bug。**为了凑一条红去编一个假期望，比没有红更糟。**

---

## wdio 这一轮为什么要多写一个 service

wdio 把一轮测试拆进**多个 worker 子进程**（一个 spec 一个），进程间内存不通。而 ingest 的契约是**一轮只收一次总提交，不支持追加**，同一个幂等键第二次提交会命中第一次的缓存对账单原样返回。

所以那套眼熟的「先建后发」（总控先建一个 build、把 id 塞进环境变量、各 worker 各自追加）在这里**行不通**。照抄的后果是第 2 个往后的 worker 一条都写不进去，却各自收到一份看起来成功的对账单——**绿的，什么都没发生**，连退出码都不会红。

这份示例走的是汇聚：

```
worker 0-0 ──onRunnerEnd──▶ .wdio-spool/0-0.json ─┐
worker 0-1 ──onRunnerEnd──▶ .wdio-spool/0-1.json ─┤
                                                   ├─▶ 总控 onComplete
                                                   │   回捡 → 拼成一轮
                                                   └─▶ 唯一一次 finish()
```

两个地方不能省：

- **`isSynchronised` 必须实现。** wdio 文档原话：*「The test runner waits for all reporters to have `isSynchronised` set to `true` before terminating the process.」* `onRunnerEnd` 的**返回值是被忽略的**（基类里就是同步调一句）。写成 `async onRunnerEnd()` 而不实现这个 getter，wdio 不会等——落盘写到一半进程就被杀，症状是这一轮少了某个 worker 的结果，**而且没有任何报错**。
- **一个 worker 一个文件。** 两个 worker 同时写同一个文件会互相截断，截掉的正好是「某个 spec 的全部结果」。

`onComplete` 会把证据打出来，好让「少了一个 worker」这件事看得见：

```
[切面/wdio] 回捡到 2 份 spool（每份 = 一个 worker 子进程）：
  cid 0-0  3 条  execution-contract.spec.ts
  cid 0-1  2 条  route-paths.spec.ts
[切面/wdio] 合计 5 条，汇成一轮，只发一次 POST
```

3 + 2 = 5，和后面「开始上报：5 条结果」对得上，才叫一条没丢。

---

## 「全绿但一条都没写进去」

```bash
pnpm report:empty-write; echo $?     # 1
```

那条用例是**通过**的，node:test 不会给任何非零退出码。退出码 1 完全来自上报侧：标题里的 sourceRef 在平台上不存在 → `writtenTo` 为空 → SDK 抛 `IngestEmptyWriteError` 并把 `process.exitCode` 置 1。

服务端这时返回的仍然是 **200**：HTTP 状态码表达「请求本身有没有问题」，对账单表达「业务上发生了什么」。把后者翻译成退出码是 SDK 的职责。

CI 里最危险的失败从来不是红，是**绿着但什么都没写进去**——跑了一整晚、流水线全绿、平台上一条结论都没有。这个入口就是用来证明那种情况不会静悄悄过去。

---

## 接到你自己的仓库里

1. 抄 `src/report-run.ts` 和 `src/source-ref.ts`（改掉 sourceRef 的正则就行）。
2. 按你的框架挑一份 `adapters/*.ts`，改掉里面 `results` 的取法。
3. 在框架配置里挂上它——**测试文件一个字都不用改**。

wdio 的那两份要一起抄，少了 `wdio-service.ts` 就退回成「每个 worker 各发一次」，而那条路上的失败是静默的。
