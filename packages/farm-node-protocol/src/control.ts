import { z } from "zod";

import { nodeBackendSchema, nodeCapabilitiesSchema } from "./capabilities";
import { farmRpcMethodSchema } from "./rpc";

/**
 * 控制帧（`FRAME_TYPE_CONTROL`）的**信封**：谁能说什么话。
 *
 * 两个方向各有一张自己的判别联合，**不是**一张公用的大表。这不是洁癖：
 * 收到帧的一侧只用对端方向那张 schema 去解，于是「agent 冒充 farm 下发
 * `openStream`」在解析这一步就直接失败——一个拿到了节点 token 的机器
 * 因此仍然指挥不动 farm 去连它想连的端口。共用一张表的话，这道闸门就得靠
 * 每个 handler 自己记得再判一次 `type`，而那种「每处都要记得」的约束
 * 从来守不住。
 *
 * 载荷（`call.params` / `result.value`）在这一层是 `unknown`：信封只管
 * 「这是不是一句合法的话」，肚子里那句话的形状由 `rpc.ts` 按方法各自校验。
 * 分层的理由是 mux 不该认识 `acquire` 长什么样——它只搬运。
 */

/**
 * 后端枚举住在 `capabilities.ts`（`nodeCapabilities.backend` 要用它，而那个文件
 * 不能反过来依赖信封层）。从这里继续导出是为了不动既有的十几处
 * `import { NodeBackend } from ".../control"`——真相源仍然只有一处。
 */
// biome-ignore lint/performance/noBarrelFile: 这不是中转文件，只是把一个搬了家的枚举原地续上，免得十几个调用点跟着改 import 路径
export { type NodeBackend, nodeBackendSchema } from "./capabilities";

/** call / result 的关联 id。由发起方（farm）自增，见 `mux.ts`。 */
const callIdSchema = z.int().positive();

/**
 * agent 上线的第一句话。**必须是这条连接上的第一帧**，farm 在收到它之前
 * 不接受任何别的控制帧（mux 不管这条纪律，它是 farm 侧握手逻辑的事）。
 *
 * `token` 是节点 token 的**明文**：farm 侧哈希后比对（沿 api_tokens 模式，
 * plan §12）。因此这条连接必须是 wss——协议层没法替部署方补这一条，
 * 但可以在这里把它写下来。
 *
 * `capabilities` 是**必填**的，而不是「新版本 agent 才带」的可选项：模型转向之后
 * （`capabilities.ts` 文件头）「这台机器有什么浏览器」是调度的输入，一个不报能力
 * 的节点在新模型里根本没法参与筛选。做成可选的话，farm 就得为「没报」再发明一套
 * 兜底规则，而那套规则会在所有人都升级完之后永久留在代码里。老 agent 因此在
 * 握手这一步就被 schema 挡住——这正是想要的结果，报错也停在能看懂的地方。
 *
 * 它与 `backends` 不重复：`backends` 说的是「我能开哪种槽位」（进程还是容器），
 * `capabilities` 说的是「那种槽位里能跑出什么浏览器」。
 */
export const helloSchema = z.object({
	agentVersion: z.string().min(1),
	backends: z.array(nodeBackendSchema).min(1),
	capabilities: nodeCapabilitiesSchema,
	token: z.string().min(1),
	type: z.literal("hello"),
});

/**
 * 心跳（plan §12：10s 一次，超窗标 offline）。
 *
 * 只带 `activeSlots` 一个数：farm 已经知道自己下发过几次 acquire，心跳带回
 * agent 自己数出来的那个数，两边对不上就是有槽位漏了——这是对账用的，
 * 不是给 farm 当真相源用的。
 */
export const heartbeatSchema = z.object({
	activeSlots: z.int().nonnegative(),
	type: z.literal("heartbeat"),
});

const resultOkSchema = z.object({
	id: callIdSchema,
	ok: z.literal(true),
	type: z.literal("result"),
	value: z.unknown(),
});

/**
 * 失败的应答。`error` 是**给人看的说明**，不是错误码：这条链路上的失败
 * （浏览器没装、端口占满、进程杀不掉）没有一个稳定的枚举，硬编一套只会
 * 逼 agent 把真实原因塞进一个 `other` 里。farm 侧把它原样落进
 * `statusReason` / 日志。
 */
const resultErrSchema = z.object({
	error: z.string().min(1),
	id: callIdSchema,
	ok: z.literal(false),
	type: z.literal("result"),
});

/**
 * 成败两支合成一条消息。
 *
 * 必须先在 `ok` 上合成、再作为**一个**选项进方向表：zod 的
 * `discriminatedUnion` 不接受两个选项在同一个判别键上取同一个值
 * （直接把两支平铺进 `type` 表会当场抛 `Duplicate discriminator value "result"`），
 * 而嵌套的判别联合是支持的。
 */
export const resultMessageSchema = z.discriminatedUnion("ok", [
	resultOkSchema,
	resultErrSchema,
]);

/** 握手通过。farm 这一刻才把库里那行节点配置告诉 agent。 */
export const helloAckSchema = z.object({
	backend: nodeBackendSchema,
	maxSlots: z.int().positive(),
	name: z.string().min(1),
	nodeId: z.string().min(1),
	type: z.literal("helloAck"),
});

/**
 * 握手被拒，**发完即关**。
 *
 * 用一条控制帧而不是直接 WS close code：close code 只有一个数字加一段
 * 常被中间设备截断的 reason，而 agent 需要把「token 不对」和「版本太老」
 * 分开处理（前者要人去后台看，后者要自己升级）。
 */
export const helloRejectSchema = z.object({
	reason: z.string().min(1),
	type: z.literal("helloReject"),
});

/** farm 调 agent 的一个方法。载荷形状见 `rpc.ts` 的 `farmRpcContracts`。 */
export const callSchema = z.object({
	id: callIdSchema,
	method: farmRpcMethodSchema,
	params: z.unknown(),
	type: z.literal("call"),
});

/**
 * 要求 agent 连上**它本机**的 `127.0.0.1:port`，并把那个 socket 接到 `streamId`
 * 这条流上。farm 侧随后就把这条流当成一个普通的 Duplex 用。
 *
 * 写死 127.0.0.1 而不是让 farm 指定 host：这条指令的能力边界必须是
 * 「agent 自己」。允许指定 host 的话，一台被 farm 攻陷（或一个配错的 farm）
 * 就能把每个节点变成扫内网的跳板。
 */
export const openStreamSchema = z.object({
	port: z.int().min(1).max(65_535),
	streamId: z.int().positive(),
	type: z.literal("openStream"),
});

/** agent → farm 能发的全部控制消息。 */
export const nodeToFarmControlSchema = z.discriminatedUnion("type", [
	helloSchema,
	heartbeatSchema,
	resultMessageSchema,
]);
export type NodeToFarmControl = z.infer<typeof nodeToFarmControlSchema>;

/** farm → agent 能发的全部控制消息。 */
export const farmToNodeControlSchema = z.discriminatedUnion("type", [
	helloAckSchema,
	helloRejectSchema,
	callSchema,
	openStreamSchema,
]);
export type FarmToNodeControl = z.infer<typeof farmToNodeControlSchema>;

export type ControlMessage = FarmToNodeControl | NodeToFarmControl;
export type ResultMessage = Extract<NodeToFarmControl, { type: "result" }>;
export type CallMessage = Extract<FarmToNodeControl, { type: "call" }>;
export type OpenStreamMessage = Extract<
	FarmToNodeControl,
	{ type: "openStream" }
>;

/** 解析结果。与 `frame.ts` 的 `FrameDecodeResult` 同一套「坏输入是常规输入」写法。 */
export type ControlParseResult<T> =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; value: T };

/**
 * 把控制帧的 JSON 文本解成一条消息。
 *
 * 两步各自失败各自报：JSON 语法错说明对端根本不是这个协议（或者中间有人截断了
 * 帧），schema 不过说明是版本/方向不对。混成一句「消息无效」时，
 * 线上唯一能拿到的线索就没了。
 */
export function parseControl<T extends z.ZodType>(
	schema: T,
	json: string
): ControlParseResult<z.infer<T>> {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return { kind: "invalid", message: `控制帧不是合法 JSON：${detail}` };
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			kind: "invalid",
			message: `控制帧不符合协议：${parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`)
				.join("; ")}`,
		};
	}
	return { kind: "ok", value: parsed.data };
}

/** 序列化。单独一个函数是为了让「控制帧是 JSON」这件事只写在这一处。 */
export function serializeControl(message: ControlMessage): string {
	return JSON.stringify(message);
}
