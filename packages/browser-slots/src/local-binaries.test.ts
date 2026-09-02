import { describe, expect, it } from "vitest";
import type { BinaryEnvNames, BinaryLookup } from "./local-binaries";
import {
	resolveChromeBinary,
	resolveChromedriverBinary,
} from "./local-binaries";

/**
 * 二进制查找的用例。
 *
 * 这里只钉一件事：**错误文案里那个环境变量名由调用方给**。同一份 provider 既跑在
 * farm 进程里（读 `FARM_*`），也跑在 `apps/node-agent` 的执行机上（读 `NODE_AGENT_*`），
 * 而这两条错误是用户唯一能看到的东西——指向一个那台机器上根本不存在的开关，
 * 等于没写。查找顺序本身在 `local.test.ts` 里经 provider 覆盖。
 */

const CHROME_BIN = "/fake/bin/chrome";

const FARM_NAMES: BinaryEnvNames = {
	chrome: "FARM_CHROME_BIN",
	chromedriver: "FARM_CHROMEDRIVER_BIN",
};

const NODE_NAMES: BinaryEnvNames = {
	chrome: "NODE_AGENT_CHROME_BIN",
	chromedriver: "NODE_AGENT_CHROMEDRIVER_BIN",
};

/** 只认那个假 Chrome；PATH 是空的，于是「什么都没装」可复现。 */
const LOOKUP: BinaryLookup = {
	isExecutable: (path) => path === CHROME_BIN,
	pathDirs: [],
};

function messageOf(run: () => string): string {
	try {
		run();
	} catch (error) {
		return (error as Error).message;
	}
	throw new Error("预期抛错，却正常返回了");
}

describe("resolveChromeBinary", () => {
	it("配了但不可执行：报错指向调用方自己的变量名", () => {
		const message = messageOf(() =>
			resolveChromeBinary("/nope/chrome", NODE_NAMES, LOOKUP)
		);
		expect(message).toContain("NODE_AGENT_CHROME_BIN");
		expect(message).not.toContain("FARM_");
	});

	it("什么都没配也探不到：装法提示里同样用调用方的变量名", () => {
		const message = messageOf(() =>
			resolveChromeBinary(undefined, NODE_NAMES, {
				isExecutable: () => false,
				pathDirs: [],
			})
		);
		expect(message).toContain("NODE_AGENT_CHROME_BIN");
		expect(message).not.toContain("FARM_");
	});

	it("farm 传 FARM_* 时文案就是 FARM_*（两边各说各的）", () => {
		const message = messageOf(() =>
			resolveChromeBinary("/nope/chrome", FARM_NAMES, LOOKUP)
		);
		expect(message).toContain("FARM_CHROME_BIN");
		expect(message).not.toContain("NODE_AGENT_");
	});
});

describe("resolveChromedriverBinary", () => {
	it("没装时的提示里两个名字都跟着调用方走", () => {
		const message = messageOf(() =>
			resolveChromedriverBinary(undefined, NODE_NAMES, LOOKUP)
		);
		expect(message).toContain("NODE_AGENT_CHROMEDRIVER_BIN");
		// 「主版本要和 Chrome 对齐」那句里要让人跑 `"$<chrome 变量>" --version`，
		// 所以 chrome 的名字也出现在这条 chromedriver 的错误里。
		expect(message).toContain('"$NODE_AGENT_CHROME_BIN" --version');
		expect(message).not.toContain("FARM_");
	});

	it("配了但不可执行：同样是调用方的变量名", () => {
		const message = messageOf(() =>
			resolveChromedriverBinary("/nope/chromedriver", FARM_NAMES, LOOKUP)
		);
		expect(message).toContain("FARM_CHROMEDRIVER_BIN");
		expect(message).not.toContain("NODE_AGENT_");
	});
});
