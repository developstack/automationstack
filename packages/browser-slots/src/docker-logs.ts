/**
 * Docker 日志流的多路复用格式解码。
 *
 * 从 `docker.ts` 拆出来：那份文件到了 356 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这一段是纯字节处理：
 * 一个 Buffer 进、一个 string 出，跟 daemon、容器、会话都没有关系。它也是这个
 * provider 里唯一真正值得单独盯着看的算法（帧头判定错了整份日志就是乱码）。
 */

/**
 * 收尾时拉多少行容器日志。**必须有上限**：一条跑满 30 分钟的会话，
 * chromedriver 的 verbose 日志能到几百 MB，无上限地读进 Node 堆就是一次 OOM。
 * 浏览器崩溃类问题看的是最后那一段，2000 行足够。
 */
export const LOG_TAIL_LINES = 2000;

/** Docker 多路复用流的帧头长度：1 字节流类型 + 3 字节保留 + 4 字节大端长度。 */
const LOG_FRAME_HEADER_SIZE = 8;
/** 帧头第一字节的合法取值上限（0=stdin, 1=stdout, 2=stderr）。 */
const MAX_LOG_STREAM_TYPE = 2;
const LOG_FRAME_SIZE_OFFSET = 4;

/** 这 8 个字节看着像不像一个合法帧头。 */
function isLogFrameHeader(raw: Buffer, offset: number): boolean {
	const streamType = raw[offset];
	if (streamType === undefined || streamType > MAX_LOG_STREAM_TYPE) {
		return false;
	}
	return (
		raw[offset + 1] === 0 && raw[offset + 2] === 0 && raw[offset + 3] === 0
	);
}

/**
 * 解 Docker 日志流的多路复用格式。
 *
 * `container.logs()` 在 `Tty:false`（我们建容器时的默认）下回的是带帧头的字节流，
 * 直接 `toString()` 会把每 8 字节的二进制帧头混进正文，肉眼看就是每隔几行冒出
 * 一坨乱码。判不出帧结构时整段按裸文本处理——`Tty:true` 的容器本来就没有帧头，
 * 与其抛异常丢掉整份日志，不如原样交出去。
 */
export function demultiplexDockerLogs(raw: Buffer): string {
	const chunks: string[] = [];
	let offset = 0;
	while (offset + LOG_FRAME_HEADER_SIZE <= raw.length) {
		if (!isLogFrameHeader(raw, offset)) {
			return raw.toString("utf8");
		}
		const size = raw.readUInt32BE(offset + LOG_FRAME_SIZE_OFFSET);
		const start = offset + LOG_FRAME_HEADER_SIZE;
		chunks.push(raw.subarray(start, start + size).toString("utf8"));
		offset = start + size;
	}
	return chunks.length === 0 ? raw.toString("utf8") : chunks.join("");
}
