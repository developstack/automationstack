import { describe, expect, it } from "vitest";

import { isCaseSectionPathname } from "@/components/layout/case-section-path";

const PROJECT_ID = "3f7c0b1e-8f5a-4a1d-9c2b-0d1e2f3a4b5c";
const projectRoot = `/projects/${PROJECT_ID}`;

describe("isCaseSectionPathname", () => {
	it.each([
		["认项目根路径本身：用例列表就落在这里", projectRoot, true],
		["认带尾斜杠的项目根路径：规范化前后是同一处", `${projectRoot}/`, true],
		["认脑图：它是同一批用例的另一种视图", `${projectRoot}/mindmap`, true],
		["不认概览", `${projectRoot}/overview`, false],
		["不认测试任务列表", `${projectRoot}/test-runs`, false],
		["不认测试任务详情", `${projectRoot}/test-runs/run-1`, false],
		["不认测试任务报告", `${projectRoot}/test-runs/run-1/report`, false],
		[
			"不认别的项目的根路径：换项目时高亮不能跟着串",
			"/projects/other-project",
			false,
		],
		["不认项目列表页", "/projects", false],
	])("%s", (_name, pathname, matches) => {
		expect(isCaseSectionPathname(pathname, PROJECT_ID)).toBe(matches);
	});
});
