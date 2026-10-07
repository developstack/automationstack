import { resolveRunIdempotencyKey } from "./idempotency.js";

export interface ReporterConfig {
	baseUrl: string;
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	idempotencyKey: string;
	overwriteManual: boolean;
	projectId: string;
	runIds: string[] | null;
	token: string;
}

export type ReporterConfigInput = Partial<
	Omit<ReporterConfig, "idempotencyKey">
> & {
	env?: Record<string, string | undefined>;
	idempotencyKey?: string;
};

export class ReporterConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReporterConfigError";
	}
}

const TRAILING_SLASHES = /\/+$/;

const MISSING_TOKEN =
	"缺少 AS_TOKEN：在 https://<你的平台地址>/api-tokens 建一个个人 token，明文只显示一次";
const MISSING_PROJECT =
	"缺少 AS_PROJECT：填这个仓库对应的项目 id（跟着仓库走，建一次不再变）";
const MISSING_BASE_URL =
	"缺少 AS_BASE_URL：填平台地址，例如 https://qa.example.com";

function trimmedOrNull(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function requireValue(
	explicit: string | undefined,
	fromEnv: string | undefined,
	missingMessage: string
): string {
	const value = explicit ?? trimmedOrNull(fromEnv);
	if (!value) {
		throw new ReporterConfigError(missingMessage);
	}
	return value;
}

export function resolveReporterConfig(
	input: ReporterConfigInput = {}
): ReporterConfig {
	const env = input.env ?? process.env;
	return {
		baseUrl: requireValue(
			input.baseUrl,
			env.AS_BASE_URL,
			MISSING_BASE_URL
		).replace(TRAILING_SLASHES, ""),
		branch: input.branch ?? trimmedOrNull(env.AS_BRANCH),
		ciUrl: input.ciUrl ?? trimmedOrNull(env.AS_CI_URL),
		commitSha: input.commitSha ?? trimmedOrNull(env.AS_COMMIT_SHA),
		idempotencyKey: input.idempotencyKey ?? resolveRunIdempotencyKey(env),
		overwriteManual: input.overwriteManual ?? false,
		projectId: requireValue(input.projectId, env.AS_PROJECT, MISSING_PROJECT),
		runIds: input.runIds ?? null,
		token: requireValue(input.token, env.AS_TOKEN, MISSING_TOKEN),
	};
}
