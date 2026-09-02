import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildHar } from "./har";
import {
	CONSOLE_FILE_NAME,
	EVENTS_FILE_NAME,
	HAR_FILE_NAME,
	SCREENSHOTS_DIR_NAME,
} from "./paths";
import type { CollectRecorderArtifacts, RecorderArtifactFile } from "./types";

/**
 * finalize 阶段把工作目录里的东西整理成产物清单（plan §5.5「落盘与产物」）。
 *
 * 三条铁律：
 * 1. **每一项独立 try/catch**：HAR 组装炸了不该连累截图，console 文件缺失不该
 *    让整次 finalize 失败——半程记录也要上传。
 * 2. `events.ndjson` 不算产物：它是中间态（体积最大、可读性最差），价值已经
 *    转移到 har.json 与 console.ndjson 里了。
 * 3. 容器日志（`container_log`）与用户补传的 `client_trace` 不在这里——前者
 *    要 dockerode 拉 `container.logs()`，属于会话侧的活。
 */

const SCREENSHOT_FILE = /^(\d+)-(.+)\.jpeg$/;

const countLines = (content: string): number =>
	content.split("\n").filter((line) => line.trim().length > 0).length;

const collectHar = async (
	workDir: string,
	artifacts: RecorderArtifactFile[]
): Promise<void> => {
	const ndjson = await readFile(join(workDir, EVENTS_FILE_NAME), "utf8");
	const har = buildHar(ndjson);
	const path = resolve(workDir, HAR_FILE_NAME);
	await writeFile(path, JSON.stringify(har), "utf8");
	artifacts.push({
		contentType: "application/json",
		kind: "har",
		meta: { entries: har.log.entries.length, pages: har.log.pages.length },
		path,
	});
};

const collectConsole = async (
	workDir: string,
	artifacts: RecorderArtifactFile[]
): Promise<void> => {
	// 没有 console 事件时 sink 压根不建这个文件，读不到就是「本会话没日志」。
	const content = await readFile(join(workDir, CONSOLE_FILE_NAME), "utf8");
	artifacts.push({
		contentType: "application/x-ndjson",
		kind: "console",
		meta: { lines: countLines(content) },
		path: resolve(workDir, CONSOLE_FILE_NAME),
	});
};

const collectScreenshots = async (
	workDir: string,
	artifacts: RecorderArtifactFile[]
): Promise<void> => {
	const dir = join(workDir, SCREENSHOTS_DIR_NAME);
	const fileNames = await readdir(dir);
	const shots: { seq: number; label: string; fileName: string }[] = [];

	for (const fileName of fileNames) {
		const matched = SCREENSHOT_FILE.exec(fileName);
		if (!matched) {
			continue;
		}
		const [, rawSeq, label] = matched;
		shots.push({
			fileName,
			label: label ?? "",
			seq: Number.parseInt(rawSeq ?? "0", 10),
		});
	}
	// 按序号排：readdir 的顺序是文件系统说了算的，产物清单要可预期。
	shots.sort((left, right) => left.seq - right.seq);

	for (const shot of shots) {
		artifacts.push({
			contentType: "image/jpeg",
			kind: "screenshot",
			meta: { label: shot.label, seq: shot.seq },
			path: resolve(dir, shot.fileName),
		});
	}
};

export const collectRecorderArtifacts: CollectRecorderArtifacts = async (
	workDir
) => {
	const artifacts: RecorderArtifactFile[] = [];

	try {
		await collectHar(workDir, artifacts);
	} catch {
		// events.ndjson 不存在 / 写 har.json 失败：这个会话就没有 HAR 产物。
	}
	try {
		await collectConsole(workDir, artifacts);
	} catch {
		// 同上，缺就缺了。
	}
	try {
		await collectScreenshots(workDir, artifacts);
	} catch {
		// 目录不存在 = 一张都没截到。
	}

	return artifacts;
};
