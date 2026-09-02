/**
 * 会话与节点之间那一条外键的**连库**往返测试（plan §12）。
 *
 * 跳过条件、清场方式与「为什么必须真连库」的完整理由见
 * `farm-node-repository.test.ts` 的文件头，这里不重复。
 *
 * 单独一个文件而不是并进那一份：这里测的是 `farm-session-repository` 与
 * `farm_sessions.node_id` 的行为（外键语义、列表页的 join），被测对象不是节点
 * 仓储。合在一起只会让「哪个仓储坏了」这个问题需要先读一遍套件名。
 *
 * 要守的两条，都只有数据库答得出来：
 * - `nodeId` 能原样落库、并被列表页 join 成 `nodeName`；
 * - **注销节点不带走它跑过的会话**（`on delete set null`）。第二条写错的表现是
 *   删一台机器顺手删掉一批历史会话与录制产物，且没有任何地方会报错。
 */

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectTestDb, hasTestDatabase } from "../db-test-connect";
import { farmNodes } from "../schema/farm-nodes";
import { farmSessions } from "../schema/farm-sessions";
import { projects } from "../schema/projects";

type NodeRepository = typeof import("./farm-node-repository");
type SessionRepository = typeof import("./farm-session-repository");
type Db = Awaited<ReturnType<typeof connectTestDb>>;

const RUN_ID = crypto.randomUUID();
const NAME_PREFIX = `test-farm-link-${RUN_ID}-`;

let nodeRepo: NodeRepository;
let sessionRepo: SessionRepository;
let db: Db;
let projectId: string;

const nameOf = (suffix: string): string => `${NAME_PREFIX}${suffix}`;

/** 会话行的必填快照列。取什么值无所谓，这些测试一列都不看它们。 */
function sessionRow(overrides: { id: string; nodeId?: string }) {
	return {
		browser: "chromium",
		image: "automationstack-browser-chromium:140",
		projectId,
		protocol: "webdriver" as const,
		version: "140",
		...overrides,
	};
}

async function readSessionNodeId(
	id: string
): Promise<string | null | undefined> {
	const [row] = await db
		.select({ nodeId: farmSessions.nodeId })
		.from(farmSessions)
		.where(eq(farmSessions.id, id));
	return row?.nodeId;
}

describe.skipIf(!hasTestDatabase)("farm_sessions.node_id（连库往返）", () => {
	beforeAll(async () => {
		db = await connectTestDb();
		nodeRepo = await import("./farm-node-repository");
		sessionRepo = await import("./farm-session-repository");
		const [project] = await db
			.insert(projects)
			.values({ name: nameOf("project") })
			.returning({ id: projects.id });
		if (!project) {
			throw new Error("测试准备失败：项目没插进去");
		}
		projectId = project.id;
	});

	afterAll(async () => {
		// 会话随项目 cascade 消失，所以只要删项目与节点两处。
		// `db` 为空只可能是 beforeAll 自己就没跑通，那时没有任何行需要清。
		await db?.delete(projects).where(like(projects.name, `${NAME_PREFIX}%`));
		await db?.delete(farmNodes).where(like(farmNodes.name, `${NAME_PREFIX}%`));
	});

	it("createSession 带 nodeId 时原样落列", async () => {
		const { node } = await nodeRepo.createNode({
			backend: "local",
			name: nameOf("carrier"),
		});
		const sessionId = crypto.randomUUID();
		const created = await sessionRepo.createSession(
			sessionRow({ id: sessionId, nodeId: node.id })
		);
		expect(created.nodeId).toBe(node.id);
		expect(await readSessionNodeId(sessionId)).toBe(node.id);
	});

	it("不传 nodeId 就是 null——那是 farm 内建 provider 跑的会话", async () => {
		const sessionId = crypto.randomUUID();
		const created = await sessionRepo.createSession(
			sessionRow({ id: sessionId })
		);
		expect(created.nodeId).toBeNull();
	});

	it("listSessionsByProject 把节点名 join 出来，内建的那条是 null", async () => {
		const { node } = await nodeRepo.createNode({
			backend: "docker",
			name: nameOf("named"),
		});
		const onNodeId = crypto.randomUUID();
		const builtinId = crypto.randomUUID();
		await sessionRepo.createSession(
			sessionRow({ id: onNodeId, nodeId: node.id })
		);
		await sessionRepo.createSession(sessionRow({ id: builtinId }));
		const { items } = await sessionRepo.listSessionsByProject({
			limit: 50,
			offset: 0,
			projectId,
		});
		const byId = new Map(items.map((item) => [item.id, item]));
		expect(byId.get(onNodeId)?.nodeName).toBe(node.name);
		expect(byId.get(builtinId)?.nodeName).toBeNull();
	});

	it("updateSessionStatus 回填 nodeId：建行时还不知道会落到哪台机器上", async () => {
		const { node } = await nodeRepo.createNode({
			backend: "local",
			name: nameOf("backfill"),
		});
		const sessionId = crypto.randomUUID();
		await sessionRepo.createSession(sessionRow({ id: sessionId }));
		const result = await sessionRepo.updateSessionStatus(sessionId, {
			containerId: "slot-1",
			nodeId: node.id,
			status: "running",
		});
		expect(result.kind).toBe("updated");
		expect(await readSessionNodeId(sessionId)).toBe(node.id);
	});

	it("回填 nodeId 同样吃终态守卫：已落定的行不会被改", async () => {
		const { node } = await nodeRepo.createNode({
			backend: "local",
			name: nameOf("settled"),
		});
		const sessionId = crypto.randomUUID();
		await sessionRepo.createSession(sessionRow({ id: sessionId }));
		await sessionRepo.updateSessionStatus(sessionId, { status: "completed" });
		const late = await sessionRepo.updateSessionStatus(sessionId, {
			nodeId: node.id,
			status: "running",
		});
		expect(late.kind).toBe("settled");
		// 迟到的回填落不进去，这正是那道守卫该有的样子。
		expect(await readSessionNodeId(sessionId)).toBeNull();
	});

	it("注销节点：会话仍在，nodeId 变 null（on delete set null，不是 cascade）", async () => {
		const { node } = await nodeRepo.createNode({
			backend: "local",
			name: nameOf("doomed"),
		});
		const sessionId = crypto.randomUUID();
		await sessionRepo.createSession(
			sessionRow({ id: sessionId, nodeId: node.id })
		);
		expect(await nodeRepo.removeNode(node.id)).toBe(true);
		// 行还在——这是这条测试的全部意义：删机器不该带走历史排查材料。
		const survivor = await sessionRepo.findSessionById(sessionId);
		expect(survivor).not.toBeNull();
		expect(survivor?.nodeId).toBeNull();
		const { items } = await sessionRepo.listSessionsByProject({
			limit: 50,
			offset: 0,
			projectId,
		});
		expect(items.find((item) => item.id === sessionId)?.nodeName).toBeNull();
	});
});
