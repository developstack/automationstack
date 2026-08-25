import {
	handleIngestExecution,
	handleIngestRuns,
	type IngestExecutionOutcome,
	type IngestRunsOutcome,
} from "@automationstack/api/lib/ingest/execution-ingest";
import type { Hono } from "hono";

import { ingestBodyLimit, MAX_INGEST_BODY_BYTES } from "./body-limit";
import {
	HTTP_BAD_REQUEST,
	INVALID_JSON_MESSAGE,
	invalidPayload,
	parseJsonBody,
	projectNotFound,
	unauthorized,
	unhandledOutcome,
} from "./responses";
import { INGEST_EXECUTIONS_ROUTE, INGEST_RUNS_ROUTE } from "./route-paths";

/**
 * 结论上报这条线的两个 HTTP 入口：候选清单（GET /ingest/runs）与结论本身
 * （POST /ingest/executions）。两者同属一次上报的前后两步，且共用
 * `execution-ingest.ts` 里的那一对 handler，所以摆在同一个文件里。
 *
 * 与整个 ingest 层一样，这里只做搬运，业务判断全在 api 侧——理由见 `routes.ts`。
 */

function registerRunsRoute(app: Hono): void {
	app.get(INGEST_RUNS_ROUTE, async (c) => {
		const outcome: IngestRunsOutcome = await handleIngestRuns({
			authorizationHeader: c.req.header("authorization") ?? null,
			// 查询串原样交出去，一个字都不解析：`projectId` 是不是 uuid、缺了没有，
			// 全由 handler 里的 `ingestRunsQuerySchema` 说了算。在这里先判一道，
			// 拒绝理由就有了两个来源，早晚会说出两句不一样的话。
			query: c.req.query(),
		});
		switch (outcome.kind) {
			case "invalid-payload":
				return invalidPayload(c, outcome.message);
			case "ok":
				return c.json(outcome.response);
			case "project-not-found":
				return projectNotFound(c);
			case "unauthorized":
				return unauthorized(c);
			default:
				return unhandledOutcome(outcome);
		}
	});
}

function registerExecutionRoute(app: Hono): void {
	app.post(
		INGEST_EXECUTIONS_ROUTE,
		ingestBodyLimit({
			advice: "结果本身没有问题，请分批重发（SDK 建议每批 200 条）",
			maxSize: MAX_INGEST_BODY_BYTES,
		}),
		async (c) => {
			const parsedBody = parseJsonBody(await c.req.text());
			if (parsedBody.kind !== "ok") {
				return invalidPayload(c, INVALID_JSON_MESSAGE);
			}
			/**
			 * ⚠️ 这里**刻意不套 try/catch**。
			 *
			 * `handleIngestExecution` 只把「能说清楚」的失败做成类型化结果；连不上库、
			 * SQL 报错这类真故障是**故意让它抛出去**的：接住会让
			 * `completeAutomationExecution` 没跑完的那一轮被标成已完成，之后同键重试
			 * 直接走「返回缓存对账单」，剩下的任务永远写不进去。
			 *
			 * Hono 的默认 errorHandler 已经把未捕获异常 `console.error` 之后翻成
			 * 500（hono-base 的 `errorHandler`），正是要的行为，所以这里不再加一层。
			 */
			const outcome: IngestExecutionOutcome = await handleIngestExecution({
				// 原样透传，不解析 token、不碰哈希——那些全在 `resolveUserFromBearer`。
				authorizationHeader: c.req.header("authorization") ?? null,
				body: parsedBody.body,
			});
			switch (outcome.kind) {
				case "duplicate-source-refs":
					return c.json(
						{
							error: "duplicate-source-refs",
							message:
								"同一批结果里有重复的 sourceRef，整批未受理；请合并后重发",
							sourceRefs: outcome.sourceRefs,
						},
						HTTP_BAD_REQUEST
					);
				case "invalid-payload":
					return invalidPayload(c, outcome.message);
				case "ok":
					// ⚠️ `writtenTo` 为空**仍然是 200**（§5.8）：HTTP 码表达「请求本身有没有
					// 问题」，对账单表达「业务上发生了什么」。把「一条都没写进去」做成
					// 404/422，SDK 就分不清是路由错了还是业务结果——那件事由 SDK 自己
					// 照着对账单翻成非零退出码。
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

export function registerIngestExecutionRoutes(app: Hono): void {
	registerRunsRoute(app);
	registerExecutionRoute(app);
}
