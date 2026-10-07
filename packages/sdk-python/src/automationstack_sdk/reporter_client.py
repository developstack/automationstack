"""SDK 的**唯一**形态：一个框架无关的编程式入口。

本包不认识 pytest、unittest、robot 或任何别的框架，`dependencies` 是空的。
用户（或者 `pytest-automationstack` 那层薄壳）把框架给的对象搬成 `CaseResultInput`，
那十几行搬运代码在**插件里或他自己的仓库里**——框架升级时改的是那几行，
不用等我们发版，我们也不会因为绑了某个框架的大版本而卡住别人。

生命周期严格对应 §7.2 的五条铁律：

1. `add_result` 只入内存缓冲，`finish()` 才发（缓冲后批量提交，D29）；
2. 幂等键在**构造时**生成一次，之后所有批次都从它派生，重试复用；
3. `finish()` 一定会把对账单原样打出来，`writtenTo` 逐任务一行；
4. `writtenTo` 为空时抛 `IngestEmptyWriteError` 并把退出码摁成非零；
5. 全程不调 `GET /ingest/runs`，正常路径只有 `POST /ingest/executions`。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, List, Optional

from .attachment_load import assert_attachment_input, load_attachments
from .attachment_upload import upload_attachments
from .config import ReporterConfig, resolve_reporter_config
from .contract_types import IngestExecutionReceipt
from .errors import IngestEmptyWriteError, arm_nonzero_exit, mark_nonzero_exit
from .execution_batches import ExecutionWindow
from .http_client import IngestHttpClient, Transport
from .receipt_merge import has_no_writes
from .receipt_printer import ReceiptSink, default_sink, print_receipt
from .reporter_types import AttachmentInput, AttachmentOutcome, CaseResultInput
from .submit_execution import submit_execution


@dataclass(frozen=True)
class RunOutcome:
    receipt: IngestExecutionReceipt
    attachments: Optional[AttachmentOutcome]


class AutomationStackReporter:
    def __init__(
        self,
        *,
        config: Optional[ReporterConfig] = None,
        exit_on_empty_write: bool = True,
        max_attempts: int = 3,
        sink: ReceiptSink = default_sink,
        sleep: Optional[Callable[[float], None]] = None,
        started_at: Optional[datetime] = None,
        timeout_seconds: float = 30.0,
        transport: Optional[Transport] = None,
        **config_kwargs: object,
    ) -> None:
        self._config = config or resolve_reporter_config(**config_kwargs)  # type: ignore[arg-type]
        self._client = IngestHttpClient(
            base_url=self._config.base_url,
            max_attempts=max_attempts,
            sleep=sleep,
            timeout_seconds=timeout_seconds,
            token=self._config.token,
            transport=transport,
        )
        self._sink = sink
        self._started_at = started_at or datetime.now()
        self._results: List[CaseResultInput] = []
        self._attachments: List[AttachmentInput] = []
        if exit_on_empty_write:
            arm_nonzero_exit()

    @property
    def idempotency_key(self) -> str:
        """一次进程一个，重试复用（§7.2 第 2 条）。暴露出来是为了能打进日志。"""
        return self._config.idempotency_key

    @property
    def pending_result_count(self) -> int:
        return len(self._results)

    def add_result(self, result: CaseResultInput) -> None:
        """只入缓冲，**不发网络**。跑一条报一条既慢又碎（D29）。"""
        self._results.append(result)

    def add_results(self, results: List[CaseResultInput]) -> None:
        self._results.extend(results)

    def add_attachment(self, attachment: AttachmentInput) -> None:
        """同样只入队；真正读盘在 `finish()`，几百张截图不必整轮驻留内存。"""
        assert_attachment_input(attachment)
        self._attachments.append(attachment)

    def finish(self) -> RunOutcome:
        """攒完一整轮之后调一次。

        顺序是**先结论、后附件**：附件的 presign 要按 sourceRef 解析到 run_case，
        而人看报告时最在意的是结论有没有进去。

        :raises IngestEmptyWriteError: `writtenTo` 为空时（§7.2 第 4 条）。
        """
        receipt = submit_execution(
            client=self._client,
            config=self._config,
            results=self._results,
            window=ExecutionWindow(
                finished_at=datetime.now(), started_at=self._started_at
            ),
        )
        attachments = self._flush_attachments()
        print_receipt(receipt, attachments, self._sink)
        if has_no_writes(receipt):
            mark_nonzero_exit()
            raise IngestEmptyWriteError(receipt)
        return RunOutcome(attachments=attachments, receipt=receipt)

    def _flush_attachments(self) -> Optional[AttachmentOutcome]:
        if not self._attachments:
            return None
        loaded, failures = load_attachments(self._attachments)
        outcome = upload_attachments(
            attachments=loaded, client=self._client, config=self._config
        )
        outcome.rejections[:0] = failures
        return outcome
