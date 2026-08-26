/**
 * 失败现场的落盘与回捡：截图 + 完整日志。
 *
 * ## 为什么要落盘，而不是把日志直接塞进 `message`
 *
 * `message` 落进 `test_run_cases.comment`，是给人在失败清单上**一眼扫**的一行字，
 * SDK 会按契约上限截断它。完整堆栈、driver 日志、请求响应体属于附件——
 * 塞进 comment 只会让失败清单变成一面日志墙，而真正要看的那一行反而找不到。
 *
 * ## 为什么写在磁盘上而不是内存里
 *
 * 测试文件由 node:test 跑在**子进程**里（`run()` 默认一文件一进程），
 * 内存里的东西回不到上报进程。磁盘是这两个进程之间唯一现成的通道，
 * 也正好是真实框架的做法（wdio / playwright 的截图都在 `./screenshots` 下）。
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 示例根目录（`examples/nodejs`），从本文件位置推出来，与 cwd 无关。 */
const EXAMPLE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const ARTIFACT_DIR = join(EXAMPLE_ROOT, "artifacts");

/**
 * 一个 1×1 的合法 PNG。
 *
 * 示例里没有浏览器，也不该为了「有张截图」去装一个无头浏览器——这份示例的
 * 依赖只有 SDK 和 node 内置模块，加一个 playwright 就把「不绑框架」这件事
 * 当场推翻了。真实项目里这里换成 `await page.screenshot(...)`，
 * 上报侧一个字都不用改：SDK 只关心「一段字节 + 一个 kind」。
 */
const PLACEHOLDER_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function screenshotPath(sourceRef) {
	return join(ARTIFACT_DIR, `${sourceRef}.png`);
}

function logPath(sourceRef) {
	return join(ARTIFACT_DIR, `${sourceRef}.log`);
}

/**
 * 一条用例的运行记录器。
 *
 * 无论成败都收着日志，只在**失败时**落盘：通过的用例不需要附件，
 * 一轮几百条全落盘只是白写几百个文件，也会把附件配额喂给没人看的东西。
 */
export function startCaseLog(sourceRef) {
	const lines = [];
	return {
		log(line) {
			lines.push(`${new Date().toISOString()} ${line}`);
		},
		async saveFailure(error) {
			lines.push(`${new Date().toISOString()} 失败：${error?.stack ?? error}`);
			await mkdir(ARTIFACT_DIR, { recursive: true });
			await writeFile(logPath(sourceRef), `${lines.join("\n")}\n`, "utf8");
			await writeFile(
				screenshotPath(sourceRef),
				Buffer.from(PLACEHOLDER_PNG_BASE64, "base64")
			);
		},
	};
}

/**
 * 回捡某条 sourceRef 的附件，捡不到就少给几条。
 *
 * 读不到文件时**不抛**：附件是锦上添花，让一张丢失的截图把一整轮结论
 * 拦在门外是最没道理的失败方式（SDK 内部对附件也是同一条原则，§5.6）。
 */
export async function collectFailureAttachments(sourceRef) {
	const wanted = [
		{ kind: "screenshot", path: screenshotPath(sourceRef) },
		{ kind: "log", path: logPath(sourceRef) },
	];
	const found = [];
	for (const item of wanted) {
		try {
			// 只确认文件在、能读；**不读内容**——真正的读盘由 SDK 在 finish() 时做，
			// 一轮几百张截图不必从这一刻起就驻留内存。
			// biome-ignore lint/performance/noAwaitInLoops: 逐个兜异常，Promise.all 会让一个缺失的文件带走整批
			await access(item.path);
			found.push({ filePath: item.path, kind: item.kind, sourceRef });
		} catch {
			// 这条用例没留下这类现场（比如通过的用例），跳过即可。
		}
	}
	return found;
}
