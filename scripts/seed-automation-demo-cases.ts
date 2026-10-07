import type { SeedCaseSpec } from "../packages/db/src/repositories/seed-repository";

export const DEMO_PROJECT_NAME = "自动化上报演示";

export const DEMO_RUN_NAME_REGRESSION = "自动化演示 · v1.0 回归";
export const DEMO_RUN_NAME_SMOKE = "自动化演示 · 冒烟专项";

export const DEMO_SOURCE_REF_FAILING = "AUTO-CART-002";

export const DEMO_SOURCE_REF_MANUAL = "AUTO-REPORT-004";

export const DEMO_SOURCE_REF_OUT_OF_SCOPE = "AUTO-SEARCH-005";

function step(id: string, text: string, expected: string) {
	return { expected, id, step: text };
}

export const DEMO_CASES: SeedCaseSpec[] = [
	{
		caseType: "functional",
		maintainer: "自动化",
		name: "手机号验证码登录成功",
		preconditions: "已注册手机号，短信通道可用",
		priority: "P0",
		sourceRef: "AUTO-LOGIN-001",
		status: "active",
		steps: [
			step("s1", "输入手机号并获取验证码", "60s 倒计时开始"),
			step("s2", "输入正确验证码点击登录", "登录成功并跳转首页"),
		],
		tags: ["自动化", "登录"],
	},
	{
		caseType: "functional",
		maintainer: "自动化",
		name: "购物车合计金额随数量刷新",
		preconditions: "购物车内有 1 件有货商品",
		priority: "P0",
		sourceRef: DEMO_SOURCE_REF_FAILING,
		status: "active",
		steps: [
			step("s1", "把商品数量从 1 改成 3", "合计金额同步变成三倍"),
			step("s2", "刷新页面", "数量与合计保持不变"),
		],
		tags: ["自动化", "购物车"],
	},
	{
		caseType: "functional",
		maintainer: "自动化",
		name: "收银台切换支付方式",
		preconditions: "存在一笔待支付订单，且支付沙箱可用",
		priority: "P1",
		sourceRef: "AUTO-PAY-003",
		status: "active",
		steps: [
			step("s1", "打开收银台切换为余额支付", "应付金额与可用余额同步刷新"),
			step("s2", "确认支付", "订单状态变为「已支付」"),
		],
		tags: ["自动化", "支付"],
	},
	{
		caseType: "functional",
		maintainer: "人工",
		name: "订单报表导出为 Excel",
		preconditions: "存在至少一笔已完成订单",
		priority: "P2",
		sourceRef: DEMO_SOURCE_REF_MANUAL,
		status: "active",
		steps: [
			step("s1", "在报表页点击「导出」", "浏览器开始下载 xlsx"),
			step("s2", "用 Excel 打开下载的文件", "表头与行数与页面一致"),
		],
		tags: ["报表", "自动化"],
	},
	{
		caseType: "functional",
		maintainer: "自动化",
		name: "商品搜索关键词高亮",
		preconditions: "商品库里存在名称含「耳机」的商品",
		priority: "P3",
		sourceRef: DEMO_SOURCE_REF_OUT_OF_SCOPE,
		status: "active",
		steps: [step("s1", "搜索「耳机」", "结果列表里关键词高亮显示")],
		tags: ["搜索", "自动化"],
	},
];

export const REGRESSION_SOURCE_REFS = [
	"AUTO-LOGIN-001",
	DEMO_SOURCE_REF_FAILING,
	"AUTO-PAY-003",
	DEMO_SOURCE_REF_MANUAL,
];

export const SMOKE_SOURCE_REFS = ["AUTO-LOGIN-001", DEMO_SOURCE_REF_MANUAL];

export const DEMO_SPEC = {
	description: "自动化上报演示：examples/ 下三个示例共用的项目",
	modules: [{ cases: DEMO_CASES, path: ["自动化演示", "核心链路"] }],
	name: DEMO_PROJECT_NAME,
};
