import type { AttachmentKind, AutomationCaseResult } from "./contract-types";

/**
 * SDK 的**公开输入结构**。这是本包唯一认识的「一条结果长什么样」。
 *
 * 刻意**不掺任何测试框架的类型**：wdio 的 `TestStats`、playwright 的 `TestResult`
 * 都是它们随时会改的东西，让它们出现在这里等于把本包的大版本焊死在框架版本上。
 * 用户在自己的 reporter / hook / afterAll 里把框架给的对象搬成下面这两个形状——
 * 那段搬运代码在**用户的仓库里**，框架升级时改的是他自己那十几行，不用等我们发版。
 * README 里有 wdio 与 playwright 各自的示例片段。
 */

export interface CaseResultInput {
	/**
	 * ⚠️ 服务端收下但本期不落库（`test_run_cases` 没有这一列）。照填不误。
	 */
	durationMs?: number | null;
	/**
	 * 失败时的一行说明，落进 `test_run_cases.comment`。
	 * 超过 `MAX_INGEST_COMMENT_LENGTH` 会被截断——完整堆栈请作为 `log` 附件传，
	 * `comment` 是给人在失败清单上一眼扫的，不是日志容器。
	 */
	message?: string | null;
	result: AutomationCaseResult;
	/**
	 * 用例上的 `sourceRef`，归属**唯一**的输入（§3.7）。
	 * 没有任何办法指定「写进哪个测试任务」，那是刻意的（D31）。
	 */
	sourceRef: string;
}

/**
 * 一个待上传的附件。`body` 与 `filePath` 二选一，两个都不给会在入队时就报错——
 * 那是本地的编程错误，没必要拖到 presign 之后才发现。
 */
export interface AttachmentInput {
	/** 直接给字节。截图/录屏常常本来就在内存里，逼用户先落盘没有道理。 */
	body?: Uint8Array;
	/** 不给就按 `kind` 猜一个；PUT 时必须用 presign 回来的值，不是这个值。 */
	contentType?: string;
	/** 不给就取 `filePath` 的 basename；两个都没有就用 `{kind}` 兜底。 */
	fileName?: string;
	filePath?: string;
	kind: AttachmentKind;
	/** 附件挂在哪条用例上，与结论走同一条归属路径。 */
	sourceRef: string;
}

/** 读盘/取字节之后的样子。`attachment-upload` 只认这个，不碰文件系统语义。 */
export interface LoadedAttachment {
	body: Uint8Array;
	contentType: string;
	fileName: string;
	kind: AttachmentKind;
	sizeBytes: number;
	sourceRef: string;
}

/** 附件那一轮的结果，只用来打印——它不参与退出码判定（§5.6）。 */
export interface AttachmentOutcome {
	registered: number;
	/** 逐条的拒绝理由，**服务端原文**，SDK 不概括。 */
	rejections: string[];
	/** R2 未配置时 false：结论照常上报成功，只有附件部分降级。 */
	storageConfigured: boolean;
	uploaded: number;
}
