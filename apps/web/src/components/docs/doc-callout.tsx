/**
 * 提示块（callout）：文档里需要被单独看见的那几句话。
 *
 * ## 约定（写文档的人只需要记住这一条）
 *
 * **引用块就是提示块**。markdown 里一段 `> …` 会被渲染成一个带左侧色条的方块，
 * 而不是排版意义上的「引文」——这几份文档里没有任何要引述的外部原文，那个用法
 * 空着也是空着，拿来当提示块正好省掉一套自造语法。
 *
 * 提示块只有两档：
 * - 正文以 `⚠️` 开头 → **警示态**（红色边与淡红底），用于「照做会出事」的那几条；
 * - 其余 → 中性态（灰底），用于「知道了会省事」的补充。
 *
 * 选这条约定而不是 GitHub 的 `> [!WARNING]`：后者不是 CommonMark 也不在
 * remark-gfm 里，要么再装一个插件，要么自己写一段 mdast 变换去剥标记。而本仓
 * 现成的文案里，该警示的那几条**本来就以 ⚠️ 开头**（原 agent-mcp-clients.ts
 * 里 zcode 的两条），等于约定已经在用了，只是过去没人把它渲染出来。
 *
 * 档位只做两档也是有意的：三档以上就得先约定「info 与 tip 有什么区别」，而没有
 * 人会记住那个区别，最后所有块都会落在同一档上，只是颜色随手挑。
 *
 * 判定读的是**渲染前的语法树文本**（collectHastText），不是 children：⚠️ 后面
 * 紧跟着的可能是一段 `**加粗**`，那时 children 的第一个元素是 <strong>，
 * 从里面认前缀要先猜结构。
 */
import type { JSX } from "react";
import type { ExtraProps } from "react-markdown";

import {
	collectHastText,
	type DocHastElement,
} from "@/components/docs/doc-hast";

/*
 * 两个写法都认：带变体选择符的 `⚠️`（U+26A0 U+FE0F，编辑器里打出来的默认形态）
 * 与裸的 `⚠`（U+26A0）。只认前者的话，一次不带 emoji 呈现的粘贴就会静默降级成
 * 普通提示块——降级本身还不报错，最容易漏。
 */
const WARNING_MARKERS = ["⚠️", "⚠"];

const NOTE_CLASS =
	"flex flex-col gap-2 rounded-lg border-border border-l-2 bg-muted p-3";
const WARNING_CLASS =
	"flex flex-col gap-2 rounded-lg border-destructive/50 border-l-2 bg-destructive/10 p-3";

function isWarning(node: DocHastElement | undefined): boolean {
	if (node === undefined) {
		return false;
	}
	const text = collectHastText(node.children).trimStart();
	return WARNING_MARKERS.some((marker) => text.startsWith(marker));
}

export function DocCallout({
	children,
	node,
}: JSX.IntrinsicElements["blockquote"] & ExtraProps) {
	return (
		<blockquote className={isWarning(node) ? WARNING_CLASS : NOTE_CLASS}>
			{children}
		</blockquote>
	);
}
