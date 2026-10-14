import { describe, expect, it } from "vitest";

import type { Module } from "../schema/modules";
import {
	type BlockedCaseRef,
	checkModuleDeleteBlock,
	describeModuleDeleteBlock,
	type ModuleDeleteBlocked,
} from "./module-delete-guard";
import type { DbTransaction } from "./repository-types";

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const GRANDCHILD_ID = "33333333-3333-4333-8333-333333333333";

const ROOT_MODULE: Module = {
	createdAt: new Date(0),
	id: ROOT_ID,
	name: "登录",
	parentId: null,
	projectId: "99999999-9999-4999-8999-999999999999",
	sortOrder: 0,
	updatedAt: new Date(0),
};

interface TotalsRow {
	caseCount: number;
	runCount: number;
}

interface FakeChain {
	from: () => FakeChain;
	groupBy: () => FakeChain;
	innerJoin: () => FakeChain;
	limit: () => FakeChain;
	orderBy: () => FakeChain;
	then: (resolve: (value: unknown) => unknown) => unknown;
	where: (condition: unknown) => FakeChain;
}

interface FakeTxOptions {
	sample?: BlockedCaseRef[];
	subtreeIds: string[];
	totals?: TotalsRow[];
}

function createFakeTx(options: FakeTxOptions) {
	const whereConditions: unknown[] = [];
	let selectCount = 0;
	const makeChain = (rows: unknown[]): FakeChain => {
		const chain: FakeChain = {
			from: () => chain,
			groupBy: () => chain,
			innerJoin: () => chain,
			limit: () => chain,
			orderBy: () => chain,
			// biome-ignore lint/suspicious/noThenProperty: drizzle 的查询构造器就是 thenable，假货必须能被 await
			then: (resolve) => resolve(rows),
			where: (condition) => {
				whereConditions.push(condition);
				return chain;
			},
		};
		return chain;
	};
	const tx = {
		execute: () =>
			Promise.resolve({ rows: options.subtreeIds.map((id) => ({ id })) }),
		select: () => {
			selectCount += 1;
			return makeChain(
				selectCount === 1 ? (options.totals ?? []) : (options.sample ?? [])
			);
		},
	};
	return { tx: tx as unknown as DbTransaction, whereConditions };
}

function collectStrings(
	value: unknown,
	seen: WeakSet<object>,
	found: string[]
): void {
	if (typeof value === "string") {
		found.push(value);
		return;
	}
	if (typeof value !== "object" || value === null || seen.has(value)) {
		return;
	}
	seen.add(value);
	for (const item of Object.values(value)) {
		collectStrings(item, seen, found);
	}
}

function conditionStrings(condition: unknown): string[] {
	const found: string[] = [];
	collectStrings(condition, new WeakSet(), found);
	return found;
}

describe("checkModuleDeleteBlock", () => {
	it("lets the delete through when nothing in the subtree is referenced", async () => {
		const { tx } = createFakeTx({
			subtreeIds: [ROOT_ID, CHILD_ID],
			totals: [{ caseCount: 0, runCount: 0 }],
		});
		expect(await checkModuleDeleteBlock(tx, ROOT_MODULE)).toBeNull();
	});

	it("returns a structured block carrying counts, the module and named cases", async () => {
		const sample = [
			{ id: "case-a", name: "登录成功" },
			{ id: "case-b", name: "登录失败" },
		];
		const { tx } = createFakeTx({
			sample,
			subtreeIds: [ROOT_ID, CHILD_ID],
			totals: [{ caseCount: 5, runCount: 2 }],
		});
		expect(await checkModuleDeleteBlock(tx, ROOT_MODULE)).toEqual(
			blockedFixture({ blockedCases: sample, referencedCaseCount: 5 })
		);
	});

	it("filters by every id in the subtree, not just the module itself", async () => {
		const { tx, whereConditions } = createFakeTx({
			subtreeIds: [ROOT_ID, CHILD_ID, GRANDCHILD_ID],
			totals: [{ caseCount: 0, runCount: 0 }],
		});
		await checkModuleDeleteBlock(tx, ROOT_MODULE);
		expect(conditionStrings(whereConditions[0])).toEqual(
			expect.arrayContaining([ROOT_ID, CHILD_ID, GRANDCHILD_ID])
		);
	});

	it("skips the reference query when the subtree came back empty", async () => {
		const { tx, whereConditions } = createFakeTx({ subtreeIds: [] });
		expect(await checkModuleDeleteBlock(tx, ROOT_MODULE)).toBeNull();
		expect(whereConditions).toHaveLength(0);
	});
});

function blockedFixture(
	overrides: Partial<ModuleDeleteBlocked>
): ModuleDeleteBlocked {
	return {
		blockedCases: [{ id: "case-a", name: "登录成功" }],
		kind: "blocked",
		module: ROOT_MODULE,
		referencedByRunCount: 2,
		referencedCaseCount: 1,
		...overrides,
	};
}

describe("describeModuleDeleteBlock", () => {
	it("names the module, both counts and the blocking cases", () => {
		const message = describeModuleDeleteBlock(
			blockedFixture({
				blockedCases: [
					{ id: "case-a", name: "登录成功" },
					{ id: "case-b", name: "登录失败" },
				],
				referencedCaseCount: 2,
			})
		);
		expect(message).toBe(
			"模块「登录」下有 2 条用例被 2 个测试任务引用，无法删除（登录成功、登录失败）；可先把这些用例改为「废弃」状态"
		);
	});

	it("marks the sample as partial when more cases are blocking", () => {
		const message = describeModuleDeleteBlock(
			blockedFixture({ referencedCaseCount: 9 })
		);
		expect(message).toContain("（登录成功等）");
		expect(message).toContain("9 条用例");
	});

	it("omits the parenthesised sample when no case names are available", () => {
		const message = describeModuleDeleteBlock(
			blockedFixture({ blockedCases: [] })
		);
		expect(message).not.toContain("（");
		expect(message).toContain("无法删除；");
	});
});
