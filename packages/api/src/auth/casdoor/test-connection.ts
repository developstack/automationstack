import type { CustomFetch } from "openid-client";

import {
	type CasdoorConnectionDraft,
	type CasdoorField,
	describeMissingFields,
} from "./connection";
import {
	CasdoorManagementClient,
	type ManagementClientOptions,
} from "./management-client";
import { discoverCasdoor } from "./oidc";
import { describeError } from "./redact";

/** 测试连接的总时限（plan 021 T13、§10.1）。 */
export const CONNECTION_TEST_BUDGET_MS = 12_000;

const MS_PER_SECOND = 1000;

export type ConnectionStepId =
	| "adminRole"
	| "discovery"
	| "organization"
	| "token";

export type ConnectionStepStatus = "failed" | "passed" | "skipped";

export interface ConnectionStep {
	/** 失败或跳过的原因，通过时的说明。不包含密钥，最长 300 个字符。 */
	detail: string | null;
	id: ConnectionStepId;
	label: string;
	status: ConnectionStepStatus;
}

export interface ConnectionTestResult {
	ok: boolean;
	steps: ConnectionStep[];
}

export const CONNECTION_STEP_LABELS: Record<ConnectionStepId, string> = {
	adminRole: "平台管理员角色存在",
	discovery: "发现文档和 JWKS",
	organization: "读取组织",
	token: "用 client_credentials 获取管理 token",
};

export interface ConnectionTestDeps {
	discover: typeof discoverCasdoor;
	fetch: typeof fetch;
	managementClient: (
		options: ManagementClientOptions
	) => Pick<
		CasdoorManagementClient,
		"fetchToken" | "getOrganization" | "getRole"
	>;
}

const defaultDeps: ConnectionTestDeps = {
	discover: discoverCasdoor,
	fetch: (input, init) => fetch(input, init),
	managementClient: (options) => new CasdoorManagementClient(options),
};

type StepRun = () => Promise<string | null>;

class StepFailure extends Error {}

/** 一定失败的步骤，例如缺少字段时。 */
function failingStep(message: string): StepRun {
	return () => Promise.reject(new StepFailure(message));
}

function missing(
	draft: CasdoorConnectionDraft,
	fields: CasdoorField[]
): CasdoorField[] {
	return fields.filter((field) => !draft[field]);
}

interface Runner {
	budget: AbortSignal;
	secret: string | null;
	steps: ConnectionStep[];
}

async function runStep(
	runner: Runner,
	id: ConnectionStepId,
	run: StepRun | string
): Promise<boolean> {
	const step: ConnectionStep = {
		detail: null,
		id,
		label: CONNECTION_STEP_LABELS[id],
		status: "passed",
	};
	runner.steps.push(step);
	if (typeof run === "string") {
		Object.assign(step, { detail: run, status: "skipped" });
		return false;
	}
	if (runner.budget.aborted) {
		Object.assign(step, {
			detail: `超过 ${CONNECTION_TEST_BUDGET_MS / MS_PER_SECOND} 秒总时限`,
			status: "skipped",
		});
		return false;
	}
	try {
		step.detail = await run();
		return true;
	} catch (error) {
		const detail = runner.budget.aborted
			? `超过 ${CONNECTION_TEST_BUDGET_MS / MS_PER_SECOND} 秒总时限`
			: describeError(error, [runner.secret]);
		Object.assign(step, { detail, status: "failed" });
		return false;
	}
}

function budgetFetch(base: typeof fetch, budget: AbortSignal): CustomFetch {
	return (url, options) => {
		const signal = options.signal
			? AbortSignal.any([options.signal, budget])
			: budget;
		// openid-client 的请求体类型是 fetch 请求体类型的子集。
		return base(url, { ...options, signal } as RequestInit);
	};
}

function discoveryStep(
	draft: CasdoorConnectionDraft,
	runner: Runner,
	deps: ConnectionTestDeps
): StepRun {
	return async () => {
		const absent = missing(draft, ["issuer", "internalUrl", "clientId"]);
		if (absent.length > 0) {
			throw new StepFailure(describeMissingFields(absent));
		}
		const doFetch = budgetFetch(deps.fetch, runner.budget);
		const config = await deps.discover(
			{
				clientId: draft.clientId ?? "",
				clientSecret: draft.clientSecret ?? "",
				internalUrl: draft.internalUrl ?? "",
				issuer: draft.issuer ?? "",
				redirectUrl: null,
			},
			{
				fetch: doFetch,
				timeoutSeconds: CONNECTION_TEST_BUDGET_MS / MS_PER_SECOND,
			}
		);
		const jwksUri = config.serverMetadata().jwks_uri ?? "";
		const response = await deps.fetch(jwksUri, {
			headers: { accept: "application/json" },
			signal: runner.budget,
		});
		const jwks = (await response.json()) as { keys?: unknown };
		if (!(response.ok && Array.isArray(jwks.keys) && jwks.keys.length > 0)) {
			throw new StepFailure(`JWKS（${jwksUri}）中没有签名密钥`);
		}
		return `JWKS 地址：${jwksUri}`;
	};
}

/**
 * 测试 Casdoor 连接（plan 021 §10.1、§10.5 第 1 项）。每一步的结果是通过、失败或跳过。
 * 步骤：发现文档和 JWKS、client_credentials、读取组织、平台管理员角色存在。
 * 总时限 12 秒。结果中不包含 client secret。
 */
export async function testCasdoorConnection(
	draft: CasdoorConnectionDraft,
	deps: ConnectionTestDeps = defaultDeps
): Promise<ConnectionTestResult> {
	const runner: Runner = {
		budget: AbortSignal.timeout(CONNECTION_TEST_BUDGET_MS),
		secret: draft.clientSecret,
		steps: [],
	};
	await runStep(runner, "discovery", discoveryStep(draft, runner, deps));
	const credentialsMissing = missing(draft, [
		"internalUrl",
		"clientId",
		"clientSecret",
	]);
	const client = deps.managementClient({
		baseUrl: draft.internalUrl ?? "",
		clientId: draft.clientId ?? "",
		clientSecret: draft.clientSecret ?? "",
		fetch: deps.fetch,
		signal: runner.budget,
	});
	const tokenOk = await runStep(
		runner,
		"token",
		credentialsMissing.length > 0
			? failingStep(describeMissingFields(credentialsMissing))
			: async () => {
					await client.fetchToken();
					return null;
				}
	);
	const organization = draft.organization ?? "";
	await runStep(
		runner,
		"organization",
		organizationStep(draft, tokenOk, client)
	);
	await runStep(
		runner,
		"adminRole",
		adminRoleStep(draft, tokenOk, client, organization)
	);
	return {
		ok: runner.steps.every((step) => step.status === "passed"),
		steps: runner.steps,
	};
}

type ReadClient = Pick<CasdoorManagementClient, "getOrganization" | "getRole">;

const SKIPPED_NO_TOKEN = "管理 token 获取失败，跳过";

function organizationStep(
	draft: CasdoorConnectionDraft,
	tokenOk: boolean,
	client: ReadClient
): StepRun | string {
	if (!draft.organization) {
		return failingStep(describeMissingFields(["organization"]));
	}
	if (!tokenOk) {
		return SKIPPED_NO_TOKEN;
	}
	const name = draft.organization;
	return async () => {
		if ((await client.getOrganization(name)) === null) {
			throw new StepFailure(`Casdoor 中没有组织「${name}」`);
		}
		return null;
	};
}

function adminRoleStep(
	draft: CasdoorConnectionDraft,
	tokenOk: boolean,
	client: ReadClient,
	organization: string
): StepRun | string {
	if (!draft.adminRole) {
		return failingStep(describeMissingFields(["adminRole"]));
	}
	if (!(tokenOk && organization)) {
		return tokenOk ? "没有填写组织，跳过" : SKIPPED_NO_TOKEN;
	}
	const roleName = draft.adminRole;
	return async () => {
		const role = await client.getRole(organization, roleName);
		if (role === null) {
			throw new StepFailure(`组织「${organization}」中没有角色「${roleName}」`);
		}
		if (!role.isEnabled) {
			throw new StepFailure(
				`角色「${roleName}」已关闭：它的成员不会成为平台管理员`
			);
		}
		return `角色有 ${role.users.length} 个成员`;
	};
}
