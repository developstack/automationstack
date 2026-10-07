import type {
	CaseSnapshot,
	CaseStep,
} from "@automationstack/db/schema/test-cases";
import { expect, test } from "vitest";
import {
	type CaseSnapshotDiff,
	diffCaseSnapshots,
} from "@/components/versions/field-diff";

const MODULE_ID = "11111111-1111-4111-8111-111111111111";

const makeStep = (id: string, step: string, expected: string): CaseStep => ({
	expected,
	id,
	step,
});

const STEP_ONE = makeStep("s1", "打开登录页", "展示登录表单");
const STEP_TWO = makeStep("s2", "输入账号密码", "按钮可点击");

function makeSnapshot(overrides: Partial<CaseSnapshot> = {}): CaseSnapshot {
	return {
		caseType: "functional",
		maintainer: "alice",
		moduleId: MODULE_ID,
		name: "登录成功",
		preconditions: "已注册账号",
		priority: "P1",
		sourceRef: null,
		status: "active",
		steps: [STEP_ONE],
		tags: ["smoke", "login"],
		...overrides,
	};
}

const entryOf = (diff: CaseSnapshotDiff, id: string) =>
	diff.steps.entries.find((entry) => entry.id === id);

const kindsOf = (diff: CaseSnapshotDiff) =>
	diff.steps.entries.map((entry) => [entry.id, entry.kind]);

test("完全相同的两个快照没有任何变更", () => {
	const diff = diffCaseSnapshots(makeSnapshot(), makeSnapshot());
	expect(diff.hasChanges).toBe(false);
	expect(diff.scalars.name.kind).toBe("unchanged");
	expect(diff.preconditions.kind).toBe("unchanged");
	expect(diff.tags).toEqual({
		added: [],
		kept: ["smoke", "login"],
		kind: "unchanged",
		removed: [],
	});
	expect(diff.steps.hasChanges).toBe(false);
	expect(diff.steps.counts.unchanged).toBe(1);
});

test("标量字段逐个比较，只有真正变化的字段标记为 changed", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot(),
		makeSnapshot({ priority: "P0" })
	);
	expect(diff.scalars.priority).toEqual({
		kind: "changed",
		newValue: "P0",
		oldValue: "P1",
	});
	expect(diff.scalars.name.kind).toBe("unchanged");
	expect(diff.scalars.status.kind).toBe("unchanged");
	expect(diff.scalars.caseType.kind).toBe("unchanged");
	expect(diff.hasChanges).toBe(true);
});

test("maintainer 的 null 与字符串互转都算变更", () => {
	const cleared = diffCaseSnapshots(
		makeSnapshot(),
		makeSnapshot({ maintainer: null })
	);
	expect(cleared.scalars.maintainer).toEqual({
		kind: "changed",
		newValue: null,
		oldValue: "alice",
	});
	const filled = diffCaseSnapshots(
		makeSnapshot({ maintainer: null }),
		makeSnapshot()
	);
	expect(filled.scalars.maintainer.kind).toBe("changed");
});

test("moduleId 与 sourceRef 不参与 diff（当前行为）", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot(),
		makeSnapshot({ moduleId: "22222222-2222-4222-8222-222222222222" })
	);
	expect(diff.hasChanges).toBe(false);
	const withSource = diffCaseSnapshots(
		makeSnapshot(),
		makeSnapshot({ sourceRef: "JIRA-1" })
	);
	expect(withSource.hasChanges).toBe(false);
});

test("preconditions 的 null 与空串等价，但原值原样保留", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ preconditions: null }),
		makeSnapshot({ preconditions: "" })
	);
	expect(diff.preconditions.kind).toBe("unchanged");
	expect(diff.preconditions.oldValue).toBeNull();
	expect(diff.preconditions.newValue).toBe("");
	expect(diff.preconditions.segments).toEqual([]);
	expect(diff.hasChanges).toBe(false);
});

test("preconditions 变更时产出 ins/del 词级片段", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ preconditions: "need a token" }),
		makeSnapshot({ preconditions: "need an admin token" })
	);
	expect(diff.preconditions.kind).toBe("changed");
	const kinds = new Set(diff.preconditions.segments.map((seg) => seg.kind));
	expect(kinds.has("added")).toBe(true);
	expect(kinds.has("unchanged")).toBe(true);
	expect(diff.hasChanges).toBe(true);
});

test("tags 做集合差：added 按新序、removed 按旧序、kept 按新序", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ tags: ["a", "b", "c"] }),
		makeSnapshot({ tags: ["c", "a", "d", "e"] })
	);
	expect(diff.tags).toEqual({
		added: ["d", "e"],
		kept: ["c", "a"],
		kind: "changed",
		removed: ["b"],
	});
});

test("tags 仅重排视为未变更（当前行为）", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ tags: ["a", "b"] }),
		makeSnapshot({ tags: ["b", "a"] })
	);
	expect(diff.tags).toEqual({
		added: [],
		kept: ["b", "a"],
		kind: "unchanged",
		removed: [],
	});
	expect(diff.hasChanges).toBe(false);
});

test("tags 全部清空只产生 removed", () => {
	const diff = diffCaseSnapshots(makeSnapshot(), makeSnapshot({ tags: [] }));
	expect(diff.tags.added).toEqual([]);
	expect(diff.tags.kept).toEqual([]);
	expect(diff.tags.removed).toEqual(["smoke", "login"]);
	expect(diff.tags.kind).toBe("changed");
});

test("steps：新增/删除/未变三种状态与 entries 排序", () => {
	const stepThree = makeStep("s3", "点击登录", "跳转首页");
	const diff = diffCaseSnapshots(
		makeSnapshot({ steps: [STEP_ONE, STEP_TWO] }),
		makeSnapshot({ steps: [STEP_ONE, stepThree] })
	);
	expect(kindsOf(diff)).toEqual([
		["s1", "unchanged"],
		["s3", "added"],
		["s2", "removed"],
	]);
	expect(diff.steps.counts).toEqual({
		added: 1,
		modified: 0,
		moved: 0,
		removed: 1,
		unchanged: 1,
	});
	expect(entryOf(diff, "s3")?.oldIndex).toBeNull();
	expect(entryOf(diff, "s3")?.oldStep).toBeNull();
	expect(entryOf(diff, "s2")?.newIndex).toBeNull();
	expect(entryOf(diff, "s2")?.oldIndex).toBe(1);
	expect(diff.hasChanges).toBe(true);
});

test("steps：内容不变仅位置变化标记为 moved，且不产生 segments", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ steps: [STEP_ONE, STEP_TWO] }),
		makeSnapshot({ steps: [STEP_TWO, STEP_ONE] })
	);
	expect(kindsOf(diff)).toEqual([
		["s2", "moved"],
		["s1", "moved"],
	]);
	expect(entryOf(diff, "s2")).toMatchObject({
		expectedSegments: null,
		newIndex: 0,
		oldIndex: 1,
		stepSegments: null,
	});
	expect(diff.steps.counts.unchanged).toBe(0);
	expect(diff.hasChanges).toBe(true);
});

test("steps：原地改内容标记为 modified，两个字段的 segments 都会生成", () => {
	const edited = makeStep(STEP_ONE.id, STEP_ONE.step, "展示登录表单与验证码");
	const diff = diffCaseSnapshots(
		makeSnapshot({ steps: [STEP_ONE] }),
		makeSnapshot({ steps: [edited] })
	);
	const entry = entryOf(diff, "s1");
	expect(entry?.kind).toBe("modified");
	expect(entry?.oldIndex).toBe(0);
	expect(entry?.newIndex).toBe(0);
	expect(entry?.stepSegments).toEqual([
		{ kind: "unchanged", text: STEP_ONE.step },
	]);
	expect(entry?.expectedSegments?.some((seg) => seg.kind === "added")).toBe(
		true
	);
});

test("steps：既移动又改内容时归类为 modified 并保留新旧下标", () => {
	const editedOne = makeStep(STEP_ONE.id, "打开登录页面", STEP_ONE.expected);
	const diff = diffCaseSnapshots(
		makeSnapshot({ steps: [STEP_ONE, STEP_TWO] }),
		makeSnapshot({ steps: [STEP_TWO, editedOne] })
	);
	expect(kindsOf(diff)).toEqual([
		["s2", "moved"],
		["s1", "modified"],
	]);
	expect(entryOf(diff, "s1")).toMatchObject({
		kind: "modified",
		newIndex: 1,
		oldIndex: 0,
	});
	expect(entryOf(diff, "s1")?.stepSegments).not.toBeNull();
});

test("steps 是唯一变化时 hasChanges 仍为 true", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ steps: [STEP_ONE] }),
		makeSnapshot({ steps: [STEP_ONE, STEP_TWO] })
	);
	expect(diff.scalars.name.kind).toBe("unchanged");
	expect(diff.tags.kind).toBe("unchanged");
	expect(diff.preconditions.kind).toBe("unchanged");
	expect(diff.hasChanges).toBe(true);
});

test("两个空 steps 列表不算变更", () => {
	const diff = diffCaseSnapshots(
		makeSnapshot({ steps: [] }),
		makeSnapshot({ steps: [] })
	);
	expect(diff.steps.entries).toEqual([]);
	expect(diff.steps.hasChanges).toBe(false);
	expect(diff.hasChanges).toBe(false);
});

test("diffCaseSnapshots 不修改传入的快照", () => {
	const oldSnapshot = makeSnapshot({ steps: [STEP_ONE, STEP_TWO] });
	const newSnapshot = makeSnapshot({ steps: [STEP_TWO], tags: ["x"] });
	diffCaseSnapshots(oldSnapshot, newSnapshot);
	expect(oldSnapshot).toEqual(makeSnapshot({ steps: [STEP_ONE, STEP_TWO] }));
	expect(newSnapshot).toEqual(makeSnapshot({ steps: [STEP_TWO], tags: ["x"] }));
});
