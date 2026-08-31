/**
 * 从 react-markdown 交给自定义组件的那棵 hast 节点上取原文与语言标注。
 *
 * 为什么要读节点、而不是读 `children`：`children` 是已经渲染成 React 元素的产物，
 * 想从里面还原「围栏里那段一模一样的文本」只能靠猜结构（一层 code、一个字符串、
 * 还是被高亮切成了十几个 span）。复制按钮的正确性标准是**贴出去的东西与文档里
 * 写的逐字节相同**，那件事只有对着语法树才断言得清楚。
 *
 * 类型不从 `hast` 包里 import：那是 react-markdown 的传递依赖，在 pnpm 的严格
 * node_modules 布局下从 apps/web 根本解析不到（同一条坑已经记在
 * components/cases/markdown-parser.ts 顶部）。这里改从 react-markdown 自己导出的
 * `ExtraProps` 上把节点类型摘下来——它在自己的 .d.ts 里引 hast，解析得到，
 * 而我们一个字的类型都不必重抄。
 *
 * 纯函数，不碰 DOM 也不碰 React，所以能在 node 环境下直接单测。
 */
import type { ExtraProps } from "react-markdown";

/** 自定义组件拿到的那棵 hast 元素节点。 */
export type DocHastElement = NonNullable<ExtraProps["node"]>;

type DocHastContent = DocHastElement["children"][number];

/** 围栏代码块的语言标注在 hast 里的形态：class="language-json"。 */
const LANGUAGE_PREFIX = "language-";

export interface DocFencedCode {
	code: string;
	/** 围栏上标的语言；没标就是 undefined，调用方据此决定文案。 */
	language: string | undefined;
}

/**
 * 递归收集纯文本。行内节点（强调、链接、行内 code）在这里一律被摊平成它们的
 * 文字——两个调用方要的都是「这段读起来是什么」，不是它的结构。
 */
export function collectHastText(nodes: readonly DocHastContent[]): string {
	let text = "";
	for (const node of nodes) {
		if (node.type === "text") {
			text += node.value;
		} else if (node.type === "element") {
			text += collectHastText(node.children);
		}
	}
	return text;
}

function readLanguage(value: unknown): string | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	for (const item of value) {
		if (typeof item === "string" && item.startsWith(LANGUAGE_PREFIX)) {
			return item.slice(LANGUAGE_PREFIX.length);
		}
	}
	return undefined;
}

/**
 * `<pre>` 节点 → 围栏里的原文与语言。
 *
 * 返回 null 表示「这不是一个由围栏产生的代码块」（理论上不会发生，remark 只在
 * 代码块处产出 pre）。调用方据此回落到朴素 `<pre>`，而不是渲染一个复制了空串的
 * 按钮——按下去说「已复制」却什么都没复制，比没有按钮更糟。
 */
export function readFencedCode(
	node: DocHastElement | undefined
): DocFencedCode | null {
	const child = node?.children[0];
	if (child === undefined || child.type !== "element") {
		return null;
	}
	if (child.tagName !== "code") {
		return null;
	}
	return {
		code: collectHastText(child.children),
		language: readLanguage(child.properties.className),
	};
}
