import type { z } from "zod";

/**
 * ingest 四个端点把 zod 的校验失败拼成一行中文，**并且有上限**。
 *
 * 从前 `execution-ingest.ts` 与 `attachment-uploads.ts` 各有一份逐字相同的实现，
 * 两份都是无界的 `error.issues.map(...).join("；")`。抽到这里是为了让上限只有
 * 一处、也只需要论证一次——两份实现分叉的表现是「同一种错误，两条端点一条被
 * 截断一条没有」。
 *
 * ## 为什么必须有上限：这是一个放大器，不是崩溃风险
 *
 * 这四条端点拿一枚 token 就能打，而 zod 会给数组里**每个元素的每个字段**各报
 * 一条 issue。实测：一份 8.8 KB 的 `{"attachments":[{},{},…3000 个空对象]}`
 * 换回一行 **1,254,548 字节**的中文说明——约 140 倍的不对称，而且这串字符
 * 完全是服务端现拼出来的（拼接、UTF-8 编码、序列化全在本进程）。
 * 请求体那道 `bodyLimit` 拦不住它：畸形的输入可以极小，膨胀发生在响应侧。
 *
 * 上限不改变任何一条正常请求看到的东西，只把「机器批量生成的垃圾」压平。
 */

/**
 * 最多列出多少条 issue。
 *
 * 取 20 的判据是**手写请求一条都不能被截掉**：请求体最大的那个 schema
 * （`ingestExecutionRequestSchema`）一共 11 个顶层字段
 * （branch / ciUrl / commitSha / finishedAt / idempotencyKey / overwriteManual /
 * projectId / results / runId / runIds / startedAt），也就是说「一个人手写请求
 * 把每一个顶层字段都写错了」的极端情况也只有 11 条 issue，20 还留着近一倍余量
 * 给他顺带写错的那几条 `results[i]`。
 *
 * 另一头：会被截断的输入至少要 20 条 issue，现实里只有机器生成的批量请求
 * 能做到——2000 条上限的数组填满畸形元素是几千到上万条。两端差着两三个
 * 数量级，20 落在中间的空档里，**不是**一个需要精调的阈值。
 *
 * 截断之后仍然给出总数（见下），所以「我这次到底错了多少条」这个信息不丢，
 * 丢的只是逐条重复几千遍的那部分。
 */
const MAX_REPORTED_ISSUES = 20;

/** 直接从 `ZodError` 上取，不去 import zod 内部的 issue 类型名（v3→v4 已经改过一次名）。 */
type IngestZodIssue = z.ZodError["issues"][number];

function describeIssue(issue: IngestZodIssue): string {
	const path = issue.path.join(".");
	return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

/**
 * zod 的 issues 拼成一行中文，最多 `MAX_REPORTED_ISSUES` 条，其余折成一句计数。
 *
 * 分隔符沿用「；」，与两条端点从前的行为逐字一致——SDK 那边可能正拿它切行。
 */
export function formatIngestIssues(error: z.ZodError): string {
	const shown = error.issues.slice(0, MAX_REPORTED_ISSUES);
	const lines = shown.map(describeIssue);
	const omitted = error.issues.length - shown.length;
	if (omitted > 0) {
		lines.push(
			`……还有 ${omitted} 条问题未列出（共 ${error.issues.length} 条，只列前 ${MAX_REPORTED_ISSUES} 条）`
		);
	}
	return lines.join("；");
}
