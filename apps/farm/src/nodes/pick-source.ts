import {
	type BrowserRequirement,
	describeSummary,
	summarySatisfies,
} from "./source-capability";
import type { SourceUsage } from "./source-registry";

/**
 * 选源策略（plan §12 的调度那一段）。
 *
 * 这里只做**纯计算**：进来一份「各源当下占了几个/共几个」的快照，出去一个源名或者
 * 一句给客户端看的错误。它不认识 mux、不认识 provider、不发起任何 IO——这样
 * 「点名点到停用节点会怎样」这类问题可以用一张字面量数组问清楚，而不必先起一个
 * WebSocket。真正的取用副作用（占位计数、containerId 绑定）在 composite-provider 里。
 *
 * ## 两道闸门的顺序：先能力、后占用
 *
 * 「这个源装了 chrome 吗」是**长期事实**，「它现在满了吗」是**此刻事实**。
 * 先筛能力再挑最空的，于是「所有源都满了」这句话永远说的是**能干这活的那些源**
 * 都满了；反过来先按占用挑、挑完再看能力，一台空着的 firefox 机器会把一次
 * chrome 请求吸走并判死，而旁边空着的 chrome 机器根本没被看见。
 *
 * 点名模式里也是这个顺序：能力不满足要说「它没有」（改 caps 或换机器），
 * 满了要说「等一会儿」。把一台永远不会有 firefox 的机器说成「稍后重试」，
 * 是让人去等一件不会发生的事。
 */

export type PickSourceResult =
	| { message: string; ok: false }
	| { name: string; ok: true };

/** 占用率。容量 0 的源（理论上不该存在）取 +∞，于是永远排在最后且永远选不中。 */
function utilization(usage: SourceUsage): number {
	return usage.capacity <= 0
		? Number.POSITIVE_INFINITY
		: usage.active / usage.capacity;
}

function hasRoom(usage: SourceUsage): boolean {
	return usage.active < usage.capacity;
}

/**
 * 点名模式。
 *
 * 三种失败**必须分开说**，因为客户端能做的事完全不同：名字打错了要改 caps，
 * 机器没上线要去看那台机器，槽位满了则是等一会儿再来。含糊成一句
 * 「无法创建会话」的话，这三件事在用户那边长得一模一样。
 *
 * 「不在线」与「不存在」这里合成一句：注册表只装在线的源，farm 无从分辨
 * 「库里没这台机器」和「这台机器没连上来」——那需要查库，而选源必须是同步的
 * （占位计数不能跨 await，见 source-registry 文件头）。措辞因此写成
 * 「未在线」而不是「不存在」，两种情况读起来都不算说谎。
 */
function pickNamed(
	usages: SourceUsage[],
	hint: string,
	requirement: BrowserRequirement
): PickSourceResult {
	const target = usages.find((usage) => usage.name === hint);
	if (target === undefined) {
		return {
			message: `会话点名了槽位来源「${hint}」，但它当前未在线（名字写错，或者那台节点没连上来 / 已停用）。`,
			ok: false,
		};
	}
	if (!canServe(target, requirement)) {
		return {
			message: `会话点名了槽位来源「${hint}」，但它提供不了 ${describeRequirement(requirement)}（它能提供：${describeSummary(target.browsers)}）。请改点名到别的节点，或去掉点名让 farm 自行调度。`,
			ok: false,
		};
	}
	if (!hasRoom(target)) {
		return {
			message: `会话点名了槽位来源「${hint}」，但它的槽位已用满（${target.active}/${target.capacity}）。请稍后重试，或改用不点名的方式让 farm 自行调度。`,
			ok: false,
		};
	}
	return { name: target.name, ok: true };
}

/**
 * 自动模式：占用率最低者胜，**平手归内建**。
 *
 * 平手归内建不是偏心，是省一跳：内建源的槽位在 farm 本机，数据面不用穿隧道。
 * 空集群启动时所有源占用率都是 0，这条平手规则让第一条会话落在最短的那条路上。
 */
function pickLeastUsed(usages: SourceUsage[]): PickSourceResult {
	const candidates = usages.filter(hasRoom);
	const best = candidates.reduce<SourceUsage | undefined>((winner, usage) => {
		if (winner === undefined) {
			return usage;
		}
		const delta = utilization(usage) - utilization(winner);
		if (delta < 0) {
			return usage;
		}
		if (delta === 0 && usage.kind === "builtin") {
			return usage;
		}
		return winner;
	}, undefined);

	return best === undefined
		? {
				message:
					"所有槽位来源都已用满（内建容量与在线节点的 maxSlots 都占满了）。请稍后重试。",
				ok: false,
			}
		: { name: best.name, ok: true };
}

/**
 * 这个源能不能兑现这次请求。两种后端两个真相源，理由见 `source-capability.ts`：
 * docker 源以**镜像库**为真相，而走到这一步就说明 `pickBrowser` 已经在库里找到了
 * 那一行，所以恒为真；local 源以它自己报上来的那份清单为真相。
 */
function canServe(
	usage: SourceUsage,
	requirement: BrowserRequirement
): boolean {
	return (
		usage.backend === "docker" || summarySatisfies(usage.browsers, requirement)
	);
}

function describeRequirement(requirement: BrowserRequirement): string {
	return requirement.browserVersion === null
		? requirement.browserName
		: `${requirement.browserName} ${requirement.browserVersion}`;
}

/** 一个源都筛不出来时那句话的素材：逐源摆出它能提供什么，好让人知道该改哪一边。 */
function describeInventory(usages: SourceUsage[]): string {
	return usages
		.map(
			(usage) =>
				`${usage.name} = ${usage.backend === "docker" ? "docker 后端（按 farm 镜像库兑现）" : describeSummary(usage.browsers)}`
		)
		.join("；");
}

/**
 * 挑一个源来跑这条会话。
 *
 * `hint` 来自 `as:options.node`。返回的失败 message 是**要原样端给客户端**的
 * （WebDriver 的 500 body / CDP 升级失败的那句话），所以它写成人话而不是错误码。
 */
export function pickSource(
	usages: SourceUsage[],
	hint: string | undefined,
	requirement: BrowserRequirement
): PickSourceResult {
	if (usages.length === 0) {
		return {
			message: "farm 当前没有任何可用的槽位来源。",
			ok: false,
		};
	}
	if (hint !== undefined && hint !== "") {
		return pickNamed(usages, hint, requirement);
	}
	const capable = usages.filter((usage) => canServe(usage, requirement));
	if (capable.length === 0) {
		return {
			message: `没有任何槽位来源能提供 ${describeRequirement(requirement)}。当前各来源能提供：${describeInventory(usages)}。`,
			ok: false,
		};
	}
	return pickLeastUsed(capable);
}
