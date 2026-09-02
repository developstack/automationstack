import "dotenv/config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * `apps/node-agent`（实机节点守护进程）专用的环境变量。
 *
 * **单独一个 createEnv、不并进 `server.ts` 也不并进 `farm.ts`**：理由与 farm.ts
 * 头注释逐字相同——node-agent 是第三个进程、跑在**第三台机器**上，那台机器上
 * 既没有 `DATABASE_URL` 也没有 `R2_*`（它连不上库，也不该连）。把 NODE_AGENT_*
 * 塞进任何一份既有 schema，得到的都是「一台执行机必须配一堆它永远不读的变量」。
 *
 * 反过来，这份 schema 也**刻意不复用 FARM_***：同一台开发机上完全可能既跑 farm
 * 又跑 agent（自测用），两者的 chrome 路径、工作目录、docker host 必须能各配各的。
 * 变量名前缀不同，`.env` 才不会互相串味。
 *
 * 这个包不认识 `packages/db`，所以 token 的 `as_node_` 前缀在这里**不做校验**：
 * 前缀常量的真相源是 `packages/db/src/farm-node-token.ts`，在这儿复制一份的收益
 * （早一步报错）远小于代价（哪天前缀变了，会有一处安静地对不上）。凭据对不对
 * 由 farm 哈希比对说了算，agent 只负责把它原样搬过去。
 */

/** 槽位过程数据的落盘根目录。理由与 `FARM_WORK_DIR` 相同：这些是过程数据。 */
const DEFAULT_WORK_DIR = join(tmpdir(), "automationstack-node-agent");

/** 默认 daemon 地址。形态与 `FARM_DOCKER_HOST` 一致（`parseDockerHost` 解析它）。 */
const DEFAULT_DOCKER_HOST = "unix:///var/run/docker.sock";

export const nodeAgentEnv = createEnv({
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		/**
		 * 本机 Chrome/Chromium 可执行文件。留空按平台探测（macOS 的
		 * `/Applications/Google Chrome.app/...`、Linux 的 `google-chrome` /
		 * `chromium`），探不到在 acquire 时报错而不是启动时。
		 *
		 * 探测失败的错误文案里会**指名这个变量**：变量名由调用方传给
		 * `@automationstack/browser-slots`（`BinaryEnvNames`），装配点在
		 * `apps/node-agent/src/provider-factory.ts`。
		 */
		NODE_AGENT_CHROME_BIN: z.string().min(1).optional(),
		/**
		 * 本机 chromedriver。留空查 PATH。**只有 webdriver 模式才需要它**，
		 * 所以缺失同样不是启动错误：一台只接 CDP 会话的节点不必装它。
		 */
		NODE_AGENT_CHROMEDRIVER_BIN: z.string().min(1).optional(),
		/**
		 * docker 后端要连的本机 daemon。**这个地址是「本机的 daemon」**：
		 * 节点跑容器的意义就是「在这台机器上跑」，指向另一台机器的 daemon
		 * 会让隧道端口（agent 从 127.0.0.1 连容器发布的端口）当场落空。
		 */
		NODE_AGENT_DOCKER_HOST: z.string().min(1).default(DEFAULT_DOCKER_HOST),
		/**
		 * 平台地址（farm 的对外 URL），**填 http(s)**，agent 内部转成
		 * `ws(s)://…/nodes/connect`。让人填 http 而不是 ws：这是他在浏览器里
		 * 访问平台用的那个地址，填自己见过的东西才不会错。
		 *
		 * ⚠️ 生产必须是 https：节点 token 的明文在握手第一帧里，明文 ws 等于把
		 * 凭据发在网上（`packages/farm-node-protocol/src/control.ts` 的 hello 注释）。
		 */
		NODE_AGENT_FARM_URL: z
			.url()
			.refine(
				(value) => value.startsWith("http://") || value.startsWith("https://"),
				"必须是 http:// 或 https:// 开头的平台地址（agent 自己转成 ws/wss）"
			),
		/**
		 * 浏览器跑不跑无头。默认 true——节点通常是一台没人看着的机器。
		 *
		 * 刻意不用 `z.coerce.boolean()`：它把任意非空串（包括 "false"）判成 true，
		 * 于是 `NODE_AGENT_HEADLESS=false` 会静默地无头跑（与 farm.ts 同一条坑）。
		 */
		NODE_AGENT_HEADLESS: z
			.enum(["true", "false"])
			.default("true")
			.transform((value) => value === "true"),
		/** 节点凭据明文（形如 `as_node_…`），在平台的节点管理页创建时显示一次。 */
		NODE_AGENT_TOKEN: z.string().min(1),
		/** 槽位目录（`<WORK_DIR>/local-slots/<sessionId>/`）的根。 */
		NODE_AGENT_WORK_DIR: z.string().min(1).default(DEFAULT_WORK_DIR),
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
