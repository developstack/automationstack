import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	constructed: [] as unknown[],
	getSchedules: vi.fn(),
	poolQuery: vi.fn(),
	registerAutoSubmitScan: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
	unschedule: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({
	pool: { query: mocks.poolQuery },
}));

vi.mock("./auto-submit-scan", () => ({
	registerAutoSubmitScan: mocks.registerAutoSubmitScan,
}));

vi.mock("pg-boss", () => ({
	PgBoss: class {
		constructor(options: unknown) {
			mocks.constructed.push(options);
		}
		getSchedules = mocks.getSchedules;
		on = vi.fn();
		start = mocks.start;
		stop = mocks.stop;
		unschedule = mocks.unschedule;
	},
}));

const { getJobsStatus, sharedPoolDb, startJobs, stopJobs } = await import(
	"./boss"
);

beforeEach(() => {
	vi.resetAllMocks();
	mocks.constructed.length = 0;
	mocks.getSchedules.mockResolvedValue([]);
	mocks.start.mockResolvedValue(undefined);
	mocks.stop.mockResolvedValue(undefined);
	mocks.registerAutoSubmitScan.mockResolvedValue(undefined);
	mocks.unschedule.mockResolvedValue(undefined);
});

afterEach(async () => {
	await stopJobs();
});

test("pg-boss 共用应用连接池，不自建第二个池", async () => {
	await startJobs();
	expect(getJobsStatus()).toBe("running");
	expect(mocks.constructed).toHaveLength(1);
	const options = mocks.constructed[0] as Record<string, unknown>;
	expect(options.db).toBe(sharedPoolDb);
	expect(options).not.toHaveProperty("connectionString");
	expect(options).not.toHaveProperty("max");
	expect(options.useListenNotify).not.toBe(true);
});

test("共享适配器把 SQL 原样转给应用池的 query", async () => {
	const result = { rows: [{ ok: 1 }] };
	mocks.poolQuery.mockResolvedValue(result);
	await expect(sharedPoolDb.executeSql("select $1", [1])).resolves.toBe(result);
	expect(mocks.poolQuery).toHaveBeenCalledWith("select $1", [1]);
});

test("启动时删除以前的 Casdoor 对账计划；删除失败时后台任务照常启动", async () => {
	mocks.getSchedules.mockResolvedValue([{ name: "casdoor-reconcile" }]);
	mocks.unschedule.mockRejectedValue(new Error("no such schedule"));
	await startJobs();
	expect(mocks.unschedule).toHaveBeenCalledWith("casdoor-reconcile");
	expect(getJobsStatus()).toBe("running");
});

test("没有旧的计划时不删除，也不打告警", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	await startJobs();
	expect(mocks.unschedule).not.toHaveBeenCalled();
	expect(warn).not.toHaveBeenCalled();
	expect(getJobsStatus()).toBe("running");
	warn.mockRestore();
});
