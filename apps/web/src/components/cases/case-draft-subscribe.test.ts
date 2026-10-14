import { afterEach, describe, expect, it, vi } from "vitest";

import {
	caseDraftKey,
	HostileStorage,
	installStorage,
	seedLegacyCaseDraft,
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
const LEGACY_KEY = caseDraftKey(PROJECT, MODULE_A);

function draftOf(caseId: string): Omit<CaseDraft, "savedAt"> {
	return {
		attachments: [],
		caseId,
		moduleId: MODULE_A,
		values: { ...emptyCaseFormValues(), name: caseId },
	};
}

const unsubscribes: (() => void)[] = [];

function listen<T extends () => void>(listener: T): T {
	unsubscribes.push(subscribeCaseDrafts(listener));
	return listener;
}

afterEach(() => {
	for (const unsubscribe of unsubscribes.splice(0)) {
		unsubscribe();
	}
	uninstallStorage();
});

describe("subscribeCaseDrafts", () => {
	it("本标签页写入草稿时通知所有订阅者，不是只通知最后一个", () => {
		installStorage();
		const first = listen(vi.fn());
		const second = listen(vi.fn());

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("删除草稿时同样通知：在一处删掉，别处开着的清单要跟着变", () => {
		installStorage();
		writeCaseDraft(PROJECT, draftOf("case-1"));
		const listener = listen(vi.fn());

		clearCaseDraft(PROJECT, "case-1");

		expect(listener).toHaveBeenCalledTimes(1);
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
		const other = listen(vi.fn());

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(other).toHaveBeenCalledTimes(1);
	});

	it("存储整个不可用（写抛异常）时不发通知：什么都没变，别让订阅者白扫一遍", () => {
		installStorage(new HostileStorage());
		const listener = listen(vi.fn());

		writeCaseDraft(PROJECT, draftOf("case-1"));
		clearCaseDraft(PROJECT, "case-1");

		expect(listener).not.toHaveBeenCalled();
	});
});

describe("老键迁移不自激", () => {
	it("listCaseDrafts 里的迁移写入一声不吭", () => {
		const store = installStorage();
		seedLegacyCaseDraft(store, LEGACY_KEY, { caseId: "legacy-case" });
		const listener = listen(vi.fn());

		expect(listCaseDrafts(PROJECT)).toHaveLength(1);
		expect(store.getItem(LEGACY_KEY)).toBeNull();
		expect(listener).not.toHaveBeenCalled();
	});

	it("订阅者回调里调 listCaseDrafts 触发迁移，也只转一圈就停", () => {
		const store = installStorage();
		seedLegacyCaseDraft(store, LEGACY_KEY, { caseId: "legacy-case" });
		const seen: number[] = [];
		listen(() => {
			seen.push(listCaseDrafts(PROJECT).length);
		});

		writeCaseDraft(PROJECT, draftOf("case-1"));

		expect(seen).toEqual([2]);
		expect(store.getItem(LEGACY_KEY)).toBeNull();
	});
});
