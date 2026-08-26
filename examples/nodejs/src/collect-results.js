/**
 * node:test 的事件流 → SDK 认识的 `CaseResultInput[]`。
 *
 * 这就是「接到你的测试框架上」那段搬运代码（SDK README 里 wdio / playwright
 * 两个片段做的是同一件事）。它待在示例仓库里而不是 SDK 里，是**形态本身**：
 * node:test 哪天把 `details.duration_ms` 改个名字，要改的是这三十行，
 * 不用等 SDK 发版，也不会因为 SDK 绑了某个框架的大版本而卡住别人。
 *
 * ⚠️ 全程**只入内存**，一个网络请求都不发（§7.2 第 1 条）。QA 本机跑、网络不稳，
 * 跑一条报一条既慢又碎；攒完一整轮再一次性提交，重试也只重试那一次。
 */

import { extractSourceRef } from "./source-ref.js";

/**
 * node:test 把「跳过」也报成 `test:pass`，只是 `data.skip` 有值——
 * 照着事件类型直译会把跳过的用例记成通过，那是**在报告里编数据**：
 * 通过率的分母只算 passed + failed，跳过被算成通过会让分子分母一起虚高。
 */
function toResult(event) {
	if (event.type === "test:fail") {
		return "failed";
	}
	return event.data.skip || event.data.todo ? "skipped" : "passed";
}

/**
 * 失败信息取 `error.message` 而不是整个堆栈：它落进 `test_run_cases.comment`，
 * 是失败清单上给人一眼扫的一行。完整堆栈随 `log` 附件走（见 `artifacts.js`）。
 */
function toMessage(event) {
	const error = event.data.details?.error;
	if (!error) {
		return null;
	}
	return typeof error.message === "string" ? error.message : String(error);
}

/**
 * 消费整条事件流，返回攒好的结果与失败的 sourceRef 清单。
 *
 * 没有 sourceRef 的事件整条跳过，理由见 `source-ref.js`：
 * 文件级汇总事件混进来会在对账单上凭空多出一批「未匹配」。
 */
export async function collectResults(stream) {
	const results = [];
	const failedSourceRefs = [];
	for await (const event of stream) {
		if (event.type !== "test:pass" && event.type !== "test:fail") {
			continue;
		}
		const sourceRef = extractSourceRef(event.data.name);
		if (!sourceRef) {
			continue;
		}
		const result = toResult(event);
		results.push({
			durationMs: Math.round(event.data.details?.duration_ms ?? 0),
			message: toMessage(event),
			result,
			sourceRef,
		});
		if (result === "failed") {
			failedSourceRefs.push(sourceRef);
		}
	}
	return { failedSourceRefs, results };
}
