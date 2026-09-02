/**
 * 节点能力清单的取值规则与展示文案。纯函数 + 常量，配
 * farm-node-capability-meta.test.ts。
 *
 * 与 farm-node-meta.ts 分开一份，不是为了凑行数：那一份服务的是**管理员填的表单**
 * （名字、槽位的校验规则，逐条誊自服务端 zod），这一份服务的是**机器报上来的东西**
 * （怎么把一份可能过期、可能为空、可能带着「装了但不可用」的清单说清楚）。
 * 两组的改动理由不同——服务端 schema 变了要改前者，探测协议变了要改后者。
 *
 * ── 这一列的性质（照抄 db 侧的分工，因为界面很容易说反）──
 * `capabilities` 是**落了库的展示副本**，不是调度判据：真正派活读的是 farm 内存
 * 注册表里的活值。所以这一页上任何一句话都不能写成「这台机器现在能跑 X」，只能
 * 写成「上次探测时它有 X」——`capabilitiesUpdatedAt` 因此必须和清单一起出现在
 * 屏幕上，它是读的人判断该不该信这份清单的唯一线索。
 */
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { formatLastSeenAt } from "@/components/farm-nodes/farm-node-meta";

/** 一次探测的完整结果（非空时的形状），从路由客户端反推，不在 web 侧重写一份。 */
export type NodeCapabilities = NonNullable<FarmNodeRow["capabilities"]>;

/** 清单里的一个浏览器。`version` 可空、`bin`/`channel`/`reason` 可缺席。 */
export type BrowserCapability = NodeCapabilities["browsers"][number];

/**
 * 「重新探测」在飞时的轮询节拍。
 *
 * 3 秒与会话列表同档（farm/session-meta.ts）：这一下的完成时间取决于 farm 下一拍
 * 轮询 + 一次 RPC 往返，量级是秒。再快只是空转——探测不是这台浏览器上的动作，
 * 快慢由另外两个进程说了算。
 */
export const NODE_REFRESH_POLL_INTERVAL_MS = 3000;

/**
 * 节点列表的 refetchInterval。**没有任何一台在等探测结果时返回 false，即完全不轮询**。
 *
 * 与 `sessionListPollInterval` 同一条硬要求：节点表在没人操作时是静止的（心跳只
 * 改 `lastSeenAt`，而那一列的展示精度是分钟级），让它常年 3 秒一拍等于给每个开着
 * 这一页的标签页配一条心跳。而「变成有待办」这件事必然由**看着这一页的人**触发
 * ——他自己按的那颗按钮。
 *
 * 写成函数交给 React Query 每拍求值：写成常量的话，最后一台探完之后轮询不会停
 * ——refetchInterval 只在选项变化时重新读，选项里若是个死数字，它就永远是那个数字。
 */
export function nodeListPollInterval(
	data: readonly FarmNodeRow[] | undefined
): number | false {
	if (data === undefined) {
		return false;
	}
	return data.some((row) => row.refreshPending)
		? NODE_REFRESH_POLL_INTERVAL_MS
		: false;
}

/**
 * 一条能力的标题：`chromium 140`、`firefox（beta）`……
 *
 * 版本是**可空**的（读不出版本号的浏览器、镜像 tag 是 latest 的情况），协议那边
 * 刻意没有编一个 `"unknown"` 塞进去。所以这里也不能把 null 渲染成空白——一行只有
 * 名字的条目，看起来像是版本号没加载出来。说成「版本未知」才是那件事本身。
 */
export function browserCapabilityTitle(capability: BrowserCapability): string {
	const version = capability.version ?? "版本未知";
	const base = `${capability.name} ${version}`;
	return capability.channel ? `${base}（${capability.channel}）` : base;
}

/**
 * `bin` 那一格的列名。同一个字段在两种后端下是**完全不同的东西**：local 是那台
 * 机器上的可执行文件路径，docker 是镜像 tag。都叫「bin」的话，运维会拿着一个
 * 镜像名去机器上 `ls`。
 */
export function capabilityBinLabel(
	backend: NodeCapabilities["backend"]
): string {
	return backend === "docker" ? "镜像" : "路径";
}

/**
 * 探测过、但一个浏览器都没探到时说的话。
 *
 * 空数组是合法上报（协议那边写死了这一条），与「从没探测过」是两件事，所以这句
 * 话必须指出**下一步该去哪做什么**：docker 后端是去那台机器上拉镜像，local 后端
 * 是去装一个浏览器。说成笼统的「暂无数据」，看的人只会再按一次重新探测。
 */
export function capabilitiesEmptyHint(
	backend: NodeCapabilities["backend"]
): string {
	return backend === "docker"
		? "这台机器上还没有拉取任何浏览器镜像。在它上面 docker pull 之后，再按「重新探测」。"
		: "这台机器上没有探到浏览器。装一个（如 Chrome / Chromium）之后，再按「重新探测」。";
}

/**
 * 清单顶上那句「这份东西有多旧」。
 *
 * 相对时间而不是时间戳，理由同 `formatLastSeenAt`：这一行要回答的是「还能不能
 * 信」，那需要把一个绝对时刻和现在相减一次。
 *
 * @param now 调用方给，本模块不读时钟——这一页是 SSR 的，渲染里读 `Date.now()`
 *   会让服务端与浏览器跨过秒边界时给出不同的 HTML（hydration mismatch）。
 */
export function capabilityDetectedLabel(
	capabilitiesUpdatedAt: Date | string | null,
	now: number
): string {
	if (capabilitiesUpdatedAt === null) {
		return "还没有探测过这台机器";
	}
	return `探测于 ${formatLastSeenAt(capabilitiesUpdatedAt, now)}`;
}

export interface RefreshButtonState {
	disabled: boolean;
	/** 按钮旁边那句解释；为 null 时不占位。 */
	hint: string | null;
	label: string;
}

/**
 * 「重新探测」按钮的三种样子。**判据全在这里**，组件只负责画——三个 if 散在 JSX
 * 里的话，「离线且已下令」这种组合会走到哪一支就得靠读渲染顺序才知道。
 *
 * 顺序即优先级：**先看在不在线**。一台离线的机器就算挂着标记也不会有任何进展，
 * 把它画成「探测中」等于让人对着一台关机的机器等结果；说「上线后生效」才是实话
 * ——标记确实还挂着，它回来那一拍就会被消费掉（服务端那条刻意受理离线节点的
 * 推导见 packages/api/src/routers/farm-nodes.ts 的 requestRefresh）。
 */
export function refreshButtonState(row: FarmNodeRow): RefreshButtonState {
	if (!row.online) {
		return {
			disabled: true,
			hint: "这台机器现在离线，上线后生效",
			label: "重新探测",
		};
	}
	if (row.refreshPending) {
		return {
			disabled: true,
			hint: "已下令，等农场下一拍去问这台机器",
			label: "探测中…",
		};
	}
	return { disabled: false, hint: null, label: "重新探测" };
}
