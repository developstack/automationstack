import type {
	IngestAttachmentRegisterItem,
	IngestAttachmentRegisterRejection,
} from "./attachment-contract";

/**
 * **登记**阶段的纯折算（plan §5.6）：把请求里的条目按任务分组、把整组或逐条的
 * 拒绝落成对账单行。
 *
 * 与 presign 那一侧（`./attachment-plan-buckets` / `./attachment-plan-quota`）
 * 分开是因为两边的对账单行长得不一样：presign 用 `sourceRef` + `runName` 定位
 * （那时候还没有 storageKey），register 用 `runCaseId` + `storageKey` 定位
 * （那时候 sourceRef 已经不在请求里了）。硬凑成一个类型只会让两边都带上一半
 * 永远是 null 的字段。
 *
 * 这里没有任何 db import，纯数组操作，可单测。
 */

/** 登记请求里的一条，`index` 是请求 `attachments` 数组的下标。 */
export interface AttachmentRegisterItem extends IngestAttachmentRegisterItem {
	index: number;
}

/** 一个测试任务一组：守卫与归属查询按任务批量做，与 presign 对称。 */
export interface AttachmentRegisterGroup {
	items: AttachmentRegisterItem[];
	runId: string;
}

/**
 * 登记请求按 `runId` 分组。
 *
 * `runId` 是 presign 那一轮原样回传的，分组只为把
 * 「一次 `ensureRunWritable` + 一次归属查询」摊到整组上——
 * 逐条各查一次就是几百个事务反复抢同一把行锁（§5.3 那条「不许 N+1」）。
 * 组内顺序即请求顺序，对账单于是与 SDK 自己的文件清单对得上。
 */
export function groupRegisterItemsByRunId(
	items: IngestAttachmentRegisterItem[]
): AttachmentRegisterGroup[] {
	const groupByRunId = new Map<string, AttachmentRegisterGroup>();
	for (const [index, item] of items.entries()) {
		const group = groupByRunId.get(item.runId);
		if (group) {
			group.items.push({ ...item, index });
			continue;
		}
		groupByRunId.set(item.runId, {
			items: [{ ...item, index }],
			runId: item.runId,
		});
	}
	return [...groupByRunId.values()];
}

/** 登记阶段的逐条拒绝，**绝不静默丢弃**：传上去却登记不了的对象必须有人知道。 */
export function buildRegisterRejections(
	items: AttachmentRegisterItem[],
	reason: string
): IngestAttachmentRegisterRejection[] {
	return items.map((item) => ({
		index: item.index,
		reason,
		runCaseId: item.runCaseId,
		storageKey: item.storageKey,
	}));
}
