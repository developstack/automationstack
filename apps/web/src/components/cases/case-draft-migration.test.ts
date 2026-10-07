import { afterEach, describe, expect, it } from "vitest";

import {
	installStorage,
	uninstallStorage,
} from "@/components/cases/case-draft-fake-storage";
import { parseCaseDraft } from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	listCaseDrafts,
	readCaseDraft,
} from "@/components/cases/case-draft-storage";
import { emptyCaseFormValues } from "@/components/cases/case-meta";

const PROJECT = "p1";
const MODULE_A = "module-a";
const MODULE_B = "module-b";

function keyFor(caseId: string): string {
	return `automationstack.case-draft.${PROJECT}.${caseId}`;
}

function seedLegacy(
	store: Storage,
	moduleId: string,
	caseId: string,
	patch: Record<string, unknown> = {}
): void {
	store.setItem(
		`automationstack.case-draft.${PROJECT}.${moduleId}`,
		JSON.stringify({
			attachments: [],
			caseId,
			savedAt: 100,
			values: { ...emptyCaseFormValues(), name: "老草稿" },
			...patch,
		})
	);
}

function byText(a: string, b: string): number {
	return a.localeCompare(b);
}

afterEach(uninstallStorage);

describe("老键迁移", () => {
	it("把 {projectId}.{moduleId} 搬到 {projectId}.{caseId}，内容与时间都不变", () => {
		const store = installStorage();
		seedLegacy(store, MODULE_A, "legacy-case");

		const drafts = listCaseDrafts(PROJECT);

		expect(drafts).toHaveLength(1);
		expect(drafts[0].moduleId).toBe(MODULE_A);
		expect(drafts[0].values.name).toBe("老草稿");
		expect(drafts[0].savedAt).toBe(100);
		expect(
			store.getItem(`automationstack.case-draft.${PROJECT}.${MODULE_A}`)
		).toBeNull();
		const migrated = parseCaseDraft(store.getItem(keyFor("legacy-case")));
		expect(migrated?.moduleId).toBe(MODULE_A);
		expect(migrated?.savedAt).toBe(100);
	});

	it("迁移之后能按 caseId 单独读回来、单独删掉", () => {
		const store = installStorage();
		seedLegacy(store, MODULE_A, "legacy-case");
		listCaseDrafts(PROJECT);

		expect(readCaseDraft(PROJECT, "legacy-case")?.values.name).toBe("老草稿");
		clearCaseDraft(PROJECT, "legacy-case");
		expect(listCaseDrafts(PROJECT)).toEqual([]);
		expect(store.getItem(keyFor("legacy-case"))).toBeNull();
	});

	it("还没迁移过就直接按 caseId 读，也能找回来（readCaseDraft 自己兜底）", () => {
		const store = installStorage();
		seedLegacy(store, MODULE_B, "legacy-case");

		const found = readCaseDraft(PROJECT, "legacy-case");

		expect(found?.moduleId).toBe(MODULE_B);
		expect(found?.values.name).toBe("老草稿");
		expect(store.getItem(keyFor("legacy-case"))).not.toBeNull();
	});

	it("多个模块各自的老草稿一次全部迁走，互不覆盖", () => {
		const store = installStorage();
		seedLegacy(store, MODULE_A, "legacy-a", { savedAt: 10 });
		seedLegacy(store, MODULE_B, "legacy-b", { savedAt: 20 });

		const drafts = listCaseDrafts(PROJECT);

		expect(drafts.map((item) => item.caseId)).toEqual(["legacy-b", "legacy-a"]);
		expect(drafts.map((item) => item.moduleId).sort(byText)).toEqual([
			MODULE_A,
			MODULE_B,
		]);
		expect(store.getItem(keyFor("legacy-a"))).not.toBeNull();
		expect(store.getItem(keyFor("legacy-b"))).not.toBeNull();
	});

	it("键后缀恰好等于 caseId 却缺 moduleId：不瞎猜，留成孤儿只让删", () => {
		const store = installStorage();
		store.setItem(
			keyFor("orphan"),
			JSON.stringify({ attachments: [], caseId: "orphan", savedAt: 5 })
		);

		const drafts = listCaseDrafts(PROJECT);

		expect(drafts).toHaveLength(1);
		expect(drafts[0].moduleId).toBe("");
	});
});

describe("parseCaseDraft", () => {
	it("缺 moduleId 不算坏数据，回落成空串等存储层补", () => {
		const parsed = parseCaseDraft(
			JSON.stringify({ attachments: [], caseId: "x", savedAt: 3 })
		);

		expect(parsed?.moduleId).toBe("");
		expect(parsed?.caseId).toBe("x");
	});

	it("moduleId 不是字符串时同样回落成空串，绝不把它塞进导航", () => {
		const parsed = parseCaseDraft(
			JSON.stringify({ caseId: "x", moduleId: 42, savedAt: 3 })
		);

		expect(parsed?.moduleId).toBe("");
	});

	it("缺 caseId 直接判废：那批图的 object key 前缀全靠它", () => {
		expect(parseCaseDraft(JSON.stringify({ moduleId: MODULE_A }))).toBeNull();
	});
});
