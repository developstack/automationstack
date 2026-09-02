/**
 * caps 的**写**那一半：把槽位要求的启动参数注进去（D4/D5）。
 *
 * 与 `capabilities.ts` 分家纯粹是因为那份文件到了 308 行、越过仓库 300 行的上限
 * （scripts/check-file-rules.js）。分界线选在「读 caps」与「改 caps」之间：
 * 读那半（`as:options` 提取、浏览器点名）在会话建起来**之前**发生，改这半必须在
 * `acquire` **之后**才能调用（端口是槽位给的）。两半的调用时机本来就不同。
 */

import {
	asRecord,
	CHROME_OPTIONS_KEY,
	capabilitiesOf,
	DEBUGGING_PORT_FLAG,
	type NewSessionBody,
	type W3cCapabilities,
} from "./capabilities";

/** flag 名（`--foo=bar` 里的 `--foo`）。按它判重，值是几不影响「已经写过了」。 */
function flagNameOf(arg: string): string {
	const [name] = arg.split("=");
	return name ?? arg;
}

/** 客户端是否已经写过这个 flag（不管它给的值是什么）。 */
function hasFlag(args: unknown, flag: string): boolean {
	return (
		Array.isArray(args) &&
		args.some(
			(arg) =>
				typeof arg === "string" && (arg === flag || arg.startsWith(`${flag}=`))
		)
	);
}

/**
 * 往一份 caps 里补齐槽位要求的那几个启动参数。
 *
 * 逐个判重：某个 flag 客户端已经写过（不管它给的值是几）就跳过那一个。
 * 客户端显式指定过的东西不该被我们悄悄改掉，而重复传同一个 flag 会让 chromium
 * 直接拒绝启动。代价是那种会话可能录不到东西（端口对不上）或者用了它自己的
 * profile 目录（本地 provider 的孤儿清扫就认不出它），这是客户端自己选的。
 */
function withSlotArgs(
	slot: Record<string, unknown>,
	slotArgs: readonly string[]
): Record<string, unknown> {
	const chromeOptions = asRecord(slot[CHROME_OPTIONS_KEY]) ?? {};
	const existing = Array.isArray(chromeOptions.args)
		? [...chromeOptions.args]
		: [];
	const args = [...existing];
	for (const candidate of slotArgs) {
		if (!hasFlag(existing, flagNameOf(candidate))) {
			args.push(candidate);
		}
	}
	if (args.length === existing.length) {
		return slot;
	}
	return {
		...slot,
		[CHROME_OPTIONS_KEY]: { ...chromeOptions, args },
	};
}

/** 一个槽位对浏览器命令行的全部要求，来自 `AcquiredSlot`。 */
export interface SlotArgsInput {
	/** 槽位额外要求的参数（本地 provider 的 `--user-data-dir` / `--headless=new`）。 */
	browserArgs: readonly string[];
	/** 这个槽位分给 recorder 的 CDP 端口。Docker 恒 9222，本地按会话挑。 */
	cdpDebugPort: number;
}

/**
 * 注入 debugging port（+ 槽位自己要求的参数），让 recorder 能以第二条 CDP 连接
 * 挂上这个浏览器（D4/D5）。
 *
 * 端口是**参数**而不是常量：本地进程槽位的浏览器全在同一台机器上，写死一个端口
 * 就是并发会话互相踩（契约见 `@automationstack/browser-slots` 的 `cdpDebugPort`）。因此这个
 * 函数只能在 acquire 之后调用——调用点 `wd/create-session.ts` 拿的正是
 * `launchSession` 返回的那个槽位。
 *
 * ## 注入到哪一边，不是随手选的
 *
 * W3C 的合并规则：同一个键**不允许**同时出现在 `alwaysMatch` 和某个
 * `firstMatch` 条目里，撞了就是一次 `invalid argument`，会话根本起不来。
 * 所以这里必须二选一，且要跟着客户端已有的位置走：
 *
 * - alwaysMatch 里已经有 `goog:chromeOptions` → 就注在那儿；
 * - 否则有 firstMatch → 注进**每一个**条目（不知道 chromedriver 最终选中哪个）；
 * - 两处都没有 → 在 alwaysMatch 里新建。
 *
 * 唯一注不好的情况是客户端自己在两边都写了 `goog:chromeOptions`——那份 caps
 * 本来就是非法的，我们只注 alwaysMatch，把它原样交给上游去报错。
 */
export function injectSlotArgs<T extends NewSessionBody>(
	body: T,
	slot: SlotArgsInput
): T {
	const slotArgs = [
		`${DEBUGGING_PORT_FLAG}=${slot.cdpDebugPort}`,
		...slot.browserArgs,
	];
	const caps = capabilitiesOf(body);
	const firstMatch = caps.firstMatch ?? [];
	const injectIntoFirstMatch =
		firstMatch.length > 0 &&
		!(caps.alwaysMatch && CHROME_OPTIONS_KEY in caps.alwaysMatch);
	// 逐键赋值而不是先建全量对象再删空键：`alwaysMatch: undefined` 这种「键在、值是
	// undefined」的形状会被 `in` 判成存在，而 W3C 合并恰恰按键是否存在来判。
	const next: W3cCapabilities = {};
	if (injectIntoFirstMatch) {
		if (caps.alwaysMatch !== undefined) {
			next.alwaysMatch = caps.alwaysMatch;
		}
		next.firstMatch = firstMatch.map((entry) => withSlotArgs(entry, slotArgs));
	} else {
		next.alwaysMatch = withSlotArgs(caps.alwaysMatch ?? {}, slotArgs);
		if (caps.firstMatch !== undefined) {
			next.firstMatch = caps.firstMatch;
		}
	}
	return { ...body, capabilities: next };
}
