/**
 * 本包对外的三个端口。**agent 只认接口，不认实现**：Postgres 适配器在
 * `packages/db/src/agent-adapters/`，provider 配置的读取在 `packages/ai`，
 * 组装在 `packages/api/src/lib/ai-ports.ts`。本文件不 import 任何运行时依赖。
 */
import type {
	CasePriority,
	CaseType,
	GenerationSessionStatus,
	ProposedCase,
} from "./types";

/**
 * 已解析、可直接用的模型配置。
 *
 * 密钥如何存（环境变量 / 登记表）、如何加解密、如何轮换，全是宿主的事：
 * 本包拿到的永远是一份已经解密好的明文配置，或者 `null`（没配）。
 */
export interface ResolvedProviderConfig {
	apiKey: string;
	baseUrl: string;
	modelId: string;
}

export interface ProviderConfigStore {
	/** 返回当前生效的配置；未配置时返回 `null`（不是抛错）。 */
	read: () => Promise<ResolvedProviderConfig | null>;
}

/** 已有用例摘要，由 `readExistingCases` 返回，供 agent 去重参考。 */
export interface ExistingCaseSummary {
	caseType: CaseType;
	id: string;
	name: string;
	priority: CasePriority;
	tags: string[];
}

/**
 * 只读的项目资料：模型靠它了解「这个项目现在有什么」。
 * 实现方负责把可见范围限制在当前项目内。
 */
export interface CaseCatalog {
	/** 项目的模块树大纲（含模块 id 的缩进文本）。 */
	listModulesOutline: (projectId: string) => Promise<string>;
	/** 指定模块下已有用例的摘要列表。 */
	readExistingCases: (moduleId: string) => Promise<ExistingCaseSummary[]>;
}

/** `updateStatus` 的入参；`error` 显式可空，别用 undefined 表示「没错」。 */
export interface SessionStatusUpdate {
	error: string | null;
	sessionId: string;
	status: GenerationSessionStatus;
}

/**
 * agent 跑一轮期间需要落盘的东西：落提案、更新本轮会话状态。
 *
 * **边界**：「采纳提案 → 创建真实用例」**不在这里**。那是宿主的业务动作
 * （写 `test_cases`、跨项目校验、发实时失效通知），留在 `packages/api` /
 * `packages/db` 原处，进了这个端口就等于把业务规则塞回 agent 包里。
 */
export interface SessionStore {
	/** 增量持久化提案，按入参顺序返回提案 id 列表。 */
	saveProposals: (
		sessionId: string,
		proposals: ProposedCase[]
	) => Promise<string[]>;
	/** 写入本轮会话状态（运行中 / 终态与错误信息）。 */
	updateStatus: (update: SessionStatusUpdate) => Promise<void>;
}

/** 跑一轮生成所需的全部端口。 */
export interface AgentPorts {
	caseCatalog: CaseCatalog;
	providerConfig: ProviderConfigStore;
	sessionStore: SessionStore;
}
