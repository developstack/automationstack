/** biome-ignore-all lint/suspicious/noConsole: 运维脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

// 删除迁移 0019 删除的步骤截图在对象存储（R2 或服务器本地）中的对象（#74，ADR 0005）。
// 默认只列出对象。加上 --apply 才删除。使用说明见 docs/runbooks/step-screenshot-purge.md。

import { runStepScreenshotPurge } from "../apps/server/src/maintenance/step-screenshot-purge-core";
import { getObjectStorage } from "../packages/api/src/lib/object-storage";
import {
	dequeueStepScreenshot,
	findCaseAttachmentKeysInUse,
	listQueuedStepScreenshots,
} from "../packages/db/src/repositories/step-screenshot-purge-repository";

const ARGV_OFFSET = 2;
const EXIT_FAILURE = 1;

async function main(): Promise<number> {
	const storage = await getObjectStorage();
	const result = await runStepScreenshotPurge(process.argv.slice(ARGV_OFFSET), {
		dequeue: dequeueStepScreenshot,
		findKeysInUse: findCaseAttachmentKeysInUse,
		listQueued: listQueuedStepScreenshots,
		log: console.log,
		removeObject: storage.remove,
		warn: console.warn,
	});
	if (result.kind === "error") {
		console.error(result.message);
		return EXIT_FAILURE;
	}
	return result.report.failed > 0 ? EXIT_FAILURE : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(EXIT_FAILURE);
	});
