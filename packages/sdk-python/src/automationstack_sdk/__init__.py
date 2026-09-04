"""本包的公开导出面。

只在这里写 `from .x import y`，各模块之间一律**直接**互相 import，不绕这里
——绕过来就成了一个环形依赖工厂，而且会让「读某个模块要先读 __init__」成立。
这个文件的唯一职责是：让用户的 `from automationstack_sdk import X` 有一份稳定的
名字表，改内部模块划分时不惊动任何调用方。

⚠️ `INGEST_RUNS_ROUTE` 在这里导出，但本包**没有任何代码调它**（§7.2 第 5 条）：
它是留给人写排查脚本用的。`tests/test_no_preflight.py` 守着这条。
"""

from __future__ import annotations

from .attachment_contract_types import (
    IngestAttachmentPresignReceipt,
    IngestAttachmentRegisterItemWire,
    IngestAttachmentRegisterReceipt,
    IngestAttachmentRejection,
    IngestAttachmentUpload,
)
from .attachment_load import (
    AttachmentInputError,
    assert_attachment_input,
    load_attachment,
    load_attachments,
)
from .attachment_upload import upload_attachments
from .config import ReporterConfig, resolve_reporter_config
from .contract_limits import (
    ATTACHMENTS_PER_BATCH,
    MAX_INGEST_ATTACHMENTS_PER_REQUEST,
    MAX_INGEST_COMMENT_LENGTH,
    MAX_INGEST_MESSAGE_LENGTH,
    MAX_INGEST_RESULTS_PER_REQUEST,
    MAX_INGEST_SOURCE_REF_LENGTH,
    RESULTS_PER_BATCH,
)
from .contract_types import (
    ATTACHMENT_KINDS,
    AUTOMATION_CASE_RESULTS,
    AttachmentKind,
    AutomationCaseResult,
    IngestExecutionReceipt,
    IngestExecutionRequestWire,
    IngestExecutionResultWire,
    IngestOutOfScopeEntry,
    IngestSkippedManualEntry,
    IngestUnmatchedCaseEntry,
    IngestWrittenToEntry,
)
from .errors import IngestEmptyWriteError, IngestHttpError, ReporterConfigError
from .execution_batches import (
    ExecutionWindow,
    build_execution_requests,
    chunk_results,
    truncate_message,
)
from .http_client import (
    HttpRequest,
    HttpResponse,
    IngestHttpClient,
    Transport,
    urllib_transport,
)
from .idempotency import derive_batch_idempotency_key, resolve_run_idempotency_key
from .receipt_merge import has_no_writes, merge_receipts
from .receipt_printer import (
    ReceiptSink,
    format_attachment_lines,
    format_receipt_lines,
    print_receipt,
)
from .reporter_client import AutomationStackReporter, RunOutcome
from .reporter_types import (
    AttachmentInput,
    AttachmentOutcome,
    CaseResultInput,
    LoadedAttachment,
)
from .route_paths import (
    INGEST_ATTACHMENTS_PRESIGN_ROUTE,
    INGEST_ATTACHMENTS_REGISTER_ROUTE,
    INGEST_EXECUTIONS_ROUTE,
    INGEST_RUNS_ROUTE,
)
from .submit_execution import submit_execution

__version__ = "1.0.0"

__all__ = [
    "ATTACHMENTS_PER_BATCH",
    "ATTACHMENT_KINDS",
    "AUTOMATION_CASE_RESULTS",
    "INGEST_ATTACHMENTS_PRESIGN_ROUTE",
    "INGEST_ATTACHMENTS_REGISTER_ROUTE",
    "INGEST_EXECUTIONS_ROUTE",
    "INGEST_RUNS_ROUTE",
    "MAX_INGEST_ATTACHMENTS_PER_REQUEST",
    "MAX_INGEST_COMMENT_LENGTH",
    "MAX_INGEST_MESSAGE_LENGTH",
    "MAX_INGEST_RESULTS_PER_REQUEST",
    "MAX_INGEST_SOURCE_REF_LENGTH",
    "RESULTS_PER_BATCH",
    "AttachmentInput",
    "AttachmentInputError",
    "AttachmentKind",
    "AttachmentOutcome",
    "AutomationCaseResult",
    "AutomationStackReporter",
    "CaseResultInput",
    "ExecutionWindow",
    "HttpRequest",
    "HttpResponse",
    "IngestAttachmentPresignReceipt",
    "IngestAttachmentRegisterItemWire",
    "IngestAttachmentRegisterReceipt",
    "IngestAttachmentRejection",
    "IngestAttachmentUpload",
    "IngestEmptyWriteError",
    "IngestExecutionReceipt",
    "IngestExecutionRequestWire",
    "IngestExecutionResultWire",
    "IngestHttpClient",
    "IngestHttpError",
    "IngestOutOfScopeEntry",
    "IngestSkippedManualEntry",
    "IngestUnmatchedCaseEntry",
    "IngestWrittenToEntry",
    "LoadedAttachment",
    "ReceiptSink",
    "ReporterConfig",
    "ReporterConfigError",
    "RunOutcome",
    "Transport",
    "__version__",
    "assert_attachment_input",
    "build_execution_requests",
    "chunk_results",
    "derive_batch_idempotency_key",
    "format_attachment_lines",
    "format_receipt_lines",
    "has_no_writes",
    "load_attachment",
    "load_attachments",
    "merge_receipts",
    "print_receipt",
    "resolve_reporter_config",
    "resolve_run_idempotency_key",
    "submit_execution",
    "truncate_message",
    "upload_attachments",
    "urllib_transport",
]
