/**
 * 用例正文的 markdown 语法树来源——**编辑器与只读预览共用同一个 parser**。
 *
 * 单独成文件，是因为它有两个互相冲突的消费者：
 * - `markdown-extensions.ts` 只在浏览器里被动态 import（`@codemirror/view`
 *   在 import 期就读 `navigator`，进 SSR bundle 会直接炸）；
 * - `markdown-doc.ts` 走的是只读渲染路径，`/projects/$projectId` 这条路由**会 SSR**，
 *   它必须能在 node 里跑。
 *
 * 因此本文件**不许 import 任何 `@codemirror/*`**：一旦引入，预览侧就会顺着
 * import 链把 CodeMirror 拖进 SSR bundle。
 *
 * 两边共用同一个 parser 是有意的：编辑器里被高亮成粗体的那一段，预览里就必须
 * 渲染成粗体。各自解析一遍等于给「所见」与「所得」两套语法定义。
 *
 * 用 `@lezer/markdown` 的裸 parser 而不是 `@codemirror/lang-markdown`：后者为了给
 * 围栏代码块做嵌套高亮会连带打包 lang-html / lang-javascript / lang-css，
 * 实测 gzip 从 99KB 涨到 173KB，而用例里的代码块只需要等宽字体，不需要按语言着色。
 */
import { parser } from "@lezer/markdown";

export const markdownParser = parser;

/**
 * 语法树节点类型。
 *
 * 从 `parse()` 的返回值反推，而不是 `import type { SyntaxNode } from "@lezer/common"`：
 * `@lezer/common` 只是 `@lezer/markdown` 的传递依赖，在 pnpm 的严格 node_modules 布局下
 * 从 apps/web 根本解析不到（`apps/web/node_modules/@lezer/` 里只有 highlight 与 markdown）。
 * 硬加一条直接依赖只为拿一个类型，代价是多一个要跟着 lezer 升级的版本号。
 */
export type MarkdownTree = ReturnType<typeof markdownParser.parse>;
export type MarkdownSyntaxNode = MarkdownTree["topNode"];
