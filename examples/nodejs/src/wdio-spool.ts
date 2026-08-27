/**
 * wdio 专用的**汇聚通道**：worker 落盘、总控回捡。
 *
 * ## 为什么非要有这么一层
 *
 * wdio 把一轮测试拆进**多个 worker 子进程**（一个 spec 一个），进程间内存不通。
 * 而 ingest 的契约是「一轮只收一次总提交，不支持追加」，同一个幂等键第二次提交
 * 会命中第一次的缓存对账单**原样返回**。
 *
 * 于是「先建后发」那套（总控先建一个 build、把 id 塞进环境变量、各 worker
 * 各自往上追加）在这里是**行不通**的：照抄的后果是第 2 个往后的 worker
 * 一条都写不进去，却各自收到一份看起来成功的对账单——绿的，什么都没发生。
 * 这正是 §7.2 第 4 条要堵的那种静默成功，而且它连退出码都不会红。
 *
 * 所以走汇聚：worker 只攒 + 落一份 JSON，总控在 `onComplete` 里回捡、拼成一轮、
 * 调**唯一一次** `finish()`。磁盘是这两类进程之间唯一现成的通道。
 *
 * ⚠️ 一个 worker 一个文件，文件名带 cid：两个 worker 同时写同一个文件会互相截断，
 * 而截断掉的那部分正是「某个 spec 的全部结果」——又是一种只会静悄悄少几条的失败。
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CaseResultInput } from "@automationstack/sdk";

import { EXAMPLE_ROOT } from "./failure-artifacts.ts";

/** 已在 .gitignore 里：它是一轮之内的中间产物，不进版本库。 */
export const SPOOL_DIR = join(EXAMPLE_ROOT, ".wdio-spool");

export interface SpooledRunner {
	/** wdio 的 worker 标识（`0-0` / `0-1`…），用来证明这一轮真的开了几个进程。 */
	cid: string;
	failedSourceRefs: string[];
	results: CaseResultInput[];
	specs: string[];
}

const SPOOL_SUFFIX = ".json";

/** 总控在 `onPrepare` 里清一次：捡到上一轮的残留就等于凭空多报一批结果。 */
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
		// 缩进着写：这份文件是人在排查「某个 worker 的结果去哪了」时会打开的东西，
		// 压成一行只省几百字节，却让它读不了。
		`${JSON.stringify(payload, null, 2)}\n`,
		"utf8"
	);
}

/**
 * 回捡全部 worker 的结果。
 *
 * 文件名排序后再读：wdio 的 worker 完成顺序不定，不排序的话同一轮跑两次
 * 打印出来的结果顺序会不一样，对着日志比对差异时全是噪声。
 */
export async function readSpooledRunners(): Promise<SpooledRunner[]> {
	let names: string[];
	try {
		names = await readdir(SPOOL_DIR);
	} catch {
		// 目录不在 = 一个 worker 都没跑起来。这不是「零条结果」，
		// 交给调用方去说这句话，这里只如实返回空。
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
