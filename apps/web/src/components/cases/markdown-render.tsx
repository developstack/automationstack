/**
 * 用例正文（markdown 原文）→ React 节点。实时预览与只读展示共用同一个组件。
 *
 * ## 只读，且只读
 *
 * 这里**不产生也不回写任何文本**：解析结果里的每段字符串都是原文的切片
 * （见 `markdown-doc.ts`）。正文里的 `user_id`、`3 * 4`、`?a=1&b=2` 因此
 * 一个字符都不会变——`versions/field-diff.ts` 对原始字符串逐词 diff，
 * 任何 remark 式的「解析再序列化」往返都会把它们转义成 `user\_id`，
 * 于是版本对比页会凭空多出一堆没人改过的「改动」。
 *
 * ## 为什么不引排版插件
 *
 * `apps/web` 没装 `@tailwindcss/typography`，这里也不装：`prose` 那套的字号、
 * 行高、颜色是为长文档调的，而这段内容要么挤在分栏预览里、要么挤在详情抽屉里，
 * 周围全是 `text-sm`。手写十来个类比覆盖一整套 prose 变量便宜得多。
 *
 * ## 与 components/docs/ 那套的分工
 *
 * 全仓有两条 markdown 链路，别合并，也别在这里「顺手支持一下表格」：
 * 这一条服务**用户敲进来的用例正文**（所见即所得、原文切片、`whitespace-pre-wrap`、
 * 表格与分隔线一律降级成原文）；`components/docs/doc-markdown.tsx` 那条服务
 * **我们自己写的产品内文档**（标准 CommonMark + GFM，`---` 真的画成分割线）。
 * 两边的正确性标准是相反的，理由分别写在各自文件顶部。
 *
 * ## SSR
 *
 * `/projects/$projectId` 会 SSR，因此本文件及其依赖**不许 import 任何
 * `@codemirror/*`**（`@codemirror/view` 在 import 期就读 `navigator`）。
 * 语法树来自 `markdown-parser.ts` 里那个与编辑器共用的裸 lezer parser。
 *
 * ## 本文件只剩入口
 *
 * 块级节点的渲染在 `block.tsx`（Block / ListBlocks / ListNode 三者互相递归，
 * 必须同处一个文件），标题在 `heading.tsx`，行内节点在
 * `markdown-inline-render.tsx`。上面这几条约束对它们同样成立。
 */
import { type ReactElement, useMemo } from "react";

import { Block } from "@/components/cases/block";
import { parseMarkdownDoc } from "@/components/cases/markdown-doc";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

export interface MarkdownRenderProps {
	/** attachment id → 15 分钟签名 URL；缺失表示还没查到或已失效。 */
	imageUrls?: MarkdownImageUrls;
	text: string;
}

export function MarkdownRender({
	imageUrls,
	text,
}: MarkdownRenderProps): ReactElement {
	// 解析随每次按键发生（预览是实时的），按原文缓存一层，输入没变就不重解析。
	const blocks = useMemo(() => parseMarkdownDoc(text), [text]);
	return (
		<div className="space-y-2 text-sm leading-relaxed">
			{blocks.map((block) => (
				<Block block={block} imageUrls={imageUrls} key={block.from} />
			))}
		</div>
	);
}
