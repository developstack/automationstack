import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CaseResultInput } from "@automationstack/sdk";

import { EXAMPLE_ROOT } from "./failure-artifacts.ts";

export const SPOOL_DIR = join(EXAMPLE_ROOT, ".wdio-spool");

export interface SpooledRunner {
	cid: string;
	failedSourceRefs: string[];
	results: CaseResultInput[];
	specs: string[];
}

const SPOOL_SUFFIX = ".json";

export async function resetSpool(): Promise<void> {
	await rm(SPOOL_DIR, { force: true, recursive: true });
	await mkdir(SPOOL_DIR, { recursive: true });
}

export async function writeSpooledRunner(
	payload: SpooledRunner
): Promise<void> {
	await mkdir(SPOOL_DIR, { recursive: true });
	await writeFile(
		join(SPOOL_DIR, `${payload.cid}${SPOOL_SUFFIX}`),
		`${JSON.stringify(payload, null, 2)}\n`,
		"utf8"
	);
}

export async function readSpooledRunners(): Promise<SpooledRunner[]> {
	let names: string[];
	try {
		names = await readdir(SPOOL_DIR);
	} catch {
		return [];
	}
	const spooled: SpooledRunner[] = [];
	for (const name of names.filter((it) => it.endsWith(SPOOL_SUFFIX)).sort()) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐个读，一个坏文件不该带走整批
		const raw = await readFile(join(SPOOL_DIR, name), "utf8");
		spooled.push(JSON.parse(raw) as SpooledRunner);
	}
	return spooled;
}
