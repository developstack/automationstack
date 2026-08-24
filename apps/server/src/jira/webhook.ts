import {
	JIRA_SECRET_HEADER,
	JIRA_SIGNATURE_HEADER,
	JIRA_WEBHOOK_ROUTE,
} from "@automationstack/api/lib/jira/webhook";
import { handleJiraWebhook } from "@automationstack/api/lib/jira/webhook-handler";
import type { Hono } from "hono";

/**
 * Jira 状态同步 webhook 的 HTTP 入口。
 *
 * 它是**普通 HTTP 端点而不是 oRPC procedure**：调用方是 Jira，不是本平台的
 * 前端，没有会话 cookie，也不会说 oRPC 的协议；而且 HMAC 校验需要**原始请求体
 * 字节**，oRPC 的输入管道拿不到。
 *
 * 本文件只做搬运：取头、取原始体、把类型化结果映射成状态码。校验、解析与落库
 * 全在 `packages/api/src/lib/jira/webhook-handler.ts`（那里也解释了为什么
 * `defectStatus` 是「已提交即冻结」的唯一例外）。
 */

/** 路径参数必须先自证是个 uuid，否则拿去查库会撞出一个 500。 */
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

/**
 * 拒绝时的统一应答。
 *
 * 「密钥不对」与「这个项目没配 Jira」返回**完全相同**的 401：这个端点没有
 * 会话，任何人都能拿一串 projectId 来试，两者若可区分，它就成了「哪些项目
 * 配了 Jira」的探测器。
 */
const REJECTED_BODY = { error: "rejected" } as const;

export function registerJiraWebhook(app: Hono): void {
	app.post(JIRA_WEBHOOK_ROUTE, async (c) => {
		const projectId = c.req.param("projectId");
		if (!UUID_PATTERN.test(projectId)) {
			return c.json(REJECTED_BODY, HTTP_UNAUTHORIZED);
		}
		// 必须是原始文本：HMAC 对字节算，重新序列化过的 JSON 键序与空白都可能变。
		const rawBody = await c.req.text();
		const outcome = await handleJiraWebhook({
			projectId,
			rawBody,
			secretHeader: c.req.header(JIRA_SECRET_HEADER) ?? null,
			signatureHeader: c.req.header(JIRA_SIGNATURE_HEADER) ?? null,
		});
		switch (outcome.kind) {
			case "invalid-payload":
				return c.json({ error: "invalid payload" }, HTTP_BAD_REQUEST);
			case "synced":
				return c.json({ status: "synced" });
			case "ignored":
				// 评论、附件、worklog 等我们不关心的事件走这里。**必须回 2xx**：
				// Jira 对非 2xx 会重试，反复失败还会把 webhook 整个停用。
				return c.json({ status: "ignored" });
			default:
				return c.json(REJECTED_BODY, HTTP_UNAUTHORIZED);
		}
	});
}
