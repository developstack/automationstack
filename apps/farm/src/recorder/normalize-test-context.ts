/**
 * `normalize*.test.ts` 共用的归一化上下文夹具。
 *
 * 从 `normalize.test.ts` 拆出来：那份文件到了 341 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js），按事件族分成了三个文件。时钟必须是可控的
 * （否则 frameNavigated 这类用「收到时刻」的事件没法断言），所以固定的 now
 * 与造上下文的方式得是同一份，抄三遍迟早会有一处偷偷换了值。
 *
 * 名字里没有 `.test`：vitest 的 include 会把 `.test.ts` 当成套件收走，而这里
 * 一个 it() 都没有，会当场报「No test suite found」。
 */

import { createRecorderClock } from "./normalize";

export const FIXED_NOW = 1_700_000_500_000;

export const makeContext = (now = FIXED_NOW) => ({
	clock: createRecorderClock(() => now),
	targetId: "TARGET-1",
});
