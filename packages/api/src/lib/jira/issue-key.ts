/**
 * Jira issue key 的解析与 URL 组装。
 *
 * 纯函数、不发任何请求：反向关联时用户粘进来的东西五花八门——完整浏览器地址栏
 * URL、看板上带 `selectedIssue` 的深链、或者干脆只打了个 `PAY-123`。
 * 把「从一坨文本里认出 key」和「拿 key 去问 Jira」拆开，前者才能被单测覆盖，
 * 后者才可以在未配置 Jira 时整段跳过（D9）。
 */

/**
 * Jira 的 project key 规则：首字符是字母，其后为字母或数字，总长 2–10。
 * issue 号是正整数。这里刻意写成**完全匹配**而不是「在文本里找一处」——
 * 用户手打的场景下，宁可让「PAY-123 登录失败」这种带描述的输入被拒并提示，
 * 也不要从一句话里猜出一个 key 然后把结论静默关联到错误的 issue 上。
 */
const ISSUE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]{1,9})-([1-9]\d*)$/;

/** URL 路径里的 key：`/browse/PAY-123`、`/jira/.../issues/PAY-123` 都命中。 */
const URL_PATH_KEY_PATTERN =
	/\/(?:browse|issues)\/([A-Za-z][A-Za-z0-9]{1,9}-[1-9]\d*)/;

/** 看板 / 待办列表的深链把 key 放在查询串里：`?selectedIssue=PAY-123`。 */
const SELECTED_ISSUE_KEYS = ["selectedIssue", "issueKey", "selectedIssueKey"];

/** 末尾斜杠会让 `${siteUrl}/browse/...` 拼出双斜杠，统一先削掉。 */
const TRAILING_SLASHES_PATTERN = /\/+$/;

function normalizeKey(value: string): string | null {
	const matched = ISSUE_KEY_PATTERN.exec(value.trim());
	if (matched === null) {
		return null;
	}
	const [, projectKey, issueNumber] = matched;
	if (projectKey === undefined || issueNumber === undefined) {
		return null;
	}
	// Jira 的 key 恒为大写，但用户经常小写手打；统一大写后才能和 API 返回值比对。
	return `${projectKey.toUpperCase()}-${issueNumber}`;
}

function parseFromUrl(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	const fromPath = URL_PATH_KEY_PATTERN.exec(url.pathname)?.[1];
	if (fromPath !== undefined) {
		return normalizeKey(fromPath);
	}
	for (const parameter of SELECTED_ISSUE_KEYS) {
		const value = url.searchParams.get(parameter);
		if (value !== null) {
			const key = normalizeKey(value);
			if (key !== null) {
				return key;
			}
		}
	}
	return null;
}

/**
 * 从用户输入里解析出 issue key；认不出来返回 null（不抛异常——这是最常见的
 * 用户输入错误，调用方要把它映射成一句人话提示，而不是一个 500）。
 */
export function parseIssueKey(input: string): string | null {
	const trimmed = input.trim();
	if (trimmed === "") {
		return null;
	}
	if (trimmed.includes("://")) {
		return parseFromUrl(trimmed);
	}
	return normalizeKey(trimmed);
}

/** 削掉末尾斜杠的站点地址，用于拼接所有 REST 路径与 browse 链接。 */
export function normalizeSiteUrl(siteUrl: string): string {
	return siteUrl.trim().replace(TRAILING_SLASHES_PATTERN, "");
}

/** issue 的人类可读地址：Jira Cloud 恒为 `<site>/browse/<KEY>`。 */
export function buildIssueUrl(siteUrl: string, issueKey: string): string {
	return `${normalizeSiteUrl(siteUrl)}/browse/${issueKey}`;
}
