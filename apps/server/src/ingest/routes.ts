import type { Hono } from "hono";

import { registerIngestAttachmentRoutes } from "./attachment-routes";
import { registerIngestExecutionRoutes } from "./execution-routes";

/**
 * 自动化上报（ingest）四个端点的 HTTP 入口（plan §5.1.1 与 §5.6）。
 *
 * 与 `jira/webhook.ts` 完全同构：调用方是别人 CI 里的 SDK，不是本平台的前端，
 * 没有会话 cookie，也不会说 oRPC 的协议。所以它们是**普通 HTTP 端点而不是
 * oRPC procedure**，且注册在 oRPC 中间件**之前**——走一遍 `createContext`
 * 只会白做一次 cookie 解析加一次读库。
 *
 * 这一层只做搬运：取头、取体、把类型化结果映射成状态码。鉴权、校验、分桶、
 * 落库、实时事件全在 `packages/api/src/lib/ingest/execution-ingest.ts`
 * 与 `packages/api/src/lib/ingest/attachment-uploads.ts`，
 * 这里**不做任何业务判断**（连「token 长得像不像」都不判：那是 handler 的事）。
 *
 * 四条端点按「哪条线」分在两个文件里，各自的共用零件再分两个：
 * - `execution-routes.ts`——候选清单与结论上报；
 * - `attachment-routes.ts`——附件预签名与登记；
 * - `responses.ts`——状态码与几种固定形状的错误体，四条端点共用；
 * - `body-limit.ts`——两档请求体上限与 413 文案。
 *
 * 本文件只剩注册顺序这一件事，`index.ts` 仍旧只认 `registerIngestRoutes` 一个入口。
 */
export function registerIngestRoutes(app: Hono): void {
	registerIngestExecutionRoutes(app);
	registerIngestAttachmentRoutes(app);
}
