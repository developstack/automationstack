/**
 * AsyncLocalStorage 的进出语义，而不是「调用一下 API 能不能跑」。
 *
 * 重点钉住那条容易被忽略的分支：`clientIp` 为 null 时 `runWithClientIp`
 * **不建新作用域**、直接执行 `run()`——这意味着「取不到地址」在顶层确实
 * 拿到 null，但如果这次调用嵌在一个已经有真实地址的 run 里面，它不会把
 * 外层地址盖成 null，而是原样透出外层的值。这是实现的真实行为，不是
 * 「地址取不到就该是 null」的直觉，所以专门写一条用例把它钉住。
 */
import { describe, expect, it } from "vitest";

import { getClientIp, runWithClientIp } from "./request-client-ip";

describe("getClientIp：作用域之外拿不到地址", () => {
	it("没有任何 run 包裹时返回 null", () => {
		expect(getClientIp()).toBeNull();
	});

	it("run 结束之后，作用域外重新变回 null", () => {
		runWithClientIp("203.0.113.1", () => {
			expect(getClientIp()).toBe("203.0.113.1");
		});

		expect(getClientIp()).toBeNull();
	});
});

describe("runWithClientIp：作用域内部能读到传入的地址", () => {
	it("run 内部读到的就是传进去的地址", () => {
		const seen: (string | null)[] = [];

		runWithClientIp("203.0.113.7", () => {
			seen.push(getClientIp());
		});

		expect(seen).toEqual(["203.0.113.7"]);
	});

	it("把 run 的返回值原样透传出去", () => {
		const result = runWithClientIp("203.0.113.7", () => 42);
		expect(result).toBe(42);
	});
});

describe("runWithClientIp：嵌套取最内层", () => {
	it("内层地址覆盖外层，退出内层后恢复外层的值", () => {
		const seen: (string | null)[] = [];

		runWithClientIp("outer-ip", () => {
			seen.push(getClientIp());
			runWithClientIp("inner-ip", () => {
				seen.push(getClientIp());
			});
			seen.push(getClientIp());
		});

		expect(seen).toEqual(["outer-ip", "inner-ip", "outer-ip"]);
	});
});

describe("runWithClientIp：clientIp 为 null 时不建新作用域", () => {
	it("顶层调用時，null 就是 null——不会伪造出一个假地址", () => {
		const seen: (string | null)[] = [];

		runWithClientIp(null, () => {
			seen.push(getClientIp());
		});

		expect(seen).toEqual([null]);
	});

	it("嵌在真实地址的作用域里传 null，不会覆盖外层——直接透出外层地址", () => {
		const seen: (string | null)[] = [];

		runWithClientIp("outer-ip", () => {
			runWithClientIp(null, () => {
				// 这里不是 null：因为 clientIp === null 时 runWithClientIp
				// 直接 `return run()`，没有调用 clientIpStorage.run 建立新的
				// AsyncLocalStorage 帧，所以仍然读到外层已经在跑的 store。
				seen.push(getClientIp());
			});
		});

		expect(seen).toEqual(["outer-ip"]);
	});
});

describe("runWithClientIp：跨 await 的异步边界仍在同一个 store 内", () => {
	it("await 之后依然读到同一个地址", async () => {
		const seen: (string | null)[] = [];

		await runWithClientIp("async-ip", async () => {
			seen.push(getClientIp());
			await Promise.resolve();
			await new Promise((resolve) => setTimeout(resolve, 0));
			seen.push(getClientIp());
		});

		expect(seen).toEqual(["async-ip", "async-ip"]);
	});

	it("并发的两次 run 互不串味：各自的异步延续只看到自己的地址", async () => {
		const seenA: (string | null)[] = [];
		const seenB: (string | null)[] = [];

		const runA = runWithClientIp("ip-a", async () => {
			seenA.push(getClientIp());
			await new Promise((resolve) => setTimeout(resolve, 5));
			seenA.push(getClientIp());
		});
		const runB = runWithClientIp("ip-b", async () => {
			seenB.push(getClientIp());
			await new Promise((resolve) => setTimeout(resolve, 1));
			seenB.push(getClientIp());
		});

		await Promise.all([runA, runB]);

		expect(seenA).toEqual(["ip-a", "ip-a"]);
		expect(seenB).toEqual(["ip-b", "ip-b"]);
	});
});
