import { randomUUID } from "node:crypto";

/**
 * 用例正文贴图的**策略层**：多大算超、允许什么类型、object key 长什么样。
 *
 * ## 为什么不复用 `./attachment-policy.ts`
 *
 * 那份是按 `TestRunAttachmentKind` 分档的（screenshot / video / log / other），
 * key 里带 `runId` / `runCaseId` / `kind` 三段。用例贴图只有一档（图片），
 * key 里一段 kind 都没有。把两者合并成一个泛型策略，代价是给一条根本没有 kind
 * 的路径开一个 kind 形状的洞，而且哪天为了录屏把视频上限调到 200MB，
 * 会**顺带**放大「能粘进用例正文、并被冻进每一个版本快照」的东西。
 * 两份查表各四十行，比一个错的抽象便宜得多。
 *
 * 与那份一样，这里全是纯函数：一行 I/O 都没有，也不读 env，因此可以直接单测。
 */

/** 1 MiB。用来把「10 MB」写成人能读的算式，而不是 10_485_760 这个魔法数。 */
const BYTES_PER_MIB = 1024 * 1024;

/**
 * 单张贴图体积上限：10 MiB。
 *
 * 比测试任务附件的 20MB 小一档，是**故意**的：这里是粘贴场景，来源基本只有
 * 截图工具和剪贴板，一张 5K 全屏 PNG 通常也就几 MB；而贴图的引用会被冻进
 * 这条用例的**每一个**历史版本快照，正文因此永远不会「变轻」。
 * 定成独立常量而不是引用那边的 `MAX_ATTACHMENT_BYTES`，正是为了让那边为录屏
 * 调上限时不会静默改变这边。
 */
const MAX_CASE_IMAGE_MIB = 10;

export const MAX_CASE_IMAGE_BYTES = MAX_CASE_IMAGE_MIB * BYTES_PER_MIB;

/**
 * 允许粘贴的图片类型，与 `attachment-policy.ts` 的 `IMAGE_CONTENT_TYPES` 一致。
 *
 * **只允许图片**：粘贴场景就是图片，正文里的引用也只会被渲染成 `<img>`。
 * 放行一个 `application/pdf` 进来，结果不是「多了个能力」，而是正文里出现
 * 一个永远画不出来的破图标，而问题要到别人打开这条用例才暴露。
 *
 * 导出是给前端用的（`paste` 事件里筛 `ClipboardItem`、以及错误文案），
 * 白名单只有一份定义。
 */
export const CASE_IMAGE_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;

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
};

/** 查表落空时的扩展名。白名单已经挡在前面，正常路径走不到这里。 */
const FALLBACK_EXTENSION = "bin";

/** 用例贴图 key 的公共根前缀，便于在 bucket 里一眼分辨来源与整体清理。 */
const CASE_ATTACHMENT_KEY_ROOT = "test-cases";

export interface CaseAttachmentKeyScope {
	caseId: string;
	projectId: string;
}

export interface CaseImageUploadRequest {
	contentType: string;
	sizeBytes: number;
}

export type CaseImageUploadValidation =
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
export function validateCaseImageUpload(
	request: CaseImageUploadRequest
): CaseImageUploadValidation {
	if (
		!(CASE_IMAGE_CONTENT_TYPES as readonly string[]).includes(
			request.contentType
		)
	) {
		return {
			allowedContentTypes: CASE_IMAGE_CONTENT_TYPES,
			kind: "unsupported-content-type",
		};
	}
	if (request.sizeBytes > MAX_CASE_IMAGE_BYTES) {
		return { kind: "too-large", maxBytes: MAX_CASE_IMAGE_BYTES };
	}
	return { kind: "ok" };
}

/**
 * 一条用例下所有贴图的公共前缀，形如 `test-cases/<projectId>/<caseId>/`。
 *
 * `register` 用它验证客户端回传的 key 确实是我们刚为**这条用例**签出去的，
 * 而不是随手编的、或者从别的用例里抄来的 key。
 */
export function caseAttachmentKeyPrefix(scope: CaseAttachmentKeyScope): string {
	return `${CASE_ATTACHMENT_KEY_ROOT}/${scope.projectId}/${scope.caseId}/`;
}

/**
 * 客户端在 `register` 回传的 key 是否确实是我们为**这条用例**签出去的那一类。
 *
 * 两条判据：
 * 1. 必须落在这条用例的前缀下——否则一个人可以把别人的图登记到自己的用例上，
 *    或者登记一个根本不存在的 key，让正文里出现一张永远加载不出的死图；
 * 2. 不含 `..` 段。S3/R2 把 key 当不透明字符串，不做路径归一化，所以 `..`
 *    并不能真的穿越出前缀；但带 `..` 的 key 会在任何做了路径归一化的中间层
 *    （代理、CDN）上把签名弄失效，变成一个只在某些网络环境下复现的怪 bug。
 *    我们自己生成的 key 永远不含 `..`，所以直接拒绝，不留这个坑。
 */
export function isCaseAttachmentKeyOwnedBy(
	storageKey: string,
	scope: CaseAttachmentKeyScope
): boolean {
	if (storageKey.split("/").includes("..")) {
		return false;
	}
	return storageKey.startsWith(caseAttachmentKeyPrefix(scope));
}

/**
 * 生成 object key：`test-cases/<projectId>/<caseId>/<uuid>.<ext>`。
 *
 * 两层 id 前缀有两个用途，都不是装饰：
 * 1. **排障**——在 R2 控制台看到一个可疑对象，不查库就知道它属于哪个项目、哪条用例；
 * 2. **批量清理**——「项目整体下线」时能按前缀 `ListObjectsV2` 圈出来。
 *    ⚠️ 但**不要**据此写「正文不再引用就删」的 GC，理由见
 *    `packages/db/src/schema/case-attachments.ts` 的文件头（版本快照会碎图）。
 *
 * uuid 随机段防猜测：key 本身不是秘密（访问要签名），但可预测的 key 会让
 * 「换个 caseId 试试」变成可行的探测手段。
 *
 * `projectId` **由服务端从 case 反查**、`caseId` 经 `z.uuid()` 把关，都不是自由文本，
 * 因此不会含 `/` 或 `..`；扩展名查表得到。这条 key 里没有任何一段是用户能控制的字符串——
 * 尤其**没有原始文件名**。
 */
export function buildCaseAttachmentStorageKey(
	scope: CaseAttachmentKeyScope,
	image: { contentType: string }
): string {
	const extension =
		EXTENSION_BY_CONTENT_TYPE[image.contentType] ?? FALLBACK_EXTENSION;
	return `${caseAttachmentKeyPrefix(scope)}${randomUUID()}.${extension}`;
}
