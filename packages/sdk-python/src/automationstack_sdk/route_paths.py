"""四条 ingest 端点的 URL。**这是 `apps/server/src/ingest/route-paths.ts` 的副本**。

为什么是副本而不是从服务端读：本包要能被 `pip install` 之后独立跑，
运行时依赖 TypeScript 那边的任何东西都是不成立的（Python 也根本没法 import
一个 `.ts` 文件）。这与 `packages/sdk-node` 的取舍同源——那边的长注释写着
「SDK 的卖点之一就是零运行时依赖」，本包把这条推到极致：`dependencies` 为空。

副本的代价是「两处可能分叉」，那件事由 `tests/test_contract_parity.py` 兜底：
它把 Node 版那两份 `.ts` 当**文本**读进来，正则抽出常量值逐个比对，
改了一边而没改另一边，测试立刻红。

⚠️ `INGEST_RUNS_ROUTE` 在本包里**刻意没有任何调用方**（§7.2 第 5 条）：
正常路径只有一次 `POST /ingest/executions`，`GET /ingest/runs` 是留给人
排查用的。常量留在这里是为了让副本与服务端那份一一对齐（少一条就比不出差异），
「没人调它」这件事由 `tests/test_no_preflight.py` 扫源码守着。
"""

from __future__ import annotations

INGEST_ATTACHMENTS_PRESIGN_ROUTE = "/ingest/attachments/presign"
INGEST_ATTACHMENTS_REGISTER_ROUTE = "/ingest/attachments/register"
INGEST_EXECUTIONS_ROUTE = "/ingest/executions"
INGEST_RUNS_ROUTE = "/ingest/runs"
