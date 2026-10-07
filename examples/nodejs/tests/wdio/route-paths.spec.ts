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

		expect(result?.status).toBe(401);
	});
});
