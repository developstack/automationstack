import { parseDockerHost } from "@automationstack/browser-slots";
import type { NodeBackend } from "@automationstack/farm-node-protocol/control";
import Docker from "dockerode";

/**
 * 「这台机器能提供哪几种槽位后端」的探测。
 *
 * 结论会原样写进 hello 的 `backends`，farm 拿它与库里那行节点配置对账。
 * 所以这里的纪律是**如实上报**：探不到就不报，绝不「先报上去再说，真要用的时候
 * 才发现不行」——那会让一条会话在 acquire 阶段才失败，而那时它已经占了配额、
 * 建了会话行、还得走一整套 finalize。
 */

/** daemon 探测超时。ping 是一次本机 socket 往返，两秒还不回就是它有问题。 */
export const DOCKER_PROBE_TIMEOUT_MS = 2000;

/** daemon 在不在。返回 false 表示「这台机器没有 docker 后端」，不是错误。 */
export type DockerProbe = () => Promise<boolean>;

/**
 * local 后端**恒支持**：它要的只是一个能 spawn 进程的操作系统。Chrome 装没装
 * 不在这里判——那是 acquire 时的事（`local-binaries.ts` 的错误文案带装法指引），
 * 提前到启动期只会让一台准备接 docker 会话的机器起不来。
 */
export async function detectBackends(
	probe: DockerProbe
): Promise<NodeBackend[]> {
	const hasDocker = await probe().catch(() => false);
	return hasDocker ? ["local", "docker"] : ["local"];
}

function withTimeout(work: Promise<unknown>, ms: number): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), ms);
		timer.unref();
		work
			.then(() => resolve(true))
			.catch(() => resolve(false))
			.finally(() => clearTimeout(timer));
	});
}

/**
 * 真探测：连本机 daemon 打一次 ping。
 *
 * 任何失败（socket 不存在、权限不足、daemon 没起、host 串写错到
 * `parseDockerHost` 就抛）一律**降能力，不报错**——一台没装 Docker 的开发机
 * 接进来当 local 节点是完全正常的用法。
 */
export function createDockerProbe(dockerHost: string): DockerProbe {
	return () => {
		let docker: Docker;
		try {
			docker = new Docker(parseDockerHost(dockerHost));
		} catch {
			return Promise.resolve(false);
		}
		return withTimeout(docker.ping(), DOCKER_PROBE_TIMEOUT_MS);
	};
}
