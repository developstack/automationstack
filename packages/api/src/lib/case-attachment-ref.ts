/**
 * 用例正文里的图片引用格式：`![](attachment:<attachment-id>)`。
 *
 * ## 为什么正文里存的是**附件 id**而不是 storage key 或签名 URL
 *
 * - **URL 不行**：GET 是 15 分钟短签名，存进正文十五分钟后就是死链，
 *   而正文还会被冻进版本快照——那就是永久死链。
 * - **storage key 不行**：key 是实现细节（前缀规则将来完全可能改），
 *   而且 key 本身不带归属信息，服务端拿到一个 key 没法判断读它的人该不该读；
 *   id 能一路查回 `case_attachments.case_id`。
 * - **id 可以**：换 key 规则时历史正文一个字都不用动。
 *
 * ## 为什么单独一个文件
 *
 * 这个格式必须由**前端**产生（粘贴时插入）和解析（渲染时替换成 `<img>`），
 * 服务端一行都不解析正文。让前端自己硬编码一份正则，就等于同一个格式有两份
 * 定义，改一处漏一处的结果是历史正文里的图静默变成一串裸文本。
 *
 * 因此这里是**唯一真相**，且刻意不 import `node:*`、不 import 任何 SDK——
 * `apps/web` 直接 `import ... from "@automationstack/api/lib/case-attachment-ref"`
 * 就能用，不会把 aws-sdk 或 node 内置模块拖进浏览器包。
 */

/** 引用的协议段。单独导出，便于前端在编辑器里做「这是不是我们的链接」的粗判。 */
export const CASE_ATTACHMENT_REF_SCHEME = "attachment:";

/**
 * 匹配正文里的一处图片引用，捕获组 1 是附件 id。
 *
 * ⚠️ **带 `g` 标志，因此它是有状态的**：请只用 `String.matchAll` / `String.replace`
 * （两者都不会推进这个字面量的 `lastIndex`），**不要**直接 `.test()` 或 `.exec()`——
 * 那会让「同一个字符串连问两次得到不同答案」这种 bug 出现在渲染路径上。
 * 需要判定单个字符串时用下面的 `isCaseAttachmentRef`。
 *
 * alt 段刻意锁死为空（`![]`）：格式只有一个产生者（前端粘贴），
 * 放宽成「可有 alt」就意味着同一张图存在两种合法写法，而两种写法必须在
 * 产生、解析、版本 diff 三处都表现一致——为一个没人会手写的格式付这个代价不值。
 * 用户要给图片配文字，写在图片引用的前后即可，那本来就是纯文本。
 */
export const CASE_ATTACHMENT_REF_PATTERN =
	/!\[\]\(attachment:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

/** 整串**恰好**是一处引用（无 `g`，可安全 `.test()`）。 */
const CASE_ATTACHMENT_REF_EXACT =
	/^!\[\]\(attachment:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)$/;

/**
 * 生成一处引用。前端粘贴成功后把返回值插进光标处即可。
 *
 * 只接受附件 id，不接受 URL / key —— 参数类型逼着调用方去拿对的那个值。
 */
export function buildCaseAttachmentRef(attachmentId: string): string {
	return `![](${CASE_ATTACHMENT_REF_SCHEME}${attachmentId})`;
}

/** 整串是否恰好是一处引用。 */
export function isCaseAttachmentRef(value: string): boolean {
	return CASE_ATTACHMENT_REF_EXACT.test(value);
}

/**
 * 正文里出现的全部附件 id，**按出现顺序、保留重复**。
 *
 * 不去重：调用方要么是「按顺序替换成 `<img>`」（重复必须各替各的），
 * 要么是「统计引用了哪些图」（自己 `new Set` 一行的事）。
 * 在这里去重会让前一种用法悄悄少渲染一张图。
 */
export function extractCaseAttachmentIds(text: string): string[] {
	const ids: string[] = [];
	for (const [, id] of text.matchAll(CASE_ATTACHMENT_REF_PATTERN)) {
		if (id !== undefined) {
			ids.push(id);
		}
	}
	return ids;
}
