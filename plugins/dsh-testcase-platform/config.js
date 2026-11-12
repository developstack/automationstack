/**
 * 测试用例平台 dsh 插件的纯配置逻辑。
 *
 * 这个模块不 import 任何东西：单测不装 dsh 也能加载它。index.js 负责把这里算出的
 * 两份配置交给 @deepseek-ai/dsh-skill-filesystem 与 @deepseek-ai/dsh-mcp-client。
 *
 * 出错时不抛异常：url 或 token 不合法只会让 MCP 那一半不挂载，并在 errors 里写明原因；
 * 两个 skill 照常挂载。插件整体加载失败会把错误埋进启动日志，用户更难找到原因。
 */

export const DEFAULT_URL = "https://testcase.logwing.com/mcp";
export const DEFAULT_TOKEN_ENV = "AS_TOKEN";

/** MCP 工具名前缀：mcp__testcase-platform__<工具>，与平台 MCP server 自报的名字一致。 */
export const SERVER_NAME = "testcase-platform";
export const SKILL_PROVIDER_NAME = "testcase-platform";
export const SKILL_NAMES = ["testcase-authoring", "testcase-migration"];

const KNOWN_KEYS = new Set(["url", "tokenEnv"]);
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WHITESPACE_PATTERN = /\s/;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveUrl(raw, report) {
	if (raw === undefined) {
		return DEFAULT_URL;
	}
	if (typeof raw !== "string" || raw.trim() === "") {
		report.errors.push("config.url 必须是非空字符串");
		return null;
	}
	const url = raw.trim();
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		report.errors.push(`config.url 不是合法的 URL：${url}`);
		return null;
	}
	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
		report.errors.push(`config.url 只支持 http 或 https：${url}`);
		return null;
	}
	if (parsed.username !== "" || parsed.password !== "") {
		report.errors.push(
			"config.url 不能包含用户名或密码，token 走 Authorization 头"
		);
		return null;
	}
	if (parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(parsed.hostname)) {
		report.warnings.push(
			`config.url 使用明文 http（${parsed.host}），token 会以明文发送；请改用 https`
		);
	}
	return url;
}

function resolveTokenEnv(raw, report) {
	if (raw === undefined) {
		return DEFAULT_TOKEN_ENV;
	}
	if (typeof raw !== "string" || !ENV_NAME_PATTERN.test(raw)) {
		report.errors.push(
			`config.tokenEnv 必须是环境变量名（字母、数字、下划线）：${String(raw)}`
		);
		return null;
	}
	return raw;
}

function resolveHeaders(tokenEnv, env, report) {
	const token = (env[tokenEnv] ?? "").trim();
	if (token === "") {
		report.warnings.push(
			`环境变量 ${tokenEnv} 未设置或为空：请求不带 Authorization 头，平台返回 401，不会注册任何 mcp__${SERVER_NAME}__* 工具。设置后重启 dsh。`
		);
		return {};
	}
	if (WHITESPACE_PATTERN.test(token)) {
		report.errors.push(
			`环境变量 ${tokenEnv} 的值中间含空白字符，不是合法的 API token`
		);
		return null;
	}
	return { Authorization: `Bearer ${token}` };
}

/**
 * 由插件行的 config 与启动环境算出两个子插件的配置。
 *
 * @param {object} input
 * @param {unknown} input.config cordis.patch.yml 里该插件行的 config（可为 undefined）。
 * @param {Record<string, string | undefined>} input.env 启动环境，通常是 process.env。
 * @param {string} input.skillsDir 包内 skills/ 目录的绝对路径。
 * @returns {{ skills: object, mcp: object | null, warnings: string[], errors: string[] }}
 *   mcp 为 null 表示配置有错，MCP 不挂载；原因在 errors 里。
 */
export function buildPluginSetup({ config, env, skillsDir }) {
	const report = { errors: [], warnings: [] };
	const skills = {
		customSkillDirs: [skillsDir],
		includeDefaultRoots: false,
		providerName: SKILL_PROVIDER_NAME,
	};

	const raw = config ?? {};
	if (!isPlainObject(raw)) {
		report.errors.push("插件 config 必须是对象（YAML 映射）");
		return { ...report, mcp: null, skills };
	}
	for (const key of Object.keys(raw)) {
		if (!KNOWN_KEYS.has(key)) {
			report.warnings.push(
				`忽略未知的 config 键 ${key}（只认 url、tokenEnv；token 本身必须放在环境变量里）`
			);
		}
	}

	const url = resolveUrl(raw.url, report);
	const tokenEnv = resolveTokenEnv(raw.tokenEnv, report);
	const headers =
		tokenEnv === null ? null : resolveHeaders(tokenEnv, env, report);
	if (url === null || headers === null) {
		return { ...report, mcp: null, skills };
	}

	const mcp = {
		failOnStartupError: false,
		headers,
		serverName: SERVER_NAME,
		transport: "streamable-http",
		url,
	};
	return { ...report, mcp, skills };
}
