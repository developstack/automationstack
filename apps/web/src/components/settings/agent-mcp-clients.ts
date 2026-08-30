/**
 * 五家本地 agent 各自的 MCP 配置写法。
 *
 * 「MCP 配置」是一个惯例、不是一个标准，四家客户端在文件格式、顶层键、远程
 * 类型值、token 注入方式四个维度上各走各的（第五家 pi 根本没有 MCP 客户端）。
 * 任何一格填成邻居的写法都是**静默失败**：Codex 不做字符串插值，会把
 * "${AS_TOKEN}" 原样当成 token 发出去；opencode 不认 type: "http"，见不到
 * oauth: false 还会自己去试 OAuth 握手。所以这里是五段各自写死的正文，
 * 不是一个模板套五次——套模板恰好会把「差异」这条唯一要传达的信息抹平。
 *
 * 正文与 public/install-agent-skill.sh 里那四段写入逻辑**逐字同源**：脚本装出
 * 来的就是这些内容，看页面手抄和跑脚本的人不该得到两份不一样的配置。
 *
 * 正文用「一行一个字符串再 join」而不是一整段多行模板串：这样每一行都能被
 * 格式化器按 80 列量到，也避免整块正文的缩进跟着代码缩进一起漂。占位符里那个
 * `$` 由下面的 DOLLAR 拼进去，理由见它旁边那段。
 */

/*
 * 一个孤零零的 `$`，用来在字符串里拼出 `${…}` 这种占位符。
 *
 * 直接把 `${AS_TOKEN}` 写进普通字符串会被 lint/suspicious/noTemplateCurlyInString
 * 拦下——那条规则假定「普通字符串里出现 ${} = 忘了写反引号」。这里恰恰相反：
 * 它是要原样展示、让人抄进配置文件的占位符，插值掉就废了。
 */
const DOLLAR = "$";

/** 平台里生成的 API Token 建议存进这个环境变量，四家配置正文都引用它。 */
export const TOKEN_ENV_VAR = "AS_TOKEN";

/** MCP server 在各家配置里的键名，与安装脚本的 SKILL_NAME 一致。 */
const SERVER_KEY = "testcase-platform";

export interface AgentMcpClient {
	/** 配置正文；null 表示这家根本不支持 MCP。 */
	config: string | null;
	/** 可复制块的 label 后缀，同时点明文件格式。 */
	format: string;
	/** 元素 key 与控件 id 用；同时是 kebab-case 的稳定标识。 */
	id: string;
	name: string;
	/** 必须知道的坑，逐条独立成句。 */
	notes: string[];
	/** 配置文件位置：项目级在前，用户级在后。 */
	paths: string[];
}

function claudeCode(mcpUrl: string): AgentMcpClient {
	return {
		config: [
			"{",
			'  "mcpServers": {',
			`    "${SERVER_KEY}": {`,
			'      "type": "http",',
			`      "url": "${mcpUrl}",`,
			'      "headers": {',
			`        "Authorization": "Bearer ${DOLLAR}{AS_TOKEN}"`,
			"      }",
			"    }",
			"  }",
			"}",
		].join("\n"),
		format: "JSON",
		id: "claude-code",
		name: "Claude Code",
		notes: [
			`支持 ${DOLLAR}{VAR} 与 ${DOLLAR}{VAR:-默认值} 插值，所以配置里留占位符即可，不必写死 token。`,
			"用户级的 ~/.claude.json 同时装着会话历史等一堆结构，建议用官方命令改它：claude mcp add --scope user --transport http（注意给 header 加单引号，否则 shell 会先把占位符吃掉）。",
		],
		paths: ["项目级：<仓库根>/.mcp.json", "用户级：~/.claude.json"],
	};
}

function codex(mcpUrl: string): AgentMcpClient {
	return {
		config: [
			`[mcp_servers.${SERVER_KEY}]`,
			`url = "${mcpUrl}"`,
			`bearer_token_env_var = "${TOKEN_ENV_VAR}"`,
		].join("\n"),
		format: "TOML",
		id: "codex",
		name: "Codex",
		notes: [
			"不要写 type 字段——Codex 的远程 server 没有这一项。",
			"不支持任何字符串插值，只接受「环境变量的名字」：bearer_token_env_var 填 AS_TOKEN 这个名字本身，不是它的值。要加别的头就用 env_http_headers，它的值同样是变量名，变量内容被整体当作头的值取用。",
			"项目级的 .codex/config.toml 要求该项目已被 trust，否则 Codex 根本不读它。",
		],
		paths: [
			"项目级：<仓库根>/.codex/config.toml",
			"用户级：~/.codex/config.toml",
		],
	};
}

function opencode(mcpUrl: string): AgentMcpClient {
	return {
		config: [
			"{",
			'  "$schema": "https://opencode.ai/config.json",',
			'  "mcp": {',
			`    "${SERVER_KEY}": {`,
			'      "type": "remote",',
			`      "url": "${mcpUrl}",`,
			'      "enabled": true,',
			'      "oauth": false,',
			'      "headers": {',
			'        "Authorization": "Bearer {env:AS_TOKEN}"',
			"      }",
			"    }",
			"  }",
			"}",
		].join("\n"),
		format: "JSON",
		id: "opencode",
		name: "opencode",
		notes: [
			"三处与众不同：顶层键是 mcp（不是 mcpServers）、type 是 remote（不是 http）、还必须显式写 enabled。",
			'"oauth": false 必须写。漏了它 opencode 会自己去试 OAuth 握手，而这个端点只认 Bearer。',
			`插值语法是 {env:AS_TOKEN}（另支持 {file:路径}），不是 ${DOLLAR}{...}。`,
		],
		paths: [
			"项目级：<仓库根>/opencode.json",
			"用户级：~/.config/opencode/opencode.json",
		],
	};
}

function zcode(mcpUrl: string): AgentMcpClient {
	return {
		config: [
			"{",
			'  "mcpServers": {',
			`    "${SERVER_KEY}": {`,
			'      "type": "http",',
			`      "url": "${mcpUrl}",`,
			'      "headers": {',
			'        "Authorization": "Bearer <把这里换成你的 token>"',
			"      }",
			"    }",
			"  }",
			"}",
		].join("\n"),
		format: "JSON",
		id: "zcode",
		name: "zcode",
		notes: [
			"⚠️ 上面这份正文里的 HTTP 字段名（type / url / headers）不是官方文档写明的，是照「.agents/mcp.json 采用与 Claude Code 相同的结构」推断出来的。zcode 官方只给了 stdio 的示例。如果它不认，改走图形界面：Settings → MCP Servers → New MCP Server，填端点地址加一个 Authorization: Bearer 头。",
			"⚠️ 同一作用域下只要 .zcode 的配置里声明了任何一个 MCP server，.agents/mcp.json 就会被整份忽略、不做合并。两边都配了以 .zcode 为准。",
			"没有确认可用的插值语法，所以上面写的是字面量占位符，需要你手工替换成真 token。换完请确认这个文件没有被提交进 git——它会含明文凭据。",
		],
		paths: ["项目级：<仓库根>/.agents/mcp.json", "用户级：~/.agents/mcp.json"],
	};
}

function pi(): AgentMcpClient {
	return {
		config: null,
		format: "无",
		id: "pi",
		name: "pi",
		notes: [
			"pi 不支持 MCP：它的 README 逐字写着 “No MCP”。别给它配 MCP，配了也不会生效。",
			"pi 只装 skill。skill 正文里写了直接 curl 这个端点的办法（标准 JSON-RPC over HTTP，tools/list 与 tools/call），够用。",
		],
		paths: ["没有 MCP 配置文件要写；skill 的装法见下一节。"],
	};
}

/** 按「配置最简单 → 最需要小心」排序，pi 收尾（它压根没有配置）。 */
export function buildMcpClients(mcpUrl: string): AgentMcpClient[] {
	return [
		claudeCode(mcpUrl),
		codex(mcpUrl),
		opencode(mcpUrl),
		zcode(mcpUrl),
		pi(),
	];
}
