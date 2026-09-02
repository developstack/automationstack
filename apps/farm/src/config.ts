import { join } from "node:path";
import type { SlotEndpointMode } from "@automationstack/browser-slots";
import { farmEnv } from "@automationstack/env/farm";

/**
 * 会话端点的取法，语义见 `packages/env/src/farm.ts` 的 FARM_ENDPOINT_MODE。
 * 真相源是 `@automationstack/browser-slots` 的 `SlotEndpointMode`（Docker 实现
 * 自己的词汇）；这里只保留 farm 侧的叫法，免得两处各写一遍字面量后悄悄漂开。
 */
export type FarmEndpointMode = SlotEndpointMode;

/**
 * farm 的运行时配置。env 那层只负责「校验 + 兜默认值」，这层负责**分组与派生**，
 * 让 provider / scheduler / recorder 各自 import 自己那一组，而不是满仓库
 * 直接读 `process.env.FARM_*`——env 名字将来要改时，改动面收在这一个文件里。
 */
export const farmConfig = {
	browser: {
		/** 目录（farm_browsers）没命中时的兜底镜像。 */
		defaultImage: farmEnv.FARM_DEFAULT_BROWSER_IMAGE,
	},
	docker: {
		/**
		 * published-port 模式下容器端口发布在哪台机器上；留空即与 daemon 同机。
		 * 回落 127.0.0.1 而不是 localhost：后者在双栈机器上可能解析到 ::1，
		 * 而 Docker 发布的端口默认只绑 0.0.0.0（IPv4）。
		 */
		advertiseHost: farmEnv.FARM_ADVERTISE_HOST ?? "127.0.0.1",
		endpointMode: farmEnv.FARM_ENDPOINT_MODE satisfies FarmEndpointMode,
		host: farmEnv.FARM_DOCKER_HOST,
		/** container-ip 模式下把浏览器容器挂进哪张网；published-port 模式不用。 */
		network: farmEnv.FARM_DOCKER_NETWORK,
	},
	/** `FARM_PROVIDER=local` 时才有意义的一组，语义见 `@automationstack/browser-slots` 的 `local.ts`。 */
	local: {
		chromeBin: farmEnv.FARM_CHROME_BIN,
		chromedriverBin: farmEnv.FARM_CHROMEDRIVER_BIN,
		headless: farmEnv.FARM_LOCAL_HEADLESS,
		/**
		 * 槽位目录的根。放在 workDir 之下而不是另起一处：本地模式的过程数据
		 * （profile、meta）与会话过程数据（NDJSON、截图）是同一类东西——
		 * 一台机器上「farm 摊在哪」应该只有一个答案。
		 */
		slotsRoot: join(farmEnv.FARM_WORK_DIR, "local-slots"),
	},
	/** 槽位从哪来：`docker`（生产）| `local`（没有 Docker 的开发机）。 */
	provider: farmEnv.FARM_PROVIDER,
	server: {
		port: farmEnv.FARM_PORT,
		/** 对外可达地址（接入指南示例代码、产物下载链接）。 */
		publicUrl: farmEnv.FARM_PUBLIC_URL,
	},
	session: {
		idleTimeoutMs: farmEnv.FARM_SESSION_IDLE_TIMEOUT_MS,
		maxLifetimeMs: farmEnv.FARM_SESSION_MAX_LIFETIME_MS,
		/** 内建伪节点的容量；在线实机节点各有自己的 `maxSlots`（plan §12）。 */
		maxSessions: farmEnv.FARM_MAX_SESSIONS,
	},
	/** 会话过程数据（NDJSON / 截图）落盘根目录，finalize 后按会话删除。 */
	workDir: farmEnv.FARM_WORK_DIR,
} as const;

export type FarmConfig = typeof farmConfig;
