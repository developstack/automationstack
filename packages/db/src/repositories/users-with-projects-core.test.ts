import { describe, expect, it } from "vitest";

import type { PublicUser } from "../schema/users";
import {
	groupUsersWithProjects,
	type UserProjectRow,
} from "./users-with-projects-core";

const makeUser = (id: string, username: string): PublicUser => ({
	createdAt: new Date("2026-01-01T00:00:00Z"),
	disabledAt: null,
	hasPassword: true,
	id,
	mustChangePassword: false,
	role: "member",
	username,
});

const alice = makeUser("u-1", "alice");
const bob = makeUser("u-2", "bob");
const carol = makeUser("u-3", "carol");

const rowWithProject = (
	user: PublicUser,
	projectId: string,
	projectName: string
): UserProjectRow => ({ projectId, projectName, user });

const rowWithoutProject = (user: PublicUser): UserProjectRow => ({
	projectId: null,
	projectName: null,
	user,
});

describe("groupUsersWithProjects", () => {
	it("多项目的人并成一行，项目顺序照抄输入", () => {
		const rows = [
			rowWithProject(alice, "p-1", "Apollo"),
			rowWithProject(alice, "p-2", "Borealis"),
			rowWithProject(alice, "p-3", "Cygnus"),
		];

		const result = groupUsersWithProjects(rows);

		expect(result).toHaveLength(1);
		expect(result[0]?.user).toBe(alice);
		expect(result[0]?.projects.map((project) => project.name)).toEqual([
			"Apollo",
			"Borealis",
			"Cygnus",
		]);
	});

	it("一个项目都没有的人也在结果里，projects 是空数组而不是缺席", () => {
		const result = groupUsersWithProjects([rowWithoutProject(bob)]);

		expect(result).toHaveLength(1);
		expect(result[0]?.user.username).toBe("bob");
		expect(result[0]?.projects).toEqual([]);
	});

	it("每个成员关系给出项目的 id 和名称", () => {
		const result = groupUsersWithProjects([
			rowWithProject(alice, "p-1", "Apollo"),
			rowWithProject(alice, "p-2", "Borealis"),
		]);

		expect(result[0]?.projects).toEqual([
			{ id: "p-1", name: "Apollo" },
			{ id: "p-2", name: "Borealis" },
		]);
	});

	it("用户顺序按首次出现，零项目的人不会被挤到末尾", () => {
		const rows = [
			rowWithProject(alice, "p-1", "Apollo"),
			rowWithoutProject(bob),
			rowWithProject(carol, "p-1", "Apollo"),
			rowWithProject(alice, "p-2", "Borealis"),
		];

		const result = groupUsersWithProjects(rows);

		expect(result.map((entry) => entry.user.username)).toEqual([
			"alice",
			"bob",
			"carol",
		]);
		expect(result.map((entry) => entry.projects.length)).toEqual([2, 0, 1]);
	});

	it("空输入返回空数组", () => {
		expect(groupUsersWithProjects([])).toEqual([]);
	});
});
