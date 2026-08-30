import {
	handleIngestAttachmentPresign,
	handleIngestAttachmentRegister,
	type IngestAttachmentPresignOutcome,
	type IngestAttachmentRegisterOutcome,
} from "@automationstack/api/lib/ingest/attachment-uploads";
import type { Hono } from "hono";

import {
	ingestBodyLimit,
	MAX_INGEST_ATTACHMENT_BODY_BYTES,
} from "./body-limit";
import {
	forbidden,
	INVALID_JSON_MESSAGE,
	invalidPayload,
	parseJsonBody,
	projectNotFound,
	unauthorized,
	unhandledOutcome,
} from "./responses";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
} from "./route-paths";

/**
 * 附件那条线的两个 HTTP 入口：申请预签名（presign）与上传完成后的登记（register）。
 *
 * 两者是同一次附件上传的前后两步，共用同一条更小的 body 上限
 * （`MAX_INGEST_ATTACHMENT_BODY_BYTES`，理由见 `body-limit.ts`），
 * 所以摆在同一个文件里、与结论上报那两条分开。
 *
 * 与整个 ingest 层一样，这里只做搬运，业务判断全在 api 侧——理由见 `routes.ts`。
 */

function registerPresignRoute(app: Hono): void {
	app.post(
		INGEST_ATTACHMENTS_PRESIGN_ROUTE,
		ingestBodyLimit({
			advice: "附件本体不走这个端点（它只收元数据），请分批申请签名",
			maxSize: MAX_INGEST_ATTACHMENT_BODY_BYTES,
		}),
		async (c) => {
			const parsedBody = parseJsonBody(await c.req.text());
			if (parsedBody.kind !== "ok") {
				return invalidPayload(c, INVALID_JSON_MESSAGE);
			}
			/**
			 * ⚠️ 同样**刻意不套 try/catch**。
			 *
			 * `handleIngestAttachmentPresign` 只把「能说清楚」的失败做成类型化结果。
			 * 特别注意 R2 未配置**不是**异常，它是那边自己的 200 降级分支
			 * （`storageConfigured: false` + 逐条 `rejected`，§5.6）；真正会抛出来的
			 * 是连不上库、R2 签名调用炸了这类故障，接住它们只会把「一个 URL 都没签出来」
			 * 伪装成一次成功的 presign，SDK 随后拿着空对账单当正常结果继续跑。
			 */
			const outcome: IngestAttachmentPresignOutcome =
				await handleIngestAttachmentPresign({
					// 原样透传，不解析 token、不碰哈希——那些全在 `resolveUserFromBearer`。
					authorizationHeader: c.req.header("authorization") ?? null,
					body: parsedBody.body,
				});
			switch (outcome.kind) {
				case "forbidden":
					return forbidden(c);
				case "invalid-payload":
					return invalidPayload(c, outcome.message);
				case "ok":
					// ⚠️ `uploads` 为空**仍然是 200**，与 `writtenTo` 为空同理（§5.8）：
					// 存储没配置、用例没匹配上、任务还在待评审，全由对账单里的
					// `storageConfigured` 与 `rejected` 逐条说明，不挤进状态码。
					return c.json(outcome.receipt);
				case "project-not-found":
					return projectNotFound(c);
				case "unauthorized":
					return unauthorized(c);
				default:
					return unhandledOutcome(outcome);
			}
		}
	);
}

function registerRegisterRoute(app: Hono): void {
	app.post(
		INGEST_ATTACHMENTS_REGISTER_ROUTE,
		ingestBodyLimit({
			advice: "附件本体不走这个端点（它只收元数据），请分批登记",
			maxSize: MAX_INGEST_ATTACHMENT_BODY_BYTES,
		}),
		async (c) => {
			const parsedBody = parseJsonBody(await c.req.text());
			if (parsedBody.kind !== "ok") {
				return invalidPayload(c, INVALID_JSON_MESSAGE);
			}
			// ⚠️ 同样不套 try/catch。这条路径是真的写库（`registerAttachment`）：
			// 吞掉写库异常会让 SDK 以为附件已经登记完毕，而报告页上那一行根本不存在。
			const outcome: IngestAttachmentRegisterOutcome =
				await handleIngestAttachmentRegister({
					authorizationHeader: c.req.header("authorization") ?? null,
					body: parsedBody.body,
				});
			/**
			 * 这里**没有** `project-not-found`、也没有 `forbidden` 分支，不是漏了：
			 * register 的请求体里压根没有 `projectId`（定位靠 presign 回传的
			 * `runId` + `runCaseId`），两种结果都不可能整请求地发生。作用域这一关
			 * 在这条端点上是**逐个任务**判的，判不过的整组进对账单的 `rejected`
			 * （见 `packages/api/src/lib/ingest/attachment-register-scope.ts`），
			 * 与「任务已提交」「任务已删除」走同一条 §5.8 的局部失败路径。
			 * 凭空补一个分支等于映射一种服务端并不会产生的语义。
			 * 将来 handler 真加了它，`unhandledOutcome` 会在编译期把这里拦下来。
			 */
			switch (outcome.kind) {
				case "invalid-payload":
					return invalidPayload(c, outcome.message);
				case "ok":
					return c.json(outcome.receipt);
				case "unauthorized":
					return unauthorized(c);
				default:
					return unhandledOutcome(outcome);
			}
		}
	);
}

export function registerIngestAttachmentRoutes(app: Hono): void {
	registerPresignRoute(app);
	registerRegisterRoute(app);
}
