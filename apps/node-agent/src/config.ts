import { join } from "node:path";

/**
 * env 值 → agent 运行配置的**纯**转换。
 *
 * 这个文件刻意**不 import `@automationstack/env/node-agent`**：那份 schema 一被
 * import 就会当场校验 `process.env`（两个必填变量），于是任何想测一行 URL 拼接的
 * 用例都得先摆一套环境变量。真正读 env 的地方只有 `index.ts` 一处，
 * 它把值传进来（`NodeAgentEnvValues` 是那份 schema 输出的结构性投影）。
 */

/** farm 侧节点接入口。与 plan §12 的 `wss://farm/nodes/connect` 逐字一致。 */
export const NODE_CONNECT_PATH = "/nodes/connect";

/** 本机进程槽位的目录根。与 farm 的 `<FARM_WORK_DIR>/local-slots` 同一约定。 */
const LOCAL_SLOTS_DIR = "local-slots";

/** 顶层常量而不是循环内新建（仓库规约：`no-regex-in-loop`）。 */
const TRAILING_SLASHES = /\/+$/;

export interface NodeAgentEnvValues {
	NODE_AGENT_CHROME_BIN?: string | undefined;
	NODE_AGENT_CHROMEDRIVER_BIN?: string | undefined;
	NODE_AGENT_DOCKER_HOST: string;
	NODE_AGENT_FARM_URL: string;
	NODE_AGENT_HEADLESS: boolean;
	NODE_AGENT_TOKEN: string;
	NODE_AGENT_WORK_DIR: string;
}

export interface AgentConfig {
	/** 拨号地址，`ws(s)://…/nodes/connect`。 */
	connectUrl: string;
	docker: { host: string };
	local: {
		chromeBin: string | undefined;
		chromedriverBin: string | undefined;
		headless: boolean;
		slotsRoot: string;
	};
	token: string;
	workDir: string;
}

/**
 * `http(s)://平台` → `ws(s)://平台/nodes/connect`。
 *
 * 让人在 `.env` 里填 http 而不是 ws，是因为那是他在浏览器地址栏里见过的那个串；
 * 「协议要换成 ws、路径要补 /nodes/connect」是**协议的知识**，属于 agent，
 * 不属于配置它的人。
 *
 * 保留原 URL 的路径前缀（`https://例子/farm` → `wss://例子/farm/nodes/connect`）：
 * 平台挂在反代子路径下是常见部署形态，直接丢掉 pathname 会得到一个 404，
 * 而那个 404 在握手期表现为「连上了又被关掉」，非常难猜。
 */
export function connectUrlOf(farmUrl: string): string {
	const url = new URL(farmUrl);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(
			`NODE_AGENT_FARM_URL 只接受 http:// 或 https://，收到 ${url.protocol}//`
		);
	}
	const scheme = url.protocol === "https:" ? "wss" : "ws";
	const base = url.pathname.replace(TRAILING_SLASHES, "");
	return `${scheme}://${url.host}${base}${NODE_CONNECT_PATH}`;
}

export function configFromEnv(values: NodeAgentEnvValues): AgentConfig {
	return {
		connectUrl: connectUrlOf(values.NODE_AGENT_FARM_URL),
		docker: { host: values.NODE_AGENT_DOCKER_HOST },
		local: {
			chromeBin: values.NODE_AGENT_CHROME_BIN,
			chromedriverBin: values.NODE_AGENT_CHROMEDRIVER_BIN,
			headless: values.NODE_AGENT_HEADLESS,
			slotsRoot: join(values.NODE_AGENT_WORK_DIR, LOCAL_SLOTS_DIR),
		},
		token: values.NODE_AGENT_TOKEN,
		workDir: values.NODE_AGENT_WORK_DIR,
	};
}
