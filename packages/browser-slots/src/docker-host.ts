/**
 * `FARM_DOCKER_HOST` 这一个字符串到 dockerode 连接参数的全部解析。
 *
 * 从 `docker.ts` 拆出来：那份文件到了 356 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这一段只在**进程启动
 * 那一次**跑，且是纯的字符串 → 对象转换：它不认识容器、不认识会话，也不需要
 * daemon 在线。把它与「跟 daemon 说话」的那部分分开，读的人不用先想清楚
 * 自己在哪一层。
 */
import type Docker from "dockerode";

/** Docker 约定的 TLS 端口。裸 2375 是明文，等价于把宿主 root 挂公网上，严禁。 */
const DOCKER_TLS_PORT = 2376;
const DEFAULT_SSH_PORT = 22;

function sshDockerOptions(url: URL): Docker.DockerOptions {
	const port = url.port ? Number(url.port) : DEFAULT_SSH_PORT;
	const username = url.username || undefined;
	return {
		host: url.hostname,
		port,
		protocol: "ssh",
		// docker-modem 把这两组分别喂给自己和 ssh2，都得给。
		sshOptions: { host: url.hostname, port, username },
		username,
	};
}

function tcpDockerOptions(url: URL): Docker.DockerOptions {
	const port = url.port ? Number(url.port) : DOCKER_TLS_PORT;
	const secure = url.protocol === "https:" || port === DOCKER_TLS_PORT;
	return {
		host: url.hostname,
		port,
		protocol: secure ? "https" : "http",
	};
}

/**
 * `FARM_DOCKER_HOST` → dockerode 的连接参数。
 *
 * 三种形态用同一套 URL 语法表达（env schema 的注释里写了理由），解析集中在这里
 * 一处。裸路径（`/var/run/docker.sock`）也认——那是 Docker CLI 用户的肌肉记忆，
 * 为它多一个分支比让人对着一句 `Invalid URL` 猜半天划算。
 *
 * ⚠️ `tcp://` + 2376 只把协议判成 https，**客户端证书没有 env 通道**：本仓没有
 * `FARM_DOCKER_CERT_*` 这组变量，所以双向 TLS 实际配不出来。远程 daemon 的
 * 可用形态是 `ssh://`（B 机不暴露任何 Docker 端口，凭据走 ssh-agent），
 * 这里保留 tcp 分支只是为了让它**明确地连不上**，而不是静默降级成明文 http。
 */
export function parseDockerHost(raw: string): Docker.DockerOptions {
	if (raw.startsWith("/")) {
		return { socketPath: raw };
	}
	const url = new URL(raw);
	if (url.protocol === "unix:") {
		return { socketPath: url.pathname };
	}
	if (url.protocol === "ssh:") {
		return sshDockerOptions(url);
	}
	return tcpDockerOptions(url);
}
