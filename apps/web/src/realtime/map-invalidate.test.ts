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

test("case + update 只刷新用例与脑图", () => {
	expect(mapInvalidateTargets(makeEvent("case", "update"))).toEqual([
		"cases",
		"mindmap",
	]);
});

test("case 的增删改移会连带刷新模块树", () => {
	for (const action of MODULE_TOUCHING_CASE_ACTIONS) {
		expect(mapInvalidateTargets(makeEvent("case", action))).toEqual([
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
		"cases",
		"mindmap",
		"modules",
		"projects",
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
