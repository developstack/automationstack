/**
 * §7.2 第 4 条的**演示入口**：一条都没写进去时，进程必须非零退出。
 *
 *   pnpm --filter @automationstack/example-nodejs report:empty-write
 *   echo $?          # 1
 *
 * ## 这个演示的巧妙之处（也是它为什么值得单独一个 npm script）
 *
 * 下面这条用例是**通过**的。node:test 因此不会给进程任何非零退出码。
 * 退出码那个 1 **完全来自上报侧**：标题里的 sourceRef 在平台上不存在
 * → `unmatchedCases` 全量落空 → `writtenTo` 为空 → SDK 抛
 * `IngestEmptyWriteError` 并把 `process.exitCode` 置成 1。
 *
 * 也就是说：**测试全绿，进程仍然红**。CI 里最危险的失败不是红，是绿着但
 * 什么都没写进去——一整晚的自动化跑完、流水线全绿、平台上一条结论都没有。
 * 这个入口就是用来证明那种情况不会静悄悄过去的。
 *
 * ⚠️ 服务端这时返回的仍然是 **200**：HTTP 状态码表达「请求本身有没有问题」，
 * 对账单表达「业务上发生了什么」。翻译成非零退出码是 SDK 的职责。
 *
 * ⚠️ 同样地，**这个文件里没有一行提到上报**。它只是一条普通的、通过的用例，
 * 唯一特别的地方是标题里那个平台上不存在的 sourceRef。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { hasNoWrites } from "@automationstack/sdk";

/**
 * `AUTO-DOES-NOT-EXIST-999` 是种子脚本**不会**造的一条。
 * 造了这个入口就演示不了任何东西了。
 */
test("[AUTO-DOES-NOT-EXIST-999] writtenTo 为空是 SDK 唯一据以报错的信号", () => {
	// 这条断言本身是真的：`hasNoWrites` 只看 `writtenTo`，不看 HTTP 状态码。
	// 服务端在「一条都没写进去」时返回的仍然是 200 加一份说明详尽的对账单。
	assert.equal(
		hasNoWrites({
			executionId: "8f0d6a1e-2c34-4b55-9a70-1de2f3c45678",
			outOfScope: [],
			skippedManual: [],
			unmatchedCases: [],
			writtenTo: [],
		}),
		true
	);
	assert.equal(
		hasNoWrites({
			executionId: "8f0d6a1e-2c34-4b55-9a70-1de2f3c45678",
			outOfScope: [],
			skippedManual: [],
			unmatchedCases: [],
			writtenTo: [{ runId: "r1", runName: "回归", updated: 1 }],
		}),
		false
	);
});
