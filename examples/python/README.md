# Python 示例：一轮 pytest 结果的完整上报

这份示例回答的是一个很具体的问题：**我的 pytest 已经在跑了，怎么让它的结论落进
平台的测试任务里，并且我怎么知道到底落进去了没有。**

它只有三个依赖：`automationstack-sdk`、`pytest-automationstack`、`pytest`。
没有 requests、没有 httpx、没有 allure、没有 pytest-html——核心包的 `dependencies`
是**空数组**（只用标准库的 `urllib.request`），插件除了 pytest 什么都不要。
QA 的测试环境常常是被 pip 锁死的，多一个依赖就多一次「装不上」。

跟 [`../nodejs`](../nodejs) 那份是**同一套种子数据、同一份对账单契约**，演示的也是
同一组事情，只是这边走 pytest 插件。两份都读一遍，你会发现变的只有搬运代码。

## 目录

```
examples/python
├── conftest.py                  # 接线：失败现场（截图 + 完整日志）经 add_attachment() 挂进本轮上报
├── pytest.ini                   # 只声明 testpaths；刻意不把 --automationstack 写进 addopts
├── src/
│   ├── artifacts.py             # 失败现场的落盘与回捡
│   ├── ci_idempotency_key.py    # 把 CI 的 job-attempt 折成合法 UUID
│   ├── env_file.py              # 30 行的 .env 读取器（不为读三行配置装第四个包）
│   └── report_empty_write.py    # 第二入口：「一条都没写进去」的非零退出；**不 import pytest**
└── tests/
    └── test_checkout.py         # 6 条用例：5 条标了 sourceRef（1 条故意失败、1 条跳过）+ 1 条没标
```

## 跑之前

先按 [`../README.md`](../README.md) 的「共同前置」把库起起来、迁移、种数据、起服务。

### 建环境

系统自带的 Python（macOS 上是 3.9）不该被示例污染，用 uv 建一个独立环境：

```bash
cd examples/python
uv venv --python 3.11
uv pip install -e ../../packages/sdk-python -e ../../packages/sdk-pytest pytest --python .venv
```

两个包都是**本地路径可编辑安装**（`-e ../../packages/...`）。示例跟着仓库走，
装 git tag 意味着改了 SDK 得先发一个 tag 才能在示例里看见效果。
你自己的项目里请照 [核心包 README](../../packages/sdk-python/README.md) 那样从 GitHub 装。

⚠️ **跑测试一律显式走 `./.venv/bin/python -m pytest`。** 不要用
`uv run --python .venvXX`——uv 会把那个目录当成项目环境重新解析并重建，
你刚装好的可编辑安装会被它换掉。

### 填 .env

```bash
cp .env.example .env
# 把 pnpm db:seed-automation-demo 打印的 AS_PROJECT / AS_TOKEN 填进去
```

种子脚本打印的那段抬头写的是 `examples/nodejs`，三行内容对这份示例**一模一样**：
环境变量名 Node / Python / Java 三边逐字一致，同一条流水线上跑两种脚本时
不用维护两套 secret。

**AS_TOKEN 的明文只在创建那一刻打印一次。** 库里存的是 SHA-256 哈希，
没有任何接口能把明文取回来；丢了就重新跑一次种子生成一个。

`.env` 由 `src/env_file.py` 在 conftest 里读进来（Node 那边靠 `--env-file-if-exists`，
Python 运行时没有对等物）。已经在环境里的变量优先——CI 上的 secret 不该被
谁忘了删的一份本地文件顶掉。

## 跑

```bash
./.venv/bin/python -m pytest --automationstack
```

**`--automationstack` 是必须显式加的。** 装了插件不等于开始往平台写东西，
所以它也没被写进 `pytest.ini` 的 addopts：任何人克隆下来直接 `pytest`
都该能在没有 AS_TOKEN 的机器上跑通。

真实输出（这台机器上跑出来的，R2 未配置）：

```
tests/test_checkout.py .Fs...                                            [100%]
[example] AUTO-CART-002 带 2 个附件（截图 + 完整日志）
[example] 2 个附件只是入了队；一个请求都还没发，它们随插件收工时那一次上报一起走
[automationstack] 1 条用例没有 sourceRef，未上报：tests/test_checkout.py::test_health_check_endpoint_returns_ok
[automationstack] 上报对账单（execution fbb9af0e-e7dd-43da-8f10-78ad9cf85100）
写入 《自动化演示 · v1.0 回归》  3 条
写入 《自动化演示 · 冒烟专项》   2 条
跳过 1 条（已有人工结论）：AUTO-REPORT-004 @《自动化演示 · v1.0 回归》
越界 1 条（不在任何未提交任务的范围内）：AUTO-SEARCH-005
附件 存储未配置，本轮附件全部跳过；结论已正常写入
附件 被拒：AUTO-CART-002：附件存储（R2）未配置，本轮附件未上传；结论已照常写入
附件 被拒：AUTO-CART-002：附件存储（R2）未配置，本轮附件未上传；结论已照常写入
```

注意那行「一个请求都还没发」：`[example]` 开头的两行都打在 `finish()` **之前**，
此时结论和附件全都还在内存里（插件的 `pytest_runtest_logreport` 只调 `add_result`，
示例的 `add_attachment()` 也只入队），跑完一次性提交。跑一条报一条既慢又碎，
重试也只能重试那一条。下面那份对账单才是 POST 回来之后渲染的。

种子数据是特意造成这样的：

| 用例 | 本轮结果 | 对账单里的去向 |
| --- | --- | --- |
| `AUTO-LOGIN-001` | 通过 | 写进「回归」和「冒烟」两个任务 |
| `AUTO-CART-002` | **失败** | 写进「回归」，带截图 + 完整日志 |
| `AUTO-PAY-003` | 跳过 | 写进「回归」（跳过是一种结论，不是「没跑」） |
| `AUTO-REPORT-004` | 通过 | 写进「冒烟」；在「回归」里因为已有人工结论而被跳过 |
| `AUTO-SEARCH-005` | 通过 | **越界**：项目里有这条用例，但没有任何未提交任务收着它 |
| （没标 marker 的那条） | 通过 | 不上报，收工时插件单独说一句 |

「越界」是这份示例最想让你记住的地方：它和「未匹配」是**两件不同的事**，
平台从不把它们合并成一句「上报失败」。越界 → 去把用例勾进测试任务；
未匹配 → 去检查 `AS_PROJECT` 和 sourceRef 有没有写错。

## sourceRef 怎么标

**marker 优先**，两种写法都认：

```python
@pytest.mark.automationstack("AUTO-LOGIN-001")
@pytest.mark.automationstack(source_ref="AUTO-LOGIN-001")
```

没标 marker 的用例**默认不上报**，收工时插件打一行说明有几条、都是谁——
上面那条 `test_health_check_endpoint_returns_ok` 就是特意留着演示这个的。
真实仓库里这种用例占大多数（单元测试、内部冒烟），它们本来就不该出现在测试任务里。

想让没标 marker 的用例退化用 nodeid（`tests/test_checkout.py::test_login`）当
sourceRef，加 `--automationstack-nodeid-fallback`。**默认关掉**是因为 nodeid 与平台上
录进去的 sourceRef 基本不可能碰巧相等，开着只会让整批结果掉进对账单的「未匹配」里，
把真正该看的那几条淹掉。

归属**只认** sourceRef（§3.7）。代码里没有任何办法指定「写进哪个测试任务」——
平台按用例的 sourceRef 反查，一条结果可以同时落进多个未提交的任务，
`AUTO-LOGIN-001` 那行同时进两个任务就是这么来的。

## 一条都没写进去的时候

```bash
./.venv/bin/python -m src.report_empty_write
echo $?          # 1
```

```
[example] 故意上报一条不存在的用例：AUTO-DOES-NOT-EXIST-999（幂等键 a549e62f-…）
[automationstack] 上报对账单（execution f0933437-c226-42ad-8291-e8c73be27636）
写入 0 个测试任务
未匹配 1 条（项目里没有这个 sourceRef 的用例）：AUTO-DOES-NOT-EXIST-999
[example] 一条都没写进去：
本轮结果一条都没有写进任何测试任务（writtenTo 为空）。服务端逐条给出的理由：
  AUTO-DOES-NOT-EXIST-999：项目里没有这个 sourceRef 的用例
[example] 按 §7.2 第 4 条，进程以退出码 1 结束
```

这个入口故意上报一条平台上不存在的 sourceRef。服务端仍然返回 **200**
（HTTP 状态码说的是「请求本身有没有问题」，对账单说的是「业务上发生了什么」），
核心包看见 `writtenTo` 为空就抛 `IngestEmptyWriteError`。

这条路径值得单独有个入口：**CI 里最危险的失败不是红，是绿着但什么都没写。**
一整晚的自动化跑完、流水线全绿、平台上一条结论都没有——这个入口就是用来
证明那种情况不会静悄悄过去的。

跑在插件里时同一条判定由插件接管：它把 `session.exitstatus` 设成 1，
而不是走核心包那条 `os._exit` 兜底通道——后者会把 pytest 的收尾（报告、缓存、
其他插件的 `sessionfinish`）整个跳过。

## 不用 pytest 也能用核心包

**`src/report_empty_write.py` 从头到尾没有 import pytest**，它就是这件事的可跑证据。
核心包的 `dependencies` 是空的，它不认识 pytest、unittest、robot 或任何别的框架：

```python
from automationstack_sdk import AutomationStackReporter, CaseResultInput

reporter = AutomationStackReporter()      # 缺配置在这一行就炸，不会等你跑完二十分钟
reporter.add_result(CaseResultInput(result="passed", source_ref="AUTO-LOGIN-001"))
reporter.add_result(CaseResultInput(
    result="failed", source_ref="AUTO-CART-002", message="expected 59.7, got 59.699…",
))
reporter.finish()                          # 批量提交、打印对账单、决定退出码
```

要接 robot / unittest / 一个自己写的 runner，照这个形状搬即可：
`AutomationStackReporter()` → 若干次 `add_result` → 一次 `finish()`。
`pytest-automationstack` 自己就是这么写的，它整个包只有一百多行壳。

## CI 重试要复用幂等键

一次进程一个幂等键，SDK 默认自己生成 UUID。但 CI 重试的是**同一次运行**，
不是新的一轮——不复用键，网络抖了重跑一次流水线，平台上就会多出一份内容
一模一样的执行记录。

⚠️ 这个键必须是**合法 UUID**（服务端按 `z.uuid()` 校，不是就 400）。
CI 给的是 `12345-2` 这种字符串，直接塞进去会被拒，先确定性地折成 UUID：

```bash
export AS_IDEMPOTENCY_KEY=$(./.venv/bin/python -m src.ci_idempotency_key \
  "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")
./.venv/bin/python -m pytest --automationstack
```

`src/ci_idempotency_key.py` 整个文件只有一次函数调用：核心包**已经导出**了
`derive_batch_idempotency_key`（分批派生用的就是它），要的性质只有
「同样的输入永远得到同样的 UUID」，示例再抄一遍 SHA-1 摆位没有意义。
复用同一个键再跑一次，服务端返回的是**同一个 execution id**，不会写第二份：

```
--- 第一次 ---  [automationstack] 上报对账单（execution b3dcb580-059b-45ce-8259-d158e9130fa1）
--- 重试   ---  [automationstack] 上报对账单（execution b3dcb580-059b-45ce-8259-d158e9130fa1）
```

⚠️ 它摘的是 `python:` + 输入串，不是输入串本身。CI 发给三种语言的
`$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT` 是**同一个字符串**，一条流水线里
Node / Python / Java 各跑一轮自己的测试，两轮共用一个幂等键才是灾难——
第二轮会命中第一轮的缓存对账单直接返回，结论一条都写不进去，而它看到的是
一份「成功」的对账单。`examples/jdk` 调的是同一个 `deriveBatchIdempotencyKey`，
不加前缀两边算出的就是同一个键（实测撞过）；三份示例各自加上
`node:` / `python:` / `java:` 之后，两两不同是被**写下来**的性质，
不再依赖「三份实现碰巧公式不一样」这种一碰就碎的巧合。

## 关于附件

失败的用例会带两个附件：一张截图和一份完整日志（`artifacts/` 下，已 gitignore）。
示例里那张「截图」是个 1×1 的占位 PNG——这份示例不装浏览器，真实项目里把它换成
`page.screenshot(path=...)` 即可，上报侧一个字都不用改。

**这段接线在 `conftest.py` 里，不在插件里**，这是有意的：插件自己只在断言输出超过
2000 字时把完整堆栈另传一份 `log`，它不截图，也不知道你的框架把现场留在哪——
截图是 playwright / appium / selenium 各自的事。「失败 → 收集现场 → 挂到这条
sourceRef 上」那几十行属于你的仓库，换框架时改的也只有它。

插件为最后那一下开了一个公开入口，也只有这一个：

```python
from pytest_automationstack import add_attachment

add_attachment(session.config, AttachmentInput(file_path=..., kind="screenshot", source_ref=...))
```

它把附件挂到**这一轮的那个** reporter 上。自己 new 一个 `AutomationStackReporter`
就是另一次执行、另一个 execution id，附件会挂到一份没有结论的记录上。
没加 `--automationstack` 时它是安静的空操作（返回 `False`）——写满了这个调用的仓库，
不带开关时照样要能在没有 AS_TOKEN 的机器上直接 `pytest` 跑通。

附件走的是「预签名 → PUT → 登记」三步。**如果服务端没配对象存储（R2），
上报不会失败**：服务端返回 `storageConfigured: false`，SDK 跳过附件、
把结论正常写进去，并在对账单旁边说明这次降级——上面那三行「附件 …」就是。
让一张丢失的截图把一整轮结论拦在门外，是最没道理的失败方式。

同一个文件被打印了两次「被拒」也不是 bug：`AUTO-CART-002` 的两个附件各被拒了一次。
一条 sourceRef 落进多个任务时，presign 会按解析出的 run_case 逐个返回 URL，
拿到几个就传几次同一个文件——object key 规则要求如此，SDK 刻意不做去重。

## 只有一次 POST，从不预检

正常路径上只有一次 `POST /ingest/executions`。SDK **不调** `GET /ingest/runs`
（那条路由是留给人写排查脚本用的），也就不存在「先查有哪些任务再决定报什么」这回事。
把一次上报拆成「查 + 写」两步，中间任何一个迭代动作都能让它们看到不一致的世界。

拿一个只转发不改写的代理挡在中间数一遍，这份示例跑一轮发出去的全部请求是：

```
POST /ingest/executions
POST /ingest/attachments/presign
```

第二条是附件那条线（R2 未配置，于是没有后续的 PUT 和 register）。
一条 `GET` 都没有。

## 退出码的含义

⚠️ **这里和 Node 那份示例不一样，值得单独看一眼。**

Node 那边测试与上报是两条命令，退出码各管各的。pytest 这边是**一条命令**——
插件的价值恰恰在于此——代价是 `session.exitstatus` 只有一个，两件事共用它：

- 有用例失败 → pytest 自己就把它置成 1；
- 一条都没写进去（或上报本身炸了）→ 插件把它置成 1。

所以这份示例跑完退出码就是 **1**（`AUTO-CART-002` 是故意失败的，要用它演示附件），
**那不代表上报失败**。要分辨是哪一种，看对账单：出现了「写入 《…》 N 条」就是写进去了。

真要在 CI 里把两件事分开判，办法是不带 `--automationstack` 跑一遍决定构建红绿，
再用核心包单独走一次上报（`src/report_empty_write.py` 就是那种形态）——
代价是你得自己把结果搬进 `CaseResultInput`，也就是绕开插件。
这份示例不这么做：一条命令的便利在绝大多数仓库里更值钱，而对账单已经把
「写没写进去」说得足够清楚了。

## 为什么这个目录里没有 package.json

`examples/*` 在 pnpm 工作区里，`examples/nodejs` 有 `package.json` 是因为它真的要
`workspace:*` 引 SDK。这份示例的依赖全在 Python 那侧（`uv pip install -e ...`），
加一个 `package.json` 唯一的作用是让 `pnpm --filter` 能调起来——
换来的是仓库的 JSON 检查多扫一个文件、读的人多一层「这个 Python 示例为什么要 npm 包」
的疑问。没有它，pnpm 直接忽略这个目录，一切照常。

## Python 版本

开发用 3.11，代码本身兼容 **3.9**（macOS 自带的就是 3.9，砍掉它等于逼 QA 先装 Python），
与核心包的下限一致。代价是全库 `from __future__ import annotations`，
且不用 `X | Y` 那种写法。验一遍：

```bash
uv venv --python 3.9 .venv39
uv pip install -e ../../packages/sdk-python -e ../../packages/sdk-pytest pytest --python .venv39
./.venv39/bin/python -m pytest --automationstack
```
