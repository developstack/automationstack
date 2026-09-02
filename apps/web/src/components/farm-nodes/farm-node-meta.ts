/**
 * 实机节点页的取值规则与展示文案。纯函数 + 常量，配 farm-node-meta.test.ts。
 *
 * ── 校验规则从哪儿来 ──
 * 与 farm-browser-meta.ts / api-token-meta.ts 同一个思路：**服务端 zod 校验失败
 * 只回一句笼统的 "Input validation failed"**，用户看不出是哪个字段、差在哪里，
 * 所以同一套规则在输入时就要说清楚。下面三个上限是
 * `packages/api/src/schemas/farm.ts` 里 `nodeNameSchema` / `nodeSlotsSchema` 的
 * 誊写（trim + min(1) + max(64)；整数 1..64），trim 的先后次序也一致。
 * 不自造任何服务端没有的格式规则——收紧只会把后端本来接受的值挡在门外。
 * 唯一**不誊写**的是保留名那一条：判据和文案都从 schemas/farm.ts import，
 * 理由见 validateNodeName 里那段注释。
 */
import type { AppRouterClient } from "@automationstack/api/routers/index";
import {
	RESERVED_NODE_NAME,
	RESERVED_NODE_NAME_MESSAGE,
} from "@automationstack/api/schemas/farm";

/**
 * 列表行的形状**从路由客户端反推**，不在 web 侧再声明一遍，也不从
 * `@automationstack/db/schema/*` 取。
 *
 * 两个理由：一是 `online` 这一列压根不在库里，它是 `farm.nodes.list` 现算的派生
 * 字段（判据见 packages/api/src/lib/farm-node-online.ts），从 db 取到的类型天生
 * 少一列；二是这一支的返回形状将来还会长（比如加上「当前占用了几个槽位」），
 * `Awaited<ReturnType<...>>` 取到的永远是最新那一份。与
 * `farm/session-meta.ts` 取 `AppRouterClient` 的用法同源。
 */
type FarmNodeListResult = Awaited<
	ReturnType<AppRouterClient["farm"]["nodes"]["list"]>
>;

/** 一行节点（含派生的 `online`）。 */
export type FarmNodeRow = FarmNodeListResult[number];

/** `"local" | "docker"`，同样从路由反推，免得两处各写一份枚举。 */
export type FarmNodeBackend = FarmNodeRow["backend"];

const MAX_NODE_NAME_LENGTH = 64;
const MIN_NODE_SLOTS = 1;
const MAX_NODE_SLOTS = 64;

/** 新建表单的槽位初值，与服务端 schema 的 `.default()` 同值。 */
export const DEFAULT_NODE_SLOTS = 2;

export const NODE_NAME_HINT = `给自己认的名字，最多 ${MAX_NODE_NAME_LENGTH} 个字符，例如「工位 A 的 Mac mini」`;
export const NODE_SLOTS_HINT = `这台机器上最多同时跑几个浏览器，${MIN_NODE_SLOTS}–${MAX_NODE_SLOTS}`;

/**
 * 后端的中文说法。
 *
 * 不直接把 `local` / `docker` 摆在表格里：这一列要回答的是「这台机器上的浏览器
 * 是怎么起来的」，而 local 这个词单看只说明「不是远程」，说不出它其实是在直接
 * 拉起那台机器上装着的那个 Chrome——那正是它与 docker 那档在体感上的全部差别
 * （会抢走真人的鼠标焦点、装什么版本由那台机器说了算）。
 */
export const NODE_BACKEND_LABELS: Record<FarmNodeBackend, string> = {
	docker: "Docker 容器",
	local: "本机 Chrome",
};

export interface NodeBackendOption {
	label: string;
	value: FarmNodeBackend;
}

/** 新建表单的下拉选项。顺序即推荐顺序：装起来最省事的那档在前。 */
export const NODE_BACKEND_OPTIONS: readonly NodeBackendOption[] = [
	{ label: NODE_BACKEND_LABELS.local, value: "local" },
	{ label: NODE_BACKEND_LABELS.docker, value: "docker" },
];

/** 返回错误文案；通过校验时返回 null。 */
export function validateNodeName(value: string): string | null {
	// 先 trim 再量长度，与服务端 zod 的 `.trim().min(1).max(n)` 同序，边界才一致
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "节点名不能为空";
	}
	if (trimmed.length > MAX_NODE_NAME_LENGTH) {
		return `节点名最多 ${MAX_NODE_NAME_LENGTH} 个字符`;
	}
	/*
	 * 保留名。这一条的判据与文案都从服务端 schema import 过来，不誊写：上面那两
	 * 条上限誊一遍最多是边界差一个字，这一条誊错了是「表单放行、提交被拒、而拒
	 * 的理由被 oRPC 包成一句 Input validation failed」——用户对着一个没有红字的
	 * 表单反复按保存。
	 */
	if (trimmed.toLowerCase() === RESERVED_NODE_NAME) {
		return RESERVED_NODE_NAME_MESSAGE;
	}
	return null;
}

/**
 * 槽位上限。收的是**输入框里的原文**而不是 number：`<input type="number">` 的
 * value 始终是字符串，空框、`"1.5"`、`"abc"` 都要有说得出口的说法，转成 number
 * 之后这三者会一起塌成 `NaN`，分不开也就没法给出不同的提示。
 */
export function validateMaxSlots(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "槽位上限不能为空";
	}
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed)) {
		return "槽位上限要填整数";
	}
	if (parsed < MIN_NODE_SLOTS || parsed > MAX_NODE_SLOTS) {
		return `槽位上限要在 ${MIN_NODE_SLOTS}–${MAX_NODE_SLOTS} 之间`;
	}
	return null;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * 上次心跳距今多久。
 *
 * 用相对时间而不是绝对时间戳：这一列要回答的是「它是刚掉的还是躺了一周」，
 * 而那需要把 `25/8/30 14:03` 和当前时刻在脑子里相减一次。相对说法直接就是答案。
 *
 * @param now 由调用方传进来，这个函数**不读时钟**。这一页是 SSR 的
 *   （TanStack Start + nitro），在渲染里读 `Date.now()` 会让服务端与浏览器
 *   跨过一次秒边界时给出不同的 HTML，即 hydration mismatch——同 farm/use-live-now.ts
 *   顶部那一整段。调用方该传的是 React Query 的 `dataUpdatedAt`（它随
 *   dehydrate 一起序列化，两侧读到同一个数字）。
 * @param lastSeenAt 与 session-meta 同规写成 `Date | string`：这份数据经过
 *   dehydrate → hydrate 一个来回，直接 `.getTime()` 等于赌那条链路上每一环都
 *   保住了 Date 这个类型，赌输的表现是整页白屏。
 */
export function formatLastSeenAt(
	lastSeenAt: Date | string | null,
	now: number
): string {
	if (lastSeenAt === null) {
		// 建号之后一次都没报到过：多半是 token 还没填进 agent，说成「0 秒前」是假话
		return "从未上报";
	}
	const elapsedMs = now - new Date(lastSeenAt).getTime();
	const seconds = Math.floor(elapsedMs / MS_PER_SECOND);
	// 节点机器的时钟快了会给出未来的心跳，负数在界面上是句谎话，一律说「刚刚」
	if (seconds < 1) {
		return "刚刚";
	}
	if (seconds < SECONDS_PER_MINUTE) {
		return `${seconds} 秒前`;
	}
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) {
		return `${minutes} 分钟前`;
	}
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	if (hours < HOURS_PER_DAY) {
		return `${hours} 小时前`;
	}
	return `${Math.floor(hours / HOURS_PER_DAY)} 天前`;
}

/** 在线状态点旁边的字。读屏只有这两个词可念，所以它不能只是个颜色。 */
export function nodeOnlineLabel(online: boolean): string {
	return online ? "在线" : "离线";
}
