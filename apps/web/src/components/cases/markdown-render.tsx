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
 *
 * ## 字号为什么必须写在根节点上，以及为什么要开一个 prop
 *
 * 根节点上的 `text-sm` 是**写死**的，不是继承来的——正文里混着 `<pre>`、`<code>`、
 * 四级标题，它们各自有绝对字号（见 `block.tsx` / `heading.tsx`），没有一个统一的
 * 基准，段落与列表的字号就会跟着调用点四处漂。
 *
 * 代价是它会**盖掉调用点想施加的字号**。执行台的步骤卡片踩了这一脚：外面那层
 * 容器写了 `text-xs`（用户要求预期比步骤正文小一号），可「预期：」这个前缀是
 * 纯文本、老老实实继承成了 xs，右边走 MarkdownRender 的预期正文却被这里的
 * `text-sm` 顶了回去，同一行里两个字号。
 *
 * 所以开 `textSize`，而不是让调用点在外面套一层 class 硬碰硬：外面那层要赢
 * 只能靠权重或 `!important`，而真正需要变的是**这里的基准**。刻意做成闭集
 * （`"sm" | "xs"`）而不是自由的 className——这个 prop 的用途只有「整块小一号」
 * 一种，开成 className 就等于允许调用点从外面重排 markdown，那正是把字号写死
 * 在根节点上要防的事。默认 `"sm"`，所有既有调用点一个字都不用改，class 串
 * 逐字符不变。
 *
 * 注意它只挪动**段落与列表**这一层基准。块内的 `<pre>`、`<code>` 仍是绝对的
 * `text-xs`，markdown 标题仍是 `heading.tsx` 那四档——真在「预期」里敲 `# 标题`
 * 会得到一个比正文大的标题，但那在改动之前就是这样，且预期字段里写标题本来
 * 就不该发生，不在这次范围内。
 */
import { type ReactElement, useMemo } from "react";

import { Block } from "@/components/cases/block";
import { parseMarkdownDoc } from "@/components/cases/markdown-doc";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

/**
 * 两档基准字号各写成完整的类名常量。
 *
 * 不能拼 `text-${size}`：Tailwind 扫的是源码里的字面量，拼出来的类名不会被生成，
 * 上线后那一档直接没有样式（仓库里踩过同一脚的地方都是这么记的）。
 */
const ROOT_CLASSES = {
	sm: "space-y-2 text-sm leading-relaxed",
	xs: "space-y-2 text-xs leading-relaxed",
} as const;

export interface MarkdownRenderProps {
	/** attachment id → 15 分钟签名 URL；缺失表示还没查到或已失效。 */
	imageUrls?: MarkdownImageUrls;
	text: string;
	/**
	 * 段落与列表的基准字号。默认 `"sm"`，只有执行台步骤卡片里的「预期」传 `"xs"`。
	 *
	 * 闭集不是随手写的：见文件头「字号为什么必须写在根节点上」。
	 */
	textSize?: keyof typeof ROOT_CLASSES;
}

export function MarkdownRender({
	imageUrls,
	text,
	textSize = "sm",
}: MarkdownRenderProps): ReactElement {
	// 解析随每次按键发生（预览是实时的），按原文缓存一层，输入没变就不重解析。
	const blocks = useMemo(() => parseMarkdownDoc(text), [text]);
	return (
		<div className={ROOT_CLASSES[textSize]}>
			{blocks.map((block) => (
				<Block block={block} imageUrls={imageUrls} key={block.from} />
			))}
		</div>
	);
}
