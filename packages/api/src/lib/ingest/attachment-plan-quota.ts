import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

import {
	type IngestAttachmentRejection,
	MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN,
	MAX_AUTOMATION_ATTACHMENTS_PER_RUN,
} from "./attachment-contract";
import type { WritableTarget } from "./attachment-plan-buckets";

/**
 * 附件折算的**按任务分组与配额裁剪**（plan §5.6）：待签名条目落进哪一组、
 * 一组能装下多少、装不下的那些怎么进对账单。
 *
 * 与 `./attachment-plan-buckets` 同一个「不碰 db 运行时」的性质：唯一那条 db
 * import 是 `import type`，编译期就被擦掉，测试不需要 `DATABASE_URL`。
 */

const BYTES_PER_MIB = 1024 * 1024;

function describeQuotaExhausted(runName: string): string {
	const maxMib = Math.floor(
		MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN / BYTES_PER_MIB
	);
	return `测试任务「${runName}」的自动化附件配额已用完（单次最多 ${MAX_AUTOMATION_ATTACHMENTS_PER_RUN} 个、合计 ${maxMib} MiB），本条未获签名`;
}

/** 一条要签名的附件，`index` 是请求里 `attachments` 数组的下标。 */
export interface AttachmentUploadItem {
	contentType: string;
	index: number;
	kind: TestRunAttachmentKind;
	runCaseId: string;
	sizeBytes: number;
	sourceRef: string;
}

/**
 * 一个测试任务一组，**一组一个事务**（同 `AutomationWriteGroup` 的理由）。
 *
 * 配额也按组算：§5.6 明写「配额按单个任务计，不是按整次执行的总和」——
 * 否则一个人的执行横跨三个任务时，配额会莫名其妙地缩水成三分之一。
 */
export interface AttachmentUploadGroup {
	items: AttachmentUploadItem[];
	runId: string;
	runName: string;
}

export function pushUploadItem(
	groupByRunId: Map<string, AttachmentUploadGroup>,
	target: WritableTarget,
	item: AttachmentUploadItem
): void {
	const group = groupByRunId.get(target.runId);
	if (group) {
		group.items.push(item);
		return;
	}
	groupByRunId.set(target.runId, {
		items: [item],
		runId: target.runId,
		runName: target.runName,
	});
}

/**
 * 配额裁剪：按**请求里的顺序**贪心接受，第一个装不下的那条**以及它之后的
 * 全部**进拒绝（§5.6）。
 *
 * 两个取舍都是刻意的：
 * 1. **不整组拒绝**。一个任务 600 个附件、上限 500，整组扔掉等于连最该看的
 *    那几张失败截图也一起没了。SDK 控制着顺序（失败的先传），保留前 N 条
 *    正好保住最重要的那批。
 * 2. **一旦装不下就到此为止**，不继续往后找「还能塞进去的小文件」。
 *    那种最佳装箱会产生「第 5 条被拒、第 6 条却通过了」的对账单，
 *    上报方永远猜不到判据是什么；而且它对同一批输入的结果依赖于文件大小分布，
 *    改一个附件的体积就能让另一个附件的命运翻转。
 */
export function applyRunQuota(
	group: AttachmentUploadGroup,
	rejected: IngestAttachmentRejection[]
): AttachmentUploadGroup {
	const accepted: AttachmentUploadItem[] = [];
	let totalBytes = 0;
	let exhausted = false;
	for (const item of group.items) {
		const fitsCount = accepted.length < MAX_AUTOMATION_ATTACHMENTS_PER_RUN;
		const fitsBytes =
			totalBytes + item.sizeBytes <= MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN;
		if (exhausted || !(fitsCount && fitsBytes)) {
			exhausted = true;
			rejected.push({
				index: item.index,
				reason: describeQuotaExhausted(group.runName),
				runName: group.runName,
				sourceRef: item.sourceRef,
			});
			continue;
		}
		accepted.push(item);
		totalBytes += item.sizeBytes;
	}
	return { items: accepted, runId: group.runId, runName: group.runName };
}

/**
 * 整组在签名/登记前被拒（已提交、任务不存在）时逐条落到对账单。
 * **绝不静默丢弃**——SDK 要把它原样打出来。
 */
export function buildGroupRejections(
	group: AttachmentUploadGroup,
	reason: string
): IngestAttachmentRejection[] {
	return group.items.map((item) => ({
		index: item.index,
		reason,
		runName: group.runName,
		sourceRef: item.sourceRef,
	}));
}
