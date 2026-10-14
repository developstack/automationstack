import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { expect, test } from "vitest";

import { EMPTY_PRESENCE, PresenceStore } from "@/realtime/presence-store";

function makeEntry(
	clientId: string,
	overrides: Partial<PresenceEntry> = {}
): PresenceEntry {
	return {
		clientId,
		color: "#111111",
		editingCaseId: null,
		joinedAt: 1000,
		name: `name-${clientId}`,
		page: null,
		view: "list",
		viewingCaseId: null,
		...overrides,
	};
}

/** 新建一个计数通知次数的 store；给了 entries 时先同步一次，first 是同步后的快照。 */
function withStore(entries?: PresenceEntry[]) {
	const store = new PresenceStore();
	let count = 0;
	store.subscribe(() => {
		count += 1;
	});
	if (entries) {
		store.apply({ entries, type: "presence:sync" });
	}
	return { calls: () => count, first: store.getSnapshot(), store };
}

function idsOf(store: PresenceStore): string[] {
	return store.getSnapshot().map((entry) => entry.clientId);
}

const JOINED_LATER = makeEntry("b", { joinedAt: 2000 });

test("内容完全相同的两次 commit 保留旧引用且不通知", () => {
	const { calls, first, store } = withStore([makeEntry("a")]);
	expect(calls()).toBe(1);

	store.apply({ entries: [makeEntry("a")], type: "presence:sync" });

	expect(store.getSnapshot()).toBe(first);
	expect(calls()).toBe(1);
});

test("presence:update 内容没变时不通知", () => {
	const { calls, first, store } = withStore([makeEntry("a")]);

	store.apply({ entry: makeEntry("a"), type: "presence:update" });

	expect(store.getSnapshot()).toBe(first);
	expect(calls()).toBe(1);
});

test("空快照之间不产生新引用", () => {
	const { calls, store } = withStore();
	expect(store.getSnapshot()).toBe(EMPTY_PRESENCE);

	store.apply({ clientId: "ghost", type: "presence:leave" });

	expect(store.getSnapshot()).toBe(EMPTY_PRESENCE);
	expect(calls()).toBe(0);
});

const CHANGED_FIELDS: [string, Partial<PresenceEntry>][] = [
	["color", { color: "#222222" }],
	["editingCaseId", { editingCaseId: "case-1" }],
	["joinedAt", { joinedAt: 2000 }],
	["name", { name: "renamed" }],
	["page", { page: "/cases" }],
	["view", { view: "mindmap" }],
	["viewingCaseId", { viewingCaseId: "case-1" }],
];

for (const [field, overrides] of CHANGED_FIELDS) {
	test(`entry 的 ${field} 变化会换引用并通知`, () => {
		const { calls, first, store } = withStore([makeEntry("a")]);

		store.apply({
			entry: makeEntry("a", overrides),
			type: "presence:update",
		});

		expect(store.getSnapshot()).not.toBe(first);
		expect(calls()).toBe(2);
	});
}

test("有人加入会换引用并通知", () => {
	const { calls, first, store } = withStore([makeEntry("a")]);

	store.apply({ entry: JOINED_LATER, type: "presence:join" });

	expect(store.getSnapshot()).not.toBe(first);
	expect(store.getSnapshot()).toHaveLength(2);
	expect(calls()).toBe(2);
});

test("有人离开会换引用并通知", () => {
	const { calls, first, store } = withStore([makeEntry("a"), JOINED_LATER]);

	store.apply({ clientId: "b", type: "presence:leave" });

	expect(store.getSnapshot()).not.toBe(first);
	expect(idsOf(store)).toEqual(["a"]);
	expect(calls()).toBe(2);
});

test("clear 清空后换引用并通知，重复 clear 静默", () => {
	const { calls, store } = withStore([makeEntry("a")]);

	store.clear();
	expect(store.getSnapshot()).toEqual([]);
	expect(calls()).toBe(2);

	store.clear();
	expect(calls()).toBe(2);
});

test("joinedAt 相同的 entry 多次 commit 顺序不抖", () => {
	const store = new PresenceStore();
	const tied = [
		makeEntry("c-charlie", { joinedAt: 1000 }),
		makeEntry("a-alice", { joinedAt: 1000 }),
		makeEntry("b-bob", { joinedAt: 1000 }),
	];
	store.apply({ entries: tied, type: "presence:sync" });
	expect(idsOf(store)).toEqual(["a-alice", "b-bob", "c-charlie"]);

	const first = store.getSnapshot();
	store.apply({ entries: [...tied].reverse(), type: "presence:sync" });

	expect(store.getSnapshot()).toBe(first);
});

test("joinedAt 决定主序，不受到达顺序影响", () => {
	const store = new PresenceStore();
	store.apply({
		entries: [
			makeEntry("late", { joinedAt: 3000 }),
			makeEntry("early", { joinedAt: 1000 }),
		],
		type: "presence:sync",
	});

	expect(idsOf(store)).toEqual(["early", "late"]);
});

test("setSelf 首次设置会注入自己并通知", () => {
	const { calls, store } = withStore();

	store.setSelf(makeEntry("me"));

	expect(idsOf(store)).toEqual(["me"]);
	expect(calls()).toBe(1);
});

test("setSelf 字段变化会换引用并通知，joinedAt 保持不变", () => {
	const { calls, store } = withStore();
	store.setSelf(makeEntry("me", { joinedAt: 1000 }));
	const first = store.getSnapshot();

	store.setSelf(makeEntry("me", { joinedAt: 9999, name: "new", view: "map" }));

	const [self] = store.getSnapshot();
	expect(store.getSnapshot()).not.toBe(first);
	expect(self?.joinedAt).toBe(1000);
	expect(self?.name).toBe("new");
	expect(self?.view).toBe("map");
	expect(calls()).toBe(2);
});

test("setSelf 传入等价 entry 不通知", () => {
	const { calls, store } = withStore();
	store.setSelf(makeEntry("me"));
	const first = store.getSnapshot();

	store.setSelf(makeEntry("me"));

	expect(store.getSnapshot()).toBe(first);
	expect(calls()).toBe(1);
});

test("setSelf 置空会移除自己并通知", () => {
	const { calls, store } = withStore();
	store.setSelf(makeEntry("me"));
	const first = store.getSnapshot();

	store.setSelf(null);

	expect(store.getSnapshot()).not.toBe(first);
	expect(store.getSnapshot()).toEqual([]);
	expect(calls()).toBe(2);
});

test("服务端已回发自己后 setSelf(null) 不改变可见结果，因此不通知", () => {
	const { calls, store } = withStore();
	store.setSelf(makeEntry("me"));
	store.apply({ entry: makeEntry("me"), type: "presence:update" });
	const first = store.getSnapshot();

	store.setSelf(null);

	expect(store.getSnapshot()).toBe(first);
	expect(idsOf(store)).toEqual(["me"]);
	expect(calls()).toBe(1);
});

test("setSelf 换 clientId 会替换自己并通知", () => {
	const { calls, store } = withStore();
	store.setSelf(makeEntry("me-old", { joinedAt: 1000 }));

	store.setSelf(makeEntry("me-new", { joinedAt: 5000 }));

	const [self] = store.getSnapshot();
	expect(idsOf(store)).toEqual(["me-new"]);
	expect(self?.joinedAt).toBe(5000);
	expect(calls()).toBe(2);
});

test("服务端版本优先于 setSelf 注入的本端身份", () => {
	const store = new PresenceStore();
	store.setSelf(makeEntry("me", { view: "list" }));
	store.apply({
		entries: [makeEntry("me", { view: "mindmap" })],
		type: "presence:sync",
	});

	expect(store.getSnapshot()[0]?.view).toBe("mindmap");
});

test("listener 在回调里退订自己不影响后续 listener", () => {
	const store = new PresenceStore();
	const seen: string[] = [];
	const unsubscribeFirst = store.subscribe(() => {
		seen.push("first");
		unsubscribeFirst();
	});
	store.subscribe(() => {
		seen.push("second");
	});

	store.apply({ entries: [makeEntry("a")], type: "presence:sync" });
	store.apply({ entry: JOINED_LATER, type: "presence:join" });

	expect(seen).toEqual(["first", "second", "second"]);
});
