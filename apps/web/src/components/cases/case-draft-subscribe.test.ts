/**
 * 草稿存储层的单测之三：**同标签页内的变更通知**。
 *
 * 这是修「有草稿不会自动更新页面，要刷新才会出现」那个 bug 的机制：`storage`
 * 事件只在别的标签页写入时触发，写入它的那个标签页自己收不到，所以写入方必须
 * 自己说一声。写错不会报错，只会让侧栏那一行又悄悄退回「必须刷新整页」。
 *
 * 另一半盯的是自激：订阅者的回调就是回头去调 `listCaseDrafts`，而
 * `listCaseDrafts` 里的老键迁移**也会写 localStorage**。迁移那条路要是也发通知，
 * 就成了「读 → 迁 → 通知 → 再读」。这里把「迁移一声不吭」逐条钉死。
 *
 * 键的算法与迁移本身在 `case-draft-storage.test.ts` / `case-draft-migration.test.ts`
 * （单文件 300 行上限）。
 */
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

/** 老格式的键：后缀是 moduleId 而不是 caseId。 */
function legacyKey(): string {
	return `automationstack.case-draft.${PROJECT}.${MODULE_A}`;
}

/** 老格式：键的后缀是 moduleId，value 里没有 moduleId 字段。 */
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
		// 先订阅、并且在回调里就把自己摘掉：通知过程中订阅表被就地改了。
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

		// 这一趟实实在在写了 localStorage（老键搬到新键），但那是同一份草稿
		// 换个地方存，清单内容一个字没变，不该惊动任何人。
		const drafts = listCaseDrafts(PROJECT);

		expect(drafts).toHaveLength(1);
		expect(store.getItem(legacyKey())).toBeNull();
		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("订阅者回调里调 listCaseDrafts 触发迁移，也只转一圈就停", () => {
		const store = installStorage();
		seedLegacy(store, "legacy-case");
		// 复刻 useLocalCaseDrafts 的真实回调：收到通知就整份重读，
		// 而重读顺手就把老键迁了。迁移要是也发通知，这里会再被叫一次。
		const seen: number[] = [];
		const unsubscribe = subscribeCaseDrafts(() => {
			seen.push(listCaseDrafts(PROJECT).length);
		});

		writeCaseDraft(PROJECT, draftOf("case-1"));

		// 恰好一次：迁移不发通知，所以没有第二圈。这个数字要是变成 2，
		// 说明迁移那条路又开始发通知了（幂等保证它最终会停，但白转一圈）。
		expect(seen).toEqual([2]);
		expect(store.getItem(legacyKey())).toBeNull();
		unsubscribe();
	});
});
