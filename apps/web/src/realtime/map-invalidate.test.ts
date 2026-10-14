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

const CASE_TARGETS = ["caseAttachments", "cases", "mindmap"];

test.each<[string, InvalidateEntity, InvalidateAction[], string[]]>([
	["case + update 刷新用例、贴图与脑图", "case", ["update"], CASE_TARGETS],
	[
		"case 的增删改移会连带刷新模块树",
		"case",
		["create", "delete", "move", "restore"],
		[...CASE_TARGETS, "modules"],
	],
	[
		"module 的任何动作都刷新 cases/mindmap/modules 且不重复",
		"module",
		["create", "delete", "move", "restore", "update"],
		["cases", "mindmap", "modules"],
	],
	[
		"project 的任何动作都只刷新 mindmap/projects",
		"project",
		["update", "delete"],
		["mindmap", "projects"],
	],
	[
		"testRun 同时刷新测试任务与附件两个缓存根",
		"testRun",
		["create", "delete", "update"],
		["testRunAttachments", "testRuns"],
	],
])("%s", (_name, entity, actions, targets) => {
	for (const action of actions) {
		expect(mapInvalidateTargets(makeEvent(entity, action))).toEqual(targets);
	}
});

test("未知 entity 兜底为空列表（不抛异常）", () => {
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

test.each([
	["身份未就绪时保守地全部应用", null, true],
	["跳过自己触发的失效", "client-a", false],
	["他人触发的失效要应用", "client-b", true],
	["他人触发的失效要应用", "", true],
])("shouldApplyInvalidate：%s（%j）", (_name, selfClientId, apply) => {
	expect(shouldApplyInvalidate(makeEvent("case", "update"), selfClientId)).toBe(
		apply
	);
});
