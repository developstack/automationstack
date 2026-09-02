import Docker from "dockerode";

import { parseDockerHost } from "./docker-host";
import { demultiplexDockerLogs, LOG_TAIL_LINES } from "./docker-logs";
import {
	type AcquiredSlot,
	type AcquireSlotInput,
	FARM_LABEL_EXPIRES_AT,
	FARM_LABEL_MANAGED,
	FARM_LABEL_SESSION,
	type ManagedContainer,
	type SlotProvider,
} from "./types";

/**
 * `SlotProvider` 的 Docker 实现（plan §5.6 / D10）。
 *
 * 一个会话 = 一个一次性容器，结束即销毁——Selenoid 的核心遗产，也是这个模型
 * 全部正确性的来源：容器里没有任何跨会话残留，所以不存在「上一条会话把 profile
 * 弄脏了」这种查不动的问题。代价是每次都要付一次容器启动时间，接受。
 *
 * 本文件**只跟 daemon 打交道**，不认识会话状态机、不认识 DB、不认识配额。
 * 它唯一对外承诺的东西是 `types.ts` 里那几个字段。
 *
 * `FARM_DOCKER_HOST` 的解析搬去了 `docker-host.ts`、日志帧解码搬去了
 * `docker-logs.ts`（本文件曾到 356 行，越过仓库 300 行上限，
 * 见 scripts/check-file-rules.js）——那两段都是纯函数，不需要 daemon 在场。
 */

// 实现搬走了，但 `docker.ts` 仍是这两个纯函数的对外路径。
export { parseDockerHost } from "./docker-host";
export { demultiplexDockerLogs } from "./docker-logs";

/** 容器内固定端口：chromedriver 与 CDP。单会话单容器，不存在冲突（plan §11.2）。 */
const CONTAINER_WEBDRIVER_PORT = 4444;
const CONTAINER_CDP_PORT = 9222;

/** Chromium 的硬需求：/dev/shm 太小会让渲染进程随机崩（默认才 64M）。 */
const SHM_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * 会话端点从哪取：published-port（读宿主映射端口）| container-ip（读容器 IP）。
 *
 * 这个联合类型原先住在 `apps/farm/src/config.ts`（`FarmEndpointMode`），provider
 * 从那里 `import type`。搬进包里之后必须由包自己声明：包不认识任何一个宿主进程
 * 的配置层——farm 读的是 `FARM_ENDPOINT_MODE`，将来的 node-agent 读的会是另一个
 * 前缀，而「有哪两种取法」是 Docker 实现自己的词汇，与谁来读 env 无关。
 * farm 侧的 `FarmEndpointMode` 现在是这个类型的别名，真相源仍只有一处。
 */
export type SlotEndpointMode = "published-port" | "container-ip";

export interface DockerSlotProviderOptions {
	/** published-port 模式下容器端口发布在哪台机器上。 */
	advertiseHost: string;
	/** `FARM_DOCKER_HOST` 原样，形态见 `parseDockerHost`。 */
	dockerHost: string;
	endpointMode: SlotEndpointMode;
	/** container-ip 模式下要挂进的网络名；该模式下缺它直接报错。 */
	network?: string | undefined;
}

/** inspect 结果里某个容器端口映射到的宿主端口。 */
function publishedPort(
	info: Docker.ContainerInspectInfo,
	containerPort: number
): number | null {
	const hostPort =
		info.NetworkSettings.Ports[`${containerPort}/tcp`]?.[0]?.HostPort;
	return hostPort ? Number(hostPort) : null;
}

/**
 * container-ip 模式下容器自己的 IP。指定网络优先，没指定就取第一张网——
 * 容器只挂一张网是我们自己建出来的事实，取第一张不是猜。
 */
function containerIp(
	info: Docker.ContainerInspectInfo,
	network: string | undefined
): string | null {
	const networks = info.NetworkSettings.Networks;
	const chosen =
		(network ? networks[network] : undefined) ??
		[...Object.values(networks)][0];
	return chosen?.IPAddress || null;
}

interface SlotEndpoints {
	cdpHttpEndpoint: string;
	wdEndpoint: string | null;
}

function endpointsFromPublishedPorts(
	info: Docker.ContainerInspectInfo,
	options: DockerSlotProviderOptions,
	mode: AcquireSlotInput["mode"]
): SlotEndpoints {
	const cdpPort = publishedPort(info, CONTAINER_CDP_PORT);
	if (cdpPort === null) {
		throw new Error(`容器 ${info.Id} 没有发布 CDP 端口，无法取得会话端点`);
	}
	const host = options.advertiseHost;
	const wdPort =
		mode === "webdriver" ? publishedPort(info, CONTAINER_WEBDRIVER_PORT) : null;
	if (mode === "webdriver" && wdPort === null) {
		throw new Error(`容器 ${info.Id} 没有发布 WebDriver 端口`);
	}
	return {
		cdpHttpEndpoint: `http://${host}:${cdpPort}`,
		wdEndpoint: wdPort === null ? null : `http://${host}:${wdPort}`,
	};
}

function endpointsFromContainerIp(
	info: Docker.ContainerInspectInfo,
	options: DockerSlotProviderOptions,
	mode: AcquireSlotInput["mode"]
): SlotEndpoints {
	const ip = containerIp(info, options.network);
	if (ip === null) {
		throw new Error(
			`容器 ${info.Id} 没有取到容器 IP，检查 FARM_DOCKER_NETWORK`
		);
	}
	return {
		cdpHttpEndpoint: `http://${ip}:${CONTAINER_CDP_PORT}`,
		wdEndpoint:
			mode === "webdriver" ? `http://${ip}:${CONTAINER_WEBDRIVER_PORT}` : null,
	};
}

/**
 * 建容器要发布/暴露哪些端口。
 *
 * CDP 端口**两种模式都要**：WebDriver 会话的 recorder 也要挂上去（D5/D4），
 * 少发布它等于让 Selenium 用户的会话录不到任何东西。
 */
function portsForMode(mode: AcquireSlotInput["mode"]): number[] {
	return mode === "webdriver"
		? [CONTAINER_WEBDRIVER_PORT, CONTAINER_CDP_PORT]
		: [CONTAINER_CDP_PORT];
}

function buildHostConfig(
	options: DockerSlotProviderOptions,
	mode: AcquireSlotInput["mode"]
): Docker.HostConfig {
	const hostConfig: Docker.HostConfig = { ShmSize: SHM_SIZE_BYTES };
	if (options.endpointMode === "container-ip") {
		if (!options.network) {
			throw new Error(
				"FARM_ENDPOINT_MODE=container-ip 必须同时设置 FARM_DOCKER_NETWORK"
			);
		}
		hostConfig.NetworkMode = options.network;
		return hostConfig;
	}
	// HostPort "0" = 让 daemon 挑一个空闲宿主端口，inspect 时再读回来。
	const bindings: Record<string, Array<{ HostPort: string }>> = {};
	for (const port of portsForMode(mode)) {
		bindings[`${port}/tcp`] = [{ HostPort: "0" }];
	}
	hostConfig.PortBindings = bindings;
	return hostConfig;
}

function buildCreateOptions(
	input: AcquireSlotInput,
	options: DockerSlotProviderOptions
): Docker.ContainerCreateOptions {
	const exposed: Record<string, Record<string, never>> = {};
	for (const port of portsForMode(input.mode)) {
		exposed[`${port}/tcp`] = {};
	}
	return {
		Env: [`MODE=${input.mode}`],
		ExposedPorts: exposed,
		HostConfig: buildHostConfig(options, input.mode),
		Image: input.image,
		Labels: {
			[FARM_LABEL_EXPIRES_AT]: String(input.expiresAtEpochSec),
			[FARM_LABEL_MANAGED]: "true",
			[FARM_LABEL_SESSION]: input.sessionId,
		},
	};
}

/** label 里的 epoch 秒；缺失或不是数字一律 null（→ reaper 照杀，见 ManagedContainer）。 */
function parseExpiresAt(labels: Record<string, string>): number | null {
	const raw = labels[FARM_LABEL_EXPIRES_AT];
	if (raw === undefined) {
		return null;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 销毁容器，失败只记一行日志。
 *
 * `force` 覆盖「还在跑」，`v` 连带删匿名卷。删一个已经不在的容器会抛 404，
 * 但那正是幂等要吞掉的那种失败：reaper 与正常收尾撞车时**必然**发生一次，
 * 让它冒泡只会在日志里刷出一堆没人需要处理的「容器不存在」。
 */
function removeContainerQuietly(container: Docker.Container): Promise<void> {
	return container
		.remove({ force: true, v: true })
		.then(() => undefined)
		.catch((error: unknown) => {
			console.warn(`销毁容器 ${container.id} 失败（可能已不存在）`, error);
		});
}

function buildSlot(
	container: Docker.Container,
	endpoints: SlotEndpoints
): AcquiredSlot {
	return {
		// 容器里的 profile 与无头设置由镜像 entrypoint / chromedriver 自己决定，
		// 容器用后即毁，farm 没有任何理由从外面再塞启动参数进去（见契约注释）。
		browserArgs: [],
		// 每容器一个网络命名空间 → 这个端口恒为 9222，不会与别的会话撞。
		cdpDebugPort: CONTAINER_CDP_PORT,
		cdpHttpEndpoint: endpoints.cdpHttpEndpoint,
		containerId: container.id,
		readLogs: async () => {
			const raw = await container.logs({
				stderr: true,
				stdout: true,
				tail: LOG_TAIL_LINES,
			});
			return demultiplexDockerLogs(Buffer.from(raw));
		},
		release: () => removeContainerQuietly(container),
		wdEndpoint: endpoints.wdEndpoint,
	};
}

export function createDockerSlotProvider(
	options: DockerSlotProviderOptions
): SlotProvider {
	const docker = new Docker(parseDockerHost(options.dockerHost));
	return {
		acquire: async (input) => {
			const container = await docker.createContainer(
				buildCreateOptions(input, options)
			);
			try {
				await container.start();
				const info = await container.inspect();
				const endpoints =
					options.endpointMode === "container-ip"
						? endpointsFromContainerIp(info, options, input.mode)
						: endpointsFromPublishedPorts(info, options, input.mode);
				return buildSlot(container, endpoints);
			} catch (error) {
				// 起不来的容器必须当场删掉，否则每一次失败的 create-session 都在
				// 宿主上留一个 created/exited 的壳——reaper 收得掉，但那要等到下一拍，
				// 而「镜像不存在」这类失败是会连着发生几十次的。
				await container.remove({ force: true, v: true }).catch(() => {
					// 已经删掉或压根没建起来，无事可做。
				});
				throw error;
			}
		},
		listManagedContainers: async () => {
			const list = await docker.listContainers({
				all: true,
				filters: { label: [`${FARM_LABEL_MANAGED}=true`] },
			});
			return list.map(
				(info): ManagedContainer => ({
					containerId: info.Id,
					expiresAtEpochSec: parseExpiresAt(info.Labels),
					sessionId: info.Labels[FARM_LABEL_SESSION] ?? null,
				})
			);
		},
		releaseContainer: (containerId) =>
			removeContainerQuietly(docker.getContainer(containerId)),
	};
}
