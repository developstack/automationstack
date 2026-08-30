/**
 * 脑图批量的授权作用域。
 *
 * 这份逻辑的失效方式和 `project-access.test.ts` 里那份一样：算漏一个 id 不会
 * 抛异常也不会让 tsc 变红，只会让一个批次带着别人项目的节点通过闸门。所以这里
 * 逐条钉的是「哪些 id 必须被算进作用域」，而不是函数的返回外形。
 */
import { describe, expect, it } from "vitest";

import { collectMindmapBatchScope } from "./mindmap-batch-scope";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const MODULE_X = "22222222-2222-4222-8222-222222222222";
const MODULE_Y = "33333333-3333-4333-8333-333333333333";
const CASE_X = "44444444-4444-4444-8444-444444444444";

describe("collectMindmapBatchScope：建节点的操作自带 projectId", () => {
	it("createModule / createCase 声明的 projectId 直接进作用域，不用查库", () => {
		const scope = collectMindmapBatchScope([
			{
				name: "订单",
				op: "createModule",
				parentId: null,
				projectId: PROJECT_A,
				tempId: "t1",
			},
		]);
		expect(scope.projectIds).toEqual([PROJECT_A]);
		expect(scope.caseIds).toEqual([]);
		expect(scope.moduleIds).toEqual([]);
	});

	it("建节点时引用的**真实**父模块 / 目标模块也要算进去", () => {
		const scope = collectMindmapBatchScope([
			{
				name: "支付",
				op: "createModule",
				parentId: MODULE_X,
				projectId: PROJECT_A,
				tempId: "t1",
			},
			{
				moduleId: MODULE_Y,
				name: "退款成功",
				op: "createCase",
				projectId: PROJECT_A,
				tempId: "t2",
			},
		]);
		expect(scope.moduleIds).toEqual([MODULE_X, MODULE_Y]);
	});
});

describe("collectMindmapBatchScope：改 / 删节点按 id 解析", () => {
	it("重命名、移动、删除的目标 id 全部进作用域", () => {
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
});

describe("collectMindmapBatchScope：tempId 的时序规则", () => {
	it("引用同批次里**先前**建出的节点时，不当成真实 id 去查库", () => {
		const scope = collectMindmapBatchScope([
			{
				name: "订单",
				op: "createModule",
				parentId: null,
				projectId: PROJECT_A,
				tempId: "t1",
			},
			{
				moduleId: "t1",
				name: "下单成功",
				op: "createCase",
				projectId: PROJECT_A,
				tempId: "t2",
			},
			{ id: "t2", name: "下单成功（改）", op: "renameCase" },
		]);
		expect(scope.moduleIds).toEqual([]);
		expect(scope.caseIds).toEqual([]);
		expect(scope.projectIds).toEqual([PROJECT_A]);
	});

	/**
	 * 这一条是整个文件存在的理由，删掉它上面那条规则就会被人「顺手优化」成
	 * 预扫一遍收齐 tempId——而那正是一个越权删除的口子，理由见被测函数的注释。
	 */
	it("引用出现在 create **之前**时按真实 id 算，与 resolveId 的运行时行为一致", () => {
		const scope = collectMindmapBatchScope([
			{ id: CASE_X, op: "removeCase" },
			{
				moduleId: MODULE_X,
				name: "冒名顶替",
				op: "createCase",
				projectId: PROJECT_A,
				tempId: CASE_X,
			},
		]);
		expect(scope.caseIds).toEqual([CASE_X]);
	});
});

describe("collectMindmapBatchScope：去重", () => {
	it("同一个 id 被多个操作引用只算一次", () => {
		const scope = collectMindmapBatchScope([
			{ id: MODULE_X, name: "一", op: "renameModule" },
			{ id: MODULE_X, op: "moveModule", parentId: null },
			{ id: MODULE_X, op: "removeModule" },
		]);
		expect(scope.moduleIds).toEqual([MODULE_X]);
	});
});
