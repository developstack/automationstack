import { afterEach, describe, expect, it } from "vitest";

import {
	FakeStorage,
	HostileStorage,
	installStorage,
	uninstallStorage,
} from "@/components/cases/case-draft-fake-storage";
import {
	type CaseDraft,
	parseCaseDraft,
} from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	listCaseDrafts,
	readCaseDraft,
	writeCaseDraft,
} from "@/components/cases/case-draft-storage";
import { emptyCaseFormValues } from "@/components/cases/case-meta";

const PROJECT = "p1";
const MODULE_A = "module-a";
const MODULE_B = "module-b";

function keyFor(caseId: string): string {
	return `automationstack.case-draft.${PROJECT}.${caseId}`;
}

function draftOf(patch: Partial<CaseDraft>): CaseDraft {
	return {
		attachments: [],
		caseId: "case-1",
		moduleId: MODULE_A,
		savedAt: 1,
		values: emptyCaseFormValues(),
		...patch,
	};
}

function byText(a: string, b: string): number {
	return a.localeCompare(b);
}

afterEach(uninstallStorage);

describe("listCaseDrafts", () => {
	it("同一个模块下的多份草稿全部列出来，互不覆盖", () => {
		const store = installStorage();
		writeCaseDraft(PROJECT, draftOf({ caseId: "a1" }));
		writeCaseDraft(PROJECT, draftOf({ caseId: "a2" }));

		const drafts = listCaseDrafts(PROJECT);

		expect(drafts).toHaveLength(2);
		expect(drafts.map((item) => item.caseId).sort(byText)).toEqual([
			"a1",
			"a2",
		]);
		expect(store.getItem(keyFor("a1"))).not.toBeNull();
		expect(store.getItem(keyFor("a2"))).not.toBeNull();
	});

	it("按写入时刻从新到旧排序", () => {
		const store = installStorage();
		store.setItem(
			keyFor("old"),
			JSON.stringify(draftOf({ caseId: "old", savedAt: 10 }))
		);
		store.setItem(
			keyFor("new"),
			JSON.stringify(draftOf({ caseId: "new", savedAt: 99 }))
		);

		expect(listCaseDrafts(PROJECT).map((item) => item.caseId)).toEqual([
			"new",
			"old",
		]);
	});

	it("只认本项目的前缀，别的项目/别的应用的键一概不碰", () => {
		const store = installStorage();
		writeCaseDraft(PROJECT, draftOf({ caseId: "mine" }));
		store.setItem(
			"automationstack.case-draft.other-project.x",
			JSON.stringify(draftOf({ caseId: "x" }))
		);
		store.setItem("unrelated-app-key", "whatever");

		expect(listCaseDrafts(PROJECT).map((item) => item.caseId)).toEqual([
			"mine",
		]);
	});

	it("坏 JSON、缺 caseId、空后缀的键都跳过，不影响其它草稿", () => {
		const store = installStorage();
		writeCaseDraft(PROJECT, draftOf({ caseId: "good" }));
		store.setItem(keyFor("broken"), "{not json");
		store.setItem(keyFor("no-id"), JSON.stringify({ values: {} }));
		store.setItem(`automationstack.case-draft.${PROJECT}.`, "{}");

		expect(listCaseDrafts(PROJECT).map((item) => item.caseId)).toEqual([
			"good",
		]);
	});

	it("localStorage 一碰就抛（Safari 隐私模式）时全线降级，不崩也不抛", () => {
		installStorage(new HostileStorage());

		expect(listCaseDrafts(PROJECT)).toEqual([]);
		expect(readCaseDraft(PROJECT, "a1")).toBeNull();
		expect(() => writeCaseDraft(PROJECT, draftOf({}))).not.toThrow();
		expect(() => clearCaseDraft(PROJECT, "a1")).not.toThrow();
	});
});

describe("readCaseDraft / writeCaseDraft / clearCaseDraft", () => {
	it("按 caseId 精确取回其中一份，另一份不受影响", () => {
		installStorage();
		writeCaseDraft(PROJECT, draftOf({ caseId: "a1" }));
		writeCaseDraft(
			PROJECT,
			draftOf({
				caseId: "a2",
				values: { ...emptyCaseFormValues(), name: "第二份" },
			})
		);

		expect(readCaseDraft(PROJECT, "a2")?.values.name).toBe("第二份");
		expect(readCaseDraft(PROJECT, "a1")?.values.name).toBe("");
	});

	it("删掉一份不会连累同模块的另一份", () => {
		installStorage();
		writeCaseDraft(PROJECT, draftOf({ caseId: "a1" }));
		writeCaseDraft(PROJECT, draftOf({ caseId: "a2" }));

		clearCaseDraft(PROJECT, "a1");

		expect(readCaseDraft(PROJECT, "a1")).toBeNull();
		expect(listCaseDrafts(PROJECT).map((item) => item.caseId)).toEqual(["a2"]);
	});

	it("从来没写过的 caseId 读回 null（用户看到的就是「草稿不在了」）", () => {
		installStorage();
		writeCaseDraft(PROJECT, draftOf({ caseId: "a1" }));

		expect(readCaseDraft(PROJECT, "never-existed")).toBeNull();
	});

	it("写入时盖上 savedAt，moduleId 落在 value 里而不是键里", () => {
		const store = installStorage(new FakeStorage());
		const before = Date.now();
		writeCaseDraft(PROJECT, draftOf({ caseId: "a1", moduleId: MODULE_B }));

		const stored = parseCaseDraft(store.getItem(keyFor("a1")));
		expect(stored?.moduleId).toBe(MODULE_B);
		expect(stored?.savedAt).toBeGreaterThanOrEqual(before);
	});

	it("没有 window（SSR 首帧）时读写都是空操作，不抛", () => {
		uninstallStorage();

		expect(() => writeCaseDraft(PROJECT, draftOf({}))).not.toThrow();
		expect(readCaseDraft(PROJECT, "case-1")).toBeNull();
		expect(listCaseDrafts(PROJECT)).toEqual([]);
	});
});
