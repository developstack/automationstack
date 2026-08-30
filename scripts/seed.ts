/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

/**
 * 演示数据种子脚本（plan §7 M12）。
 *
 *   pnpm db:seed --owner <用户名>   幂等补齐：项目/模块按名复用，用例按 sourceRef 去重
 *   pnpm db:seed --reset            先清空全部业务数据（projects 级联）再插入
 *   pnpm db:seed --purge-smoke      只删除历史冒烟项目，不写入种子
 *
 * `--owner` 指定的账号会被设成种子项目的 owner。**不给就没人能看见这个项目**
 * （项目级授权见 `packages/db/src/schema/project-members.ts`），脚本会为此打一条
 * 警告——细节与错误文案在 `./seed-owner.ts`。
 *
 * 本脚本只做编排：所有 DB 访问都在 packages/db 的 repository 里
 * （docs/init-code-quantity.md 硬规则：packages/db 之外不得直接用 drizzle）。
 * 依赖 tsx 运行（见根 package.json 的 db:seed），cwd 为 apps/server，
 * 因此 dotenv 能自动读到 apps/server/.env 里的 DATABASE_URL。
 */

import type {
	SeedCaseSpec,
	SeedProjectSpec,
} from "../packages/db/src/repositories/seed-repository";
import {
	deleteProjectsByNames,
	resetBusinessData,
	seedProject,
} from "../packages/db/src/repositories/seed-repository";
import { BULK_ORDER_CASES } from "./seed-bulk-cases";
import { ARGV_OFFSET, ownerSummaryLine, resolveSeedOwner } from "./seed-owner";

/** 历史各轮冒烟残留的项目名，--reset / --purge-smoke 时清理。 */
const SMOKE_PROJECT_NAMES = ["AI 冒烟 1787123122370", "T7s smoke"];

function step(id: string, text: string, expected: string) {
	return { expected, id, step: text };
}

const ORDER_CASES: SeedCaseSpec[] = [
	{
		caseType: "functional",
		maintainer: "张三",
		name: "普通商品下单成功",
		preconditions: "已登录且购物车内有 1 件有货商品",
		priority: "P0",
		sourceRef: "seed:order:place:001",
		status: "active",
		steps: [
			step("s1", "进入购物车并勾选商品", "结算按钮可点击，合计金额正确"),
			step(
				"s2",
				"点击结算并选择默认收货地址",
				"跳转确认页，地址与运费展示正确"
			),
			step("s3", "点击提交订单", "订单创建成功，状态为「待支付」"),
		],
		tags: ["冒烟", "核心链路", "订单"],
	},
	{
		caseType: "functional",
		maintainer: "张三",
		name: "库存不足时下单被拦截",
		preconditions: "商品剩余库存为 0",
		priority: "P1",
		sourceRef: "seed:order:place:002",
		status: "active",
		steps: [
			step("s1", "把库存为 0 的商品加入购物车", "购物车提示「无货」"),
			step("s2", "点击结算", "拦截并提示「商品库存不足」，不产生订单"),
		],
		tags: ["异常流", "订单"],
	},
	{
		caseType: "interface",
		maintainer: "李四",
		name: "创建订单接口参数校验",
		preconditions: "已获取有效 token",
		priority: "P2",
		sourceRef: "seed:order:api:001",
		status: "draft",
		steps: [
			step(
				"s1",
				"POST /api/orders 缺少 skuId",
				"返回 400 且 code=INVALID_PARAM"
			),
			step("s2", "POST /api/orders 传入非法数量 -1", "返回 400 且订单未落库"),
		],
		tags: ["接口", "订单"],
	},
];

const REFUND_CASES: SeedCaseSpec[] = [
	{
		caseType: "functional",
		maintainer: "王五",
		name: "未发货订单申请退款",
		preconditions: "存在一笔已支付未发货订单",
		priority: "P1",
		sourceRef: "seed:refund:apply:001",
		status: "active",
		steps: [
			step("s1", "订单详情页点击「申请退款」", "弹出退款原因选择"),
			step("s2", "选择原因并提交", "退款单创建成功，订单状态变为「退款中」"),
			step("s3", "等待自动审核通过", "订单状态变为「已退款」，金额原路退回"),
		],
		tags: ["退款", "核心链路"],
	},
	{
		caseType: "compatibility",
		maintainer: "王五",
		name: "移动端退款页面在小屏下的展示",
		preconditions: "使用 375px 宽度视口",
		priority: "P3",
		sourceRef: "seed:refund:ui:001",
		status: "deprecated",
		steps: [step("s1", "在 375px 视口打开退款详情", "无横向滚动，按钮不重叠")],
		tags: ["兼容性", "退款", "UI"],
	},
];

const CASHIER_CASES: SeedCaseSpec[] = [
	{
		caseType: "functional",
		maintainer: "李四",
		name: "收银台切换支付方式",
		preconditions: "存在待支付订单",
		priority: "P0",
		sourceRef: "seed:pay:cashier:001",
		status: "active",
		steps: [
			step("s1", "打开收银台", "默认选中上次使用的支付方式"),
			step("s2", "切换为余额支付", "应付金额与可用余额同步刷新"),
			step("s3", "确认支付", "支付成功，订单状态变为「已支付」"),
		],
		tags: ["支付", "冒烟", "核心链路"],
	},
	{
		caseType: "performance",
		maintainer: "赵六",
		name: "收银台并发下单压测",
		preconditions: "压测环境，200 并发",
		priority: "P2",
		sourceRef: "seed:pay:perf:001",
		status: "draft",
		steps: [
			step(
				"s1",
				"以 200 并发持续压测 5 分钟",
				"P95 响应 < 800ms，错误率 < 0.1%"
			),
		],
		tags: ["性能", "支付"],
	},
];

const LOGIN_CASES: SeedCaseSpec[] = [
	{
		caseType: "functional",
		maintainer: "赵六",
		name: "手机号验证码登录",
		preconditions: "已注册手机号",
		priority: "P0",
		sourceRef: "seed:user:login:001",
		status: "active",
		steps: [
			step("s1", "输入手机号并获取验证码", "60s 倒计时开始，短信送达"),
			step("s2", "输入正确验证码点击登录", "登录成功并跳转首页"),
		],
		tags: ["登录", "冒烟"],
	},
	{
		caseType: "security",
		maintainer: "赵六",
		name: "验证码错误次数超限锁定",
		preconditions: "同一手机号连续输错验证码 5 次",
		priority: "P1",
		sourceRef: "seed:user:login:002",
		status: "active",
		steps: [
			step("s1", "连续输入 5 次错误验证码", "第 5 次后提示「尝试过多」"),
			step("s2", "立即用正确验证码登录", "仍被拒绝，需等待 10 分钟"),
		],
		tags: ["安全", "登录", "异常流"],
	},
];

/** 1 个项目 + 三层模块树 + 覆盖各优先级/状态/标签的用例。 */
const DEMO_PROJECT: SeedProjectSpec = {
	description: "演示用种子数据：三层模块树 + 覆盖各优先级/状态/标签的用例",
	modules: [
		{
			// 3 条手写演示 + 45 条批量 = 48 条，供前端验证 pageSize=20 的三页分页。
			cases: [...ORDER_CASES, ...BULK_ORDER_CASES],
			path: ["电商平台", "交易中心", "订单管理"],
		},
		{ cases: REFUND_CASES, path: ["电商平台", "交易中心", "退款管理"] },
		{ cases: CASHIER_CASES, path: ["电商平台", "支付中心", "收银台"] },
		{ cases: LOGIN_CASES, path: ["电商平台", "用户中心", "账号与登录"] },
	],
	name: "电商演示项目",
};

async function purgeSmokeProjects(): Promise<void> {
	const removed = await deleteProjectsByNames(SMOKE_PROJECT_NAMES);
	console.log(
		removed.names.length > 0
			? `已删除冒烟残留项目：${removed.names.join("、")}`
			: "没有需要删除的冒烟残留项目"
	);
}

async function main(): Promise<void> {
	const argv = process.argv.slice(ARGV_OFFSET);
	const args = new Set(argv);
	if (args.has("--purge-smoke")) {
		await purgeSmokeProjects();
		return;
	}
	// 在 --reset 之前解析：owner 写错了要在删库**之前**就退出，
	// 而不是清空之后才发现，那样人得先把数据重建一遍才能重试。
	const owner = await resolveSeedOwner(argv);
	if (args.has("--reset")) {
		const cleared = await resetBusinessData();
		console.log(`--reset：已清空 ${cleared.projects} 个项目及其级联数据`);
	} else {
		await purgeSmokeProjects();
	}
	const result = await seedProject(DEMO_PROJECT, owner?.id);
	console.log(
		[
			`项目：${DEMO_PROJECT.name}（${result.projectId}）`,
			`  ${result.projectCreated ? "新建" : "复用已有"}`,
			ownerSummaryLine(owner, result.owner),
			`新建模块：${result.modulesCreated}`,
			`新建用例：${result.casesCreated}，已存在跳过：${result.casesSkipped}`,
		].join("\n")
	);
	if (result.errors.length > 0) {
		console.error(
			`失败 ${result.errors.length} 条：\n${result.errors.join("\n")}`
		);
		process.exitCode = 1;
	}
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(1);
	});
