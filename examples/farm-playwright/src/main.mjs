import { chromium } from "playwright-core";

const DEFAULT_CDP_URL = "ws://localhost:3002/cdp";
const EXPECTED_TITLE = "Example Domain";

function requireEnv(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`缺少环境变量 ${name}（见 .env.example）`);
	}
	return value;
}

function buildCdpUrl() {
	const url = new URL(process.env.AS_FARM_CDP_URL ?? DEFAULT_CDP_URL);
	// CDP 侧没有 capabilities 这种东西，鉴权只能挂在查询参数上（plan §2 D7）。
	// browser/version 是可选的选型参数，不给就用平台目录里的默认浏览器。
	url.searchParams.set("token", requireEnv("AS_TOKEN"));
	url.searchParams.set("projectId", requireEnv("AS_PROJECT"));
	url.searchParams.set("browser", "chromium");
	// 点名槽位来源（plan §12）。CDP 这边叫 node，与 WebDriver 的
	// `as:options.node` 是同一件事。留空 = 由平台自己挑。
	const node = process.env.AS_NODE;
	if (node) {
		url.searchParams.set("node", node);
	}
	return url.toString();
}

async function main() {
	// connectOverCDP 而不是 connect()：平台不跑 Playwright 的 run-server，
	// 那条路要求客户端与服务端 Playwright 版本严格一致，多租户下是版本矩阵地狱。
	// CDP 协议稳定得多，你这边升级 Playwright 不需要平台跟着动（plan §2 D2）。
	const browser = await chromium.connectOverCDP(buildCdpUrl());

	try {
		// 容器里的 chromium 已经有一个默认 context，直接复用；
		// newContext() 在 CDP 连接上会另开一个 incognito 上下文，也能用，
		// 但那样两个上下文的录制会混在同一个会话里，不如复用来得干净。
		const context = browser.contexts()[0] ?? (await browser.newContext());
		const page = await context.newPage();

		await page.goto("https://example.com");

		// 同理：平台录的是**浏览器**的 console（终产物是 console.ndjson），
		// 下面那句 Node 侧的 console.log 是你自己的进程，不进产物。
		await page.evaluate(() => {
			console.log("[farm-playwright-example] 这行会进 console.ndjson 产物");
		});
		const title = await page.title();

		if (title !== EXPECTED_TITLE) {
			throw new Error(`标题不对：期望 ${EXPECTED_TITLE}，实际 ${title}`);
		}

		console.log(`✅ 标题断言通过：${title}`);
	} finally {
		// close() 会关掉这条 WS，farm 以此为「会话结束」的信号：收尾录制、
		// 销毁容器、释放槽位。进程被 Ctrl-C 掉也没事——WS 断了就是断了，
		// 平台看到的是同一件事。
		await browser.close();
	}
}

await main();
