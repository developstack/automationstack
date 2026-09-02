/**
 * 实机节点的管理端。由 `./farm.ts` 挂成 `farm.nodes.*`，与
 * `./farm-browsers.ts`（平台级浏览器目录）并列。
 *
 * ## 节点是什么
 *
 * 一台愿意出让浏览器算力的真机：上面跑一个 node-agent，按 token 向控制面报到，
 * 之后由农场往它身上派会话。`backend` 说的是它用什么方式起浏览器——`local` 是
 * 直接拉起本机 Chrome，`docker` 是在它自己的 Docker 里起容器。
 *
 * ## 为什么六条全是 adminProcedure
 *
 * 与浏览器目录的「读放开、写只给 admin」**刻意不同**。目录里只有镜像名，
 * 对任何要写脚本的人都是该说得出口的公开信息；节点表里是**一份基础设施清单**：
 * 谁的机器、有几个槽位、现在在不在线。它回答不了「我该怎么写脚本」这类问题，
 * 却能回答「这个平台的算力薄弱点在哪」——那不是每个登录用户都需要的一句话。
 *
 * 更硬的一条：`create` 与 `rotateToken` 的返回值里带**明文 token**，那串东西
 * 等价于「让一台机器冒充节点接入」。带明文的过程不可能有非管理员版本，而把
 * 同一组过程按条拆成两种授权，读的人就得逐条确认这一条是哪一档——
 * 整组收在 admin 一档最省事，也最不容易出错。
 *
 * ⚠️ 与农场同一条约束（D3）：这里的每一条都只读写数据库，**不去碰任何一台真机**。
 * 停用一个节点落的是意向标记，正在它上面跑的会话不受影响；删除也只是让它以后
 * 报不上来，那台机器上的 agent 进程仍然在跑，得由人去关。
 */

import {
	createNode,
	listNodes,
	removeNode,
	requestNodeRefresh,
	rotateNodeToken,
	updateNode,
} from "@automationstack/db/repositories/farm-node-repository";

import { adminProcedure } from "../index";
import { isNodeOnline } from "../lib/farm-node-online";
import {
	createFarmNodeSchema,
	farmNodeIdSchema,
	updateFarmNodeSchema,
} from "../schemas/farm";

const nodeErrors = {
	NOT_FOUND: {},
} as const;

/**
 * 行的形状从仓储反推，不在这里重写一遍：能力那三列刚加上，下一波还会长
 * （「当前占用了几个槽位」已经在计划里），`Awaited<ReturnType<...>>` 取到的永远
 * 是最新那一份。刻意不从 `@automationstack/db/schema/*` 取——api 只认仓储这一层
 * 的出参契约（db 那边的分工写在 farm-node-repository.ts 顶部）。
 */
type FarmNodeRow = Awaited<ReturnType<typeof listNodes>>[number];

/**
 * 一行节点的出参。**逐字段列出**而不是 `{ ...node, online, refreshPending }`：
 * `refreshRequestedAt` 是库里的下令时刻，而界面要的是「这一下还在不在路上」这个
 * 结论。两样东西一起出现在出参里，读的人每次都得先想一下该信哪一个——所以时刻
 * 收在服务端（它的用处是给 farm 排队与算时长，见仓储层），出去的只有结论。
 *
 * `capabilities` / `capabilitiesUpdatedAt` 则**原样带出**：前者是给人看的清单，
 * 后者是「这份清单有多旧」的唯一线索，也是界面判断「重新探测生效了没有」的凭据
 * ——两列必须同进同出，少一列另一列就没法解释自己。
 */
function toNodeListRow(node: FarmNodeRow, now: number) {
	return {
		backend: node.backend,
		capabilities: node.capabilities,
		capabilitiesUpdatedAt: node.capabilitiesUpdatedAt,
		createdAt: node.createdAt,
		enabled: node.enabled,
		id: node.id,
		lastSeenAt: node.lastSeenAt,
		maxSlots: node.maxSlots,
		name: node.name,
		online: isNodeOnline(node.lastSeenAt, now),
		refreshPending: node.refreshRequestedAt !== null,
	};
}

/** `update` 的三项都是可选的，按「传了才写」拼成仓储要的 patch。 */
function buildNodePatch(input: {
	enabled?: boolean;
	maxSlots?: number;
	name?: string;
}) {
	/*
	 * 逐键判 undefined，而不是 `const { id, ...patch } = input`。
	 * 输入 schema 是平铺的（理由见 schemas/farm.ts 里 updateFarmNodeSchema 的
	 * 注释），客户端只要显式传了一个 `name: undefined`，rest 展开就会带上这个键，
	 * 而仓储层是**按键是否存在**决定写不写的——那会变成一次把名字写成空的更新。
	 */
	const patch: { enabled?: boolean; maxSlots?: number; name?: string } = {};
	if (input.name !== undefined) {
		patch.name = input.name;
	}
	if (input.maxSlots !== undefined) {
		patch.maxSlots = input.maxSlots;
	}
	if (input.enabled !== undefined) {
		patch.enabled = input.enabled;
	}
	return patch;
}

export const farmNodeProcedures = {
	/**
	 * 注册一台节点。返回值里的 `token` 是**明文唯一一次离开服务端**——库里只留
	 * 哈希，所以刻意没有任何「重新查看」的接口，与 `apiTokens.create` 同一条
	 * 取舍（那边的完整推导见 routers/api-tokens.ts）。界面必须当场让人复制走，
	 * 丢了只能 `rotateToken` 重发一枚。
	 */
	create: adminProcedure
		.input(createFarmNodeSchema)
		.handler(({ input }) => createNode(input)),

	/**
	 * 列表**含停用行**，与浏览器目录同口径：管理页要看得见自己停过什么。
	 *
	 * `online` 是这里现算的派生字段，不落库：它每一秒都在变，存下来就等于存了
	 * 一个从写入那刻起就开始过期的值。判据（最近心跳 ≤90 秒）见
	 * `lib/farm-node-online.ts`，那里解释了为什么是三拍。
	 *
	 * `capabilities` 则相反，是**落了库的副本**：内存里那份活值只在 farm 活着且
	 * 节点连着时存在，而这一页最需要它的时刻恰恰是机器掉线之后（完整分工见
	 * `@automationstack/db` 的 schema/farm-nodes.ts 顶部）。所以它只能用来展示，
	 * **不许拿来判断能不能派活**——那是 farm 内存注册表的活。
	 */
	list: adminProcedure.handler(async () => {
		const nodes = await listNodes();
		// 取一次「现在」给所有行用，理由见 isNodeOnline 的 @param now
		const now = Date.now();
		return nodes.map((node) => toNodeListRow(node, now));
	}),

	/**
	 * 删节点。与浏览器目录的 `remove` 同规：**行不存在也不报错**，回
	 * `{ ok: false }` 就够了——管理员点删除时想要的结果是「它没了」，而它确实没了。
	 *
	 * 日常该用的是 `update({ enabled: false })`：停用之后农场不再往它派新会话，
	 * 但那台机器的 token 还认，人回到工位打开机器就能继续用。删除则把 token 一起
	 * 作废，那台机器上的 agent 会开始报鉴权失败——这是给「机器不再属于平台」
	 * 准备的动作，不是给「今天下班了」准备的。
	 */
	remove: adminProcedure
		.input(farmNodeIdSchema)
		.handler(async ({ input }) => ({ ok: await removeNode(input.id) })),

	/**
	 * 重新探测这台机器上有哪些浏览器。**落的是意向标记，不是一次探测**：控制面与
	 * farm 是两个进程、互不调用（D3），而那条 WS 连接握在 farm 手里——它下一拍轮询
	 * 到标记，才真的去问那台机器。所以 `{ ok: true }` 的含义是「已经记下了」，
	 * 不是「探完了」。界面据此把按钮画成进行中，直到 `capabilitiesUpdatedAt` 变新
	 * ——那是这一下有没有生效的唯一凭据。
	 *
	 * 与 `update` / `rotateToken` 一致地要 NOT_FOUND，而不是学 `remove` 静默回
	 * `{ ok: false }`：管理员是冲着一行他以为存在的记录去按的，静默成功会让按钮
	 * 一直转到他自己放弃，而那台机器可能刚被别人删掉——那才是他该看见的事。
	 *
	 * **离线节点照样受理**：标记挂着，它上线那一拍就被消费掉，语义正是「等它回来
	 * 再探」。界面把离线机器的按钮禁掉是另一条取舍（不让人对着一台关机的机器等
	 * 结果），不是这里拒绝——两处的判据不同，混成一处就会有一边说不清自己为什么。
	 */
	requestRefresh: adminProcedure
		.errors(nodeErrors)
		.input(farmNodeIdSchema)
		.handler(async ({ errors, input }) => {
			const accepted = await requestNodeRefresh(input.id);
			if (!accepted) {
				throw errors.NOT_FOUND({ message: "节点不存在" });
			}
			return { ok: true };
		}),

	/**
	 * 轮换 token：旧的**立即失效**，那台机器要改完 env 重启 agent 才能回来。
	 * 所以界面上这一条必须先弹确认框说清楚，不能做成一颗顺手点的按钮。
	 *
	 * 与 `remove` 相反、和 `update` 一致地要 NOT_FOUND：管理员是冲着一行他以为
	 * 存在的记录去的，静默回 null 会让界面弹出一枚**根本没生效**的新 token，
	 * 而他会把那串东西填进真机——那是最难查的一类失败。
	 */
	rotateToken: adminProcedure
		.errors(nodeErrors)
		.input(farmNodeIdSchema)
		.handler(async ({ errors, input }) => {
			const rotated = await rotateNodeToken(input.id);
			if (rotated === null) {
				throw errors.NOT_FOUND({ message: "节点不存在" });
			}
			return rotated;
		}),

	/**
	 * 改名 / 改槽位 / 停用。`backend` 不在可改项里：它是那台机器上 agent 的启动
	 * 方式，在这边改一下并不会让对面换个方式重启，只会让列表说谎。真要换后端，
	 * 就是在那台机器上重装一次 agent，对应这边「删掉再建」。
	 */
	update: adminProcedure
		.errors(nodeErrors)
		.input(updateFarmNodeSchema)
		.handler(async ({ errors, input }) => {
			const updated = await updateNode(input.id, buildNodePatch(input));
			if (updated === null) {
				throw errors.NOT_FOUND({ message: "节点不存在" });
			}
			return updated;
		}),
};
