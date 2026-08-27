/**
 * 这一份是**真浏览器打真服务**：把 `@automationstack/sdk` 里那四条路由常量
 * （`route-paths.ts`，服务端同名文件的副本）拿到页面里 `fetch` 一遍，
 * 验的是「SDK 手里这份副本，跟此刻真正跑着的服务对不对得上」。
 *
 * 为什么值得用浏览器跑而不是在 Node 里 fetch：这四条路由是**跨源被调用**的
 * 目标（QA 的机器、CI 的容器都不在服务端同源），而 `browser.url('/')` 之后
 * 的 fetch 是同源的真实请求，走的是真 HTTP 栈、真中间件、真鉴权层——
 * 而不是某个 mock 出来的 handler。
 *
 * ⚠️ 全程不带 token：这里要的恰恰是**没带凭据时的行为**。
 * 一行 SDK 上报动作都没有。
 */

import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
	INGEST_EXECUTIONS_ROUTE,
	INGEST_RUNS_ROUTE,
} from "@automationstack/sdk";
import { browser, expect } from "@wdio/globals";

interface ProbeResult {
	route: string;
	status: number;
}

/**
 * 在页面里把这些路由打一遍。用 `browser.execute` 传异步函数——`executeAsync`
 * 已经废弃了，官方 d.ts 的原话是「Please use the `execute` command instead as it
 * provides better support for error handling via `async`/`await`」。
 *
 * ⚠️ 参数刻意用 `string[]`（`"METHOD /route"`）而不是 `[string, string][]`：
 * `execute` 的入参类型会走 `TransformElement`，它把元组摊成
 * `[string, string, ...HTMLElement[]]`（为了让人能把元素句柄传进页面），
 * 于是二元组根本对不上。扁平字符串数组不受这条影响。
 */
async function probe(probes: string[]): Promise<ProbeResult[]> {
	const raw = await browser.execute(
		(specs) =>
			Promise.all(
				specs.map(async (spec) => {
					const gap = spec.indexOf(" ");
					const method = spec.slice(0, gap);
					const route = spec.slice(gap + 1);
					const response = await fetch(route, {
						body: method === "GET" ? undefined : "{}",
						headers: { "content-type": "application/json" },
						method,
					});
					return `${route} ${response.status}`;
				})
			),
		probes
	);
	return raw.map((line) => {
		const gap = line.lastIndexOf(" ");
		return { route: line.slice(0, gap), status: Number(line.slice(gap + 1)) };
	});
}

describe("ingest 路由在真跑着的服务上确实存在", () => {
	before(async () => {
		await browser.url("/");
	});

	it("[AUTO-REPORT-004] SDK 手里的四条路由没有一条是 404", async () => {
		const results = await probe([
			`POST ${INGEST_EXECUTIONS_ROUTE}`,
			`GET ${INGEST_RUNS_ROUTE}`,
			`POST ${INGEST_ATTACHMENTS_PRESIGN_ROUTE}`,
			`POST ${INGEST_ATTACHMENTS_REGISTER_ROUTE}`,
		]);

		expect(results).toHaveLength(4);
		// 404 是唯一说明「副本跟服务分叉了」的状态码：路由被改名或被删掉，
		// SDK 却还照着旧地址发——表现是所有上报都失败，而错误信息只有一句
		// 「Not Found」，没人看得出是常量过期了。
		// 断言写成「整张表对一遍」而不是逐条 expect：expect-webdriverio 底下是
		// jest 的 expect，它**不收**第二个说明参数（多传一个直接抛），
		// 所以要让失败信息说得出「是哪一条」，只能把路由名带进被比较的值里。
		expect(
			results.map(
				(item) => `${item.route} ${item.status === 404 ? "404" : "存在"}`
			)
		).toEqual([
			`${INGEST_EXECUTIONS_ROUTE} 存在`,
			`${INGEST_RUNS_ROUTE} 存在`,
			`${INGEST_ATTACHMENTS_PRESIGN_ROUTE} 存在`,
			`${INGEST_ATTACHMENTS_REGISTER_ROUTE} 存在`,
		]);
	});

	it("[AUTO-SEARCH-005] 不带 token 的上报必须被挡在门外，而且是 401", async () => {
		const [result] = await probe([`POST ${INGEST_EXECUTIONS_ROUTE}`]);

		// 401 而不是 403：没带凭据和带了凭据但没权限是两件事，
		// 前者该让人去建 token，后者该让人去要授权。混成一个码，
		// SDK 那句「缺少 AS_TOKEN」的提示就无从谈起。
		expect(result?.status).toBe(401);
	});
});
