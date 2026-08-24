/**
 * Jira webhook 的校验与解析。**纯函数 + WebCrypto，不碰数据库、不碰 env。**
 *
 * 这是整个 Jira 集成里唯一一个**没有会话、来自公网**的入口，所以校验逻辑
 * 单独成文件并被单测覆盖：其余接口错了最多是功能不可用，这里错了是别人能
 * 隔着公网改我们库里的数据。
 */

/**
 * Jira Cloud 在 webhook 配置里填了 Secret 时，会用它对**原始请求体**做
 * HMAC-SHA256，以 `sha256=<hex>` 放在这个头里。这是首选校验方式：
 * 签名和请求体绑定，重放到别的端点也没用。
 */
export const JIRA_SIGNATURE_HEADER = "x-hub-signature";

/**
 * 备选：共享密钥直接放在这个头里比对。
 *
 * 存在的理由是 Jira 的 Automation rule（Send web request）能自定义请求头
 * 却不做签名，而系统 webhook 能签名却不能加头——两条路只支持一条，
 * 就总有一半用户接不上。**两条路都是严格比对，没有「宽容处理」**：
 * 头不对、密钥没配、请求体被改，一律拒绝。
 *
 * ⚠️ 密钥只走请求头，**不接受查询串**：URL 会进访问日志和各种中间件，
 * 密钥跟着一起落盘。
 */
export const JIRA_SECRET_HEADER = "x-webhook-secret";

const SIGNATURE_PREFIX = "sha256=";

const encoder = new TextEncoder();

/**
 * 定长比较：一旦用 `===` 比对密钥/签名，比较耗时会随「前缀正确的字符数」
 * 变化，攻击者能据此逐字节猜出密钥。长度先比是无所谓的——长度本来就不是秘密。
 */
function timingSafeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) {
		// 位运算是定长比较的必需品：必须把每一位的差异累积到最后再判断，
		// 换成布尔短路就重新引入了计时侧信道。
		// biome-ignore lint/suspicious/noBitwiseOperators: 定长比较必须按位累积差异，见上
		diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
	let hex = "";
	for (const byte of new Uint8Array(buffer)) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
}

/** 用密钥对原始请求体算 HMAC-SHA256，输出小写 hex。 */
export async function signWebhookBody(
	rawBody: string,
	secret: string
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(rawBody)
	);
	return toHex(signature);
}

export interface VerifyJiraWebhookInput {
	/**
	 * **原始请求体字符串**，不是 `JSON.parse` 之后再 stringify 的结果——
	 * 后者的键序与空白都可能与 Jira 发来的不同，HMAC 必然对不上。
	 */
	rawBody: string;
	/** 库里存的 `jira_configs.webhook_secret`；null = 该项目没开状态同步。 */
	secret: string | null;
	secretHeader: string | null;
	signatureHeader: string | null;
}

/**
 * 校验一次 webhook 请求。**校验不过一律 false，没有任何放行的例外。**
 *
 * 特别地，`secret === null`（项目没配 webhook 密钥）时直接拒绝：
 * 没有密钥就没有可校验的东西，此时「放行」等价于把这个端点对公网敞开。
 */
export async function verifyJiraWebhook(
	input: VerifyJiraWebhookInput
): Promise<boolean> {
	const { secret } = input;
	if (secret === null || secret === "") {
		return false;
	}
	const signature = input.signatureHeader?.trim();
	if (signature !== undefined && signature !== "") {
		if (!signature.toLowerCase().startsWith(SIGNATURE_PREFIX)) {
			return false;
		}
		const expected = await signWebhookBody(input.rawBody, secret);
		return timingSafeEqual(
			signature.slice(SIGNATURE_PREFIX.length).toLowerCase(),
			expected
		);
	}
	const provided = input.secretHeader;
	if (provided === null || provided === "") {
		return false;
	}
	return timingSafeEqual(provided, secret);
}

/**
 * 解析结果。
 *
 * `ignored` 与 `invalid` 必须分开，因为 HTTP 应答不同：Jira 对非 2xx 会重试，
 * 反复失败还会把 webhook 停用。我们只关心 issue 的状态变化，而 Jira 会把
 * 评论、附件、worklog 等一堆事件发到同一个地址——那些是**正常且预期**的
 * 「不关我事」，必须回 2xx（`ignored`）；只有请求体压根不是 Jira 的形状
 * 才回 4xx（`invalid`）。
 */
export type JiraWebhookEvent =
	| { kind: "ignored" }
	| { kind: "invalid" }
	| { kind: "status"; issueKey: string; status: string };

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function readString(
	source: Record<string, unknown>,
	key: string
): string | null {
	const value = source[key];
	return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 从 webhook 请求体里取出 `(issueKey, 当前状态名)`。
 *
 * 只认 `jira:issue_*` 事件，且状态取自 `issue.fields.status.name` 这个
 * **当前值**，而不是 changelog 里的变更项：webhook 可能乱序到达、也可能重投，
 * 用当前值写入天然幂等，用变更项则会把状态写回旧值。
 */
export function parseJiraWebhookPayload(raw: unknown): JiraWebhookEvent {
	const body = asRecord(raw);
	if (body === null) {
		return { kind: "invalid" };
	}
	const event = readString(body, "webhookEvent");
	if (event === null) {
		return { kind: "invalid" };
	}
	if (!event.startsWith("jira:issue_")) {
		return { kind: "ignored" };
	}
	const issue = asRecord(body.issue);
	const issueKey = issue === null ? null : readString(issue, "key");
	if (issueKey === null) {
		return { kind: "invalid" };
	}
	const fields = issue === null ? null : asRecord(issue.fields);
	const status = fields === null ? null : asRecord(fields.status);
	const statusName = status === null ? null : readString(status, "name");
	if (statusName === null) {
		// issue 事件但没带状态字段（如某些 issue_deleted 载荷）：没什么可同步的，
		// 但请求本身是合法的，回 2xx 让 Jira 不要重试。
		return { kind: "ignored" };
	}
	return { issueKey, kind: "status", status: statusName };
}

/**
 * webhook 端点的路由模板；`apps/server` 按它注册，配置页按 `jiraWebhookPath`
 * 把具体路径显示给管理员。
 *
 * projectId 放在路径里而不是从请求体推断：webhook 没有会话，端点必须能独立
 * 判断「这是哪个项目的事件」才能取到对应的 `webhookSecret` 去校验。
 * Jira 的 webhook 配置只能填 URL，路径是唯一可以承载这个信息的地方。
 * 它不是凭据——知道 projectId 也过不了校验。
 */
export const JIRA_WEBHOOK_ROUTE = "/api/jira/webhook/:projectId";

export function jiraWebhookPath(projectId: string): string {
	return `/api/jira/webhook/${projectId}`;
}
