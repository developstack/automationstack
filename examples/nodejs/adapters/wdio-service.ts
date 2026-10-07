/** biome-ignore-all lint/suspicious/noConsole: 这几行是「多进程确实汇聚上来了」的证据，必须打在终端上 */

import { basename } from "node:path";

import { resetFailureScenes } from "../src/failure-artifacts.ts";
import { reportRun } from "../src/report-run.ts";
import { readSpooledRunners, resetSpool } from "../src/wdio-spool.ts";

const FRAMEWORK = "wdio";

export default class AutomationStackLauncherService {
	async onPrepare(): Promise<void> {
		await resetFailureScenes(FRAMEWORK);
		await resetSpool();
	}

	async onComplete(): Promise<void> {
		const spooled = await readSpooledRunners();
		const results = spooled.flatMap((runner) => runner.results);
		const failedSourceRefs = spooled.flatMap(
			(runner) => runner.failedSourceRefs
		);
		console.log(
			`[切面/${FRAMEWORK}] 回捡到 ${spooled.length} 份 spool（每份 = 一个 worker 子进程）：`
		);
		for (const runner of spooled) {
			console.log(
				`  cid ${runner.cid}  ${runner.results.length} 条  ${runner.specs.map((spec) => basename(spec)).join(", ")}`
			);
		}
		console.log(
			`[切面/${FRAMEWORK}] 合计 ${results.length} 条，汇成一轮，只发一次 POST`
		);
		await reportRun({ failedSourceRefs, framework: FRAMEWORK, results });
		await resetSpool();
	}
}
