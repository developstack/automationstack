/**
 * 一轮「自动化测试」，用的是 node 内置的 `node:test`。
 *
 * ## 为什么是 node:test，而不是 playwright / wdio / jest
 *
 * 这份示例要证明的恰恰是「**任何**框架都能接」。挑一个具体框架来演示，
 * 读的人第一个问题就会是「那我用的那个呢」；用内置 runner 演示，
 * 答案自明——连测试框架都不用装，SDK 也照样能上报。
 * 顺带：CI 里不用为跑一个示例拉几百兆依赖。
 *
 * ⚠️ 标题里方括号包着的就是 `sourceRef`，它必须与平台上用例的 sourceRef
 * 逐字相同（种子数据在 `scripts/seed-automation-demo-cases.ts`）。
 * 归属只认它（§3.7）：没有任何办法在代码里指定「写进哪个测试任务」。
 *
 * 这里没有真实的被测系统——断言跑的是一段假的下单流程。示例要演示的是
 * **上报链路**，不是怎么写测试。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { startCaseLog } from "../src/artifacts.js";

/** 假的被测系统：一个算合计金额的纯函数，够让断言有真东西可判就行。 */
function cartTotal(unitPrice, quantity) {
	return unitPrice * quantity;
}

test("[AUTO-LOGIN-001] 手机号验证码登录成功", () => {
	const trace = startCaseLog("AUTO-LOGIN-001");
	trace.log("输入手机号 138****0001，请求验证码");
	trace.log("输入验证码 000000，点击登录");
	assert.equal("登录成功", "登录成功");
});

test("[AUTO-CART-002] 购物车合计金额随数量刷新", async () => {
	const trace = startCaseLog("AUTO-CART-002");
	trace.log("把商品数量从 1 改成 3（单价 19.9）");
	const total = cartTotal(19.9, 3);
	try {
		// 故意判错：示例需要一条失败用例，好演示「失败才带附件」这条路径。
		assert.equal(total, 59.9, "合计金额与预期不符（这条是示例故意造的失败）");
	} catch (error) {
		// 真实框架里这段在 afterEach / onTestEnd 钩子里，这里手写是为了让
		// 「失败 → 截图 + 完整日志落盘」这一步在同一屏内看得见。
		await trace.saveFailure(error);
		throw error;
	}
});

test("[AUTO-PAY-003] 收银台切换支付方式", { skip: "支付沙箱今日停机" }, () => {
	assert.fail("跳过的用例不会跑到这里");
});

test("[AUTO-REPORT-004] 订单报表导出为 Excel", () => {
	const trace = startCaseLog("AUTO-REPORT-004");
	trace.log("点击导出，等待 xlsx 下载完成");
	assert.equal("已下载", "已下载");
});

/**
 * 这条用例在平台上**存在**，但没有被任何未提交的测试任务收着——
 * 于是它会出现在对账单的「越界」里，而不是「未匹配」。
 * 两者不能合并：这一条该去把用例勾进任务，那一条该去检查 AS_PROJECT。
 */
test("[AUTO-SEARCH-005] 商品搜索关键词高亮", () => {
	const trace = startCaseLog("AUTO-SEARCH-005");
	trace.log("搜索「耳机」，检查结果里的高亮标记");
	assert.equal("耳机", "耳机");
});
