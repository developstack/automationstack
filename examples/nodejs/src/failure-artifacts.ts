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
 * 三个框架里有两个把用例跑在**子进程**里（node:test 默认一文件一进程，
 * wdio 一个 spec 一个 worker），内存里的东西回不到那个最终发请求的进程。
 * 磁盘是这些进程之间唯一现成的通道，也正好是真实框架的做法
 * （wdio / playwright 的截图默认都在磁盘上）。
 *
 * ⚠️ 按框架分目录：三个框架各跑一轮时，后跑的那轮不该捡到前一轮留下的现场。
 */

import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AttachmentInput } from "@automationstack/sdk";

/** 示例根目录（`examples/nodejs`），从本文件位置推出来，与 cwd 无关。 */
export const EXAMPLE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ARTIFACT_ROOT = join(EXAMPLE_ROOT, "artifacts");

/**
 * 一个 1×1 的合法 PNG。
 *
 * node:test 与 vitest 那两轮没有浏览器，也不该为了「有张截图」去装一个——
 * 那会把「切面与被测框架无关」这件事当场推翻。wdio 那轮有真浏览器，
 * 走的是 `browser.takeScreenshot()`（见 wdio.config.ts 的 afterTest），
 * 上报侧一个字都不用改：SDK 只关心「一段字节 + 一个 kind」。
 */
const PLACEHOLDER_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function frameworkDir(framework: string): string {
	return join(ARTIFACT_ROOT, framework);
}

function screenshotPath(framework: string, sourceRef: string): string {
	return join(frameworkDir(framework), `${sourceRef}.png`);
}

function logPath(framework: string, sourceRef: string): string {
	return join(frameworkDir(framework), `${sourceRef}.log`);
}

/** 一轮开始前清掉上一轮的现场，免得捡到隔夜的截图。 */
export async function resetFailureScenes(framework: string): Promise<void> {
	await rm(frameworkDir(framework), { force: true, recursive: true });
}

export interface FailureScene {
	framework: string;
	/** 完整堆栈 / driver 日志，随 `log` 附件走，不进 comment。 */
	log: string;
	/** 有真浏览器时传真截图；没有就落一张占位 PNG。 */
	screenshotPng?: Uint8Array;
	sourceRef: string;
}

/**
 * 只在**失败时**落盘：通过的用例不需要附件，一轮几百条全落盘只是白写几百个文件，
 * 也会把服务端按任务计的附件配额喂给没人看的东西。
 */
export async function saveFailureScene(scene: FailureScene): Promise<void> {
	await mkdir(frameworkDir(scene.framework), { recursive: true });
	await writeFile(
		logPath(scene.framework, scene.sourceRef),
		`${scene.log}\n`,
		"utf8"
	);
	await writeFile(
		screenshotPath(scene.framework, scene.sourceRef),
		scene.screenshotPng ?? Buffer.from(PLACEHOLDER_PNG_BASE64, "base64")
	);
}

/**
 * 回捡某条 sourceRef 的附件，捡不到就少给几条。
 *
 * 读不到文件时**不抛**：附件是锦上添花，让一张丢失的截图把一整轮结论
 * 拦在门外是最没道理的失败方式（SDK 内部对附件也是同一条原则，§5.6）。
 */
export async function collectFailureAttachments(
	framework: string,
	sourceRef: string
): Promise<AttachmentInput[]> {
	const wanted = [
		{ kind: "screenshot", path: screenshotPath(framework, sourceRef) },
		{ kind: "log", path: logPath(framework, sourceRef) },
	] as const;
	const found: AttachmentInput[] = [];
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
