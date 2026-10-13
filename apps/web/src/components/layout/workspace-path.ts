export type WorkspaceView =
	| "list"
	| "mindmap"
	| "overview"
	| "settings"
	| "testRuns"
	| "users";

const MINDMAP_PATH_SUFFIX = "/mindmap";
const OVERVIEW_PATH_SUFFIX = "/overview";
const TEST_RUNS_PATH_SEGMENT = "/test-runs";
const SETTINGS_PATH_SUFFIX = "/settings";
const USERS_PATH_SUFFIX = "/users";
const NESTED_TEST_RUN_PATH = /\/test-runs\/[^/]+/;

/* 页面标题和路径使用与侧栏导航相同的叫法。修改时，侧栏的文字也要一起修改。 */
export const WORKSPACE_VIEW_LABELS: Record<WorkspaceView, string> = {
	list: "用例管理",
	mindmap: "脑图",
	overview: "项目概览",
	settings: "设置",
	testRuns: "测试任务",
	users: "成员",
};

/** 实时协作也用这个值上报所在页面，所以测试任务的执行页和报告页都算 testRuns。 */
export function workspaceViewFor(pathname: string): WorkspaceView {
	if (pathname.endsWith(MINDMAP_PATH_SUFFIX)) {
		return "mindmap";
	}
	if (pathname.endsWith(OVERVIEW_PATH_SUFFIX)) {
		return "overview";
	}
	if (pathname.includes(TEST_RUNS_PATH_SEGMENT)) {
		return "testRuns";
	}
	if (pathname.endsWith(SETTINGS_PATH_SUFFIX)) {
		return "settings";
	}
	if (pathname.endsWith(USERS_PATH_SUFFIX)) {
		return "users";
	}
	return "list";
}

/** 执行页和报告页在测试任务列表之下，路径中的「测试任务」要链接回列表。 */
export function isNestedTestRunPath(pathname: string): boolean {
	return NESTED_TEST_RUN_PATH.test(pathname);
}
