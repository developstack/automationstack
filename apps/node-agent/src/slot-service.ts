import type { SlotProvider } from "@automationstack/browser-slots";
import type {
	NodeBackend,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";
import {
	acquireParamsSchema,
	containerRefParamsSchema,
	detectCapabilitiesParamsSchema,
	type FarmRpcMethod,
	farmRpcContracts,
	listManagedParamsSchema,
} from "@automationstack/farm-node-protocol/rpc";
import type { z } from "zod";

import type { AgentLogger } from "./logger";
import {
	acquireSlot,
	createSlotTable,
	readSlotLogs,
	releaseAllSlots,
	releaseSlot,
	releaseSlotById,
	type SlotTable,
} from "./slot-table";

/**
 * RPC 服务端：`farmRpcContracts` 那几个方法在节点这边的实现。
 *
 * 这一层只做**协议**——按 method 分发、按 `params` 校验入参、按 `result` 校验出参。
 * 状态（句柄表、并发闸门、到期计时）全在 `slot-table.ts`。
 *
 * **两侧都校验**：对端是另一台机器上的另一个版本，「我这边类型对」在这条链路上
 * 不构成证据（rpc.ts 文件头的原话）。
 */

export interface SlotServiceOptions {
	/** helloAck 定下的后端。传下去只为一件事：docker 后端收不到镜像时说人话。 */
	backend: NodeBackend;
	/**
	 * 现探现报（平台上那个「重新探测」按钮）。**不是**缓存启动时那一份快照：
	 * 这个方法存在的全部理由就是「刚在机器上装了个新浏览器」，回一份旧快照
	 * 等于让那个按钮变成装饰。绑定的后端由 helloAck 决定，见 `session.ts`。
	 */
	detectCapabilities: () => Promise<NodeCapabilities>;
	logger: AgentLogger;
	maxSlots: number;
	provider: SlotProvider;
}

export interface SlotService {
	/** 心跳要报的数。 */
	activeCount: () => number;
	handleCall: (method: FarmRpcMethod, params: unknown) => Promise<unknown>;
	releaseAll: (reason: string) => Promise<void>;
}

/**
 * 用 `safeParse` 而不是 `parse`：zod 抛出来的 `ZodError.message` 是一大坨 JSON，
 * 而这句话会原样进 farm 的 `statusReason` 和日志，得是人能读的
 * （`control.ts` 的 `parseControl` 是同一套拼法）。
 */
function parseParams<T extends z.ZodType>(
	schema: T,
	method: FarmRpcMethod,
	params: unknown
): z.infer<T> {
	const parsed = schema.safeParse(params);
	if (parsed.success) {
		return parsed.data;
	}
	const detail = parsed.error.issues
		.map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`)
		.join("; ");
	throw new Error(`${method} 的参数不合协议：${detail}`);
}

function containerRefOf(method: FarmRpcMethod, params: unknown): string {
	return parseParams(containerRefParamsSchema, method, params).containerId;
}

/** 分发要用到的两样东西：槽位状态，和探能力那条与槽位无关的路。 */
interface ServiceContext {
	detectCapabilities: () => Promise<NodeCapabilities>;
	table: SlotTable;
}

function runMethod(
	ctx: ServiceContext,
	method: FarmRpcMethod,
	params: unknown
): Promise<unknown> {
	const { table } = ctx;
	switch (method) {
		case "acquire":
			return acquireSlot(
				table,
				parseParams(acquireParamsSchema, method, params)
			);
		case "detectCapabilities":
			// 入参恒为空对象，但照样过一次 schema：理由与 listManaged 同一条。
			parseParams(detectCapabilitiesParamsSchema, method, params);
			return ctx.detectCapabilities();
		case "listManaged":
			// 空入参也要过一次 schema：将来这个方法长出过滤条件时，这一行是它
			// 唯一的挂载点，现在省掉的话届时会有人忘了加。
			parseParams(listManagedParamsSchema, method, params);
			return table.provider.listManagedContainers();
		case "readLogs":
			return readSlotLogs(table, containerRefOf(method, params));
		case "release":
			return releaseSlot(table, containerRefOf(method, params));
		default:
			return releaseSlotById(table, containerRefOf(method, params));
	}
}

async function handleCall(
	ctx: ServiceContext,
	method: FarmRpcMethod,
	params: unknown
): Promise<unknown> {
	const value = await runMethod(ctx, method, params);
	const checked = farmRpcContracts[method].result.safeParse(value);
	if (checked.success) {
		return checked.data;
	}
	// 出参不合协议是**本端的实现错误**，不是对端的输入问题。照样回 result.error：
	// 让 farm 拿到一句能定位的话，好过在这条链路上发一个它解不开的帧。
	throw new Error(
		`${method} 的应答不合协议（node-agent 实现错误）：${checked.error.message}`
	);
}

export function createSlotService(options: SlotServiceOptions): SlotService {
	const table = createSlotTable({
		backend: options.backend,
		logger: options.logger,
		maxSlots: options.maxSlots,
		provider: options.provider,
	});
	const ctx: ServiceContext = {
		detectCapabilities: options.detectCapabilities,
		table,
	};
	return {
		activeCount: () => table.slots.size,
		handleCall: (method, params) => handleCall(ctx, method, params),
		releaseAll: (reason) => releaseAllSlots(table, reason),
	};
}
