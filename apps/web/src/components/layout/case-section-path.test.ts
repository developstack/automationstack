import { describe, expect, it } from "vitest";

import { isCaseSectionPathname } from "@/components/layout/case-section-path";

const PROJECT_ID = "3f7c0b1e-8f5a-4a1d-9c2b-0d1e2f3a4b5c";
const projectRoot = `/projects/${PROJECT_ID}`;

describe("isCaseSectionPathname", () => {
	it("认项目根路径本身：用例列表就落在这里", () => {
		expect(isCaseSectionPathname(projectRoot, PROJECT_ID)).toBe(true);
	});

	it("认带尾斜杠的项目根路径：规范化前后是同一处", () => {
		expect(isCaseSectionPathname(`${projectRoot}/`, PROJECT_ID)).toBe(true);
	});

	it("认脑图：它是同一批用例的另一种视图", () => {
		expect(isCaseSectionPathname(`${projectRoot}/mindmap`, PROJECT_ID)).toBe(
			true
		);
	});

	it("不认概览", () => {
		expect(isCaseSectionPathname(`${projectRoot}/overview`, PROJECT_ID)).toBe(
			false
		);
	});

	it("不认测试任务列表", () => {
		expect(isCaseSectionPathname(`${projectRoot}/test-runs`, PROJECT_ID)).toBe(
			false
		);
	});

	it("不认测试任务详情", () => {
		expect(
			isCaseSectionPathname(`${projectRoot}/test-runs/run-1`, PROJECT_ID)
		).toBe(false);
	});

	it("不认测试任务报告", () => {
		expect(
			isCaseSectionPathname(`${projectRoot}/test-runs/run-1/report`, PROJECT_ID)
		).toBe(false);
	});

	it("不认别的项目的根路径：换项目时高亮不能跟着串", () => {
		expect(isCaseSectionPathname("/projects/other-project", PROJECT_ID)).toBe(
			false
		);
	});

	it("不认项目列表页", () => {
		expect(isCaseSectionPathname("/projects", PROJECT_ID)).toBe(false);
	});
});
