import { spawn as spawnChild } from "node:child_process";
import { createServer } from "node:net";

/**
 * 本地进程槽位与操作系统之间的**唯一**边界：起进程、收日志、挑端口、杀进程组。
 *
 * 单拎出来的理由与 `docker-host.ts` 一样，只是方向相反：那边拆出去的是
 * 「不需要 daemon 在场的纯函数」，这边拆出去的是「除了系统调用什么都不做的那一段」。
 * `local.ts` 于是可以被单测按契约逐条钉死（spawn 的参数长什么样、release 幂不幂等），
 * 而不必在测试进程里真的拉起一个 Chrome——那种测试在 CI 上必然是不稳定的。
 */

/**
 * 子进程输出的环形缓冲上限。**必须有**，理由与 Docker 那边的 `LOG_TAIL_LINES`
 * 一样：chromedriver 的 verbose 日志能到几百 MB，而这里的缓冲是**进程内的**，
 * 无上限地攒下去就是一次 OOM，还会连坐同一进程里所有别的会话。
 */
const LOG_BUFFER_LIMIT_BYTES = 1_048_576;

/** SIGTERM 之后给进程组的收尸时间，超时补一发 SIGKILL。 */
const KILL_GRACE_MS = 2000;

/** 轮询「进程组还在不在」的间隔。 */
const KILL_POLL_INTERVAL_MS = 100;

export interface LocalProcess {
	/** 进程组 id（`detached: true` 下等于子进程 pid，见 `spawn` 注释）。 */
	pid: number;
	/** 环形缓冲里现有的 stdout + stderr。 */
	readLogs: () => string;
}

export interface SpawnLocalInput {
	args: string[];
	command: string;
}

export interface LocalRuntime {
	/**
	 * 杀掉整个进程组并等它真的没了。**幂等**：进程早就不在（ESRCH）时静默返回。
	 */
	killProcessGroup: (pid: number) => Promise<void>;
	/** 挑一个当前空闲的 TCP 端口。 */
	pickFreePort: () => Promise<number>;
	spawn: (input: SpawnLocalInput) => LocalProcess;
}

/**
 * 收尸轮询用的等待。这个定时器**不能 unref**。
 *
 * unref 的定时器不算「事件循环里还有活」。`killProcessGroup` 有可能是某个进程
 * 当下**唯一**在做的事——node-agent 的启动清扫就是这个形状：`sweepLocalSlots`
 * 跑在拨号之前，那一刻进程里没有 WS、没有 server、没有别的句柄。于是
 * SIGTERM 发出去、还没等到进程组咽气，事件循环就空了，node 判定「没事可做」
 * 干干净净地按 0 退出——不抛错、不打日志。表现出来是：孤儿 Chrome 被杀掉了，
 * 但槽位目录没删、「启动清扫」那行日志没打、agent 也再没连上平台（2026-09-01
 * 的 e2e 里真的这么死了三次）。
 *
 * 反过来把循环多按住最多 KILL_GRACE_MS 没有任何代价：这两秒里我们**正在**等
 * 一件必须等完的事。
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * 挑一个空闲端口：绑 0 让内核挑，读回来再释放。
 *
 * ⚠️ 这中间有一个 TOCTOU 窗口（释放到 Chrome 真正监听之间，别人可能抢走）。
 * 接受它：本地开发机上没有第二个进程在批量抢端口，而替代方案（起浏览器时传 0
 * 再去 profile 目录里读 `DevToolsActivePort`）要多一次文件轮询，且 chromedriver
 * 那条路径上我们根本没法用——端口得在 caps 注入的时候就已知（见契约里的
 * `cdpDebugPort`）。
 */
function pickFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				server.close();
				reject(new Error("挑空闲端口失败：监听地址不是 TCP 形态"));
				return;
			}
			const { port } = address;
			server.close(() => resolve(port));
		});
	});
}

/** 一个自封顶的输出缓冲：超过上限就从头丢，留下的是最近的那一段。 */
function createRingBuffer(): {
	push: (chunk: string) => void;
	read: () => string;
} {
	const chunks: string[] = [];
	let total = 0;
	return {
		push: (chunk) => {
			chunks.push(chunk);
			total += chunk.length;
			while (total > LOG_BUFFER_LIMIT_BYTES && chunks.length > 1) {
				total -= chunks.shift()?.length ?? 0;
			}
		},
		read: () => chunks.join(""),
	};
}

/**
 * 起一个子进程并接管它的输出。
 *
 * `detached: true` 是这里最要紧的一个字：它让子进程成为**新进程组的组长**，
 * 于是回收时一发 `kill(-pid)` 就能带走它拉起来的一整棵树。少了它，
 * chromedriver 起的那个 Chrome（以及 Chrome 起的一堆渲染进程）会在
 * chromedriver 死后变成孤儿，留在机器上吃内存——而这正是本地模式相对容器模式
 * 最容易漏掉的失效。
 *
 * `unref()` 让 farm 的事件循环不为它挂着：一条 30 分钟寿命的会话不该把
 * 优雅关停按在那里（同 `apps/farm/src/session.ts` 里计时器 unref 的理由）。
 */
function spawnLocal(input: SpawnLocalInput): LocalProcess {
	const buffer = createRingBuffer();
	const child = spawnChild(input.command, input.args, {
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => buffer.push(chunk));
	child.stderr?.on("data", (chunk: string) => buffer.push(chunk));
	// spawn 本身的失败（ENOENT、权限）是**异步**送到 error 事件的，没人接就是一次
	// unhandled error 把整个 farm 带走。记进缓冲即可：会话会在探活那一步失败，
	// 而那份日志正是收尾时要当 container_log 存起来的东西。
	child.on("error", (error) =>
		buffer.push(`\n[spawn error] ${String(error)}\n`)
	);
	child.unref();
	const { pid } = child;
	if (pid === undefined) {
		throw new Error(`无法启动 ${input.command}：没有拿到 pid`);
	}
	return { pid, readLogs: buffer.read };
}

/** 给整个进程组发一个信号。true = 发出去了，false = 组已经不在（ESRCH）。 */
function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
	try {
		process.kill(-pid, signal);
		return true;
	} catch {
		return false;
	}
}

/**
 * SIGTERM → 等 → SIGKILL。
 *
 * 先礼后兵不是客气：Chrome 收到 SIGTERM 会把 profile 里的锁文件与缓存收干净，
 * 直接 SIGKILL 留下的脏 profile 在容器模型里无所谓（容器要删掉），在本地模型里
 * 则会让下一次用**同一个 profile 目录**的启动变慢甚至报错。我们的 profile 也是
 * 一次性的，但槽位目录的删除可能失败，留一份干净的总比留一份脏的强。
 */
async function killProcessGroup(pid: number): Promise<void> {
	if (!signalGroup(pid, "SIGTERM")) {
		return;
	}
	const deadline = Date.now() + KILL_GRACE_MS;
	while (Date.now() < deadline) {
		// biome-ignore lint/performance/noAwaitInLoops: 轮询等收尸，本来就是串行的
		await sleep(KILL_POLL_INTERVAL_MS);
		if (!signalGroup(pid, 0)) {
			return;
		}
	}
	signalGroup(pid, "SIGKILL");
}

export function createLocalRuntime(): LocalRuntime {
	return { killProcessGroup, pickFreePort, spawn: spawnLocal };
}
