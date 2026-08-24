/**
 * 上传中的图片占位引用：`![](uploading:<token>)`。
 *
 * ## 为什么要有它
 *
 * 贴图的上传是三步异步（presign → PUT → register），几百毫秒到几秒。这期间
 * 正文里必须**已经有东西**：
 *
 * - 用户要立刻看到图（配合本地 `URL.createObjectURL` 的 blob URL，预览是即时的）；
 * - 「贴了图」必须立刻变成正文文本的改动，否则 `case-form-dirty.ts` 的指纹不变，
 *   抽屉会当成没改过而静默关闭，用户以为图丢了；
 * - 上传回来时要能**按文本定位**该替换哪一段。存偏移量不行：这中间用户可以继续
 *   打字，甚至把编辑器点掉再点回来（编辑器会被销毁重建），任何记下来的位置都会失效。
 *
 * ## 为什么另起一个 scheme 而不是复用 `attachment:`
 *
 * `attachment:` 的语义是「这条记录已经在 `case_attachments` 表里了」，正文一旦
 * 被保存/冻进版本快照，那个 id 永远查得回来。token 只是本次会话的临时握手，
 * 混进同一个 scheme 会让渲染侧无法区分「图还在传」与「图查不到 URL」，
 * 也会让 `extractCaseAttachmentIds` 吐出一堆根本不存在的附件 id。
 *
 * 这个模块**纯字符串处理**：不碰 React、不碰 DOM、不 import 任何 `@codemirror/*`
 * ——渲染链路（会 SSR）与编辑链路（只在浏览器）都要用它。
 */

/** 占位引用的协议段。 */
export const CASE_UPLOADING_REF_SCHEME = "uploading:";

/**
 * 整串**恰好**是一处占位引用，捕获组 1 是 token（无 `g`，可安全 `.test()`/`.exec()`）。
 *
 * token 由 `crypto.randomUUID()` 产生，所以按 UUID 的形状卡死：正文里用户手打的
 * `![](uploading:xxx)` 不会被误认成我们的占位，它会照 `markdown-inline.ts` 的
 * 降级规则原样显示成纯文本。
 */
const CASE_UPLOADING_REF_EXACT =
	/^!\[\]\(uploading:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)$/;

/**
 * 正文里**任意位置**是否还残留至少一处占位。
 *
 * 单独一条无 `g` 的正则，而不是拿上面那条去掉锚点复用：带 `g` 的字面量有状态，
 * `.test()` 会推进它的 `lastIndex`，让「同一个字符串连问两次得到不同答案」。
 * 提交前的兜底扫描（`case-submit-checks.ts`）正是连着问好几个字段的。
 */
const CASE_UPLOADING_REF_ANYWHERE =
	/!\[\]\(uploading:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)/;

/** 这段文本里还有没有上传中的占位。 */
export function hasCaseUploadingRef(text: string): boolean {
	return CASE_UPLOADING_REF_ANYWHERE.test(text);
}

/** 生成一处占位引用。`token` 用 `crypto.randomUUID()`。 */
export function buildCaseUploadingRef(token: string): string {
	return `![](${CASE_UPLOADING_REF_SCHEME}${token})`;
}

/** 整串恰好是一处占位引用时返回它的 token，否则返回 undefined。 */
export function extractCaseUploadingToken(value: string): string | undefined {
	return CASE_UPLOADING_REF_EXACT.exec(value)?.[1];
}

/**
 * 把 `text` 里**第一处** `from` 换成 `to`（`to` 为空串即删除）。
 *
 * 刻意不用 `String.replace`：它会把替换串里的 `$&`、`$1` 当成引用展开，而这里的
 * 替换串是从服务端拿回来的附件 id 拼出来的，不该受任何模式语义影响。
 * indexOf + slice 是纯粹的字节搬运，不存在这种解释。
 *
 * 找不到就原样返回：用户完全可以在上传结束前手动把那段占位删掉，那时
 * 「什么都不做」就是对的——不能凭空把图片引用塞回一个用户已经清空的字段。
 */
export function replaceCaseImageRef(
	text: string,
	from: string,
	to: string
): string {
	const at = text.indexOf(from);
	if (at === -1) {
		return text;
	}
	return text.slice(0, at) + to + text.slice(at + from.length);
}
