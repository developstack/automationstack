/**
 * 行内节点 → React。图片那一支（可显示 / 还没查到 / 存储未配置三种状态）
 * 在 image-node.tsx。
 *
 * 这个模块与整条预览链路一样**不许 import 任何 `@codemirror/*`**：
 * `/projects/$projectId` 会 SSR，而 `@codemirror/view` 在 import 期就读 `navigator`。
 */
import { Fragment, type ReactElement } from "react";

import { ImageNode } from "@/components/cases/image-node";
import type { MarkdownInline } from "@/components/cases/markdown-inline";

/** 附件 id → 15 分钟签名 URL。`null` 表示服务端签不出来（R2 未配置）。 */
export type MarkdownImageUrls = ReadonlyMap<string, string | null>;

interface InlineNodesProps {
	imageUrls: MarkdownImageUrls | undefined;
	nodes: readonly MarkdownInline[];
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
