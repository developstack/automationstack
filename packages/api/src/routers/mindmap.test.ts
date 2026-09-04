/**
 * 批量失败原因的中文化。
 *
 * 这张表的失效方式和别处不一样：漏一条不会抛异常也不会让 tsc 变红（新增的
 * 失败分支只是一个字符串），只会让用户在画布的 toast 上看到一个英文枚举，
 * 而那正是他唯一能拿到的解释。所以这里逐条钉死码 → 人话的对应，外加两条
 * 边界：已经是人话的原因原样透出，认不出来的码不许甩给用户。
 *
 * `vi.mock` 由 vitest 提升到 import 之前：被测的是纯函数，但它所在的
 * 路由文件顶层会 import db repository（`packages/db/src/index.ts` 一加载就
 * 读 DATABASE_URL）。api 这个 vitest project 的前提就是一行 db 都不加载，
 * 所以把那几条依赖整个换掉，只留下这份文件里的纯逻辑。
 */
import { describe, expect, it, vi } from "vitest";

// `vi.mock` 由 vitest 提升到所有 import 之前，所以下面这条静态 import 拿到的
// 已经是换过依赖的模块，一行 db 都不会被加载。
import { describeMindmapBatchReason } from "./mindmap";

vi.mock("@automationstack/db/repositories/mindmap-repository", () => ({
	listMindmapCaseNodes: vi.fn(),
	// 只有它在模块顶层被用到（拼进 zod schema 的 max 与限额文案）。
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
	// 路由对象在模块顶层就被建出来，这里只要让那条链能接下去。
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

/** 逐条来自 repository 的失败分支，见被测文件里的 `MindmapBatchReasonCode`。 */
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

describe("describeMindmapBatchReason：枚举码翻成人话", () => {
	it.each(TRANSLATIONS)("%s", (code, expected) => {
		expect(describeMindmapBatchReason(code)).toBe(expected);
	});

	it("翻出来的每一句都不含原始枚举码", () => {
		for (const [code, expected] of TRANSLATIONS) {
			expect(expected).not.toContain(code);
		}
	});
});

describe("describeMindmapBatchReason：已经是人话的原因原样透出", () => {
	it("删模块被引用挡住那句（describeModuleDeleteBlock 拼好的）不再翻一次", () => {
		// 点名了是哪个模块、被哪些用例挡住——这些结构化数据到不了 router，
		// 只能在 repository 那边拼成整句，所以这里必须原样放行。
		const blocked =
			"模块「登录」下有 2 条用例被 1 个测试任务引用，无法删除（登录成功、登录失败）；可先把这些用例改为「废弃」状态";

		expect(describeMindmapBatchReason(blocked)).toBe(blocked);
	});
});

describe("describeMindmapBatchReason：认不出来的码不甩给用户", () => {
	it("新增了失败分支却忘了补表时，给通用文案而不是英文枚举", () => {
		const message = describeMindmapBatchReason("some-new-branch");

		expect(message).not.toContain("some-new-branch");
		expect(message).toBe("该操作被服务端拒绝");
	});
});
