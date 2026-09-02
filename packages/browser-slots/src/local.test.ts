import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalSlotProvider } from "./local";
import type { BinaryLookup } from "./local-binaries";
import type {
	LocalProcess,
	LocalRuntime,
	SpawnLocalInput,
} from "./local-runtime";
import { createSlotDir } from "./local-slots";
import type { AcquireSlotInput } from "./types";

/**
 * 本地槽位 provider 的用例。
 *
 * 与 `finalize.test.ts` 同一条纪律：**进程与端口是假的，文件系统是真的**。
 * 假的那一半是因为在测试进程里真拉起 Chrome 只会得到一份看运气的 CI；真的那一半
 * 是因为「槽位目录即 label」这个约定的全部价值就在于它落在磁盘上——用假 fs 验它
 * 等于验了个寂寞（meta 到底写没写、release 到底删没删，才是回收链路的真问题）。
 */

const CHROME_BIN = "/fake/bin/chrome";
const CHROMEDRIVER_BIN = "/fake/bin/chromedriver";

/** 用例站在 farm 的位置上调这份 provider，所以给的是 FARM_* 那一套名字。 */
const ENV_NAMES = {
	chrome: "FARM_CHROME_BIN",
	chromedriver: "FARM_CHROMEDRIVER_BIN",
};
const FIRST_PORT = 41_000;
const FIRST_PID = 4242;

/** 顶层化的断言正则（仓库禁止在函数体里写正则字面量）。 */
const WD_ENDPOINT_PATTERN = /^http:\/\/127\.0\.0\.1:\d+$/;
const BREW_HINT_PATTERN = /brew install --cask chromedriver/;
const PUPPETEER_HINT_PATTERN = /@puppeteer\/browsers install chromedriver@/;

interface FakeRuntime extends LocalRuntime {
	killed: number[];
	spawned: SpawnLocalInput[];
}

function makeRuntime(logs = "chromedriver 起来了\n"): FakeRuntime {
	const killed: number[] = [];
	const spawned: SpawnLocalInput[] = [];
	let port = FIRST_PORT;
	let pid = FIRST_PID;
	return {
		killed,
		killProcessGroup: (target) => {
			killed.push(target);
			return Promise.resolve();
		},
		pickFreePort: () => {
			port += 1;
			return Promise.resolve(port);
		},
		spawn: (input): LocalProcess => {
			spawned.push(input);
			pid += 1;
			return { pid, readLogs: () => logs };
		},
		spawned,
	};
}

/** 只认那两个假二进制；PATH 是空的，于是「没装 chromedriver」可复现。 */
const LOOKUP: BinaryLookup = {
	isExecutable: (path) => path === CHROME_BIN || path === CHROMEDRIVER_BIN,
	pathDirs: [],
};

let slotsRoot = "";

beforeEach(async () => {
	slotsRoot = await mkdtemp(join(tmpdir(), "farm-local-slots-"));
});

afterEach(async () => {
	await rm(slotsRoot, { force: true, recursive: true });
});

function makeProvider(
	runtime: FakeRuntime,
	overrides: { chromedriverBin?: string; headless?: boolean } = {}
) {
	return createLocalSlotProvider({
		binaryEnvNames: ENV_NAMES,
		chromeBin: CHROME_BIN,
		chromedriverBin:
			"chromedriverBin" in overrides
				? overrides.chromedriverBin
				: CHROMEDRIVER_BIN,
		headless: overrides.headless ?? true,
		lookup: LOOKUP,
		runtime,
		slotsRoot,
	});
}

function acquireInput(
	overrides: Partial<AcquireSlotInput> = {}
): AcquireSlotInput {
	return {
		expiresAtEpochSec: 1_800_000_000,
		image: "automationstack-browser-chromium:latest",
		mode: "cdp",
		sessionId: "session-1",
		...overrides,
	};
}

describe("acquire：cdp 模式", () => {
	it("直接起 Chrome，参数带上本会话的端口与 profile", async () => {
		const runtime = makeRuntime();
		const slot = await makeProvider(runtime).acquire(acquireInput());
		const [spawned] = runtime.spawned;

		expect(spawned?.command).toBe(CHROME_BIN);
		expect(spawned?.args).toContain(
			`--remote-debugging-port=${slot.cdpDebugPort}`
		);
		expect(spawned?.args).toContain(
			`--user-data-dir=${join(slotsRoot, "session-1", "profile")}`
		);
		expect(spawned?.args).toContain("--remote-allow-origins=*");
		expect(spawned?.args).toContain("--headless=new");
		expect(spawned?.args.at(-1)).toBe("about:blank");
		// CDP 模式没有 chromedriver，端点为 null；参数已经全在命令行上了。
		expect(slot.wdEndpoint).toBeNull();
		expect(slot.browserArgs).toEqual([]);
		expect(slot.cdpHttpEndpoint).toBe(`http://127.0.0.1:${slot.cdpDebugPort}`);
		expect(slot.containerId).toBe("local-session-1");
	});

	it("FARM_LOCAL_HEADLESS=false 时不加无头旗标（有头观看）", async () => {
		const runtime = makeRuntime();
		await makeProvider(runtime, { headless: false }).acquire(acquireInput());
		expect(runtime.spawned[0]?.args).not.toContain("--headless=new");
	});

	it("落下 meta.json（含 pid）与 profile 目录，readLogs 回子进程输出", async () => {
		const runtime = makeRuntime("chrome 起来了\n");
		const slot = await makeProvider(runtime).acquire(acquireInput());
		const slotDir = join(slotsRoot, "session-1");
		const meta: unknown = JSON.parse(
			await readFile(join(slotDir, "meta.json"), "utf8")
		);

		expect(meta).toEqual({
			expiresAtEpochSec: 1_800_000_000,
			mode: "cdp",
			pid: FIRST_PID + 1,
		});
		expect((await stat(join(slotDir, "profile"))).isDirectory()).toBe(true);
		expect(await slot.readLogs()).toBe("chrome 起来了\n");
	});
});

describe("acquire：webdriver 模式", () => {
	it("起 chromedriver，profile 与调试端口经 browserArgs/cdpDebugPort 注入", async () => {
		const runtime = makeRuntime();
		const slot = await makeProvider(runtime).acquire(
			acquireInput({ mode: "webdriver", sessionId: "session-wd" })
		);
		const [spawned] = runtime.spawned;

		expect(spawned?.command).toBe(CHROMEDRIVER_BIN);
		expect(slot.wdEndpoint).toMatch(WD_ENDPOINT_PATTERN);
		expect(spawned?.args[0]).toBe(
			`--port=${slot.wdEndpoint?.split(":").at(-1)}`
		);
		// 局域网放行是容器里才需要的（entrypoint.sh），本机上不给。
		expect(spawned?.args).not.toContain("--allowed-ips=");
		// 浏览器是 chromedriver 拉起来的，这两样只能经 caps 走。
		expect(slot.browserArgs).toContain(
			`--user-data-dir=${join(slotsRoot, "session-wd", "profile")}`
		);
		expect(slot.browserArgs).toContain("--headless=new");
		// WebDriver 端口与 CDP 端口必须是两个，不能共用。
		expect(slot.wdEndpoint).not.toContain(String(slot.cdpDebugPort));
	});

	it("没装 chromedriver 时报错带上两种装法与版本对齐提醒", async () => {
		const runtime = makeRuntime();
		const provider = makeProvider(runtime, { chromedriverBin: undefined });

		await expect(
			provider.acquire(acquireInput({ mode: "webdriver" }))
		).rejects.toThrow(BREW_HINT_PATTERN);
		await expect(
			provider.acquire(acquireInput({ mode: "webdriver" }))
		).rejects.toThrow(PUPPETEER_HINT_PATTERN);
		// 起不来的会话不该在 work dir 里留一个空壳槽位。
		expect(runtime.spawned).toHaveLength(0);
	});

	it("同一台机器上没装 chromedriver 也照样能跑 CDP 会话", async () => {
		const runtime = makeRuntime();
		const provider = makeProvider(runtime, { chromedriverBin: undefined });
		await expect(provider.acquire(acquireInput())).resolves.toBeTruthy();
	});
});

describe("release / releaseContainer 的幂等", () => {
	it("release 杀进程组并删槽位目录，重复调不抛", async () => {
		const runtime = makeRuntime();
		const slot = await makeProvider(runtime).acquire(acquireInput());
		const slotDir = join(slotsRoot, "session-1");

		await slot.release();
		await expect(slot.release()).resolves.toBeUndefined();

		expect(runtime.killed[0]).toBe(FIRST_PID + 1);
		await expect(stat(slotDir)).rejects.toThrow();
	});

	it("releaseContainer 按 id 找 pid 杀进程组并删目录", async () => {
		const runtime = makeRuntime();
		const provider = makeProvider(runtime);
		await provider.acquire(acquireInput());

		await provider.releaseContainer("local-session-1");

		expect(runtime.killed).toEqual([FIRST_PID + 1]);
		await expect(stat(join(slotsRoot, "session-1"))).rejects.toThrow();
	});

	it("目录已经没了 / meta 里没有 pid，都静默成功", async () => {
		const runtime = makeRuntime();
		const provider = makeProvider(runtime);
		await createSlotDir(join(slotsRoot, "session-no-pid"), {
			expiresAtEpochSec: 1,
			mode: "cdp",
			pid: null,
		});

		await expect(
			provider.releaseContainer("local-session-no-pid")
		).resolves.toBeUndefined();
		await expect(
			provider.releaseContainer("local-已经不存在")
		).resolves.toBeUndefined();
		expect(runtime.killed).toEqual([]);
	});
});

describe("listManagedContainers", () => {
	it("把槽位目录映射成与容器同构的行", async () => {
		const runtime = makeRuntime();
		const provider = makeProvider(runtime);
		await provider.acquire(acquireInput());

		expect(await provider.listManagedContainers()).toEqual([
			{
				containerId: "local-session-1",
				expiresAtEpochSec: 1_800_000_000,
				sessionId: "session-1",
			},
		]);
	});

	it("meta 坏掉的槽位照样返回，两个字段置 null（reaper 据此照杀）", async () => {
		const runtime = makeRuntime();
		const provider = makeProvider(runtime);
		const brokenDir = join(slotsRoot, "session-broken");
		await createSlotDir(brokenDir, {
			expiresAtEpochSec: 1,
			mode: "cdp",
			pid: 1,
		});
		await writeFile(join(brokenDir, "meta.json"), "{ 这不是 JSON", "utf8");

		expect(await provider.listManagedContainers()).toEqual([
			{
				containerId: "local-session-broken",
				expiresAtEpochSec: null,
				sessionId: null,
			},
		]);
	});

	it("槽位根目录还不存在时回空数组（首次启动）", async () => {
		const provider = createLocalSlotProvider({
			binaryEnvNames: ENV_NAMES,
			chromeBin: CHROME_BIN,
			headless: true,
			lookup: LOOKUP,
			runtime: makeRuntime(),
			slotsRoot: join(slotsRoot, "还没建"),
		});
		expect(await provider.listManagedContainers()).toEqual([]);
	});
});
