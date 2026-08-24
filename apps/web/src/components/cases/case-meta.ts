/**
 * Shared display metadata for test cases: enum labels, badge variants,
 * select options, date formatting and form-value conversions.
 */
import type {
	CasePriority,
	CaseSnapshot,
	CaseStatus,
	CaseStep,
	CaseType,
	TestCase,
} from "@automationstack/db/schema/test-cases";

export interface CaseOption {
	label: string;
	value: string;
}

export type BadgeVariant =
	| "default"
	| "destructive"
	| "destructive-solid"
	| "ghost"
	| "outline"
	| "secondary";

/**
 * 优先级与状态必须分属两个视觉体系，否则在表格里是相邻两列：
 * 旧配色下 P1 与「生效」、P2 与「草稿」、P3 与「废弃」是像素级相同的徽章，
 * 扫表格时分不清眼前这枚徽章说的是优先级还是状态。
 *
 * 现在：优先级 = 填充强度色阶（实心危险色 → 浅危险色 → 灰填充 → 无填充），
 * 状态 = 统一 outline 轮廓 + 前置状态点（见 STATUS_DOT_CLASSES）。
 * 优先级刻意不再使用 outline，才能保证两组永不撞形。
 *
 * P0 必须是实心 destructive。旧映射把 default 给了 P1：暗色下 --primary 是
 * near-white 实心（合成后相对亮度 Y≈0.658），而 P0 的淡填充只有 Y≈0.019，
 * 比 P2 的实心灰（0.019）还不显眼，整行最抢眼的反倒是 P1——把「P0 最高」说反了。
 * 抬 P0 而不是压 P1：secondary 已被 P2 占用，outline 被状态列独占，降无可降。
 * 现在 P0 实心红 Y≈0.528 ≫ P1 淡红 0.019 ≈ P2 灰 0.019 > P3 无填充 0.003；
 * P1 与 P2 亮度接近，靠色相（危险色 vs 中性）分高下。
 */
export const PRIORITY_BADGE_VARIANTS: Record<CasePriority, BadgeVariant> = {
	P0: "destructive-solid",
	P1: "destructive",
	P2: "secondary",
	P3: "ghost",
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
	active: "生效",
	deprecated: "废弃",
	draft: "草稿",
};

export const STATUS_BADGE_VARIANTS: Record<CaseStatus, BadgeVariant> = {
	active: "outline",
	deprecated: "outline",
	draft: "outline",
};

/**
 * 状态点：三态除了颜色还有形态差异（实心 / 实心弱 / 空心），
 * 满足「不能只靠颜色」；文字标签仍然是主要信息载体。
 * active 用 --success：这是「已生效」的语义色，不再借用 --primary
 * （主操作色说的是「这里能点」，不是「这条用例是活的」）。
 */
export const STATUS_DOT_CLASSES: Record<CaseStatus, string> = {
	active: "bg-success",
	deprecated: "bg-muted-foreground/50",
	draft: "border border-muted-foreground",
};

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
	compatibility: "兼容性",
	functional: "功能",
	interface: "接口",
	other: "其他",
	performance: "性能",
	security: "安全",
};

export const PRIORITY_VALUES: readonly CasePriority[] = [
	"P0",
	"P1",
	"P2",
	"P3",
];

export const PRIORITY_OPTIONS: readonly CaseOption[] = PRIORITY_VALUES.map(
	(value) => ({ label: value, value })
);

/**
 * 枚举的**取值**清单，与上面几张 label 表分开导出。
 *
 * label 表是 `Record<Enum, string>`（编译期保证不漏项），但它没法直接当成
 * 「合法取值列表」用：`Object.keys` 的返回类型是 `string[]`，收窄回枚举要一次
 * 断言。而校验不可信输入（`case-draft-storage.ts` 读回来的 localStorage）这件事
 * 本身就不该建立在断言上，所以这里显式列一遍，写错会被类型直接顶回来。
 */
export const STATUS_VALUES: readonly CaseStatus[] = [
	"active",
	"deprecated",
	"draft",
];

export const CASE_TYPE_VALUES: readonly CaseType[] = [
	"compatibility",
	"functional",
	"interface",
	"other",
	"performance",
	"security",
];

export const STATUS_OPTIONS: readonly CaseOption[] = (
	Object.entries(STATUS_LABELS) as [CaseStatus, string][]
).map(([value, label]) => ({ label, value }));

export const CASE_TYPE_OPTIONS: readonly CaseOption[] = (
	Object.entries(CASE_TYPE_LABELS) as [CaseType, string][]
).map(([value, label]) => ({ label, value }));

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("zh-CN", {
	dateStyle: "short",
	timeStyle: "short",
});

export function formatDateTime(value: Date | string): string {
	return DATE_TIME_FORMAT.format(new Date(value));
}

/** Local (uncommitted) state of the case editor form. */
export interface CaseFormValues {
	caseType: CaseType;
	maintainer: string;
	name: string;
	preconditions: string;
	priority: CasePriority;
	status: CaseStatus;
	steps: CaseStep[];
	tagsText: string;
}

export function emptyCaseFormValues(): CaseFormValues {
	return {
		caseType: "functional",
		maintainer: "",
		name: "",
		preconditions: "",
		priority: "P2",
		status: "draft",
		steps: [],
		tagsText: "",
	};
}

export function caseToFormValues(testCase: TestCase): CaseFormValues {
	return {
		caseType: testCase.caseType,
		maintainer: testCase.maintainer ?? "",
		name: testCase.name,
		preconditions: testCase.preconditions ?? "",
		priority: testCase.priority,
		status: testCase.status,
		steps: testCase.steps.map((step) => ({ ...step })),
		tagsText: testCase.tags.join(", "),
	};
}

/** Tags are typed as one free-text field, split on ASCII or full-width commas. */
const TAG_SEPARATOR_PATTERN = /[,，]/;

export function parseTagsText(tagsText: string): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const raw of tagsText.split(TAG_SEPARATOR_PATTERN)) {
		const tag = raw.trim();
		if (tag.length > 0 && !seen.has(tag)) {
			seen.add(tag);
			tags.push(tag);
		}
	}
	return tags;
}

/** Content payload shared by cases.create and cases.update patch. */
export interface CaseContentValues {
	caseType: CaseType;
	maintainer: string | null;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	status: CaseStatus;
	steps: CaseStep[];
	tags: string[];
}

export function formValuesToContent(values: CaseFormValues): CaseContentValues {
	return {
		caseType: values.caseType,
		maintainer: values.maintainer.trim() === "" ? null : values.maintainer,
		name: values.name.trim(),
		preconditions:
			values.preconditions.trim() === "" ? null : values.preconditions,
		priority: values.priority,
		status: values.status,
		steps: values.steps,
		tags: parseTagsText(values.tagsText),
	};
}

/** Projects a full test-case row down to its snapshot content shape. */
export function caseToSnapshot(testCase: TestCase): CaseSnapshot {
	return {
		caseType: testCase.caseType,
		maintainer: testCase.maintainer,
		moduleId: testCase.moduleId,
		name: testCase.name,
		preconditions: testCase.preconditions,
		priority: testCase.priority,
		sourceRef: testCase.sourceRef,
		status: testCase.status,
		steps: testCase.steps,
		tags: testCase.tags,
	};
}
