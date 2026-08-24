/**
 * 行内节点 → React。图片的三种状态（可显示 / 还没查到 / 存储未配置）都在这里。
 *
 * 这个模块与整条预览链路一样**不许 import 任何 `@codemirror/*`**：
 * `/projects/$projectId` 会 SSR，而 `@codemirror/view` 在 import 期就读 `navigator`。
 */
import { Fragment, type ReactElement } from "react";

import type { MarkdownInline } from "@/components/cases/markdown-inline";

/** 附件 id → 15 分钟签名 URL。`null` 表示服务端签不出来（R2 未配置）。 */
export type MarkdownImageUrls = ReadonlyMap<string, string | null>;

interface InlineNodesProps {
	imageUrls: MarkdownImageUrls | undefined;
	nodes: readonly MarkdownInline[];
}

/**
 * 占位与降级都用 `<span>` 而不是 `<div>`：图片是行内节点，外层是 `<p>`，
 * 而 `<div>` 塞进 `<p>` 会被浏览器提前闭合段落，SSR 出来的 HTML 与客户端
 * 重新渲染出的结构对不上，直接触发 hydration mismatch。
 */
const PLACEHOLDER_CLASS =
	"my-1 flex h-24 w-full max-w-xs items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs";

/**
 * 还没查到 URL。两种成因，文案必须分开说：
 *
 * - `pending`：这是一处 `uploading:` 占位，图正在传（本地 blob URL 一般在粘贴的
 *   同一帧就登记好了，所以这一档实际很少出现——只有 blob URL 已被回收、而签名
 *   URL 还没随 `list` 回来的那一小段窗口）；
 * - 否则：`caseAttachments.list` 还在飞，或这条记录不在结果里。
 *
 * 用固定高度的静态块而不是 spinner：预览是跟着编辑实时重渲的，一个转圈会在
 * 每次按键后重新开始转；而高度固定意味着 URL 到位时图片就地替换，
 * 后面的段落不会上下弹一下。
 */
function ImagePending({ pending }: { pending: boolean }): ReactElement {
	return (
		<span className={PLACEHOLDER_CLASS}>
			{pending ? "图片上传中…" : "图片加载中"}
		</span>
	);
}

/**
 * 查到了但 URL 是 null——服务端明确告诉我们签不出来（R2 未配置，见
 * `caseAttachments.list` 的返回契约）。
 *
 * 这里必须写出**为什么**看不到图。留一块空白或一个通用的破图图标，用户只会
 * 以为自己的图丢了，然后重传一遍——而重传同样会失败。
 */
function ImageUnavailable(): ReactElement {
	return (
		<span className={PLACEHOLDER_CLASS}>附件存储未配置，图片无法显示</span>
	);
}

function ImageNode({
	attachmentId,
	imageUrls,
	pending,
}: {
	attachmentId: string;
	imageUrls: MarkdownImageUrls | undefined;
	pending: boolean;
}): ReactElement {
	const url = imageUrls?.get(attachmentId);
	if (url === undefined) {
		return <ImagePending pending={pending} />;
	}
	if (url === null) {
		return <ImageUnavailable />;
	}
	return (
		// 正文里的 alt 段被格式锁死为空（见 case-attachment-ref.ts），所以没有
		// 用户提供的替代文本可用。这是有意义的内容图而不是装饰，不能 aria-hidden，
		// 于是给一个通用可访问名——读屏至少能播报「这里有一张用例插图」。
		// max-w-full：预览常常与编辑器分栏，原图宽度不能把栏撑破。
		// biome-ignore lint/correctness/useImageSize: 我们没有这张图的宽高——附件表只存 contentType/sizeBytes（服务端 HeadObject 读回来的），拿不到像素尺寸。填一个猜的宽高会给出错误的宽高比，那比不填更糟：图会先按错误比例撑开再跳回真实比例。上方的占位块已经预留了固定高度，把加载期的位移限制在「占位高度 → 真实高度」这一次。
		<img
			alt="用例插图"
			className="my-1 block h-auto max-w-full rounded-md border"
			loading="lazy"
			src={url}
		/>
	);
}

function renderInline(
	node: MarkdownInline,
	imageUrls: MarkdownImageUrls | undefined
): ReactElement | string {
	switch (node.kind) {
		case "text":
			return node.text;
		case "code":
			return (
				<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
					{node.text}
				</code>
			);
		case "emphasis":
			return (
				<em>
					<InlineNodes imageUrls={imageUrls} nodes={node.children} />
				</em>
			);
		case "strong":
			return (
				<strong className="font-semibold">
					<InlineNodes imageUrls={imageUrls} nodes={node.children} />
				</strong>
			);
		case "image":
			return (
				<ImageNode
					attachmentId={node.attachmentId}
					imageUrls={imageUrls}
					pending={node.pending}
				/>
			);
		default:
			return (
				// rel="noopener" + target="_blank"：项目 CLAUDE.md 明令。协议白名单
				// 在 markdown-inline.ts 就把关了，走到这里的 url 一定是 http/https。
				<a
					className="text-primary underline underline-offset-2"
					href={node.url}
					rel="noopener"
					target="_blank"
				>
					<InlineNodes imageUrls={imageUrls} nodes={node.children} />
				</a>
			);
	}
}

/**
 * key 用源码偏移量 `from`：同一层的兄弟节点各占一段互不重叠的区间，偏移量天然唯一，
 * 而且同一段文本在两次渲染之间偏移不变——比数组下标稳（下标会在前面插入一个字符时
 * 整体错位，导致 React 复用错节点，正在加载的图片会闪一下）。
 */
export function InlineNodes({
	imageUrls,
	nodes,
}: InlineNodesProps): ReactElement {
	return (
		<>
			{nodes.map((node) => (
				// 用 Fragment 而不是 <span> 包一层：多包一层行内盒会让下面那些
				// 撑满宽度的占位块（w-full）拿不到段落的宽度。
				<Fragment key={node.from}>{renderInline(node, imageUrls)}</Fragment>
			))}
		</>
	);
}
