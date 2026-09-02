/**
 * 握手完成之后的那根管子：连上游、把两条 WS 逐帧接起来、把任一侧的关闭收敛成
 * 一次收尾。
 *
 * 从 `cdp/proxy.ts` 拆出来：那份文件到了 343 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为升级前后是两个世界：
 * 升级之前手上是裸 socket、还能回 HTTP 错误、随时可以拒；升级之后只剩两条 WS 与
 * 一个 close code。这个文件里的代码全部属于后者。
 */
import { type RawData, WebSocket } from "ws";

import { finalizeSession } from "../finalize";
import type { FarmDataPlaneDeps } from "../launch";
import type { LiveSession } from "../session";

/**
 * 两条 WS 之间的双向管道。**不解析任何帧**：CDP 消息里带着页面上的一切
 * （cookie、表单值、响应头），解析它就等于把这些东西复制进 farm 的内存与日志。
 *
 * `isBinary` 必须原样带过去：CDP 走文本帧，但 `Page.captureScreenshot` 之类的
 * 大 payload 在某些客户端上会走二进制帧，翻错了对面直接解不出来。
 */
function pipeFrames(from: WebSocket, to: WebSocket): void {
	from.on("message", (data: RawData, isBinary: boolean) => {
		if (to.readyState === WebSocket.OPEN) {
			to.send(data, { binary: isBinary });
		}
	});
}

interface BridgeInput {
	client: WebSocket;
	deps: FarmDataPlaneDeps;
	session: LiveSession;
	upstream: WebSocket;
}

/**
 * 把两条 WS 接上，并把「任意一侧关闭」都收敛成一次收尾。
 *
 * `settled` 这个本地标志防的是同一进程内的重复触发（关一侧必然引发另一侧的
 * close 事件），`finalizeSession` 自己还有幂等闸门——两道都留着，因为这里的
 * 顺序在客户端异常断线时并不确定。
 *
 * 这里**不**像 WebDriver 的 DELETE 分支那样先停 recorder：那边是「转发这个请求就会
 * 把浏览器杀掉」，停在转发前才来得及；这边客户端断开并不杀浏览器（槽位要等收尾第
 * ② 段才释放），所以收尾第 ① 段的「先截图、再 stop」顺序仍然成立，抢跑反而会让最后
 * 一张 final 截图拍不到（recorder 的 CDP 连接已经被自己关掉了）。
 *
 * 那条真正的竞态——浏览器先没、close 事件触发重连、重连失败上报掉线，与收尾的
 * stop 抢跑——堵在 recorder 那一侧：`reportDetached` 见到 `state.stopped` 就丢弃
 * 上报（recorder-session.ts）。堵在那里而不是这里，是因为它同时覆盖两条数据面，
 * 而且能拦住**已经在飞的**那次重连，这里再怎么排顺序都拦不住。
 */
export function bridge(input: BridgeInput): void {
	const { client, deps, session, upstream } = input;
	let settled = false;
	const finish = (status: "completed" | "failed", reason: string): void => {
		if (settled) {
			return;
		}
		settled = true;
		client.close();
		upstream.close();
		// biome-ignore lint/complexity/noVoid: 收尾是 fire-and-forget——WS 已经关了，没有谁在等它
		void finalizeSession({ deps, reason, session, status });
	};

	pipeFrames(client, upstream);
	pipeFrames(upstream, client);

	client.on("close", () => finish("completed", "client_disconnect"));
	upstream.on("close", () => finish("completed", "upstream_closed"));
	client.on("error", (error) => {
		console.warn(`CDP 客户端连接出错 session=${session.id}`, error);
		finish("failed", "client_error");
	});
	upstream.on("error", (error) => {
		console.warn(`CDP 上游连接出错 session=${session.id}`, error);
		finish("failed", "upstream_error");
	});
}

/** 连上游 browser-level WS。**先连通再放行客户端**，见 `handleCdpUpgrade` 的注释。 */
export function connectUpstream(url: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url, {
			// CDP 的截图/DOM 快照消息可以很大，默认上限在这条链路上偏小。
			maxPayload: 256 * 1024 * 1024,
			// 关掉压缩：整段链路在本机或同一内网，压缩只会把 CPU 花在不缺带宽的
			// 链路上，还给每个大 payload 多一次内存拷贝。
			perMessageDeflate: false,
		});
		socket.once("open", () => resolve(socket));
		socket.once("error", (error) => reject(error));
	});
}
