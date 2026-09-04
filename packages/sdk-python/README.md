# automationstack-sdk

把一轮自动化测试的结果**批量**上报到 automationstack 的 ingest 端点，原样打印对账单，
按「有没有写进去」决定退出码。

- **零运行时依赖。** `dependencies` 是一个空数组，只用标准库：`urllib.request` 发请求，
  `hashlib` / `uuid` 算幂等键，附件走预签名 PUT（D28），不引 boto3。
  QA 的测试环境常常是被 pip 锁死的，多一个依赖就多一次「装不上」。
- **不认识任何测试框架。** 不装 pytest 也能用它上报。想要 pytest 的自动接入，
  另装一个薄壳包 `pytest-automationstack`（见下），业务逻辑全在核心包里。

这是 `@automationstack/sdk`（Node 版）的 Python 对等物，两边的环境变量名、
数值上限、路由、幂等键派生算法**逐字/逐字节对齐**，由 `tests/test_contract_parity.py`
与 `tests/test_idempotency.py` 里的基准值守着。

## 安装

**只从 GitHub 装，本仓库的 SDK 一律不发 PyPI**（仓库是私有的，包也是）：

```sh
# 核心包
pip install "git+ssh://git@github.com/automationstack/automationstack@<tag>#subdirectory=packages/sdk-python"

# pytest 插件（可选，会把核心包一起带上）
pip install "git+ssh://git@github.com/automationstack/automationstack@<tag>#subdirectory=packages/sdk-pytest"
```

`<tag>` 用发布 tag（如 `sdk-python-v1.0.0`），不要用 `main`：
`main` 上的契约可能比你部署的那套平台新，而 SDK 与服务端是同一份契约的两端。

写进 `requirements.txt` 时把整串原样贴进去即可；用 uv 的话是
`uv add "git+ssh://git@github.com/..."`。CI 上走 HTTPS 的话把 `ssh://git@` 换成
`https://x-access-token:${GITHUB_TOKEN}@`，并给 job 开 `contents: read`。

## 配置

只有三样，全部跨迭代不变（§5.1 / D31）。**环境变量名与 Node 版完全一致**——
同一个仓库里两种脚本常常共用一份 CI 环境，改名就等于让人维护两套 secret。

| 变量 | 必填 | 说明 |
|---|---|---|
| `AS_TOKEN` | 是 | 个人 API token（在平台的 `/api-tokens` 里建，明文只显示一次） |
| `AS_PROJECT` | 是 | 这个仓库对应的项目 id |
| `AS_BASE_URL` | 是 | 平台地址，例如 `https://qa.example.com` |
| `AS_BRANCH` | 否 | 只影响失败清单上的「怎么复现」 |
| `AS_COMMIT_SHA` | 否 | 同上 |
| `AS_CI_URL` | 否 | 同上 |
| `AS_IDEMPOTENCY_KEY` | 否 | **给 CI 重试用**，见下面「幂等」 |

```sh
export AS_TOKEN=as_live_xxxxxxxx      # 占位符，别把真 token 写进任何文件
export AS_PROJECT=<projectId>
export AS_BASE_URL=https://qa.example.com
```

**没有第四样，尤其没有 `runId`。** 结论写进哪个测试任务由用例自己的 `sourceRef`
解析（§3.7）：这个迭代的任务建好了、用例勾进去了，脚本跑完就一定有地方落。
配置里写死一个 runId 意味着每个迭代都要有人去改 CI 变量，第一次会忘，第二次就没人用了。

## 核心包怎么单独用（不装 pytest 也能用）

```python
from automationstack_sdk import AttachmentInput, AutomationStackReporter, CaseResultInput

reporter = AutomationStackReporter()  # 缺配置在这一行就炸，不会等你跑完二十分钟

# 跑测试的过程中只入缓冲，一个网络请求都不发。
reporter.add_result(CaseResultInput(result="passed", source_ref="PAY-LOGIN-001", duration_ms=1820))
reporter.add_result(CaseResultInput(
    result="failed", source_ref="PAY-LOGIN-002", message="expected 200, got 500",
))
reporter.add_attachment(AttachmentInput(
    file_path="./screenshots/pay-login-002.png", kind="screenshot", source_ref="PAY-LOGIN-002",
))

# 全部跑完之后调一次：批量提交、打印对账单、决定退出码。
reporter.finish()
```

`result` 的取值只有 `passed` / `failed` / `skipped` / `blocked`——
**没有 `untested`**，「跑了但没结论」不是一件能表达的事。

## pytest 插件怎么用

装了 `pytest-automationstack` 之后，加一个开关就够：

```sh
pytest --automationstack
```

`sourceRef` 的来源有两级，**marker 优先**：

```python
import pytest

@pytest.mark.automationstack("PAY-LOGIN-001")
def test_login_with_valid_credentials():
    ...
```

没标 marker 的用例退化到用 pytest 的 nodeid（`tests/test_pay.py::test_login`）。
退化是**默认关掉**的：nodeid 与平台上的 `sourceRef` 基本不可能碰巧相等，
开着只会让整批结果掉进对账单的「未匹配」里，把真正该看的那几条淹掉。
真要用（比如你的用例库就是拿 nodeid 当 sourceRef 录进去的）加
`--automationstack-nodeid-fallback`。

失败时的断言输出会被截断成 `comment`（上限 2000 字），**完整堆栈作为 `log` 附件**
单独传——`comment` 是给人在失败清单上一眼扫的，不是日志容器。

## 对账单长什么样

```
[automationstack] 上报对账单（execution 5c1e…）
写入 《v2.3 回归》      78 条
写入 《支付模块专项》   12 条
跳过 1 条（已有人工结论）：PAY-CART-007 @《v2.3 回归》
未匹配 1 条（项目里没有这个 sourceRef 的用例）：PAY-NEW-099
越界 1 条（不在任何未提交任务的范围内）：PAY-CART-031
```

`writtenTo` 是「这轮结果扩散到了哪些任务」的**唯一披露点**（D34）——一次上报写进三个
任务，日志里就有三行。三类拒绝逐条列出，理由是**服务端原文**，SDK 一个字都不概括：
「用例不存在」和「任务还在待评审」是两件要采取不同行动的事。

## `writtenTo` 为空时的退出码

一条都没写进去时 `finish()` 抛 `IngestEmptyWriteError`，**并且进程以退出码 1 结束**
（§7.2 第 4 条）。静默成功是最坏的情况：QA 以为结果进去了，实际一条都没写。

Node 版那边是 `process.exitCode = 1`——一个不打断任何东西的软标记。Python 没有对应物：
`sys.exit()` 只是抛 `SystemExit`，而 reporter 常常跑在别人的钩子里，异常在那里会被吞掉。
所以核心包在**构造时**注册一个 `atexit` 钩子，失败时它会刷掉缓冲区再 `os._exit(1)`。
注册得早是有意的（atexit 后进先出，越早注册越晚执行），跑测试过程中注册的钩子
都排在它前面、照常执行完。

不想要这条通道就传 `exit_on_empty_write=False`，自己接管退出码——
pytest 插件正是这么做的，它改的是 `session.exitstatus`。

跑通时退出码是 0，附件传失败**不影响**退出码：R2 没配置或配额用完都只是降级，
结论那一轮早就写进去了（§5.6）。

## 幂等

一次进程启动生成一个键，分批时每批的键从它确定性派生，重试算出来的还是同一个（§5.2）。

CI 的 retry 是**新进程**，「一次进程一个」在那里失效——把 CI 的 job/attempt id 喂进
`AS_IDEMPOTENCY_KEY`，同一轮被重跑时服务端才认得出来。

## 不做的事

- **不做预检。** 正常路径只有一次 `POST /ingest/executions`。`GET /ingest/runs`
  是留给人排查用的，SDK 不在正常路径上调它（§7.2 第 5 条，由 `test_no_preflight.py` 守着）。
- **不给附件去重。** 一条结果可能写进多个任务，presign 会按解析出的 run_case
  逐个返回 URL，拿到几个就传几次同一个文件——这是 object key 规则要求的（§5.6）。
- **不让附件拖垮上报。** R2 未配置或配额用完时附件降级，结论照常写入、正常退出。

## 开发

```sh
cd packages/sdk-python
uv venv --python 3.11
uv pip install -e . --python .venv
uv pip install "pytest>=7" --python .venv
uv run --python .venv python -m pytest -q
```

支持 Python 3.9+（macOS 自带的就是 3.9，砍掉它等于逼 QA 先装 Python）。
代价是全库 `from __future__ import annotations`，且不用 `X | Y` 那种写法。
