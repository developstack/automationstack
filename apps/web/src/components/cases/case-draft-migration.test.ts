import { afterEach, describe, expect, it } from "vitest";

import {
	caseDraftKey,
	installStorage,
	seedLegacyCaseDraft,
	uninstallStorage,
} from "@/components/cases/case-draft-fake-storage";
import { parseCaseDraft } from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	listCaseDrafts,
	readCaseDraft,
} from "@/components/cases/case-draft-storage";

const PROJECT = "p1";
const MODULE_A = "module-a";
const MODULE_B = "module-b";

function keyFor(suffix: string): string {
	return caseDraftKey(PROJECT, suffix);
}

afterEach(uninstallStorage);

describe("老键迁移", () => {
	it("把 {projectId}.{moduleId} 搬到 {projectId}.{caseId}，内容与时间都不变", () => {
		const store = installStorage();
		seedLegacyCaseDraft(store, keyFor(MODULE_A), { caseId: "legacy-case" });

		expect(listCaseDrafts(PROJECT)).toMatchObject([
			{ moduleId: MODULE_A, savedAt: 100, values: { name: "老草稿" } },
		]);
		expect(store.getItem(keyFor(MODULE_A))).toBeNull();
		expect(parseCaseDraft(store.getItem(keyFor("legacy-case")))).toMatchObject({
			moduleId: MODULE_A,
			savedAt: 100,
		});
	});

	it("迁移之后能按 caseId 单独读回来、单独删掉", () => {
		const store = installStorage();
		seedLegacyCaseDraft(store, keyFor(MODULE_A), { caseId: "legacy-case" });
		listCaseDrafts(PROJECT);

		expect(readCaseDraft(PROJECT, "legacy-case")?.values.name).toBe("老草稿");
		clearCaseDraft(PROJECT, "legacy-case");
		expect(listCaseDrafts(PROJECT)).toEqual([]);
		expect(store.getItem(keyFor("legacy-case"))).toBeNull();
	});

	it("还没迁移过就直接按 caseId 读，也能找回来（readCaseDraft 自己兜底）", () => {
		const store = installStorage();
		seedLegacyCaseDraft(store, keyFor(MODULE_B), { caseId: "legacy-case" });

		expect(readCaseDraft(PROJECT, "legacy-case")).toMatchObject({
			moduleId: MODULE_B,
			values: { name: "老草稿" },
		});
		expect(store.getItem(keyFor("legacy-case"))).not.toBeNull();
	});

	it("多个模块各自的老草稿一次全部迁走，互不覆盖", () => {
		const store = installStorage();
		seedLegacyCaseDraft(store, keyFor(MODULE_A), {
			caseId: "legacy-a",
			savedAt: 10,
		});
		seedLegacyCaseDraft(store, keyFor(MODULE_B), {
			caseId: "legacy-b",
			savedAt: 20,
		});

		expect(listCaseDrafts(PROJECT)).toMatchObject([
			{ caseId: "legacy-b", moduleId: MODULE_B },
			{ caseId: "legacy-a", moduleId: MODULE_A },
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

		expect(listCaseDrafts(PROJECT)).toMatchObject([{ moduleId: "" }]);
	});
});

describe("parseCaseDraft", () => {
	it.each([
		[
			"缺 moduleId 不算坏数据，回落成空串等存储层补",
			{ attachments: [], caseId: "x", savedAt: 3 },
		],
		[
			"moduleId 不是字符串时同样回落成空串，绝不把它塞进导航",
			{ caseId: "x", moduleId: 42, savedAt: 3 },
		],
	])("%s", (_name, raw) => {
		expect(parseCaseDraft(JSON.stringify(raw))).toMatchObject({
			caseId: "x",
			moduleId: "",
		});
	});

	it("缺 caseId 直接判废：那批图的 object key 前缀全靠它", () => {
		expect(parseCaseDraft(JSON.stringify({ moduleId: MODULE_A }))).toBeNull();
	});
});
