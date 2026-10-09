import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	constructed: [] as unknown[],
	poolQuery: vi.fn(),
	registerAutoSubmitScan: vi.fn(),
	registerCasdoorReconcile: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({
	pool: { query: mocks.poolQuery },
}));

vi.mock("./auto-submit-scan", () => ({
	registerAutoSubmitScan: mocks.registerAutoSubmitScan,
}));

vi.mock("./casdoor-reconcile", () => ({
	registerCasdoorReconcile: mocks.registerCasdoorReconcile,
}));

vi.mock("pg-boss", () => ({
	PgBoss: class {
		constructor(options: unknown) {
			mocks.constructed.push(options);
		}
		on = vi.fn();
		start = mocks.start;
		stop = mocks.stop;
	},
}));

const { getJobsStatus, sharedPoolDb, startJobs, stopJobs } = await import(
	"./boss"
);

beforeEach(() => {
	vi.resetAllMocks();
	mocks.constructed.length = 0;
	mocks.start.mockResolvedValue(undefined);
	mocks.stop.mockResolvedValue(undefined);
	mocks.registerAutoSubmitScan.mockResolvedValue(undefined);
	mocks.registerCasdoorReconcile.mockResolvedValue(undefined);
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
