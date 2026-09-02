/**
 * `farm-node-capability-repository` 的**连库**往返测试（plan §12）。
 *
 * 为什么这一份也必须真的连库，理由与 `farm-node-repository.test.ts` 同源：这三个
 * 函数要守的东西没有一条能在纯函数里守住——
 * - 「能力清单原样存进 jsonb 再原样读回来」是 Postgres 的 jsonb 往返，不是任何一段
 *   TS 的行为（键序、`undefined` 的可选项、`null` 版本号都在这条路上）；
 * - 「记一次探测顺手清掉重新探测标记」是**同一条 UPDATE** 的行为，分两次写的 bug
 *   在假 db 上照样绿；
 * - 「重复下令保留第一次的时刻」是 `coalesce` 的行为。
 * 这三条的失败模式全是静默的（清单读回来变形、一次点击探两次、时长统计被清零）。
 *
 * 跳过规则、清场方式与本地跑法逐字同上一份：没有显式 `DATABASE_URL` 时整套跳过，
 * 建的行带本次运行独有的名字前缀，`afterAll` 按前缀清干净。
 * `DATABASE_URL=postgresql://... pnpm vitest run --project db`
 */

import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectTestDb, hasTestDatabase } from "../db-test-connect";
import { farmNodes } from "../schema/farm-nodes";

type NodeRepository = typeof import("./farm-node-repository");
type Db = Awaited<ReturnType<typeof connectTestDb>>;

/** 本次运行独有，`afterAll` 就是按它清场的。 */
const NAME_PREFIX = `test-farm-node-caps-${crypto.randomUUID()}-`;

let repo: NodeRepository;
let db: Db;

const nameOf = (suffix: string): string => `${NAME_PREFIX}${suffix}`;

/** 一份带齐了所有可选项形态的清单：可用的、不可用带原因的、版本读不出来的。 */
const SAMPLE_CAPABILITIES: NodeCapabilities = {
	backend: "local",
	browsers: [
		{
			available: true,
			bin: "/usr/bin/chromium",
			name: "chromium",
			version: "140",
		},
		{
			available: false,
			name: "safari",
			reason: "本期不支持：无法并发多会话",
			version: "18",
		},
		{ available: true, channel: "beta", name: "firefox", version: null },
	],
	detectedAtEpochSec: 1_788_000_000,
};

/** 直读那两列——这是唯一能回答「同一条 UPDATE 到底写了什么」的办法。 */
async function readCapabilityColumns(id: string) {
	const [row] = await db
		.select({
			capabilities: farmNodes.capabilities,
			capabilitiesUpdatedAt: farmNodes.capabilitiesUpdatedAt,
			refreshRequestedAt: farmNodes.refreshRequestedAt,
		})
		.from(farmNodes)
		.where(eq(farmNodes.id, id));
	return row;
}

describe.skipIf(!hasTestDatabase)(
	"farm-node-capability-repository（连库往返）",
	() => {
		beforeAll(async () => {
			db = await connectTestDb();
			repo = await import("./farm-node-repository");
		});

		afterAll(async () => {
			// `db` 为空只可能是 beforeAll 自己就没跑通，那时没有任何行需要清。
			await db
				?.delete(farmNodes)
				.where(like(farmNodes.name, `${NAME_PREFIX}%`));
		});

		it("新节点的三列全空：从没探测过与「探到空清单」是两件事", async () => {
			const { node } = await repo.createNode({
				backend: "local",
				name: nameOf("fresh"),
			});
			expect(node.capabilities).toBeNull();
			expect(node.capabilitiesUpdatedAt).toBeNull();
			expect(node.refreshRequestedAt).toBeNull();
		});

		it("saveNodeCapabilities 原样往返 jsonb，并盖上探测时刻", async () => {
			const { node } = await repo.createNode({
				backend: "local",
				name: nameOf("save"),
			});
			await repo.saveNodeCapabilities(node.id, SAMPLE_CAPABILITIES);
			const stored = await readCapabilityColumns(node.id);
			// 逐字相等：可选项缺席（chromium 没有 reason）与 version: null 都要活着回来
			expect(stored?.capabilities).toEqual(SAMPLE_CAPABILITIES);
			expect(stored?.capabilitiesUpdatedAt).toBeInstanceOf(Date);
		});

		it("记一次探测**顺手清掉**重新探测标记（同一条 UPDATE）", async () => {
			const { node } = await repo.createNode({
				backend: "docker",
				name: nameOf("clears"),
			});
			expect(await repo.requestNodeRefresh(node.id)).toBe(true);
			expect(
				(await readCapabilityColumns(node.id))?.refreshRequestedAt
			).not.toBe(null);
			await repo.saveNodeCapabilities(node.id, SAMPLE_CAPABILITIES);
			// 留着标记的话，farm 的下一拍会照着它再探一遍——一次点击探两次
			expect(
				(await readCapabilityColumns(node.id))?.refreshRequestedAt
			).toBeNull();
		});

		it("重复下令保留第一次的时刻，行不存在则返回 false", async () => {
			const { node } = await repo.createNode({
				backend: "local",
				name: nameOf("idempotent"),
			});
			await repo.requestNodeRefresh(node.id);
			const first = (await readCapabilityColumns(node.id))?.refreshRequestedAt;
			await repo.requestNodeRefresh(node.id);
			// 用 now() 直接覆盖的话，每点一次就把「下令到探完花了多久」清零一次
			expect(
				(await readCapabilityColumns(node.id))?.refreshRequestedAt
			).toEqual(first);
			expect(await repo.requestNodeRefresh(crypto.randomUUID())).toBe(false);
		});

		it("listRefreshRequestedNodeIds 只给还挂着标记的，且不筛在线/启用", async () => {
			const requested = await repo.createNode({
				backend: "local",
				name: nameOf("queued"),
			});
			const done = await repo.createNode({
				backend: "local",
				name: nameOf("consumed"),
			});
			// 停用的机器照样要能探：管理员正是靠这份清单决定要不要把它重新启用
			await repo.updateNode(requested.node.id, { enabled: false });
			await repo.requestNodeRefresh(requested.node.id);
			await repo.requestNodeRefresh(done.node.id);
			await repo.saveNodeCapabilities(done.node.id, SAMPLE_CAPABILITIES);

			const queued = await repo.listRefreshRequestedNodeIds();
			expect(queued).toContain(requested.node.id);
			expect(queued).not.toContain(done.node.id);
		});

		it("listNodes 带回能力三列——管理页画一张表就够，不再逐行拉一次", async () => {
			const { node } = await repo.createNode({
				backend: "docker",
				name: nameOf("listed"),
			});
			await repo.saveNodeCapabilities(node.id, SAMPLE_CAPABILITIES);
			const listed = (await repo.listNodes()).find((row) => row.id === node.id);
			expect(listed?.capabilities).toEqual(SAMPLE_CAPABILITIES);
			expect(listed?.capabilitiesUpdatedAt).toBeInstanceOf(Date);
			// 哈希仍然不外泄：加了三列不该顺带把选列表写松
			expect(listed && Object.keys(listed)).not.toContain("tokenHash");
		});
	}
);
