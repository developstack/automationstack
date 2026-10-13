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

export const STATUS_LABELS: Record<CaseStatus, string> = {
	active: "生效",
	deprecated: "废弃",
	draft: "草稿",
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
