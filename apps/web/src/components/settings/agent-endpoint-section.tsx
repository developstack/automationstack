/**
 * 「MCP 端点」这一节：地址、鉴权与身份、六个工具和它们的硬上限。
 *
 * 排在最前面，因为它是这一整格唯一「平台侧」的事实——底下的安装脚本与四家
 * 客户端配置都只是把这个地址填到不同的地方去。
 *
 * 身份那句话必须是可见文案：MCP 没有「默认身份」也不会静默降级，agent 能看到
 * 什么、能写坏什么，完全等于那枚 token 主人的权限。这条藏在文档里来不及起作用。
 *
 * 纯展示组件，零 hook：端点地址由调用方算好传进来。
 */
import { AgentCopyBlock } from "@/components/settings/agent-copy-block";
import { SettingsSection } from "@/components/settings/settings-section";

const HEADING_ID = "settings-agent-endpoint-heading";
const SECTION_TITLE = "MCP 端点";
const SECTION_DESCRIPTION =
	"平台不再内置在线 AI，改为把用例读写开成一个 MCP 接口，由你自己的本地 agent 接进来对话。";

const ENDPOINT_HINT =
	"Streamable HTTP，无状态。每个请求都要带 Authorization: Bearer <你的 API Token>；token 在上面「API Token」那一格生成，as_ 开头。";

/** 身份这条不能只写在注释或 tooltip 里，见文件头。 */
const IDENTITY_NOTES = [
	"接进去之后，agent 的身份与权限就是这枚 token 所属用户的身份与权限——没有「MCP 默认身份」，也不会静默降级成只读。",
	"没带或带错 Bearer 会直接拿到 HTTP 401，且一个工具都不会注册，tools/list 也是空的。",
	"权限不足不是 HTTP 403：服务端把它包成了普通的工具结果（HTTP 200，isError 为 true）。所以每次调用都要看返回里的 isError，别因为「没报错」就当成功。",
];

const TOOLS = [
	"list_projects —— 列出你可见的项目。第一步先调它，一次就能确认连通、token 有效、看得到哪些项目。",
	"create_project —— 新建项目。",
	"get_module_tree —— 取某个项目的模块树。",
	"ensure_module_path —— 按路径补齐模块并返回最深一级的 id；路径最多 10 段。",
	"import_test_cases —— 批量导入用例，每批最多 50 条，超了整批被拒。",
	"search_cases —— 按名称搜用例，默认返回 20 条，上限 50 条。",
];

const LIST_CLASS =
	"flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs";

export function AgentEndpointSection({ mcpUrl }: { mcpUrl: string }) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<AgentCopyBlock
				hint={ENDPOINT_HINT}
				id="settings-agent-mcp-endpoint"
				label="MCP 端点地址"
				value={mcpUrl}
			/>
			<ul className={LIST_CLASS}>
				{IDENTITY_NOTES.map((note) => (
					<li key={note}>{note}</li>
				))}
			</ul>
			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">六个工具</h3>
				<ul className={LIST_CLASS}>
					{TOOLS.map((tool) => (
						<li key={tool}>{tool}</li>
					))}
				</ul>
			</div>
		</SettingsSection>
	);
}
