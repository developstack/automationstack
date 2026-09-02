export type FarmArtifactKind =
	| "har"
	| "console"
	| "screenshot"
	| "container_log"
	| "client_trace";

export interface RecorderArtifactFile {
	contentType: string;
	kind: FarmArtifactKind;
	meta?: Record<string, unknown>;
	/** 绝对路径，位于会话 workDir 之下 */
	path: string;
}

export interface RecorderHandle {
	/** 主动补一张截图（收尾用），失败静默不抛 */
	captureScreenshot: (label: string) => Promise<void>;
	/** 断开 CDP 并 flush NDJSON，幂等 */
	stop: () => Promise<void>;
}

export interface StartRecorderOptions {
	/** browser-level CDP 的 HTTP 端点（如 http://127.0.0.1:32768），recorder 自行请求 /json/version 换 WS 地址 */
	cdpHttpEndpoint: string;
	/** 重连一次仍失败才触发；观测挂了不影响执行 */
	onDetached?: (reason: string) => void;
	/** 本会话专属工作目录，调用方保证已存在 */
	workDir: string;
}

export type StartRecorder = (
	opts: StartRecorderOptions
) => Promise<RecorderHandle>;

export type CollectRecorderArtifacts = (
	workDir: string
) => Promise<RecorderArtifactFile[]>;
