/**
 * 三个端口的 in-memory 假实现。
 *
 * 端口做成纯接口的直接好处就在这里：agent 的行为可以完全不连库、不连网、
 * 不读环境变量地钉住。本文件只被测试引用，刻意与测试分离——`tools.test.ts`
 * 与 `agent.test.ts` 共用同一套假实现，两边对「端口被怎么调用」的理解才不会
 * 各写一份然后悄悄分叉。
 */
import type {
	AgentPorts,
	CaseCatalog,
	ExistingCaseSummary,
	ProviderConfigStore,
	ResolvedProviderConfig,
	SessionStatusUpdate,
	SessionStore,
} from "./ports";
import type { ProposedCase } from "./types";

export interface FakeCaseCatalog extends CaseCatalog {
	/** 每次 readExistingCases 收到的 moduleId，按调用顺序记录。 */
	readonly existingCaseCalls: string[];
	/** 每次 listModulesOutline 收到的 projectId，按调用顺序记录。 */
	readonly outlineCalls: string[];
}

export interface FakeSessionStore extends SessionStore {
	/** 已落盘的提案，按 sessionId 归档。 */
	readonly saved: Map<string, ProposedCase[]>;
	readonly statusUpdates: SessionStatusUpdate[];
}

export interface FakeProviderConfigStore extends ProviderConfigStore {
	readonly readCount: () => number;
}

export function createFakeCaseCatalog(options?: {
	existingCases?: ExistingCaseSummary[];
	outline?: string;
}): FakeCaseCatalog {
	const outlineCalls: string[] = [];
	const existingCaseCalls: string[] = [];
	return {
		existingCaseCalls,
		listModulesOutline: (projectId) => {
			outlineCalls.push(projectId);
			return Promise.resolve(options?.outline ?? "- 登录 (id: m-1)");
		},
		outlineCalls,
		readExistingCases: (moduleId) => {
			existingCaseCalls.push(moduleId);
			return Promise.resolve(options?.existingCases ?? []);
		},
	};
}

export function createFakeSessionStore(): FakeSessionStore {
	const saved = new Map<string, ProposedCase[]>();
	const statusUpdates: SessionStatusUpdate[] = [];
	return {
		saved,
		saveProposals: (sessionId, proposals) => {
			const existing = saved.get(sessionId) ?? [];
			const offset = existing.length;
			saved.set(sessionId, [...existing, ...proposals]);
			// 与 Postgres 适配器同样的契约：id 顺序严格对应入参顺序。
			return Promise.resolve(
				proposals.map((_proposal, index) => `prop-${offset + index}`)
			);
		},
		statusUpdates,
		updateStatus: (update) => {
			statusUpdates.push(update);
			return Promise.resolve();
		},
	};
}

/** `config` 传 null 表示「宿主报告没配 provider」。 */
export function createFakeProviderConfigStore(
	config: ResolvedProviderConfig | null
): FakeProviderConfigStore {
	let readCount = 0;
	return {
		read: () => {
			readCount += 1;
			return Promise.resolve(config);
		},
		readCount: () => readCount,
	};
}

export interface FakePorts extends AgentPorts {
	caseCatalog: FakeCaseCatalog;
	providerConfig: FakeProviderConfigStore;
	sessionStore: FakeSessionStore;
}

export function createFakePorts(options?: {
	existingCases?: ExistingCaseSummary[];
	outline?: string;
	providerConfig?: ResolvedProviderConfig | null;
}): FakePorts {
	return {
		caseCatalog: createFakeCaseCatalog(options),
		providerConfig: createFakeProviderConfigStore(
			options?.providerConfig ?? null
		),
		sessionStore: createFakeSessionStore(),
	};
}
