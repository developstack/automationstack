import { randomUUID } from "node:crypto";
import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

/**
 * 附件的**策略层**：多大算超、什么类型允许、object key 长什么样。
 *
 * 单独成文件而不是塞进 `r2.ts`，有两个理由：
 * 1. 这里全是纯函数，一行 I/O 都没有，也不读 env——因此可以直接单测，
 *    不必为了测一条 key 规则去准备一套环境变量或假凭证；
 * 2. 想知道「允许传什么」的地方（router、将来的前端提示）不该为此
 *    把 aws-sdk 拖进依赖图。
 */

/** 1 MiB。用来把「20 MB」写成人能读的算式，而不是 20_971_520 这个魔法数。 */
const BYTES_PER_MIB = 1024 * 1024;

/** 单个附件体积上限（plan §6：单文件 ≤ 20MB）。 */
const MAX_ATTACHMENT_MIB = 20;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MIB * BYTES_PER_MIB;

/**
 * 上传签名有效期：5 分钟。
 *
 * 只需要覆盖「用户点了上传 → 浏览器把文件推完」这一段，签名越短，
 * 万一 URL 被日志/截图泄漏，可写窗口就越小。20MB 的文件在 1MB/s 的
 * 上行也只要 20 秒，5 分钟是很宽的余量。
 */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * 下载签名有效期：15 分钟（plan §6 / D10）。
 *
 * bucket 保持私有，绝不开 public read——测试截图里常有测试环境的真实业务数据。
 * 每次读列表现签，所以数据库里存的是 object key 而不是 URL：
 * 存下来的完整 URL 15 分钟后就是死链。
 */
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const VIDEO_CONTENT_TYPES = ["video/mp4", "video/webm"] as const;
const LOG_CONTENT_TYPES = ["text/plain"] as const;

/**
 * 按 kind 分档的 contentType 白名单（plan §6 的总白名单再按用途收紧）。
 *
 * 为什么按 kind 分而不是一张总表：`kind` 决定前端怎么渲染——screenshot 会直接
 * 塞进 `<img>`。如果 screenshot 能挂上一个 `video/mp4`，渲染出来就是一个坏图标，
 * 而问题要到用户打开报告才暴露。在签名之前按 kind 卡死，错配根本进不来。
 *
 * `other` 不是逃生口，它只是「上面三档都不合适」的兜底，允许的类型仍然是
 * 前三档的并集——白名单一旦有一个 kind 能放行任意类型，白名单就等于不存在。
 */
const ALLOWED_CONTENT_TYPES_BY_KIND: Record<
	TestRunAttachmentKind,
	readonly string[]
> = {
	log: LOG_CONTENT_TYPES,
	other: [...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES, ...LOG_CONTENT_TYPES],
	screenshot: IMAGE_CONTENT_TYPES,
	video: VIDEO_CONTENT_TYPES,
};

/**
 * contentType → 文件扩展名。
 *
 * 扩展名只从**已经过白名单**的 contentType 查表得到，绝不从用户的原始文件名里取：
 * 原始文件名是纯用户输入，拼进 object key 会同时带来两个问题——`../` 造成的
 * 路径穿越，以及中文/空格/引号在 SigV4 规范化里跟浏览器实现对不上导致的签名失效。
 */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"text/plain": "txt",
	"video/mp4": "mp4",
	"video/webm": "webm",
};

/** 查表落空时的扩展名。白名单已经挡在前面，正常路径走不到这里。 */
const FALLBACK_EXTENSION = "bin";

/** 所有附件 key 的公共根前缀，便于在 bucket 里一眼分辨来源与整体清理。 */
const ATTACHMENT_KEY_ROOT = "test-runs";

export interface AttachmentUploadRequest {
	contentType: string;
	kind: TestRunAttachmentKind;
	sizeBytes: number;
}

export type AttachmentUploadValidation =
	| { kind: "ok" }
	| { allowedContentTypes: readonly string[]; kind: "unsupported-content-type" }
	| { kind: "too-large"; maxBytes: number };

/**
 * 签名**之前**的服务端校验。
 *
 * 必须在这里拦住：预签名 URL 一旦发出去就是一张我们再也管不住的写入凭证，
 * 到 `register` 才校验等于对象已经躺在 bucket 里了，白拦。
 *
 * 返回类型化结果而不是抛异常：调用方要把 `maxBytes` / `allowedContentTypes`
 * 拼进给用户看的提示文案，异常里带不了结构化数据。
 */
export function validateAttachmentUpload(
	request: AttachmentUploadRequest
): AttachmentUploadValidation {
	const allowedContentTypes = ALLOWED_CONTENT_TYPES_BY_KIND[request.kind];
	if (!allowedContentTypes.includes(request.contentType)) {
		return { allowedContentTypes, kind: "unsupported-content-type" };
	}
	if (request.sizeBytes > MAX_ATTACHMENT_BYTES) {
		return { kind: "too-large", maxBytes: MAX_ATTACHMENT_BYTES };
	}
	return { kind: "ok" };
}

export interface AttachmentKeyScope {
	projectId: string;
	runCaseId: string;
	runId: string;
}

/**
 * 一条用例行下所有附件的公共前缀，形如
 * `test-runs/<projectId>/<runId>/<runCaseId>/`。
 *
 * `register` 用它验证客户端回传的 key 确实是我们刚为**这条用例行**签出去的，
 * 而不是随手编的、或者从别的测试任务里抄来的 key（否则一个人可以把别人的截图
 * 登记到自己的用例上，或者登记一个根本不存在的 key 让报告页出现死图）。
 */
export function attachmentKeyPrefix(scope: AttachmentKeyScope): string {
	return `${ATTACHMENT_KEY_ROOT}/${scope.projectId}/${scope.runId}/${scope.runCaseId}/`;
}

/**
 * 客户端在 `register` 回传的 key 是否确实是我们为**这条用例行**签出去的那一类。
 *
 * 两条判据：
 * 1. 必须落在这条用例行的前缀下——否则一个人可以把别人的截图登记到自己的
 *    用例上，或者登记一个根本不存在的 key，让报告页出现一张永远加载不出的死图；
 * 2. 不含 `..` 段。S3/R2 把 key 当不透明字符串，不做路径归一化，所以 `..`
 *    并不能真的穿越出前缀；但带 `..` 的 key 会在任何做了路径归一化的中间层
 *    （代理、CDN）上把签名弄失效，变成一个只在某些网络环境下复现的怪 bug。
 *    我们自己生成的 key 永远不含 `..`，所以直接拒绝，不留这个坑。
 */
export function isAttachmentKeyOwnedBy(
	storageKey: string,
	scope: AttachmentKeyScope
): boolean {
	if (storageKey.split("/").includes("..")) {
		return false;
	}
	return storageKey.startsWith(attachmentKeyPrefix(scope));
}

/**
 * 生成 object key：`test-runs/<projectId>/<runId>/<runCaseId>/<kind>-<uuid>.<ext>`。
 *
 * 三层 id 前缀有两个用途，都不是装饰：
 * 1. **排障**——在 R2 控制台看到一个可疑对象，不查库就知道它属于哪个项目、哪个测试任务；
 * 2. **批量清理**——孤儿对象与「项目整体下线」都能按前缀 `ListObjectsV2` 圈出来。
 *    没有前缀就只能全桶扫描再逐个回查数据库。
 *
 * uuid 随机段防猜测：key 本身不是秘密（访问要签名），但可预测的 key 会让
 * 「换个 runCaseId 试试」变成可行的探测手段。
 *
 * 三个 id 都来自数据库里的 uuid 列（router 侧另有 `z.uuid()` 把关），不是自由文本，
 * 因此不会含 `/` 或 `..`；扩展名查表得到。这条 key 里没有任何一段是用户能控制的字符串。
 */
export function buildAttachmentStorageKey(
	scope: AttachmentKeyScope,
	attachment: { contentType: string; kind: TestRunAttachmentKind }
): string {
	const extension =
		EXTENSION_BY_CONTENT_TYPE[attachment.contentType] ?? FALLBACK_EXTENSION;
	return `${attachmentKeyPrefix(scope)}${attachment.kind}-${randomUUID()}.${extension}`;
}
