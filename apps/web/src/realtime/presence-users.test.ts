import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { describe, expect, it } from "vitest";

import { uniquePresenceUsers } from "@/realtime/presence-users";

function makeEntry(clientId: string, name: string): PresenceEntry {
	return {
		clientId,
		color: "#111111",
		editingCaseId: null,
		joinedAt: 1000,
		name,
		page: null,
		view: "list",
		viewingCaseId: null,
	};
}

const clientIdsOf = (entries: readonly PresenceEntry[]) =>
	entries.map((entry) => entry.clientId);

describe("uniquePresenceUsers：在线名单每个用户只留一项", () => {
	it("没有重复用户时返回原数组", () => {
		const entries = [
			makeEntry("c1", "alice"),
			makeEntry("c2", "bob"),
			makeEntry("c3", "carol"),
		];
		const result = uniquePresenceUsers(entries, "c2");
		expect(clientIdsOf(result)).toEqual(["c1", "c2", "c3"]);
		expect(result).toBe(entries);
	});

	it("同一个用户的多个标签页合成一项，保留第一次出现的位置", () => {
		const entries = [
			makeEntry("c1", "alice"),
			makeEntry("c2", "bob"),
			makeEntry("c3", "alice"),
			makeEntry("c4", "carol"),
			makeEntry("c5", "bob"),
		];
		expect(clientIdsOf(uniquePresenceUsers(entries, null))).toEqual([
			"c1",
			"c2",
			"c4",
		]);
	});

	it("自己的用户名保留自己这个标签页的那一项，位置仍是该用户第一次出现的位置", () => {
		const entries = [
			makeEntry("c1", "alice"),
			makeEntry("c2", "bob"),
			makeEntry("c3", "alice"),
		];
		const result = uniquePresenceUsers(entries, "c3");
		expect(clientIdsOf(result)).toEqual(["c3", "c2"]);
		expect(result[0]).toBe(entries[2]);
	});

	it("自己的标签页本来就是该用户的第一项时保留它", () => {
		const entries = [makeEntry("c1", "alice"), makeEntry("c2", "alice")];
		expect(clientIdsOf(uniquePresenceUsers(entries, "c1"))).toEqual(["c1"]);
	});

	it("selfClientId 是 null 时每个用户都保留第一项", () => {
		const entries = [makeEntry("c1", "alice"), makeEntry("c2", "alice")];
		expect(clientIdsOf(uniquePresenceUsers(entries, null))).toEqual(["c1"]);
	});

	it("空名单返回空数组", () => {
		expect(uniquePresenceUsers([], "c1")).toEqual([]);
	});
});
