"""pytest 插件：注册开关 → 攒结果 → 收工时上报一次。

**这层薄壳只做三件事**，业务逻辑一行都没有：

1. `pytest_addoption` / `pytest_configure`：命令行开关与 `automationstack` marker；
2. `pytest_runtest_logreport`：把每份 report 搬进核心包的缓冲（`add_result`，只入内存）；
3. `pytest_sessionfinish`：调一次 `finish()`，让核心包批量提交、打印对账单，
   然后按结果决定 `session.exitstatus`。

分批、幂等键、重试、对账单渲染、`writtenTo` 为空的判定全在 `automationstack_sdk` 里。
这么切是为了让 W7（JUnit）与以后可能的 robot / unittest 壳照抄同一份骨架：
壳换掉的只有「框架的对象长什么样」，五条铁律（§7.2）只有一份实现。

**对外只有一个公开入口**：`add_attachment(config, attachment)`。结论的收集全自动，
不需要用户写一行代码；附件不同——截图、driver 日志、请求响应体长什么样只有用户的
仓库知道，插件不认识 playwright / appium / selenium 中的任何一个。它同样只入队，
一个请求都不发。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from automationstack_sdk import (
    MAX_INGEST_COMMENT_LENGTH,
    AttachmentInput,
    AutomationStackReporter,
    CaseResultInput,
    IngestEmptyWriteError,
)

from .report_mapping import (
    MARKER_NAME,
    duration_ms,
    failure_text,
    result_of,
    source_ref_of,
)

_SESSION_ATTR = "_automationstack_session"


def pytest_addoption(parser: Any) -> None:
    group = parser.getgroup("automationstack")
    group.addoption(
        "--automationstack",
        action="store_true",
        default=False,
        # 默认关：装了插件的人不该因为忘了配 AS_TOKEN 就跑不了测试。
        # 上报是一件要显式要求的事，而不是装个包就偷偷开始往平台写东西。
        help="把本轮结果批量上报到 automationstack（需要 AS_TOKEN / AS_PROJECT / AS_BASE_URL）",
    )
    group.addoption(
        "--automationstack-nodeid-fallback",
        action="store_true",
        default=False,
        help="没标 @pytest.mark.automationstack 的用例退化用 nodeid 当 sourceRef",
    )


def pytest_configure(config: Any) -> None:
    config.addinivalue_line(
        "markers",
        "{0}(source_ref): 这条用例对应平台上的哪个 sourceRef".format(MARKER_NAME),
    )
    if not config.getoption("--automationstack"):
        return
    # 在这里构造 reporter，等于把「缺 AS_TOKEN」摁在**跑测试之前**炸掉——
    # 跑完二十分钟才发现结果无处可去是最贵的失败方式。
    setattr(config, _SESSION_ATTR, _Session(config))


def _session_of(config: Any) -> Optional["_Session"]:
    # 用 setattr 而不是 pytest 的 `Stash`：`Stash` 是 7.0 才有的，
    # 而 `pyproject.toml` 声明的下限是 pytest>=7 的**运行时**，
    # 装着 7.0 之前版本的老仓库至少要能给出一句能读的报错而不是 AttributeError。
    return getattr(config, _SESSION_ATTR, None)


def add_attachment(config: Any, attachment: AttachmentInput) -> bool:
    """把一个附件挂到本轮上报的某条用例上（按 `attachment.source_ref` 归属）。

    这是插件唯一的公开入口，它存在的理由只有一个：附件必须挂在**这一轮的那个**
    reporter 上。另建一个 reporter 就是另一次执行、另一个 execution id，
    附件会挂到一份没有结论的记录上。而「失败 → 收集现场」那段接线只能写在用户的
    仓库里（插件不认识任何一个 driver），所以「挂到哪」这一下由这里接住。

    :param config: pytest 的 `Config`；hook 里是 `session.config` / `item.config`，
        fixture 里是 `request.config`。
    :param attachment: 核心包的 `AttachmentInput`（`body` 与 `file_path` 二选一，
        `source_ref` 决定挂到哪条用例上）。
    :returns: 真的入队了返回 `True`；没加 `--automationstack` 时返回 `False`。

    没加 `--automationstack` 时这里是**安静的空操作**：不抛异常、不打印、
    也不会顺手建一个 reporter。「装了插件不等于开始往平台写东西」是本插件的默认
    约定，公开入口不该成为破坏它的那条缝——不带开关的 `pytest` 必须能在没有
    AS_TOKEN 的机器上跑通，哪怕仓库的 conftest 里写满了这个调用。

    ⚠️ 只入内存队列，一个请求都不发；真正上传发生在 `pytest_sessionfinish` 里那次
    `finish()`。所以调用必须赶在它**之前**——在自己的 `pytest_sessionfinish` 里挂
    附件时记得 `@pytest.hookimpl(tryfirst=True)`，同名 hook 的顺序不该靠「恰好」。
    """
    session = _session_of(config)
    if session is None:
        return False
    session.reporter.add_attachment(attachment)
    return True


class _Session:
    """一轮 pytest 会话对应一个 reporter。"""

    def __init__(self, config: Any) -> None:
        self.nodeid_fallback = bool(config.getoption("--automationstack-nodeid-fallback"))
        self.source_refs: Dict[str, str] = {}
        self.reporter = _make_reporter()
        self.skipped_nodeids: List[str] = []

    def record(self, report: Any) -> None:
        result = result_of(report)
        if result is None:
            return
        source_ref = self.source_refs.get(report.nodeid)
        if source_ref is None:
            # 没 sourceRef 的用例**不上报**，也不静默：整批发过去只会让它们
            # 挤满对账单的「未匹配」，把真正该看的那几条淹掉。收工时统一说一句。
            self.skipped_nodeids.append(report.nodeid)
            return
        text = failure_text(report)
        self.reporter.add_result(
            CaseResultInput(
                duration_ms=duration_ms(report),
                message=text,
                result=result,
                source_ref=source_ref,
            )
        )
        if text and len(text) > MAX_INGEST_COMMENT_LENGTH:
            # 只有**超了才**传 log 附件：不超时附件与 comment 一字不差，
            # 而附件是按任务计配额的（500 条/任务），拿它去存两行重复文本
            # 会让真正需要附件的那几条用例被配额挡在外面。
            self.reporter.add_attachment(
                AttachmentInput(
                    body=text.encode("utf-8"),
                    content_type="text/plain",
                    file_name="{0}.log".format(source_ref),
                    kind="log",
                    source_ref=source_ref,
                )
            )


def _make_reporter() -> AutomationStackReporter:
    """配置全部从环境变量读（`AS_TOKEN` / `AS_PROJECT` / `AS_BASE_URL`）。

    `exit_on_empty_write=False`：退出码这件事由 `pytest_sessionfinish` 里的
    `session.exitstatus` 管——那是 pytest 自己的、干净的机制，
    而核心包的兜底通道会 `os._exit`，那会把 pytest 的收尾（报告、缓存、
    其他插件的 `sessionfinish`）整个跳过。
    """
    return AutomationStackReporter(exit_on_empty_write=False)


def pytest_collection_modifyitems(config: Any, items: List[Any]) -> None:
    session = _session_of(config)
    if session is None:
        return
    # report 上没有 marker，只有 nodeid，所以在收集阶段把对应关系存下来。
    for item in items:
        source_ref = source_ref_of(item, nodeid_fallback=session.nodeid_fallback)
        if source_ref:
            session.source_refs[item.nodeid] = source_ref


def pytest_runtest_logreport(report: Any) -> None:
    session = _ACTIVE.get("session")
    if session is not None:
        # 只入内存缓冲，一个网络请求都不发（§7.2 第 1 条 / D29）。
        session.record(report)


#: `pytest_runtest_logreport` 的签名里没有 config，只能从这里取当前会话。
#: 一个进程里同时跑两轮 pytest 不是本插件支持的场景（pytest 自己也不支持）。
_ACTIVE: Dict[str, Any] = {}


def pytest_sessionstart(session: Any) -> None:
    _ACTIVE["session"] = _session_of(session.config)


def pytest_sessionfinish(session: Any, exitstatus: int) -> None:
    active = _ACTIVE.pop("session", None)
    if active is None:
        return
    reporter = active.reporter
    if active.skipped_nodeids:
        print(
            "[automationstack] {0} 条用例没有 sourceRef，未上报：{1}".format(
                len(active.skipped_nodeids), "、".join(active.skipped_nodeids[:5])
            )
        )
    try:
        reporter.finish()
    except IngestEmptyWriteError as error:
        # §7.2 第 4 条：一条都没写进去必须显式报错 + 退出码非零。
        # 理由是**服务端原文**，插件一个字都不概括。
        print(str(error))
        session.exitstatus = 1
    except Exception as error:  # noqa: BLE001 — 上报炸了也得让整轮判失败
        # 网络/鉴权炸了同样不能静默：QA 会以为结果进去了。
        print("[automationstack] 上报失败：{0}".format(error))
        session.exitstatus = 1
