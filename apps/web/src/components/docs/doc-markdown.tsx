/**
 * 产品内文档的 markdown 渲染器：一段 markdown 原文进去，一篇排好版的正文出来。
 *
 * ## 为什么是「渲染 markdown」而不是继续手写 JSX
 *
 * 这个组件存在的全部理由，是让**文案与展示彻底分开**：接入指南那几节原先是一堆
 * `const NOTES = [...]` 加一层手工排的 `<ul><li>`，改一句话要同时想着标签、类名和
 * 顺序，而它偏偏是全站最常被整段替换的内容。现在正文住在 `.md` 里，换文只改那个
 * 文件，这里一个字都不必动。反过来也成立：想调排版就只改这里，不必碰文案。
 *
 * ## 为什么不复用 components/cases 里那套渲染器
 *
 * 那一套（markdown-parser / markdown-doc / markdown-render）是给**用例正文**写的，
 * 与这里是两种方言，硬合并会同时毁掉两边：
 * - 它刻意用 `whitespace-pre-wrap` 保留每一个用户敲下的换行（所见即所得），
 *   而文档遵循 markdown 的标准折行；
 * - 它把表格、分隔线、5/6 级标题**一律降级成原文纯文本**（那边的正确性标准是
 *   「一个字符都不能被吃掉」，因为版本对比页要对原始字符串逐词 diff）。而这一页
 *   的用户要的恰恰是 `---` 真的画成一条分割线；
 * - 它不认 GFM 的表格与删除线。
 * 于是这里另起一条链路：react-markdown + remark-gfm。两套引擎各自服务一种方言，
 * 谁也别去「统一」——真要统一，先回去读那两个文件顶部各自的正确性标准。
 *
 * ## 安全
 *
 * react-markdown 不走 innerHTML，markdown 原文里的 HTML 默认被整段忽略。
 * **不要加 rehype-raw 去「支持一点点 HTML」**：本仓禁 dangerouslySetInnerHTML，
 * 而那个插件就是它的等价物；这几篇文档也没有一处非 HTML 不可的排版。
 *
 * ## 排版约定
 *
 * - 着重点靠三样东西：`**加粗**`（前景色 + semibold）、行内 `code`、以及提示块；
 * - 提示块 = 引用块，两档，约定写在 doc-callout.tsx 顶部；
 * - 代码块右上角常驻复制按钮，见 doc-code-block.tsx；
 * - 指向站内静态文件的链接自动带 `download`（见 STATIC_ASSET_HREF）；
 * - 表格的列对齐（`:---:`）不生效：GFM 把它写成内联 style，而这里只接管类名。
 *   需要对齐的表格目前一张也没有，真有了再说。
 */
import { Separator } from "@automationstack/ui/components/separator";
import type { JSX } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { DocCallout } from "@/components/docs/doc-callout";
import { DocCodeBlock } from "@/components/docs/doc-code-block";
import { readFencedCode } from "@/components/docs/doc-hast";

/*
 * 模块级常量而不是就地写 `[remarkGfm]`：每次渲染都新建一个数组会让 react-markdown
 * 认为插件链变了，整篇文档跟着重新解析一遍。
 */
const REMARK_PLUGINS = [remarkGfm];

/** 只有绝对 http(s) 链接才算站外；`/install-agent-skill.sh` 这类是站内静态文件。 */
const EXTERNAL_HREF = /^https?:\/\//i;

/**
 * 站内静态文件：以 `/` 开头、末段带扩展名（`/install-agent-skill.sh`）。
 *
 * 这类链接要加 `download`，否则浏览器会按 Content-Type 决定怎么处理，`.sh`
 * 多半被摊成满屏源码——用户想要的是「点一下存到本地」。写成正则而不是列一张
 * 扩展名白名单：文档里指向站内的链接只有两种，要么是路由（没有扩展名），要么
 * 就是 public 下的静态文件。
 *
 * ⚠️ 必须是相对路径。`download` 对跨源 URL 会被浏览器**静默忽略**，所以正文里
 * 那条下载链接写的是 `/install-agent-skill.sh` 而不是拼好的绝对地址（绝对地址
 * 仍然要给 `curl` 用，见 agent-setup-guide.md 里那段命令）。
 */
const STATIC_ASSET_HREF = /^\/[^?#]*\.[a-z0-9]+$/i;

const HEADING_2_CLASS = "mt-2 font-semibold text-base text-foreground";
const HEADING_3_CLASS = "mt-1 font-medium text-foreground text-sm";
const HEADING_4_CLASS = "font-medium text-foreground text-sm";
const LIST_CLASS = "flex flex-col gap-1 pl-5";
const CELL_CLASS = "border-border/60 border-b px-2 py-1.5 align-top";

function DocLink({ children, href }: JSX.IntrinsicElements["a"]) {
	const isExternal = href !== undefined && EXTERNAL_HREF.test(href);
	const isAsset = href !== undefined && STATIC_ASSET_HREF.test(href);
	return (
		<a
			className="font-medium text-foreground underline underline-offset-4"
			// 不给文件名：留空即用 URL 末段，与 public 下的真实文件名天然一致
			download={isAsset ? "" : undefined}
			href={href}
			// 站外链接才加，且 noopener 与 target 必须成对出现
			rel={isExternal ? "noopener" : undefined}
			target={isExternal ? "_blank" : undefined}
		>
			{children}
		</a>
	);
}

/**
 * 代码块。正文从语法树上取（见 doc-hast.ts），取不到才回落到朴素 `<pre>`——
 * 那一支理论上走不到（remark 只在代码块处产出 pre），留着是为了「取不到就别给
 * 复制按钮」，而不是给一颗复制空串的按钮。
 */
function DocPre({ children, node }: JSX.IntrinsicElements["pre"] & ExtraProps) {
	const fenced = readFencedCode(node);
	if (fenced === null) {
		return (
			<pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs">
				{children}
			</pre>
		);
	}
	return <DocCodeBlock code={fenced.code} language={fenced.language} />;
}

/**
 * 标签 → 组件。
 *
 * h1 不给：这几篇文档挂在设置页的面板里，页面标题由外壳负责，正文的最高一级
 * 是 h2（真写了 `#` 会落到 react-markdown 的默认 `<h1>` 上，字号由这里的容器
 * 决定，不会突然冒出一个 36px 的大标题）。
 */
const COMPONENTS: Components = {
	a: DocLink,
	blockquote: DocCallout,
	// 行内 code。围栏代码块不经过这里——DocPre 直接把正文交给了 DocCodeBlock
	code: ({ children }) => (
		<code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground text-xs">
			{children}
		</code>
	),
	h2: ({ children }) => <h2 className={HEADING_2_CLASS}>{children}</h2>,
	h3: ({ children }) => <h3 className={HEADING_3_CLASS}>{children}</h3>,
	h4: ({ children }) => <h4 className={HEADING_4_CLASS}>{children}</h4>,
	// `---` 用全站同一根分割线，而不是另调一条 hr 的粗细与颜色
	hr: () => <Separator />,
	ol: ({ children }) => (
		<ol className={`list-decimal ${LIST_CLASS}`}>{children}</ol>
	),
	p: ({ children }) => <p className="break-words">{children}</p>,
	pre: DocPre,
	strong: ({ children }) => (
		<strong className="font-semibold text-foreground">{children}</strong>
	),
	// 宽表格在自己这一格里横向滚，不撑破正文列把整页顶出横向滚动条
	table: ({ children }) => (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse text-xs">{children}</table>
		</div>
	),
	td: ({ children }) => <td className={CELL_CLASS}>{children}</td>,
	th: ({ children }) => (
		<th className={`${CELL_CLASS} text-left font-medium text-foreground`}>
			{children}
		</th>
	),
	ul: ({ children }) => (
		<ul className={`list-disc ${LIST_CLASS}`}>{children}</ul>
	),
};

export interface DocMarkdownProps {
	/** markdown 原文。占位符要在传进来之前填好，这一层不做任何替换。 */
	text: string;
}

/**
 * 正文列。
 *
 * 块间距用 flex 的 gap 而不是各块自己的 margin：margin 会在相邻块之间塌陷，
 * 「标题紧跟段落」与「段落之间」的间距就变成了两套算法，加一个块的位置就得
 * 重新调一遍。gap 是一个值管到底，标题另加的那点上留白（mt-*）叠在 gap 上，
 * 于是「一节的开头」比「一节内部」更松，扫读时能一眼看出层级。
 */
export function DocMarkdown({ text }: DocMarkdownProps) {
	return (
		<div className="flex flex-col gap-4 text-muted-foreground text-sm leading-relaxed">
			<Markdown components={COMPONENTS} remarkPlugins={REMARK_PLUGINS}>
				{text}
			</Markdown>
		</div>
	);
}
