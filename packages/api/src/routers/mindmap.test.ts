import { describe, expect, it, vi } from "vitest";

import { describeMindmapBatchReason } from "./mindmap";

vi.mock("@automationstack/db/repositories/mindmap-repository", () => ({
	listMindmapCaseNodes: vi.fn(),
	MINDMAP_BATCH_LIMIT: 100,
	runMindmapBatch: vi.fn(),
}));
vi.mock("@automationstack/db/repositories/modules-repository", () => ({
	listModulesByProject: vi.fn(),
}));
vi.mock("../index", () => {
	interface Chainable {
		errors: () => Chainable;
		handler: () => Chainable;
		input: () => Chainable;
		use: () => Chainable;
	}
	const chainable: Chainable = {
		errors: () => chainable,
		handler: () => chainable,
		input: () => chainable,
		use: () => chainable,
	};
	return { protectedProcedure: chainable, requireProjectMember: chainable };
});
vi.mock("../lib/mindmap-invalidate", () => ({
	publishMindmapInvalidations: vi.fn(),
}));
vi.mock("../lib/mindmap-scope", () => ({ scopeMindmapTree: vi.fn() }));
vi.mock("../lib/project-scope", () => ({ requireMindmapBatchMember: vi.fn() }));

const TRANSLATIONS: [string, string][] = [
	["batch-limit-exceeded", "一次最多提交 100 个操作，请分批保存"],
	["blocked", "该用例被测试任务引用，无法删除；可改为「废弃」状态"],
	["conflict", "该用例已被他人修改，请刷新后重试"],
	["cycle", "不能把模块移动到它自己的子模块下"],
	["duplicate-id", "该节点已经存在，无需重复创建"],
	["invalid-module", "目标模块不存在或不属于该项目"],
	["invalid-parent", "目标父模块不存在或不属于该项目"],
	["not-found", "目标节点已不存在，可能已被他人删除"],
];

describe("describeMindmapBatchReason", () => {
	it.each(TRANSLATIONS)(
		"枚举码 %s 翻成人话，且不含原始枚举码",
		(code, expected) => {
			expect(describeMindmapBatchReason(code)).toBe(expected);
			expect(expected).not.toContain(code);
		}
	);

	it("已经是人话的原因原样透出：删模块被引用挡住那句（describeModuleDeleteBlock 拼好的）不再翻一次", () => {
		const blocked =
			"模块「登录」下有 2 条用例被 1 个测试任务引用，无法删除（登录成功、登录失败）；可先把这些用例改为「废弃」状态";
		expect(describeMindmapBatchReason(blocked)).toBe(blocked);
	});

	it("认不出来的码不甩给用户：新增了失败分支却忘了补表时，给通用文案而不是英文枚举", () => {
		const message = describeMindmapBatchReason("some-new-branch");
		expect(message).not.toContain("some-new-branch");
		expect(message).toBe("该操作被服务端拒绝");
	});
});
