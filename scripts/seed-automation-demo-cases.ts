/**
 * `seed-automation-demo.ts` 的**数据部分**：演示项目的用例清单与两个测试任务的范围。
 *
 * 与编排分开，理由和 `seed-bulk-cases.ts` 一样——这一份是「要造出什么」，
 * 那一份是「怎么造」。混在一起时，想确认 `examples/nodejs` 报的每条 sourceRef
 * 有没有被覆盖，得先跳过一百多行事务编排。
 *
 * ⚠️ **这里的 sourceRef 与 `examples/nodejs/tests/*.test.js` 的用例标题一一对应。**
 * 改了一边必须改另一边：改错的表现不是报错，而是对账单上凭空多一条「未匹配」，
 * 而那正是示例要用来演示「拼错 sourceRef」的东西，看起来和演示效果一模一样。
 */

import type { SeedCaseSpec } from "../packages/db/src/repositories/seed-repository";

export const DEMO_PROJECT_NAME = "自动化上报演示";

/**
 * 两个未提交任务，不是一个。
 *
 * §7.2 第 3 条要的是「`writtenTo` 按任务逐行打」，而这正是 D34 的落点：
 * 一次上报会扩散到几个任务，是上报方最该看见、也最容易被吞掉的事实。
 * 只造一个任务时对账单永远只有一行，那一行既证明不了分组，也演示不了扩散。
 */
export const DEMO_RUN_NAME_REGRESSION = "自动化演示 · v1.0 回归";
export const DEMO_RUN_NAME_SMOKE = "自动化演示 · 冒烟专项";

/** 示例里带截图与日志附件的那条——失败用例才有附件（§5.6）。 */
export const DEMO_SOURCE_REF_FAILING = "AUTO-CART-002";

/**
 * 已有**人工结论**的那条：种子会给它在回归任务里打一条 `via: "manual"` 的结论。
 *
 * 它同时被两个任务收着，于是同一条 sourceRef 在冒烟任务里正常写入、
 * 在回归任务里进「跳过（已有人工结论）」——D23 是**按行**生效的，
 * 对账单里 `skippedManual` 带 `runName` 就是为了这种情况不自相矛盾（§5.1.1）。
 */
export const DEMO_SOURCE_REF_MANUAL = "AUTO-REPORT-004";

/**
 * **故意不勾进任何测试任务**的那条，用来演示「越界」（`outOfScope`）。
 *
 * 用例在项目里确实存在，只是没有任何未提交任务收它——这与「项目里压根没有这条
 * 用例」（`unmatchedCases`）是两件事，人要做的动作也不同：前者去把用例勾进任务，
 * 后者去检查 `AS_PROJECT` 或补 sourceRef。示例把两类都打出来，就是为了让人
 * 亲眼看到它们没有被平台合并成一句话（§5.8）。
 */
export const DEMO_SOURCE_REF_OUT_OF_SCOPE = "AUTO-SEARCH-005";

function step(id: string, text: string, expected: string) {
	return { expected, id, step: text };
}

/**
 * 五条用例，覆盖示例会报的每一条 sourceRef。
 *
 * 全部 `status: "active"`、`caseType: "functional"`：这份种子要演示的是上报链路，
 * 用例本身的属性组合在 `seed.ts` 里已经演示过了，这里再铺一遍只会让人以为
 * 这些属性参与了归属解析——它们不参与，归属只看 sourceRef（§3.7）。
 */
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

/** 回归任务收 4 条，**不含** `AUTO-SEARCH-005`——那条落空正是要演示的东西。 */
export const REGRESSION_SOURCE_REFS = [
	"AUTO-LOGIN-001",
	DEMO_SOURCE_REF_FAILING,
	"AUTO-PAY-003",
	DEMO_SOURCE_REF_MANUAL,
];

/** 冒烟任务只收 2 条，与回归任务**故意重叠**，好让一次上报写进两个任务。 */
export const SMOKE_SOURCE_REFS = ["AUTO-LOGIN-001", DEMO_SOURCE_REF_MANUAL];

/** 演示项目本体（名字 / 描述 / 唯一那棵模块路径）。编排侧原样喂给 seedProject。 */
export const DEMO_SPEC = {
	description: "自动化上报演示：examples/ 下三个示例共用的项目",
	modules: [{ cases: DEMO_CASES, path: ["自动化演示", "核心链路"] }],
	name: DEMO_PROJECT_NAME,
};
