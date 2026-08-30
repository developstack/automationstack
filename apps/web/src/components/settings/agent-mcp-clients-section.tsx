/**
 * 「接进各家客户端」这一节：五家逐家给出配置文件位置、可复制的配置正文，
 * 以及那一家独有的坑。
 *
 * 五家并排而不是「选一家再展开」：多数人手上不止一个 agent，而这几家的差异
 * 恰恰是最容易出事的地方（抄错了不报错，只是工具列表空着）。并排摆出来，
 * 差异本身就是内容。
 *
 * 纯展示组件，零 hook：正文由 agent-mcp-clients.ts 算好后整体传进来。
 */

import { AgentCopyBlock } from "@/components/settings/agent-copy-block";
import type { AgentMcpClient } from "@/components/settings/agent-mcp-clients";
import { SettingsSection } from "@/components/settings/settings-section";

const HEADING_ID = "settings-agent-mcp-clients-heading";
const SECTION_TITLE = "接进各家客户端";
const SECTION_DESCRIPTION =
	"MCP 配置是惯例不是标准，四家的写法互不通用；抄成邻居的格式不会报错，只会静默地连不上。第五家 pi 没有 MCP 客户端。";

const LIST_CLASS =
	"flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs";

function ClientBlock({ client }: { client: AgentMcpClient }) {
	return (
		<div className="flex flex-col gap-2">
			<h3 className="font-medium text-sm">{client.name}</h3>
			<ul className={LIST_CLASS}>
				{client.paths.map((path) => (
					<li key={path}>{path}</li>
				))}
			</ul>
			{client.config === null ? null : (
				<AgentCopyBlock
					id={`settings-agent-mcp-${client.id}`}
					label={`${client.name} 的 MCP 配置（${client.format}）`}
					multiline={true}
					value={client.config}
				/>
			)}
			<ul className={LIST_CLASS}>
				{client.notes.map((note) => (
					<li key={note}>{note}</li>
				))}
			</ul>
		</div>
	);
}

export function AgentMcpClientsSection({
	clients,
}: {
	clients: AgentMcpClient[];
}) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			{clients.map((client) => (
				<ClientBlock client={client} key={client.id} />
			))}
		</SettingsSection>
	);
}
