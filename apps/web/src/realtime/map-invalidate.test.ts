import type {
	InvalidateAction,
	InvalidateEntity,
	InvalidateEvent,
} from "@automationstack/api/realtime/protocol";
import { expect, test } from "vitest";
import {
	ALL_INVALIDATE_TARGETS,
	mapInvalidateTargets,
	shouldApplyInvalidate,
} from "@/realtime/map-invalidate";

const ACTOR = { clientId: "client-a", name: "Alice" };

function makeEvent(
	entity: InvalidateEntity,
	action: InvalidateAction
): InvalidateEvent {
	return { action, actor: ACTOR, entity, ids: ["id-1"] };
}

const MODULE_TOUCHING_CASE_ACTIONS: InvalidateAction[] = [
	"create",
	"delete",
	"move",
	"restore",
];

test("case + update 刷新用例、贴图与脑图", () => {
	// caseAttachments 不在 orpc.cases.key() 的前缀里：漏掉它，别人刚贴进正文的图
	// 在这边就是一张查不到签名 URL 的占位（签名本身也只有 15 分钟）。
	expect(mapInvalidateTargets(makeEvent("case", "update"))).toEqual([
		"caseAttachments",
		"cases",
		"mindmap",
	]);
});

test("case 的增删改移会连带刷新模块树", () => {
	for (const action of MODULE_TOUCHING_CASE_ACTIONS) {
		expect(mapInvalidateTargets(makeEvent("case", action))).toEqual([
			"caseAttachments",
			"cases",
			"mindmap",
			"modules",
		]);
	}
});

test("module 的任何动作都刷新 cases/mindmap/modules 且不重复", () => {
	const actions: InvalidateAction[] = [
		"create",
		"delete",
		"move",
		"restore",
		"update",
	];
	for (const action of actions) {
		const targets = mapInvalidateTargets(makeEvent("module", action));
		expect(targets).toEqual(["cases", "mindmap", "modules"]);
		expect(new Set(targets).size).toBe(targets.length);
	}
});

test("project 的任何动作都只刷新 mindmap/projects", () => {
	expect(mapInvalidateTargets(makeEvent("project", "update"))).toEqual([
		"mindmap",
		"projects",
	]);
	// delete 也不会连带刷新 cases/modules —— 记录当前行为
	expect(mapInvalidateTargets(makeEvent("project", "delete"))).toEqual([
		"mindmap",
		"projects",
	]);
});

test("testRun 同时刷新测试任务与附件两个缓存根", () => {
	// 附件的 register/remove 也发 entity:"testRun"（plan §6.4 不给附件单开 topic），
	// 而附件列表住在另一个 router，漏掉它别人传的截图就不会自动出现。
	for (const action of ["create", "delete", "update"] as InvalidateAction[]) {
		expect(mapInvalidateTargets(makeEvent("testRun", action))).toEqual([
			"testRunAttachments",
			"testRuns",
		]);
	}
});

test("未知 entity 兜底为空列表（不抛异常）", () => {
	// 协议 schema 会先挡住，这里只锁运行时收到脏数据时的兜底行为
	const event = {
		action: "update",
		actor: ACTOR,
		entity: "workspace",
		ids: [],
	} as unknown as InvalidateEvent;
	expect(mapInvalidateTargets(event)).toEqual([]);
});

test("ALL_INVALIDATE_TARGETS 覆盖全部缓存根", () => {
	expect(ALL_INVALIDATE_TARGETS).toEqual([
		"caseAttachments",
		"cases",
		"mindmap",
		"modules",
		"projects",
		"testRunAttachments",
		"testRuns",
	]);
});

test("shouldApplyInvalidate：身份未就绪时保守地全部应用", () => {
	expect(shouldApplyInvalidate(makeEvent("case", "update"), null)).toBe(true);
});

test("shouldApplyInvalidate：跳过自己触发的失效", () => {
	expect(shouldApplyInvalidate(makeEvent("case", "update"), "client-a")).toBe(
		false
	);
});

test("shouldApplyInvalidate：他人触发的失效要应用", () => {
	expect(shouldApplyInvalidate(makeEvent("case", "update"), "client-b")).toBe(
		true
	);
	// 空串是合法的「已就绪但不同」身份，不能当作未就绪
	expect(shouldApplyInvalidate(makeEvent("case", "update"), "")).toBe(true);
});
