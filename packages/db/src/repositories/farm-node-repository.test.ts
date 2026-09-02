/**
 * `farm-node-repository` 的**连库**往返测试（plan §12）。
 *
 * ## 为什么这一份必须真的连库
 *
 * 本仓 `packages/db` 的既有测试全是纯函数（快照 no-op 判定、状态机终态集合……），
 * 理由写在根 `vitest.config.ts` 的 `db` project 上：那边不连库、没有
 * `DATABASE_URL`，CI 的 `pnpm test` 也一个环境变量都不给。
 *
 * 但节点这一块要守的东西**没有一条能在纯函数里守住**：
 * - 「库里只剩散列、明文只回一次」是一次真实 INSERT 之后回读那一列才看得见的；
 * - 「重名直接失败」是 `farm_nodes_name_uq` 的行为，不是任何一段 TS 的行为；
 * - 「注销节点不带走它跑过的会话」是外键 `on delete set null` 的行为。
 * 这三条的失败模式全是静默的（凭据泄露、两台机器重名、会话记录整批消失），
 * 而它们恰恰是这张表存在的全部理由。
 *
 * ## 于是用 `skipIf` 而不是把 db project 改成连库
 *
 * 顶层**只 import 纯模块与 schema**（schema 模块只依赖 drizzle，不碰 env），
 * 真正建连接的那次 import 藏在 `connectTestDb()` 里，只在开关为真时才发生。
 * 开关与那两条纪律见 `../db-test-connect.ts`。没有显式 `DATABASE_URL` 时整个
 * 套件跳过，连一次 import 都不会发生——CI 的「四个 project 全是纯函数、
 * 不需要任何环境变量」那句话仍然成立。
 *
 * 本地跑法：`DATABASE_URL=postgresql://... pnpm vitest run --project db`。
 * 建的行全部带一个本次运行独有的名字前缀，`afterAll` 按前缀清干净，
 * 因此跑在开发库上也不会污染既有数据。
 */

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectTestDb, hasTestDatabase } from "../db-test-connect";
import { FARM_NODE_TOKEN_PREFIX, hashFarmNodeToken } from "../farm-node-token";
import { FARM_NODE_DEFAULT_MAX_SLOTS, farmNodes } from "../schema/farm-nodes";

type NodeRepository = typeof import("./farm-node-repository");
type Db = Awaited<ReturnType<typeof connectTestDb>>;

/** 本次运行独有，`afterAll` 就是按它清场的。 */
const NAME_PREFIX = `test-farm-node-${crypto.randomUUID()}-`;

let repo: NodeRepository;
let db: Db;

const nameOf = (suffix: string): string => `${NAME_PREFIX}${suffix}`;

/** 直读那一列——这是唯一能回答「库里到底存了什么」的办法。 */
async function readStoredHash(id: string): Promise<string | undefined> {
	const [row] = await db
		.select({ tokenHash: farmNodes.tokenHash })
		.from(farmNodes)
		.where(eq(farmNodes.id, id));
	return row?.tokenHash;
}

describe.skipIf(!hasTestDatabase)("farm-node-repository（连库往返）", () => {
	beforeAll(async () => {
		db = await connectTestDb();
		repo = await import("./farm-node-repository");
	});

	afterAll(async () => {
		// `db` 为空只可能是 beforeAll 自己就没跑通，那时没有任何行需要清。
		await db?.delete(farmNodes).where(like(farmNodes.name, `${NAME_PREFIX}%`));
	});

	it("createNode 明文只此一次，库里存的是它的散列", async () => {
		const created = await repo.createNode({
			backend: "local",
			name: nameOf("create"),
		});
		expect(created.token.startsWith(FARM_NODE_TOKEN_PREFIX)).toBe(true);
		const stored = await readStoredHash(created.node.id);
		expect(stored).toBe(await hashFarmNodeToken(created.token));
		// 明文本身绝不在库里，且返回的节点对象上根本没有 tokenHash 这个键——
		// 后者是「哈希不离开 Postgres」在类型之外的运行时证据。
		expect(stored).not.toBe(created.token);
		expect(Object.keys(created.node)).not.toContain("tokenHash");
	});

	it("createNode 缺省时走列默认值：2 个槽、启用、从没心跳过", async () => {
		const { node } = await repo.createNode({
			backend: "docker",
			name: nameOf("defaults"),
		});
		expect(node.maxSlots).toBe(FARM_NODE_DEFAULT_MAX_SLOTS);
		expect(node.enabled).toBe(true);
		expect(node.lastSeenAt).toBeNull();
		expect(node.backend).toBe("docker");
	});

	it("createNode 显式 maxSlots 覆盖默认值", async () => {
		const slots = 7;
		const { node } = await repo.createNode({
			backend: "local",
			maxSlots: slots,
			name: nameOf("slots"),
		});
		expect(node.maxSlots).toBe(slots);
	});

	it("重名直接抛——唯一约束兜底，不静默变成第二台同名机器", async () => {
		const name = nameOf("dup");
		await repo.createNode({ backend: "local", name });
		await expect(
			repo.createNode({ backend: "docker", name })
		).rejects.toThrow();
	});

	it("listNodes 含停用行，且一律不带 tokenHash", async () => {
		const { node } = await repo.createNode({
			backend: "local",
			name: nameOf("listed"),
		});
		await repo.updateNode(node.id, { enabled: false });
		const listed = (await repo.listNodes()).find((row) => row.id === node.id);
		expect(listed?.enabled).toBe(false);
		expect(listed && Object.keys(listed)).not.toContain("tokenHash");
	});

	it("findNodeByToken 认得出对的那一份", async () => {
		const created = await repo.createNode({
			backend: "local",
			name: nameOf("auth-ok"),
		});
		const found = await repo.findNodeByToken(created.token);
		expect(found?.id).toBe(created.node.id);
		expect(found?.name).toBe(created.node.name);
	});

	it("findNodeByToken 对错 token / 空串 / 别人的 token 一律 null", async () => {
		const mine = await repo.createNode({
			backend: "local",
			name: nameOf("auth-mine"),
		});
		const other = await repo.createNode({
			backend: "local",
			name: nameOf("auth-other"),
		});
		expect(await repo.findNodeByToken("")).toBeNull();
		expect(await repo.findNodeByToken(`${mine.token}x`)).toBeNull();
		expect(
			await repo.findNodeByToken(
				mine.token.slice(FARM_NODE_TOKEN_PREFIX.length)
			)
		).toBeNull();
		// 别人的凭据当然认得出来，但认出来的必须是别人那一台。
		expect((await repo.findNodeByToken(other.token))?.id).toBe(other.node.id);
	});

	it("findNodeByToken 不过滤 enabled（停用与凭据不对必须分得开）", async () => {
		const created = await repo.createNode({
			backend: "local",
			name: nameOf("auth-disabled"),
		});
		await repo.updateNode(created.node.id, { enabled: false });
		const found = await repo.findNodeByToken(created.token);
		expect(found?.enabled).toBe(false);
	});

	it("rotateNodeToken 换一份新的，旧串当场失效", async () => {
		const created = await repo.createNode({
			backend: "local",
			name: nameOf("rotate"),
		});
		const rotated = await repo.rotateNodeToken(created.node.id);
		expect(rotated?.token.startsWith(FARM_NODE_TOKEN_PREFIX)).toBe(true);
		expect(rotated?.token).not.toBe(created.token);
		expect(await repo.findNodeByToken(created.token)).toBeNull();
		expect((await repo.findNodeByToken(rotated?.token ?? ""))?.id).toBe(
			created.node.id
		);
		// 轮换同样只回明文：库里换成了新明文的散列，没有留下任何旧凭据的痕迹。
		expect(await readStoredHash(created.node.id)).toBe(
			await hashFarmNodeToken(rotated?.token ?? "")
		);
	});

	it("rotateNodeToken 对不存在的 id 回 null，且不凭空建行", async () => {
		const ghostId = crypto.randomUUID();
		expect(await repo.rotateNodeToken(ghostId)).toBeNull();
		expect(await readStoredHash(ghostId)).toBeUndefined();
	});

	it("updateNode 三项都能改，backend 不在可改项里", async () => {
		const { node } = await repo.createNode({
			backend: "local",
			maxSlots: 1,
			name: nameOf("update"),
		});
		const renamed = nameOf("update-renamed");
		const slots = 4;
		const updated = await repo.updateNode(node.id, {
			enabled: false,
			maxSlots: slots,
			name: renamed,
		});
		expect(updated).toMatchObject({
			backend: "local",
			enabled: false,
			id: node.id,
			maxSlots: slots,
			name: renamed,
		});
	});

	it("updateNode 空 patch 原样回带当前行，不发空 UPDATE", async () => {
		const { node } = await repo.createNode({
			backend: "docker",
			name: nameOf("update-noop"),
		});
		expect(await repo.updateNode(node.id, {})).toEqual(node);
	});

	it("updateNode 对不存在的 id 回 null（与 browser 仓储同一条存在性语义）", async () => {
		expect(
			await repo.updateNode(crypto.randomUUID(), { enabled: false })
		).toBeNull();
		expect(await repo.updateNode(crypto.randomUUID(), {})).toBeNull();
	});

	it("removeNode 删掉回 true，再删同一个回 false", async () => {
		const { node } = await repo.createNode({
			backend: "local",
			name: nameOf("remove"),
		});
		expect(await repo.removeNode(node.id)).toBe(true);
		expect(await repo.removeNode(node.id)).toBe(false);
		expect(await repo.updateNode(node.id, {})).toBeNull();
	});

	it("touchNodeLastSeen 落时刻，重复调用只是往前刷（幂等，不建行不报错）", async () => {
		const { node } = await repo.createNode({
			backend: "local",
			name: nameOf("heartbeat"),
		});
		await repo.touchNodeLastSeen(node.id);
		const first = (await repo.updateNode(node.id, {}))?.lastSeenAt;
		expect(first).toBeInstanceOf(Date);
		await repo.touchNodeLastSeen(node.id);
		const second = (await repo.updateNode(node.id, {}))?.lastSeenAt;
		expect(second?.getTime()).toBeGreaterThanOrEqual(first?.getTime() ?? 0);
	});

	it("touchNodeLastSeen 对不存在的 id 是空操作：不抛、也不建行", async () => {
		const ghostId = crypto.randomUUID();
		await expect(repo.touchNodeLastSeen(ghostId)).resolves.toBeUndefined();
		expect(await repo.updateNode(ghostId, {})).toBeNull();
	});
});
