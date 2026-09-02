/**
 * 浏览器目录（`farm_browser`）表单的取值规则与展示文案。
 *
 * ── 这几条规则的来源 ──
 * 与 platform-user-meta.ts 同一个思路：**服务端 zod 校验失败只回一句笼统的
 * "Input validation failed"**，用户看不出是哪个字段、差在哪里，所以同一套规则
 * 在输入时就要说清楚。
 *
 * 集成时已逐条对着 `packages/api/src/schemas/farm.ts` 核过（`browserFieldSchema`
 * = trim + min(1) + max(64)，`browserImageSchema` = trim + min(1) + max(512)），
 * 这里现在是**誊写**而不是推测：三个上限一字不差，trim 的先后次序也一致。
 *
 * 原先还有两条前端自造的格式规则（浏览器名只收 `[a-z0-9-]`、版本与镜像不许带
 * 空格）。服务端**不校验格式**，于是它们会把后端本来接受的值挡在门外——用户被
 * 前端拒绝时连「其实存得进去」都不知道。放宽比收紧安全：收紧只是挡下一次本可
 * 成功的提交，放宽最多是让人存进一个自己写错的值，而那一步是可见、可改回来的。
 * 小写与不带空格仍然是**约定**，写在下面三条 HINT 里作为输入提示。
 */

const MAX_BROWSER_LENGTH = 64;
const MAX_VERSION_LENGTH = 64;
const MAX_IMAGE_LENGTH = 512;

export const BROWSER_HINT = "小写字母、数字与连字符，如 chromium";
export const VERSION_HINT = "客户端请求时写的版本号，如 124 或 stable";
export const IMAGE_HINT = "容器镜像引用，如 selenoid/chrome:124.0";

/** 返回错误文案；通过校验时返回 null。 */
export function validateBrowserName(value: string): string | null {
	// 先 trim 再量长度，与服务端 zod 的 `.trim().min(1).max(n)` 同序，边界才一致
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "浏览器名不能为空";
	}
	if (trimmed.length > MAX_BROWSER_LENGTH) {
		return `浏览器名最多 ${MAX_BROWSER_LENGTH} 个字符`;
	}
	return null;
}

/** 返回错误文案；通过校验时返回 null。 */
export function validateVersion(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "版本不能为空";
	}
	if (trimmed.length > MAX_VERSION_LENGTH) {
		return `版本最多 ${MAX_VERSION_LENGTH} 个字符`;
	}
	return null;
}

/** 返回错误文案；通过校验时返回 null。 */
export function validateImage(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "镜像不能为空";
	}
	if (trimmed.length > MAX_IMAGE_LENGTH) {
		return `镜像最多 ${MAX_IMAGE_LENGTH} 个字符`;
	}
	return null;
}

/**
 * 目录行的人类可读名，如 `chromium 124`。
 *
 * 确认框标题、toast、以及行操作按钮的 sr-only 标签都用它：一张表里
 * 「chromium 124」和「chromium 123」只差一个字，删错一行的代价是所有指定该
 * 版本的脚本立刻起不来，所以每一处提示都必须把版本一起念出来。
 */
export function browserDisplayName(row: {
	browser: string;
	version: string;
}): string {
	return `${row.browser} ${row.version}`;
}

/*
 * 两个开关的文案。新建与编辑两张表单各挂一次，写死在两处的话，将来「停用到底
 * 影响不影响在跑的会话」这句话只会被改掉其中一处——而这正是用户最需要确认的点。
 */
export const DEFAULT_FLAG_LABEL = "设为默认";
export const DEFAULT_FLAG_DESCRIPTION =
	"客户端没写版本时用这一行。一张表里只有一个默认，勾上它等于把原来那一行的默认让出来。";
export const ENABLED_FLAG_LABEL = "启用";
export const ENABLED_FLAG_DESCRIPTION =
	"停用后不再接受新会话；已经在跑的会话不受影响，目录行也仍然留着，随时可以再打开。";
