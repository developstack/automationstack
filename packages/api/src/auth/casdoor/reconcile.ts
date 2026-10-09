import {
	listCasdoorUsers,
	updateCasdoorUser,
} from "@automationstack/db/repositories/casdoor-users-repository";

import type { EffectiveAuthSettings } from "../settings-model";
import { getEffectiveAuthSettings } from "../settings-store";
import {
	type CasdoorConnection,
	connectionFingerprint,
	connectionFromSettings,
} from "./connection";
import { CasdoorManagementClient } from "./management-client";
import { planReconcile } from "./reconcile-plan";
import { createReconcileScheduler } from "./reconcile-scheduler";
import { describeError } from "./redact";

export type ReconcileResult =
	| { changed: number; kind: "done" }
	| { kind: "failed"; message: string }
	| { kind: "skipped"; reason: "not-casdoor" | "not-configured" };

export interface ReconcileLog {
	error: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
}

export interface ReconcileDeps {
	applyChange: typeof updateCasdoorUser;
	clientFor: (
		connection: CasdoorConnection
	) => Promise<Pick<CasdoorManagementClient, "getRole" | "listUsers">>;
	getSettings: () => Promise<EffectiveAuthSettings>;
	listLocalUsers: typeof listCasdoorUsers;
	log: ReconcileLog;
	now: () => Date;
}

let cachedClient: {
	client: CasdoorManagementClient;
	fingerprint: string;
} | null = null;

/** 按连接参数的指纹复用管理 API 客户端，所以 token 在多次对账之间缓存。 */
async function managementClientFor(
	connection: CasdoorConnection
): Promise<CasdoorManagementClient> {
	const fingerprint = await connectionFingerprint(connection);
	if (cachedClient?.fingerprint !== fingerprint) {
		cachedClient = {
			client: new CasdoorManagementClient({
				baseUrl: connection.internalUrl,
				clientId: connection.clientId,
				clientSecret: connection.clientSecret,
			}),
			fingerprint,
		};
	}
	return cachedClient.client;
}

const defaultDeps: ReconcileDeps = {
	applyChange: updateCasdoorUser,
	clientFor: managementClientFor,
	getSettings: getEffectiveAuthSettings,
	listLocalUsers: listCasdoorUsers,
	log: { error: console.error, info: console.log, warn: console.warn },
	now: () => new Date(),
};

async function readCasdoor(connection: CasdoorConnection, deps: ReconcileDeps) {
	const client = await deps.clientFor(connection);
	const [users, role] = await Promise.all([
		client.listUsers(connection.organization),
		client.getRole(connection.organization, connection.adminRole),
	]);
	return { role, users };
}

/**
 * 对账一次（plan 021 T11a、D13）。只在 casdoor 模式下执行。
 * 读取 Casdoor 失败时只写日志，不修改本地数据。只修改 auth_source = casdoor 的用户。
 */
export async function reconcileCasdoorUsers(
	deps: ReconcileDeps = defaultDeps
): Promise<ReconcileResult> {
	const settings = await deps.getSettings();
	if (settings.provider !== "casdoor") {
		return { kind: "skipped", reason: "not-casdoor" };
	}
	const connection = connectionFromSettings(settings);
	if (connection === null) {
		deps.log.warn("Casdoor 对账：连接参数不完整，跳过。");
		return { kind: "skipped", reason: "not-configured" };
	}
	let remote: Awaited<ReturnType<typeof readCasdoor>>;
	try {
		remote = await readCasdoor(connection, deps);
	} catch (error) {
		const message = describeError(error, [connection.clientSecret]);
		deps.log.error(`Casdoor 对账失败，本地数据不变：${message}`);
		return { kind: "failed", message };
	}
	if (remote.role === null) {
		deps.log.warn(
			`Casdoor 对账：组织 ${connection.organization} 中没有角色 ${connection.adminRole}，不修改任何角色。`
		);
	}
	const plan = planReconcile({
		adminRole: remote.role,
		casdoorUsers: remote.users,
		localUsers: await deps.listLocalUsers(),
		now: deps.now(),
		organization: connection.organization,
	});
	for (const warning of plan.warnings) {
		deps.log.warn(`Casdoor 对账：${warning}`);
	}
	for (const change of plan.changes) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐个更新，数量少，失败时前面的修改仍然有效
		await deps.applyChange(change.id, change.changes);
		deps.log.info(
			`Casdoor 对账：已同步用户「${change.username}」：${JSON.stringify(change.changes)}`
		);
	}
	return { changed: plan.changes.length, kind: "done" };
}

/** 进程内唯一的对账调度器。定期任务和 webhook 都通过它对账。 */
export const casdoorReconcileScheduler = createReconcileScheduler({
	run: () => reconcileCasdoorUsers(),
});
