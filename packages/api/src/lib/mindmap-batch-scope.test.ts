import { expect, it } from "vitest";

import { collectMindmapBatchScope } from "./mindmap-batch-scope";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const MODULE_X = "22222222-2222-4222-8222-222222222222";
const MODULE_Y = "33333333-3333-4333-8333-333333333333";
const CASE_X = "44444444-4444-4444-8444-444444444444";

const createModule = (tempId: string, parentId: string | null = null) => ({
	name: "订单",
	op: "createModule" as const,
	parentId,
	projectId: PROJECT_A,
	tempId,
});

const createCase = (tempId: string, moduleId: string) => ({
	moduleId,
	name: "下单成功",
	op: "createCase" as const,
	projectId: PROJECT_A,
	tempId,
});

it("建节点：createModule / createCase 声明的 projectId 直接进作用域，不用查库", () => {
	const scope = collectMindmapBatchScope([createModule("t1")]);
	expect(scope.projectIds).toEqual([PROJECT_A]);
	expect(scope.caseIds).toEqual([]);
	expect(scope.moduleIds).toEqual([]);
});

it("建节点时引用的**真实**父模块 / 目标模块也要算进去", () => {
	const scope = collectMindmapBatchScope([
		createModule("t1", MODULE_X),
		createCase("t2", MODULE_Y),
	]);
	expect(scope.moduleIds).toEqual([MODULE_X, MODULE_Y]);
});

it("改 / 删节点按 id 解析：重命名、移动、删除的目标 id 全部进作用域", () => {
	const scope = collectMindmapBatchScope([
		{ id: MODULE_X, name: "改名", op: "renameModule" },
		{ id: CASE_X, op: "removeCase" },
	]);
	expect(scope.moduleIds).toEqual([MODULE_X]);
	expect(scope.caseIds).toEqual([CASE_X]);
});

it("移动操作的**目的地**同样要算——否则把用例挪进别人项目的模块就没人拦", () => {
	const scope = collectMindmapBatchScope([
		{ id: CASE_X, moduleId: MODULE_Y, op: "moveCase" },
		{ id: MODULE_X, op: "moveModule", parentId: MODULE_Y },
	]);
	expect(scope.caseIds).toEqual([CASE_X]);
	expect(scope.moduleIds).toEqual([MODULE_Y, MODULE_X]);
});

it("tempId：引用同批次里**先前**建出的节点时，不当成真实 id 去查库", () => {
	const scope = collectMindmapBatchScope([
		createModule("t1"),
		createCase("t2", "t1"),
		{ id: "t2", name: "下单成功（改）", op: "renameCase" },
	]);
	expect(scope.moduleIds).toEqual([]);
	expect(scope.caseIds).toEqual([]);
	expect(scope.projectIds).toEqual([PROJECT_A]);
});

it("tempId：引用出现在 create **之前**时按真实 id 算，与 resolveId 的运行时行为一致", () => {
	const scope = collectMindmapBatchScope([
		{ id: CASE_X, op: "removeCase" },
		createCase(CASE_X, MODULE_X),
	]);
	expect(scope.caseIds).toEqual([CASE_X]);
});

it("去重：同一个 id 被多个操作引用只算一次", () => {
	const scope = collectMindmapBatchScope([
		{ id: MODULE_X, name: "一", op: "renameModule" },
		{ id: MODULE_X, op: "moveModule", parentId: null },
		{ id: MODULE_X, op: "removeModule" },
	]);
	expect(scope.moduleIds).toEqual([MODULE_X]);
});
