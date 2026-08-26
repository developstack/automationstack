# Node.js 示例：一轮 node:test 结果的完整上报

这份示例回答的是一个很具体的问题：**我的自动化测试已经在跑了，怎么让它的结论
落进平台的测试任务里，并且我怎么知道到底落进去了没有。**

它只有两个依赖：`@automationstack/sdk` 和 node 自带的 `node:test`。
没有 playwright、没有 wdio、没有 jest/vitest —— SDK 不绑任何测试框架，
把「事件流 → 结果数组」那三十行搬运代码留在你自己仓库里（见
`src/collect-results.js`），换框架时要改的就只有它。

## 目录

```
examples/nodejs
├── src/
│   ├── run-and-report.js      # 主入口：跑测试 → 攒结果 → 一次上报 → 打对账单
│   ├── report-empty-write.js  # 第二入口：演示「一条都没写进去」时的非零退出
│   ├── collect-results.js     # node:test 事件流 → SDK 的 CaseResultInput[]
│   ├── source-ref.js          # 从用例标题里取 [AUTO-XXX-000]
│   ├── ci-idempotency-key.js  # 把 CI 的 job-attempt 折成合法 UUID
│   └── artifacts.js           # 失败现场：截图 + 完整日志的落盘与回捡
└── tests/
    └── checkout.test.js       # 5 条用例：4 条跑（1 条故意失败）+ 1 条跳过
```

## 跑之前

先按 [`../README.md`](../README.md) 的「共同前置」把库起起来、迁移、种数据、
起服务。种子脚本最后会打印一段可以直接抄进 `.env` 的内容：

```bash
cp .env.example .env
# 把 pnpm db:seed-automation-demo 打印的 AS_PROJECT / AS_TOKEN 填进去
```

**AS_TOKEN 的明文只在创建那一刻打印一次。** 库里存的是 SHA-256 哈希，
没有任何接口能把明文取回来；丢了就重新生成一个。

## 跑

```bash
pnpm --filter @automationstack/example-nodejs report
```

你会依次看到：本轮用例结果（此时**一个请求都还没发**）、幂等键、失败用例带了
几个附件，然后是服务端返回的**对账单**——`writtenTo` / `skippedManual` /
`unmatchedCases` / `outOfScope` 四类，逐条列出，一条不省略。

种子数据是特意造成这样的：

| 用例 | 本轮结果 | 对账单里的去向 |
| --- | --- | --- |
| `AUTO-LOGIN-001` | 通过 | 写进「回归」和「冒烟」两个任务 |
| `AUTO-CART-002` | **失败** | 写进「回归」，带截图 + 完整日志 |
| `AUTO-PAY-003` | 跳过 | 写进「回归」（跳过是一种结论，不是「没跑」） |
| `AUTO-REPORT-004` | 通过 | 写进「冒烟」；在「回归」里因为已有人工结论而被跳过 |
| `AUTO-SEARCH-005` | 通过 | **越界**：项目里有这条用例，但没有任何未提交任务收着它 |

最后一行「越界」是这份示例最想让你记住的地方：它和「未匹配」是**两件不同的事**，
平台从不把它们合并成一句「上报失败」。越界 → 去把用例勾进测试任务；
未匹配 → 去检查 `AS_PROJECT` 和 sourceRef 有没有写错。

## 一条都没写进去的时候

```bash
pnpm --filter @automationstack/example-nodejs report:empty-write
echo $?          # 1
```

这个入口故意上报一条平台上不存在的 sourceRef。服务端仍然返回 **200**
（HTTP 状态码说的是「请求本身有没有问题」，对账单说的是「业务上发生了什么」），
SDK 看见 `writtenTo` 为空就抛 `IngestEmptyWriteError` 并把退出码置成 1。

这条路径值得单独有个入口：**CI 里最危险的失败不是红，是绿着但什么都没写。**
一整晚的自动化跑完、流水线全绿、平台上一条结论都没有——这个入口就是用来
证明那种情况不会静悄悄过去的。

## CI 重试要复用幂等键

一次进程一个幂等键，SDK 默认自己生成 UUID。但 CI 重试的是**同一次运行**，
不是新的一轮——不复用键，网络抖了重跑一次流水线，平台上就会多出一份内容
一模一样的执行记录。

⚠️ 这个键必须是**合法 UUID**（服务端按 `z.uuid()` 校，不是就 400）。
CI 给的是 `12345-2` 这种字符串，直接塞进去会被拒，先确定性地折成 UUID：

```bash
export AS_IDEMPOTENCY_KEY=$(node src/ci-idempotency-key.js "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")
pnpm report
```

`src/ci-idempotency-key.js` 就是把输入串折成 UUIDv5 的十几行代码——要的性质
只有「同样的输入永远得到同样的 UUID」。复用同一个键再跑一次，服务端返回的是
**同一个 execution id**，不会写第二份：

```
--- 第一次 ---  [automationstack] 上报对账单（execution c9664820-…）
--- 重试   ---  [automationstack] 上报对账单（execution c9664820-…）
```

⚠️ 它摘的是 `node:` + 输入串，不是输入串本身。CI 发给三种语言的
`$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT` 是**同一个字符串**，一条流水线上
Node 和 Python 各跑一轮，两轮要是撞上同一个幂等键，第二轮会命中第一轮的
缓存对账单直接返回——结论一条都写不进去，而它看到的是一份「成功」的对账单。
`examples/python` / `examples/jdk` 两份各自加了 `python:` / `java:`，
所以三份对同一个输入算出的键两两不同，而且是靠前缀**保证**不同，
不是靠三份实现碰巧用了不同公式。

## 关于附件

失败的用例会带两个附件：一张截图和一份完整日志（`artifacts/` 下，已 gitignore）。
示例里那张「截图」是个 1×1 的占位 PNG——这份示例不装浏览器，真实项目里把它换成
`await page.screenshot(...)` 即可，上报侧一个字都不用改。

附件走的是「预签名 → PUT → 登记」三步。**如果服务端没配对象存储（R2），
上报不会失败**：服务端返回 `storageConfigured: false`，SDK 跳过附件、
把结论正常写进去，并在对账单旁边说明这次降级。让一张丢失的截图把一整轮结论
拦在门外，是最没道理的失败方式。

## 退出码的含义

**本进程的退出码表达的是「结论有没有写进平台」，不是「测试有没有全过」。**
示例里有一条用例故意失败（要用它演示附件），如果把用例失败也算进退出码，
这个示例每次都红，上面那个「一条都没写进去」的信号就永远看不见了。

真实 CI 里让 `node --test` 那一步自己决定构建成败，上报是**另一件事**：

```bash
node --test tests/          # 这一步决定构建红绿
node src/run-and-report.js  # 这一步决定结论有没有落库
```
