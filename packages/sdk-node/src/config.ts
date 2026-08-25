import { resolveRunIdempotencyKey } from "./idempotency.js";

/**
 * SDK 配置（§5.1 / D31）。
 *
 * **只有 token + projectId + baseUrl 三样，没有第四样**，而且三样全都跨迭代不变。
 * 尤其**没有 `runId`**：每个迭代一个新测试任务，配置里写死 runId 意味着每个迭代
 * 都要有人去改 CI 变量，这种手动步骤第一次会忘、第二次就没人用了；
 * 归属由用例的 sourceRef 自己解析（§3.7）。
 *
 * `runIds`（复数）是**每次调用可以传的收窄白名单**，刻意不放进这里：
 * 放进配置文件它就变成了每迭代要维护的东西，D31 立刻作废。
 */
export interface ReporterConfig {
	baseUrl: string;
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	/** 一次进程一个，重试复用（§7.2 第 2 条）。 */
	idempotencyKey: string;
	overwriteManual: boolean;
	projectId: string;
	/** null = 全部候选。见上面为什么它不是配置项。 */
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

/** 顶层定义：这个正则每次解析配置都会用到，没必要每次重建一个。 */
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

/**
 * 显式参数 > 环境变量。显式参数是给「把配置写在自己的 reporter 里」的人留的，
 * 环境变量是给 CI 留的；两者都在时以代码里写的为准，否则同一份配置在本机和
 * CI 上表现不同，那是最难查的一类问题。
 *
 * 缺了就**立刻抛**：缺 token 这种事必须在跑测试之前炸，而不是等跑完二十分钟
 * 才发现结果无处可去。
 */
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
		// 末尾斜杠在这里一次性削掉：不削的话 `${baseUrl}/ingest/executions`
		// 会拼出 `//ingest/...`，有的反代会把它 301 到别处，而 301 之后
		// Authorization 头按规范是可以被丢掉的——表现就是莫名其妙的 401。
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
