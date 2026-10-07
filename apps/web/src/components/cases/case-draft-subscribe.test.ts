import { afterEach, describe, expect, it, vi } from "vitest";

import {
	HostileStorage,
	installStorage,
	uninstallStorage,
} from "@/components/cases/case-draft-fake-storage";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	listCaseDrafts,
	subscribeCaseDrafts,
	writeCaseDraft,
} from "@/components/cases/case-draft-storage";
import { emptyCaseFormValues } from "@/components/cases/case-meta";

const PROJECT = "p1";
const MODULE_A = "module-a";

function draftOf(caseId: string): Omit<CaseDraft, "savedAt"> {
	return {
		attachments: [],
		caseId,
		moduleId: MODULE_A,
		values: { ...emptyCaseFormValues(), name: caseId },
	};
}

function legacyKey(): string {
	return `automationstack.case-draft.${PROJECT}.${MODULE_A}`;
}

function seedLegacy(store: Storage, caseId: string): void {
	store.setItem(
		legacyKey(),
		JSON.stringify({
			attachments: [],
			caseId,
			savedAt: 100,
			values: { ...emptyCaseFormValues(), name: "老草稿" },
		})
	);
}

afterEach(uninstallStorage);

describe("subscribeCaseDrafts", () => {
	it("本标签页写入草稿时通知订阅者——侧栏那一行就是靠它从 0 变 1 的", () => {
		installStorage();
		const listener = vi.fn();
		const unsubscribe = subscribeCaseDrafts(listener);

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("删除草稿时同样通知：在一处删掉，别处开着的清单要跟着变", () => {
		installStorage();
		writeCaseDraft(PROJECT, draftOf("case-1"));
		const listener = vi.fn();
		const unsubscribe = subscribeCaseDrafts(listener);

		clearCaseDraft(PROJECT, "case-1");

		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("所有订阅者都收到，不是只通知最后一个", () => {
		installStorage();
		const first = vi.fn();
		const second = vi.fn();
		const stopFirst = subscribeCaseDrafts(first);
		const stopSecond = subscribeCaseDrafts(second);

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		stopFirst();
		stopSecond();
	});

	it("退订之后不再收到——组件卸载后还往里 setState 就是内存泄漏", () => {
		installStorage();
		const listener = vi.fn();
		const unsubscribe = subscribeCaseDrafts(listener);

		writeCaseDraft(PROJECT, draftOf("case-1"));
		unsubscribe();
		writeCaseDraft(PROJECT, draftOf("case-2"));
		clearCaseDraft(PROJECT, "case-1");

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("订阅者在回调里退订自己，同一轮排在它后面的照样收得到", () => {
		installStorage();
		let stopSelf: (() => void) | null = null;
		stopSelf = subscribeCaseDrafts(() => stopSelf?.());
		const other = vi.fn();
		const stopOther = subscribeCaseDrafts(other);

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(other).toHaveBeenCalledTimes(1);
		stopOther();
	});

	it("存储整个不可用（写抛异常）时不发通知：什么都没变，别让订阅者白扫一遍", () => {
		installStorage(new HostileStorage());
		const listener = vi.fn();
		const unsubscribe = subscribeCaseDrafts(listener);

		writeCaseDraft(PROJECT, draftOf("case-1"));
		clearCaseDraft(PROJECT, "case-1");

		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});
});

describe("老键迁移不自激", () => {
	it("listCaseDrafts 里的迁移写入一声不吭", () => {
		const store = installStorage();
		seedLegacy(store, "legacy-case");
		const listener = vi.fn();
		const unsubscribe = subscribeCaseDrafts(listener);

		const drafts = listCaseDrafts(PROJECT);

		expect(drafts).toHaveLength(1);
		expect(store.getItem(legacyKey())).toBeNull();
		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("订阅者回调里调 listCaseDrafts 触发迁移，也只转一圈就停", () => {
		const store = installStorage();
		seedLegacy(store, "legacy-case");
		const seen: number[] = [];
		const unsubscribe = subscribeCaseDrafts(() => {
			seen.push(listCaseDrafts(PROJECT).length);
		});

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(seen).toEqual([2]);
		expect(store.getItem(legacyKey())).toBeNull();
		unsubscribe();
	});
});
