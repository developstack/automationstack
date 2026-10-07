import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AttachmentInput } from "@automationstack/sdk";

export const EXAMPLE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const ARTIFACT_ROOT = join(EXAMPLE_ROOT, "artifacts");

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

export async function resetFailureScenes(framework: string): Promise<void> {
	await rm(frameworkDir(framework), { force: true, recursive: true });
}

export interface FailureScene {
	framework: string;
	log: string;
	screenshotPng?: Uint8Array;
	sourceRef: string;
}

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
			// biome-ignore lint/performance/noAwaitInLoops: 逐个兜异常，Promise.all 会让一个缺失的文件带走整批
			await access(item.path);
			found.push({ filePath: item.path, kind: item.kind, sourceRef });
			// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
		} catch {}
	}
	return found;
}
