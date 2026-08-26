# pytest-automationstack

pytest 插件，把一轮结果交给 [`automationstack-sdk`](../sdk-python) 批量上报并打印对账单。

**这是一层薄壳，业务逻辑一行都没有。** 分批、幂等键、重试、对账单渲染、
`writtenTo` 为空的判定全在核心包里；这里只做三件事：注册命令行开关、
在 `pytest_runtest_logreport` 里把结果攒进核心包的缓冲、在 `pytest_sessionfinish` 里
调一次核心包并按结果决定 `session.exitstatus`。

## 安装

```sh
pip install "git+ssh://git@github.com/automationstack/automationstack@<tag>#subdirectory=packages/sdk-pytest"
```

会把 `automationstack-sdk` 一起带上。环境变量、对账单样子、退出码规则见
[核心包的 README](../sdk-python/README.md)。

## 用

```sh
pytest --automationstack
```

**默认关**：装了插件不等于开始往平台写东西，上报要显式要求。

### sourceRef 从哪来

marker 优先：

```python
import pytest

@pytest.mark.automationstack("PAY-LOGIN-001")
def test_login_with_valid_credentials():
    ...
```

`@pytest.mark.automationstack(source_ref="PAY-LOGIN-001")` 也认。

没标 marker 的用例**默认不上报**，收工时会打一行说明有几条、都是谁。
加 `--automationstack-nodeid-fallback` 可以退化到用 nodeid
（`tests/test_pay.py::test_login`）当 sourceRef——默认关掉，是因为 nodeid 与平台上
录进去的 `sourceRef` 基本不可能碰巧相等，开着只会让整批结果掉进对账单的
「未匹配」里，把真正该看的那几条淹掉。

### pytest 的三个阶段怎么映射成结论

| pytest | 上报 | 为什么 |
|---|---|---|
| setup 失败（fixture 炸了） | `blocked` | 用例没跑起来，被测功能既没通过也没失败 |
| setup 被 skip | `skipped` | |
| call 通过 / 失败 | `passed` / `failed` | |
| call 里 `pytest.skip()` | `skipped` | |
| `xfail` 且真的失败了 | `skipped` | 报 `failed` 会让失败清单上固定挂着谁都不修的条目 |
| teardown 失败 | 不改结论 | 断言已经跑完，teardown 崩了是脚本自己的问题，它在 pytest 自己的输出里一目了然 |

### 失败信息与堆栈

断言输出进 `comment`（核心包按 `MAX_INGEST_COMMENT_LENGTH` 截断），
**超过上限时**完整堆栈另传一个 `log` 附件。不超就不传：附件是按任务计配额的
（500 条/任务），拿它去存一份与 comment 一字不差的副本，会让真正需要附件的用例
被配额挡在外面。

### 给失败用例挂附件

插件自己只管结论，截图与 driver 日志长什么样只有你的仓库知道。要把它们挂上去，
用插件唯一的公开入口：

```python
import pytest
from automationstack_sdk import AttachmentInput
from pytest_automationstack import add_attachment

@pytest.hookimpl(tryfirst=True)   # 必须赶在插件的 sessionfinish（就是 finish() 那一下）之前
def pytest_sessionfinish(session):
    add_attachment(session.config, AttachmentInput(
        file_path="artifacts/PAY-LOGIN-001.png",
        kind="screenshot",
        source_ref="PAY-LOGIN-001",
    ))
```

它把附件挂到**这一轮的那个** reporter 上——自己 new 一个 `AutomationStackReporter`
就是另一次执行、另一个 execution id，附件会挂到一份没有结论的记录上。

调用只入队，一个请求都不发。**没加 `--automationstack` 时是安静的空操作**，返回
`False`：写满了这个调用的仓库，不带开关时照样要能在没有 AS_TOKEN 的机器上跑通。

完整的接线（落盘、回捡、只在失败时收集）见 [`examples/python/conftest.py`](../../examples/python/conftest.py)。

### 退出码

一条都没写进去时插件把 `session.exitstatus` 设成 1（§7.2 第 4 条），
服务端逐条给出的拒绝理由原样打在终端上。上报本身炸了（网络、鉴权）同样判失败——
静默成功是最坏的情况。

用的是 pytest 自己的 `session.exitstatus`，而不是核心包那条 `os._exit` 兜底通道：
后者会把 pytest 的收尾（报告、缓存、其他插件的 `sessionfinish`）整个跳过。

## 开发

```sh
cd packages/sdk-pytest
uv venv --python 3.11
uv pip install -e ../sdk-python -e . --python .venv
uv pip install "pytest>=7" --python .venv
./.venv/bin/python -m pytest -q
```
