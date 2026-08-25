import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import { validateAttachmentUpload } from "../attachment-policy";
import type {
	IngestAttachmentPresignItem,
	IngestAttachmentRejection,
} from "./attachment-contract";
import {
	bucketCandidateRows,
	buildBlockedRejections,
	type CandidateBuckets,
	describePendingReview,
	describeRunIdsExcluded,
	groupRowsBySourceRef,
} from "./attachment-plan-buckets";
import {
	type AttachmentUploadGroup,
	applyRunQuota,
	pushUploadItem,
} from "./attachment-plan-quota";

/**
 * 附件通道的**纯折算**（plan §5.6）：按 run_case 展开、配额判定、拒绝理由拼装。
 *
 * 与 `./execution-reconcile` 同一个分文件理由，逐字适用：这里一行 SQL 都不发，
 * db import 全是 `import type`（编译期擦除），因为 api 包的 vitest project
 * 不带 `DATABASE_URL`，任何运行时通向 `@automationstack/db` 的边都会让测试
 * 在 import 阶段就炸。编排（`./attachment-uploads`）只剩「按顺序调用 + 传参」。
 *
 * ## 这个文件与它的兄弟模块
 *
 * 折算本身按内聚度分了几块，这里是**入口与判据顺序**（`planAttachmentUploads`），
 * 各块的细节各自成文件：
 * - `./attachment-plan-buckets`：候选行分桶（能签 / 白名单排除 / 待评审）；
 * - `./attachment-plan-quota`：按任务分组与配额裁剪；
 * - `./attachment-register-plan`：登记阶段的分组与逐条拒绝；
 * - `./attachment-reject-text`：两个阶段共用的拒绝文案；
 * - `./attachment-verify`：登记阶段的对象校验。
 *
 * 它们的导出**在本文件原样再导出一遍**：调用方（含 `./attachment-uploads` 与
 * 单测）沿用同一个 import 路径，拆分不构成对外的破坏性改动。
 *
 * ## 为什么一条 sourceRef 要展开成多份独立 object
 *
 * key 规则含 `{runId}/{runCaseId}`，而同一条 sourceRef 可能落在多个未提交任务
 * 的多个 run_case 上（D33）。**每个 run_case 各上传一份、各自独立的 object**，
 * SDK 拿到几个 URL 就传几次同一个文件。
 *
 * 看着浪费，另一条路（一份 object 挂 N 行）更糟：删除任意一行都要先判断
 * 「还有没有别人引用这个 key」，否则要么删出死链、要么留下永不回收的孤儿。
 * 现有的附件删除路径完全没有引用计数这个概念，为了省几张截图的存储去引入它，
 * 换来的是一条以后一定会踩的坑。候选任务现实里 1～3 个，代价是几百 KB。
 * **这条权衡已经定了，不要「优化」成共享 object。**
 */

export type {
	AttachmentUploadGroup,
	AttachmentUploadItem,
} from "./attachment-plan-quota";
// 下面这一串再导出**不是 barrel**：本文件自己就是折算的入口（`planAttachmentUploads`
// 在这里定义），再导出只为让拆分前就存在的 import 路径继续可用——调用方与单测
// 一个字都不用改。它是一份定死的兼容面，不是「把目录里的东西都摊出来」，
// 新增的模块不要顺手往这里加。
// biome-ignore lint/performance/noBarrelFile: 兼容拆分前的导入路径，理由见上
export { buildGroupRejections } from "./attachment-plan-quota";
export type {
	AttachmentRegisterGroup,
	AttachmentRegisterItem,
} from "./attachment-register-plan";
export {
	buildRegisterRejections,
	groupRegisterItemsByRunId,
} from "./attachment-register-plan";
export {
	describeRunCaseVanished,
	describeRunUnwritable,
	REASON_STORAGE_UNCONFIGURED,
} from "./attachment-reject-text";
export type {
	VerifyAutomationAttachmentInput,
	VerifyAutomationAttachmentResult,
} from "./attachment-verify";
export { verifyAutomationAttachment } from "./attachment-verify";

const REASON_UNMATCHED = "项目里没有这个 sourceRef 的用例";
const REASON_NO_CANDIDATE_RUN = "不在任何未提交任务的范围内";

export interface PlannedAttachmentUploads {
	groups: AttachmentUploadGroup[];
	rejected: IngestAttachmentRejection[];
}

export interface PlanAttachmentUploadsInput {
	attachments: IngestAttachmentPresignItem[];
	/** `resolveAutomationTargets` 的原样返回，含 LEFT JOIN 出来的右半边全 null 的行。 */
	rows: AutomationTargetRow[];
	/**
	 * §5.1.1 的 `runIds` 白名单，**收窄在这一层做，不在 SQL 里做**
	 * （与 `ReconcileAutomationTargetsInput.runIds` 逐字同一个理由）。
	 *
	 * `null` = 不收窄，全部候选；非 null = 候选先与它取交集；空数组同样合法，
	 * 含义是「这轮谁都不签」，与 `null` 完全不同——两者的差别必须活到这里，
	 * 否则「不传」和「传了个空的」会给出一模一样的对账单。
	 *
	 * 从前它是 `resolveAutomationTargets` 里 LEFT JOIN ON 子句上的一个谓词，
	 * 于是被排除的候选任务在 SQL 阶段就消失了，这一层看到的是「没有任何 runCase」，
	 * 与「真的不在任何未提交任务里」无法区分，只能给出一句假话：那条附件明明
	 * 有个未提交的候选任务，只是这一轮自己没带它，而假话会把人推向
	 * 「去某个任务里追加这条用例」。挪到这里之后被排除的候选可见，
	 * 于是能给出一条指名道姓的独立理由。
	 */
	runIds: string[] | null;
}

/**
 * 单文件的白名单与大小校验，**在签名之前**（与手工路径同一个
 * `validateAttachmentUpload`，不另立一套尺子）。
 *
 * 拒绝只发一条、不按任务重复：文件本身不合规与它要挂到哪几个任务无关，
 * 按任务各发一条只会让同一件事在对账单里出现三遍。
 */
function rejectByPolicy(
	item: IngestAttachmentPresignItem,
	index: number
): IngestAttachmentRejection | null {
	const validation = validateAttachmentUpload(item);
	if (validation.kind === "ok") {
		return null;
	}
	if (validation.kind === "too-large") {
		return {
			index,
			reason: `附件 ${item.sizeBytes} 字节，超过单文件上限 ${validation.maxBytes} 字节`,
			runName: null,
			sourceRef: item.sourceRef,
		};
	}
	return {
		index,
		reason: `${item.kind} 不支持 ${item.contentType}，允许的类型：${validation.allowedContentTypes.join(", ")}`,
		runName: null,
		sourceRef: item.sourceRef,
	};
}

/**
 * 一个可签目标都没有时，这条附件的解释。
 *
 * ⚠️ **一条附件只给一个最贴切的解释，绝不叠加互相矛盾的理由**：已经说明过是
 * 哪个任务挡的之后（白名单排除或待评审），就不再补一条「不在任何未提交任务的
 * 范围内」——那是假话。逐个任务各一条不算叠加：它们各自指名不同的任务，
 * 读起来不矛盾。
 */
function explainNoTarget(
	index: number,
	sourceRef: string,
	buckets: CandidateBuckets
): IngestAttachmentRejection[] {
	const excluded = buildBlockedRejections(
		index,
		sourceRef,
		buckets.excludedRunNames,
		describeRunIdsExcluded
	);
	if (excluded.length > 0 || buckets.pendingReviewRunNames.length > 0) {
		return excluded;
	}
	return [{ index, reason: REASON_NO_CANDIDATE_RUN, runName: null, sourceRef }];
}

/** `planAttachmentUploads` 边扫边攒的两个产物 + 只读的行索引。 */
interface AttachmentPlanState {
	groupByRunId: Map<string, AttachmentUploadGroup>;
	rejected: IngestAttachmentRejection[];
	rowsBySourceRef: Map<string, AutomationTargetRow[]>;
}

/**
 * 一条附件的判据链，顺序即优先级（与 `reconcileAutomationTargets` 的三个桶
 * 一一对应）：
 * 1. 单文件不合规（类型/大小）→ 一条拒绝，不进任何任务；
 * 2. 一行都解析不到 → 「项目里没有这个 sourceRef 的用例」；
 * 3. 落在待评审任务上 → 逐个任务指名拒绝（submitted 的任务在 SQL 里就没进候选）；
 * 4. 有可签目标 → 按 runId 分组（配额在整轮扫完之后逐组过）；
 * 5. 一个可签目标都没有 → 交给 `explainNoTarget`。
 *
 * ⚠️ 2 与 `REASON_NO_CANDIDATE_RUN` **绝不能合并**：前者人该去查 `AS_PROJECT`
 * 与用例上的 sourceRef，后者该去把用例勾进这个迭代的任务。合并等于把
 * `resolveAutomationTargets` 那个 LEFT JOIN 退化回 INNER JOIN 的语义。
 */
function planOneAttachment(
	state: AttachmentPlanState,
	attachment: IngestAttachmentPresignItem,
	index: number,
	allowedRunIds: Set<string> | null
): void {
	const violation = rejectByPolicy(attachment, index);
	if (violation !== null) {
		state.rejected.push(violation);
		return;
	}
	const rows = state.rowsBySourceRef.get(attachment.sourceRef) ?? [];
	if (rows.length === 0) {
		state.rejected.push({
			index,
			reason: REASON_UNMATCHED,
			runName: null,
			sourceRef: attachment.sourceRef,
		});
		return;
	}
	const buckets = bucketCandidateRows(rows, allowedRunIds);
	// 待评审的逐条列出，**哪怕这条附件在别的任务里签成功了**：那是平台单方面
	// 拒收，上报方没要求过，不说他就不知道。
	state.rejected.push(
		...buildBlockedRejections(
			index,
			attachment.sourceRef,
			buckets.pendingReviewRunNames,
			describePendingReview
		)
	);
	// 白名单排除**不在签成功时列出**：把调用方自己下的指令再回读一遍，只会让
	// 对账单里每条成功的附件都拖一行「越界」，把真正的越界淹掉。它只在这条附件
	// 一个 URL 都没签出来时才是答案。
	if (buckets.targets.length === 0) {
		state.rejected.push(
			...explainNoTarget(index, attachment.sourceRef, buckets)
		);
		return;
	}
	for (const target of buckets.targets) {
		pushUploadItem(state.groupByRunId, target, {
			contentType: attachment.contentType,
			index,
			kind: attachment.kind,
			runCaseId: target.runCaseId,
			sizeBytes: attachment.sizeBytes,
			sourceRef: attachment.sourceRef,
		});
	}
}

/**
 * 把请求里的附件折算成「按任务分组的待签名清单」+「逐条拒绝理由」。
 *
 * 逐条的判据顺序见 `planOneAttachment`；配额留到整轮扫完之后逐组过
 * （`applyRunQuota`），因为「这一组一共装了多少」要等所有附件都归好组才知道。
 *
 * 拒绝按 `index` 稳定排序，让 SDK 能顺着自己的文件清单逐行核对。
 */
export function planAttachmentUploads(
	input: PlanAttachmentUploadsInput
): PlannedAttachmentUploads {
	const state: AttachmentPlanState = {
		groupByRunId: new Map<string, AttachmentUploadGroup>(),
		rejected: [],
		rowsBySourceRef: groupRowsBySourceRef(input.rows),
	};
	// `null` 与空数组的差别必须活到这里：`null` 不收窄，空 Set 谁都不签（§5.1.1）。
	const allowedRunIds =
		input.runIds === null ? null : new Set<string>(input.runIds);
	for (const [index, attachment] of input.attachments.entries()) {
		planOneAttachment(state, attachment, index, allowedRunIds);
	}
	const groups = [...state.groupByRunId.values()]
		.map((group) => applyRunQuota(group, state.rejected))
		.filter((group) => group.items.length > 0);
	return { groups, rejected: sortByIndex(state.rejected) };
}

/** `Array.prototype.sort` 自 ES2019 起保证稳定，同下标的多条保持产生顺序。 */
function sortByIndex(
	rejections: IngestAttachmentRejection[]
): IngestAttachmentRejection[] {
	return [...rejections].sort((left, right) => left.index - right.index);
}
