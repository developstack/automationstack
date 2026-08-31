/**
 * 「本地 Agent 接入」那份指南的正文来源。
 *
 * ## 正文为什么住在 .md 里
 *
 * 这一页原先是五个组件（端点 / 安装 / 各家客户端 / skill，外加一份把五家客户端
 * 写成对象数组的数据文件），文案与 `<ul><li>` 编在一起，改一句话要先想清楚它归
 * 哪个数组、排第几个。而它恰恰是全站**最常被整段替换**的内容：MCP 与 skill 该
 * 怎么指导本地 agent 生成用例，这套说法还在演进。
 *
 * 所以现在只有两层：**这个文件负责把正文取来、把两个地址填进去**，
 * `agent-setup-guide.md` 负责说什么，`components/docs/` 负责长什么样。
 * 换文案 = 只改那个 .md，组件一个字都不必动。
 *
 * ## 五家客户端的正文为什么不再是数据数组
 *
 * 原来的 agent-mcp-clients.ts 把五家写成 `{ name, paths, config, notes }[]`，
 * 看着像结构化数据，其实不是：它的五个值互相之间没有一处共享形状——config 是
 * 三种互不相干的文件格式（JSON / TOML / 无）、notes 是长短不一的散文、pi 那一
 * 行还得靠 `config: null` 走一条特判分支。真正「同一张表填不同值」的是本文件
 * 顶上那张六个工具的表，它现在是一张 markdown 表格；而五家客户端从来只是
 * **五段各自写死的散文**，做成数组只是把散文塞进了对象字面量。
 * 顺带甩掉了那个 `DOLLAR` 常量——`${AS_TOKEN}` 写在 .md 里就是它自己，不必
 * 再拼一个 `$` 去绕开 noTemplateCurlyInString。
 *
 * ⚠️ 但那份正文的**约束没变，删了组件不等于删了约束**：
 * - 五家配置正文与 `public/install-agent-skill.sh` 里那四段写入逻辑**逐字同源**。
 *   脚本装出来的就是这些内容，看页面手抄的人和跑脚本的人不该拿到两份不一样的
 *   配置。改任何一边都要同时改另一边。
 * - 五段差异（顶层键、远程类型值、token 注入语法、trust 要求）是这一节唯一要
 *   传达的信息，别再把它们「合并成一个模板套五次」——那正好会把差异抹平，而抄
 *   错格式是静默失败，只是工具列表空着。
 */
import guide from "@/components/settings/agent-setup-guide.md?raw";

/**
 * 正文里的占位符。
 *
 * 用 `{{…}}` 而不是 `${…}`：这份 .md 是纯文本、不经过任何模板引擎，而它内部
 * 恰好要原样展示 Claude Code 的 `${AS_TOKEN}` 插值语法——两者共用一种写法的话，
 * 页面上给用户抄的那个占位符会在这里被当成待替换的槽位填掉。
 */
const PLACEHOLDER_PATTERN = /\{\{(MCP_URL|SCRIPT_URL)\}\}/g;

export interface AgentSetupDocValues {
	/** MCP 端点绝对地址；由调用方按后端 origin 拼好。 */
	mcpUrl: string;
	/** 安装脚本的绝对地址；由调用方按浏览器 origin 拼好。 */
	scriptUrl: string;
}

/**
 * 把两个地址填进正文。
 *
 * 纯函数、不读任何全局量，正是为了能被单测直接量到「没有占位符漏填」——漏一个
 * 的表现是页面上明晃晃印着 `{{MCP_URL}}`，而这一格没有任何服务端状态，出了错
 * 不会有别的信号。
 */
export function buildAgentSetupDoc(values: AgentSetupDocValues): string {
	return guide.replace(PLACEHOLDER_PATTERN, (_match, key: string) =>
		key === "MCP_URL" ? values.mcpUrl : values.scriptUrl
	);
}
