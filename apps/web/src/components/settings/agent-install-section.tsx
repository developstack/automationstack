/**
 * 「一键安装」这一节：一个脚本把 skill 与四家 MCP 配置一次装好。
 *
 * 给的是「先下载、再读、再跑」三步，而不是 `curl … | sh` 一行。这不是谨慎的
 * 姿态问题：这个脚本会往用户 home 和仓库根写配置文件、建符号链接，管道直灌
 * 等于让人在看不见内容的前提下同意这些写入。脚本就在 public/ 下，下载一份读
 * 一眼的成本是十秒。
 *
 * 脚本从不接收、也从不写入 token 的值，所以 export 那一行必须由用户自己做，
 * 页面上单独给一格。
 *
 * 纯展示组件，零 hook：两个地址由调用方算好传进来。
 */
import { DownloadIcon } from "lucide-react";

import { AgentCopyBlock } from "@/components/settings/agent-copy-block";
import { TOKEN_ENV_VAR } from "@/components/settings/agent-mcp-clients";
import { SettingsSection } from "@/components/settings/settings-section";

const HEADING_ID = "settings-agent-install-heading";
const SECTION_TITLE = "一键安装";
const SECTION_DESCRIPTION =
	"这个脚本把 skill 装好，并按你本机装了哪些 agent 分别写好 MCP 配置。它从不接收、也从不写入 token 的值。";

const SCRIPT_NAME = "install-agent-skill.sh";

const COMMANDS_HINT =
	"三步分开跑：先下载，再自己读一遍（它会往 home 和仓库根写文件），--dry-run 会把「将要写哪些文件、写什么内容」全部打印出来但一个字节都不写，确认无误再去掉这个参数正式执行。别用 curl … | sh，那等于在看不见内容的前提下同意这些写入。";

const TOKEN_HINT =
	"脚本装完不会替你填 token。去「API Token」那一格签一枚，然后把这一行写进 ~/.zshrc 或 ~/.bashrc；只在当前 shell 里 export 的话，凭据会留在 shell history 里。";

const BEHAVIOURS = [
	"选项：--url（平台 MCP 端点）、--platform（claude | codex | opencode | zcode | all）、--scope（project 写进当前目录 / user 写进 $HOME）、--skill-only（只装 skill，完全不碰 MCP 配置）、--dry-run、-h。",
	"用 command -v 探测本机装了哪些 agent；--platform all（默认）只给探测到的装，显式指定某一家时即使没探测到也照装。",
	"skill 真身装在 <作用域>/.agents/skills/testcase-platform/SKILL.md，另在 <作用域>/.claude/skills/testcase-platform 建一个指向它的符号链接——Claude Code 只认自己那个目录。",
	"合并 JSON 优先用 jq，没有就用 python3；两个都没有时它拒绝动手，并把该写的内容原样打印出来让你手抄（退出码 3）。",
	"改动前先备份成 <文件>.bak.<纪元秒>；目标 JSON 已经损坏时退出码 1 且不碰它；内容与要写的完全相同就跳过写入，所以重复跑不会堆一堆备份。",
	"pi 不在写配置的名单里——它没有 MCP 客户端，只装 skill。",
];

const LIST_CLASS =
	"flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs";

function buildCommands(scriptUrl: string, mcpUrl: string): string {
	return [
		`curl -O ${scriptUrl}`,
		`less ${SCRIPT_NAME}`,
		`sh ${SCRIPT_NAME} --url ${mcpUrl} --dry-run`,
		`sh ${SCRIPT_NAME} --url ${mcpUrl}`,
	].join("\n");
}

export interface AgentInstallSectionProps {
	mcpUrl: string;
	/** 脚本的下载地址；它是 apps/web/public 下的静态文件。 */
	scriptUrl: string;
}

export function AgentInstallSection(props: AgentInstallSectionProps) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<a
				className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-4"
				download={SCRIPT_NAME}
				href={`/${SCRIPT_NAME}`}
			>
				<DownloadIcon aria-hidden="true" className="size-4" />
				下载 {SCRIPT_NAME}
			</a>
			<AgentCopyBlock
				hint={COMMANDS_HINT}
				id="settings-agent-install-commands"
				label="安装命令"
				multiline={true}
				value={buildCommands(props.scriptUrl, props.mcpUrl)}
			/>
			<AgentCopyBlock
				hint={TOKEN_HINT}
				id="settings-agent-token-env"
				label="设置 token 环境变量"
				value={`export ${TOKEN_ENV_VAR}='<粘贴你的 token>'`}
			/>
			<ul className={LIST_CLASS}>
				{BEHAVIOURS.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</SettingsSection>
	);
}
