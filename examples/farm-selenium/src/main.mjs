import { Browser, Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const DEFAULT_FARM_URL = "http://localhost:3002/wd/hub";
const EXPECTED_TITLE = "Example Domain";

function requireEnv(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`缺少环境变量 ${name}（见 .env.example）`);
	}
	return value;
}

/**
 * 点名要跑在哪个**槽位来源**上（plan §12）：一台实机节点的名字，或者内建伪节点
 * `local`。留空 = 不点名，由平台按占用率自己挑一台。
 *
 * 它不是展示字段：点不中（名字写错、那台机器没连上来、它的槽位满了）就是一条
 * 明确的失败，平台不会悄悄换一台跑——点名的动机通常是「那台机器上有我要的
 * 设备/证书」，换一台跑出来的结果是错的。
 */
function nodeHint() {
	return process.env.AS_NODE ?? undefined;
}

function buildDriver() {
	const options = new chrome.Options();
	// 平台鉴权走这个厂商扩展 capability（plan §2 D7）：farm 在转发给上游
	// chromedriver **之前**会把它整个剥掉，token 不会进容器、也不会进 driver 日志。
	//
	// 浏览器启动参数不用管：--remote-debugging-port 之类由 farm 注入，
	// 脚本这边一行都不写（写了反而可能和平台注入的冲突）。
	options.set("as:options", {
		// 可选的人类可读名，会显示在平台的会话列表里，便于对上号。
		name: "farm-selenium-example",
		node: nodeHint(),
		projectId: requireEnv("AS_PROJECT"),
		token: requireEnv("AS_TOKEN"),
	});

	return (
		new Builder()
			.forBrowser(Browser.CHROME)
			// 与普通 Selenium Grid 用法的**唯一**差别就是这一行地址。
			.usingServer(process.env.AS_FARM_URL ?? DEFAULT_FARM_URL)
			.setChromeOptions(options)
			.build()
	);
}

async function main() {
	const driver = await buildDriver();

	try {
		await driver.get("https://example.com");

		// 往页面里打一条 console：平台录的是**浏览器**的 console（终产物是
		// console.ndjson），Node 这边的 console.log 是你自己的进程，不进产物。
		await driver.executeScript(
			"console.log('[farm-selenium-example] 这行会进 console.ndjson 产物')"
		);
		const title = await driver.getTitle();

		if (title !== EXPECTED_TITLE) {
			throw new Error(`标题不对：期望 ${EXPECTED_TITLE}，实际 ${title}`);
		}

		console.log(`✅ 标题断言通过：${title}`);
	} finally {
		// quit() 必须走到：它对应 WebDriver 的 DELETE session，farm 收到之后才会
		// 收尾录制、销毁容器、释放并发槽位。漏了也不会永远占着——空闲超时会兜底，
		// 但那要等满 FARM_SESSION_IDLE_TIMEOUT_MS（默认两分钟）。
		await driver.quit();
	}
}

await main();
