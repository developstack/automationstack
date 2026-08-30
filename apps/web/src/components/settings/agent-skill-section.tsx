/**
 * 「Skill 与约定文件」这一节。
 *
 * 光把 MCP 接上，agent 只拿到六个工具名；六个工具里哪个先调、导入的硬上限是
 * 什么、权限错误为什么是 HTTP 200，这些全写在 skill 正文里。所以这一节和上面
 * 那一节是一对，不是可选的补充。
 *
 * 唯一要记的例外是目录：五家吃的都是同一套 Agent Skills 约定，但 Claude Code
 * 不扫 .agents/skills/。安装脚本靠一个符号链接把这条差异抹平，手工装的人得
 * 自己知道。
 *
 * 纯展示组件，零 hook。
 */
import { AgentCopyBlock } from "@/components/settings/agent-copy-block";
import { SettingsSection } from "@/components/settings/settings-section";

const HEADING_ID = "settings-agent-skill-heading";
const SECTION_TITLE = "Skill 与约定文件";
const SECTION_DESCRIPTION =
	"五家吃的都是同一套 Agent Skills 约定：一个目录，里面一份 SKILL.md，开头是 YAML frontmatter（name 与 description 两个字段）。";

const SKILL_TEMPLATE = [
	"---",
	"name: testcase-platform",
	"description: 一句话说明这个 skill 干什么、以及什么措辞该触发它。",
	"---",
	"",
	"# 正文",
	"",
	"怎么调这几个工具、先调哪个、每批多少条、错误怎么读。",
].join("\n");

const SKILL_TEMPLATE_HINT =
	"description 决定 agent 什么时候想起来用它，写触发词而不是自我介绍。一键安装脚本装的就是这个形状，正文已经写好。";

const DIRECTORIES = [
	"Codex / opencode / pi / zcode 都扫 .agents/skills/，项目级放 <仓库根>/.agents/skills/，用户级放 ~/.agents/skills/。",
	"Claude Code 是唯一的例外，它只认 .claude/skills/。手工装的话要么在那里再放一份，要么建一个指向 .agents/skills/ 下真身的符号链接（一键安装脚本做的就是后者）。",
];

const CONVENTION_FILES = [
	"Codex / opencode / zcode / pi 读 AGENTS.md。",
	"Claude Code 读 CLAUDE.md。",
	"pi 两个都读。",
	"这两份是给仓库写规矩的地方（分支怎么开、用例导进哪个项目），与 skill 各管一段：skill 讲「这个工具怎么用」，约定文件讲「在这个仓库里该怎么做事」。",
];

const LIST_CLASS =
	"flex list-disc flex-col gap-1 pl-4 text-muted-foreground text-xs";

export function AgentSkillSection() {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<AgentCopyBlock
				hint={SKILL_TEMPLATE_HINT}
				id="settings-agent-skill-template"
				label="SKILL.md 的形状"
				multiline={true}
				value={SKILL_TEMPLATE}
			/>
			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">装到哪个目录</h3>
				<ul className={LIST_CLASS}>
					{DIRECTORIES.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</div>
			<div className="flex flex-col gap-1">
				<h3 className="font-medium text-sm">仓库约定文件</h3>
				<ul className={LIST_CLASS}>
					{CONVENTION_FILES.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</div>
		</SettingsSection>
	);
}
