import "dotenv/config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** farm 的默认 HTTP/WS 端口（plan §2 D3：3000 是 server，3001 是 web）。 */
const DEFAULT_FARM_PORT = 3002;

/** 全局并发会话上限（plan §2 D11：超限直接 503，不排队）。 */
const DEFAULT_MAX_SESSIONS = 8;

/** 空闲超时：WebDriver 每次转发重置；CDP 以 WS 存活为准，不吃这一项。 */
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 120_000;

/** 会话寿命上限：两种协议都吃，防挂死会话把并发槽位占死。 */
const DEFAULT_SESSION_MAX_LIFETIME_MS = 1_800_000;

/**
 * 默认 daemon 地址。写成 `unix://` 而不是裸路径：`FARM_DOCKER_HOST` 还要能接
 * `ssh://user@host` 与 `tcp://host:2376`（plan §5.6），三种形态用同一个 URL
 * 语法表达，解析逻辑才只有一处（apps/farm/src/config.ts）。
 */
const DEFAULT_DOCKER_HOST = "unix:///var/run/docker.sock";

/**
 * 会话工作目录：recorder 的 NDJSON 先落这里，finalize 上传 R2 后删除。
 * 放系统临时目录而不是仓库内：这些是**过程数据**，进程被 kill -9 之后由
 * 操作系统的临时目录清理策略兜底，不该赖在工作区里等人手删。
 */
const DEFAULT_WORK_DIR = join(tmpdir(), "automationstack-farm");

/** 目录（farm_browsers）里没命中任何行时的兜底镜像，与构建脚本打的 tag 对齐。 */
const DEFAULT_BROWSER_IMAGE = "automationstack-browser-chromium:latest";

/** farm 对外可达地址：接入指南里的示例代码与产物下载链接都从它拼。 */
const DEFAULT_PUBLIC_URL = "http://localhost:3002";

/**
 * farm 专用的环境变量。**单独一个 createEnv、不并进 `server.ts`**：
 * apps/server 与 apps/farm 是两个进程、两套 .env，把 FARM_* 塞进 server schema
 * 只会让「server 的必需变量清单」凭空长出一堆它永远不读的东西。
 *
 * 反过来，farm 仍然要 `env/server`（它经 packages/db、packages/api 用
 * DATABASE_URL / SESSION_SECRET / R2_*），两份 schema 在 farm 进程里共存。
 */
export const farmEnv = createEnv({
	emptyStringAsUndefined: true,
	runtimeEnv: process.env,
	server: {
		/**
		 * farm 与 Docker daemon 分离部署时（farm 在 A、容器全在 B），
		 * published-port 模式下要告诉 farm「容器端口发布在哪台机器上」。
		 * 留空 = 与 daemon 同机，回落 127.0.0.1。
		 */
		FARM_ADVERTISE_HOST: z.string().min(1).optional(),
		/**
		 * `FARM_PROVIDER=local` 时用哪个 Chrome/Chromium 可执行文件。
		 * 留空按平台探测（macOS 的 `/Applications/Google Chrome.app/...`、
		 * Linux 的 `google-chrome` / `chromium`），探不到在 acquire 时报错。
		 */
		FARM_CHROME_BIN: z.string().min(1).optional(),
		/**
		 * `FARM_PROVIDER=local` + WebDriver 会话时用哪个 chromedriver。留空查 PATH。
		 *
		 * **只有 webdriver 模式才需要它**，所以缺失不是启动错误而是 acquire 错误：
		 * 一台只跑 Playwright（CDP）的开发机根本不需要装 chromedriver，
		 * 为它在启动时就把 farm 拦下来是纯粹的添堵。
		 */
		FARM_CHROMEDRIVER_BIN: z.string().min(1).optional(),
		/** 未指定 browser/version 时的兜底镜像。 */
		FARM_DEFAULT_BROWSER_IMAGE: z
			.string()
			.min(1)
			.default(DEFAULT_BROWSER_IMAGE),
		/**
		 * Docker daemon 地址：`unix:///var/run/docker.sock`（默认）、
		 * `ssh://user@host`（推荐的远程形态）或 `tcp://host:2376` + 双向 TLS。
		 * ⚠️ 严禁明文 `tcp://host:2375`——Docker API 等价于宿主 root。
		 */
		FARM_DOCKER_HOST: z.string().min(1).default(DEFAULT_DOCKER_HOST),
		/**
		 * container-ip 模式下把浏览器容器挂进哪张网（通常是 compose 网络，
		 * 名字形如 `automationstack_default`）。published-port 模式下无意义。
		 */
		FARM_DOCKER_NETWORK: z.string().min(1).optional(),
		/**
		 * 会话端点的取法（plan §2 D10）：
		 * - `published-port`：容器发布随机宿主端口，farm 连宿主。**本地开发专用**——
		 *   macOS 的 Docker Desktop 连不通容器 IP，只能这么走。
		 * - `container-ip`：farm 自己也在容器里、与浏览器容器同网时直连容器 IP，
		 *   省一跳，浏览器容器不必发布任何宿主端口。这是生产路径。
		 */
		FARM_ENDPOINT_MODE: z
			.enum(["published-port", "container-ip"])
			.default("published-port"),
		/**
		 * `FARM_PROVIDER=local` 时浏览器跑不跑无头。默认 true。
		 *
		 * 设成 `false` 是本地开发的甜头：会话跑起来时窗口会真的弹出来，
		 * 能亲眼看着脚本点下去——Docker 那条路（headless 容器）给不了这个。
		 * CI 与后台跑一律留 true。
		 */
		FARM_LOCAL_HEADLESS: z
			// 刻意不用 `z.coerce.boolean()`：它把任意非空串（包括 "false"）判成 true，
			// 于是 `FARM_LOCAL_HEADLESS=false` 会静默地无头跑，人还以为自己关掉了。
			.enum(["true", "false"])
			.default("true")
			.transform((value) => value === "true"),
		/**
		 * **内建伪节点的容量**（plan §12）：farm 本机这个槽位来源能同时跑几条会话。
		 *
		 * 它不再是「全局并发上限」——接进来的每台实机节点各自带着自己的
		 * `maxSlots`，全局上限是它们的和。超限时仍是 503 + Retry-After，
		 * 只是判据变成了「所有源都满了」（`apps/farm/src/scheduler.ts`）。
		 */
		FARM_MAX_SESSIONS: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_MAX_SESSIONS),
		FARM_PORT: z.coerce.number().int().positive().default(DEFAULT_FARM_PORT),
		/**
		 * 槽位从哪来（`@automationstack/browser-slots` 的 `SlotProvider`）：
		 * - `docker`（默认）：一会话一个一次性容器，生产路径。
		 * - `local`：一会话一个本机 Chrome 进程 + 一个一次性 profile 目录。
		 *   给**没有 Docker 的开发机**用（macOS 上装 Docker Desktop 才是少数派
		 *   假设），代价是没有容器那道隔离，浏览器与 farm 同机同用户跑。
		 */
		FARM_PROVIDER: z.enum(["docker", "local"]).default("docker"),
		/**
		 * farm 在**用户视角**的地址（接入指南生成的示例代码、产物下载链接）。
		 * 与 FARM_PORT 分开：反代之后监听端口和对外 URL 根本不是一回事。
		 */
		FARM_PUBLIC_URL: z.url().default(DEFAULT_PUBLIC_URL),
		FARM_SESSION_IDLE_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_SESSION_IDLE_TIMEOUT_MS),
		FARM_SESSION_MAX_LIFETIME_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(DEFAULT_SESSION_MAX_LIFETIME_MS),
		/** 会话过程数据（NDJSON / 截图）的落盘根目录。 */
		FARM_WORK_DIR: z.string().min(1).default(DEFAULT_WORK_DIR),
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
