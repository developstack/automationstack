import type { CaseStep, TestCase } from "@automationstack/db/schema/test-cases";
import { expect, it } from "vitest";

import {
	FULL_DEFAULT_PAGE_SIZE,
	FULL_MAX_PAGE_SIZE,
	resolveReadPageSize,
	shapeReadCases,
} from "./case-read-shape";

const sampleCase: TestCase = {
	caseType: "functional",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	currentVersion: 3,
	id: "11111111-1111-4111-8111-111111111111",
	lastModifiedBy: "qa-bot",
	maintainer: "qa-bot",
	moduleId: "22222222-2222-4222-8222-222222222222",
	name: "用户名 21 字符时提示长度超限",
	preconditions: "已打开注册页",
	priority: "P1",
	projectId: "33333333-3333-4333-8333-333333333333",
	sortOrder: 7,
	sourceRef: "gen:PROJ-1234#username-too-long",
	status: "draft",
	steps: [
		{
			actionScreenshots: ["55555555-5555-4555-8555-555555555555"],
			expected: "提示「用户名长度需为 4–20 个字符」",
			expectedScreenshots: ["66666666-6666-4666-8666-666666666666"],
			id: "s1",
			step: "输入 21 个字符",
		},
		// 迁移 0019 以前的数据：步骤带 screenshots 字段
		{
			expected: "注册成功",
			id: "s2",
			screenshots: ["44444444-4444-4444-8444-444444444444"],
			step: "输入 20 个字符",
		} as CaseStep,
	],
	tags: ["边界值"],
	updatedAt: new Date("2026-02-01T00:00:00Z"),
};

const listResult = { items: [sampleCase], page: 2, pageSize: 20, total: 41 };

// projectId、sortOrder、currentVersion 等项目内部的记账字段一律不出现
const SUMMARY_FIELDS = [
	"caseType",
	"id",
	"maintainer",
	"moduleId",
	"name",
	"priority",
	"sourceRef",
	"status",
	"tags",
	"updatedAt",
] as const;

it.each([
	["summary", undefined, undefined],
	["summary", 100, 100],
	// full detail defaults to a small page and is capped even when a larger page is requested
	["full", undefined, FULL_DEFAULT_PAGE_SIZE],
	["full", 100, FULL_MAX_PAGE_SIZE],
	["full", 5, 5],
] as const)(
	"resolveReadPageSize(%s, %s) → %s",
	(detail, requested, expected) => {
		expect(resolveReadPageSize(detail, requested)).toBe(expected);
	}
);

const pick = (fields: readonly (keyof TestCase)[]) =>
	Object.fromEntries(fields.map((field) => [field, sampleCase[field]]));

it.each([
	["summary", "drops case bodies", pick(SUMMARY_FIELDS)],
	[
		"full",
		"keeps case bodies with only id, step and expected in each step (no action or expected screenshots)",
		{
			...pick([...SUMMARY_FIELDS, "preconditions"]),
			steps: [
				{
					expected: "提示「用户名长度需为 4–20 个字符」",
					id: "s1",
					step: "输入 21 个字符",
				},
				{ expected: "注册成功", id: "s2", step: "输入 20 个字符" },
			],
		},
	],
] as const)(
	"shapeReadCases %s detail %s, never leaks bookkeeping fields, and carries pagination through",
	(detail, _what, expected) => {
		const page = shapeReadCases(listResult, detail);
		expect(page).toMatchObject({ detail, page: 2, pageSize: 20, total: 41 });
		expect(page.items).toEqual([expected]);
	}
);
