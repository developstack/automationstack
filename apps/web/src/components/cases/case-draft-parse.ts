/**
 * 「新建用例」草稿的**结构定义与解析**（不碰 localStorage，也不碰 React）。
 *
 * ## 为什么和 `case-draft-storage.ts` 分成两个文件
 *
 * 存储那一侧要处理键的格式、老键迁移、Safari 抛异常；解析这一侧只关心
 * 「一段来路不明的 JSON 怎么折算成一份草稿」。两件事合在一个文件里已经顶到了
 * 300 行的上限（仓库规则），而它们的测试也天然是分开的：解析层连 Storage 都不用假。
 *
 * ## 读回来的东西一律当成不可信输入
 *
 * localStorage 里的字符串可能是上个版本的字段结构、可能被用户手改过、也可能
 * 被别的脚本写坏。所以这里不做 `JSON.parse as CaseDraft` 那种断言，而是逐字段
 * 校验 + 回落到默认值：坏掉的枚举值一旦进了表单，`<Select>` 会变成一个值不在
 * 选项里的受控组件，用户既看不出问题也改不回去。
 */
import type { CaseStep } from "@automationstack/db/schema/test-cases";

import {
	CASE_TYPE_VALUES,
	type CaseFormValues,
	emptyCaseFormValues,
	PRIORITY_VALUES,
	STATUS_VALUES,
} from "@/components/cases/case-meta";

/** 一张已经传进 R2、但还没登记进数据库的草稿贴图。 */
export interface CaseDraftAttachment {
	fileName: string;
	/** presign 阶段就定下的附件 id，正文里 `![](attachment:<id>)` 引的就是它。 */
	id: string;
	storageKey: string;
}

export interface CaseDraft {
	/**
	 * 图片对照表。恢复时靠它把正文里的 id 翻回 storageKey 去重签 URL
	 * （`caseAttachments.presignDraftDownload`），保存时它就是要登记的那一批。
	 */
	attachments: CaseDraftAttachment[];
	/**
	 * 打开抽屉时 `crypto.randomUUID()` 预生成的用例 id。
	 * 它同时是这份草稿的身份：存储键按它分（见 `case-draft-storage.ts`）。
	 */
	caseId: string;
	/**
	 * 这份草稿要创建到哪个模块下。
	 *
	 * 曾经它只写在存储键里（`{projectId}.{moduleId}`），那等于「一个模块只能有
	 * 一份草稿」——用户在有草稿的模块里再新建一条，敲第一个字就把上一份静默
	 * 覆盖掉了。现在模块写进 value，键腾出来给 caseId 用。
	 *
	 * 空串 = 这条记录没记住自己属于哪个模块（老格式解析不出、或被改坏）。
	 * 这种草稿在清单里按孤儿处理：只允许删除，不允许继续编辑——没有目标模块，
	 * 「继续编辑」跳过去也创建不了。
	 */
	moduleId: string;
	/** 写入时刻（epoch ms），只用来在提示里告诉用户这是什么时候的东西。 */
	savedAt: number;
	values: CaseFormValues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function pickString(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

/**
 * 枚举字段的收窄。用循环比较而不是 `allowed.includes(value as T)`：
 * 那个 `as` 会把「校验不可信输入」这件事本身建立在一次断言上。
 */
function pickOption<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T
): T {
	for (const option of allowed) {
		if (option === value) {
			return option;
		}
	}
	return fallback;
}

/** 没有 id 的步骤直接丢掉：`steps-editor` 拿 id 做 key，没有它整行都渲染不出来。 */
function parseSteps(value: unknown): CaseStep[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const steps: CaseStep[] = [];
	for (const raw of value) {
		if (isRecord(raw) && typeof raw.id === "string") {
			steps.push({
				expected: pickString(raw.expected, ""),
				id: raw.id,
				step: pickString(raw.step, ""),
			});
		}
	}
	return steps;
}

function parseValues(raw: unknown): CaseFormValues {
	const base = emptyCaseFormValues();
	if (!isRecord(raw)) {
		return base;
	}
	return {
		caseType: pickOption(raw.caseType, CASE_TYPE_VALUES, base.caseType),
		maintainer: pickString(raw.maintainer, base.maintainer),
		name: pickString(raw.name, base.name),
		preconditions: pickString(raw.preconditions, base.preconditions),
		priority: pickOption(raw.priority, PRIORITY_VALUES, base.priority),
		status: pickOption(raw.status, STATUS_VALUES, base.status),
		steps: parseSteps(raw.steps),
		tagsText: pickString(raw.tagsText, base.tagsText),
	};
}

/**
 * 三个字段缺一不可，缺任何一个这条记录都没法用：
 * 少了 id 正文引用对不上，少了 key 签不出 URL、也登记不进库。
 */
function parseAttachments(value: unknown): CaseDraftAttachment[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const items: CaseDraftAttachment[] = [];
	for (const raw of value) {
		if (
			isRecord(raw) &&
			typeof raw.fileName === "string" &&
			typeof raw.id === "string" &&
			typeof raw.storageKey === "string"
		) {
			items.push({
				fileName: raw.fileName,
				id: raw.id,
				storageKey: raw.storageKey,
			});
		}
	}
	return items;
}

/**
 * 把一条原始 JSON 字符串折算成草稿，坏数据一律回 null。
 *
 * 单独导出是为了能脱离 localStorage 单测——这一层是整个草稿链路里唯一会读到
 * 外部不可信数据的地方。
 *
 * ⚠️ `moduleId` 缺失**不算坏数据**：老格式（键是 `{projectId}.{moduleId}`）的
 * value 里压根没有这个字段，把它判成坏数据就等于把用户的老草稿全丢了。
 * 这里回落成空串，由存储层看着键把它补回来（`case-draft-storage.ts`）。
 */
export function parseCaseDraft(raw: string | null): CaseDraft | null {
	if (raw === null) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!(isRecord(parsed) && typeof parsed.caseId === "string")) {
		// caseId 是唯一没有合理默认值的字段：它决定了那批图的 object key 前缀，
		// 猜一个只会让恢复出来的正文引到一批签不出 URL 的图。
		return null;
	}
	return {
		attachments: parseAttachments(parsed.attachments),
		caseId: parsed.caseId,
		moduleId: pickString(parsed.moduleId, ""),
		savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
		values: parseValues(parsed.values),
	};
}
