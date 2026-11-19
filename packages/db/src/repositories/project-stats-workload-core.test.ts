import { describe, expect, it } from "vitest";

import {
	type ActorCountRow,
	buildWorkload,
	type WorkloadMemberRow,
} from "./project-stats-workload-core";

function member(
	username: string,
	overrides: Partial<WorkloadMemberRow> = {}
): WorkloadMemberRow {
	return { disabled: false, userId: `u-${username}`, username, ...overrides };
}

function counts(
	username: string,
	last7Days: number,
	last30Days: number
): ActorCountRow {
	return { actorId: `u-${username}`, last7Days, last30Days, username };
}

describe("buildWorkload", () => {
	it("lists every active member sorted by name, with 0 for members without work", () => {
		const stats = buildWorkload({
			created: [counts("bob", 0, 4)],
			executed: [counts("carol", 2, 9), counts("bob", 1, 3)],
			members: [member("carol"), member("alice"), member("bob")],
		});
		expect(stats.members).toEqual([
			{
				last7Days: { created: 0, executed: 0 },
				last30Days: { created: 0, executed: 0 },
				userId: "u-alice",
				username: "alice",
			},
			{
				last7Days: { created: 0, executed: 1 },
				last30Days: { created: 4, executed: 3 },
				userId: "u-bob",
				username: "bob",
			},
			{
				last7Days: { created: 0, executed: 2 },
				last30Days: { created: 0, executed: 9 },
				userId: "u-carol",
				username: "carol",
			},
		]);
	});

	it.each([
		{
			expected: ["dave"],
			name: "a user who left the project but has work is listed",
			rows: { created: [counts("dave", 0, 1)], members: [] },
		},
		{
			expected: [],
			name: "a disabled member without work is not listed",
			rows: { created: [], members: [member("erin", { disabled: true })] },
		},
		{
			expected: ["erin"],
			name: "a disabled member with work is listed",
			rows: {
				created: [counts("erin", 1, 1)],
				members: [member("erin", { disabled: true })],
			},
		},
	])("$name", ({ expected, rows }) => {
		const stats = buildWorkload({ executed: [], ...rows });
		expect(stats.members.map((item) => item.username)).toEqual(expected);
	});
});
