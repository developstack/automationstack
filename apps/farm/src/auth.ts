import { resolveUserFromBearer } from "@automationstack/api/auth/bearer";
import { tokenCanEnterProject } from "@automationstack/api/lib/ingest/ingest-project-access";
import { hashApiToken } from "@automationstack/db/api-token";
import { findActiveApiTokenByHash } from "@automationstack/db/repositories/api-tokens-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import type { User } from "@automationstack/db/schema/users";

import type { AsOptions } from "./wd/capabilities";

/**
 * farm 两条数据面的**同一道门**（plan §5.3 / §5.4 / D7）。
 *
 * 两种协议只有「凭据装在哪」不同——WebDriver 装在 caps 的 `as:options` 里，
 * CDP 装在 URL query 里——认下来之后的四步判定完全一样。所以这里只有一个
 * `authenticateFarmRequest`，两条路径各自把凭据取出来喂给它；判定顺序、
 * 失败语义、要不要区分「项目不存在」与「你不是成员」这些事只写一遍。
 *
 * ## 复用的是 ingest 那条链路，不是 oRPC 那条
 *
 * farm 与 `/ingest`、`/mcp` 同类：机器调用方，没有会话 cookie，凭据是
 * `as_live_*` token。`packages/api/src/auth/bearer.ts` 的文件头写死了
 * 「token 的权限等于其主人的权限」，而 `lib/ingest/ingest-project-access.ts`
 * 是这句话的项目级那一半。两个都直接调，**不经 `createContext`**——
 * 把 bearer 折进 oRPC context 会让一枚 token 拿到整个 `/rpc` 面，
 * bearer.ts 的注释点名了这件事。
 *
 * ## 失败语义按协议翻译，但不在这里翻
 *
 * 这里只回类型化的 outcome。WebDriver 要把它翻成 W3C 的
 * `session not created`（HTTP 500，格式见 `wd/proxy.ts`），CDP 要在**升级握手
 * 之前**回 401/403——两种表达方式差得太远，合成一个「HTTP 状态码」反而要在
 * 两边各解一次。同 `packages/api/src/lib/ingest/execution-ingest.ts` 的分工。
 */

/** 一次数据面请求认下来的身份 + 它自报的元信息。 */
export interface FarmIdentity {
	/**
	 * 开会话所用 token 的行 id，落 `farm_sessions.api_token_id` 供审计
	 * （「一个人有多枚 token，出事时要查的是哪一枚在开会话」）。
	 *
	 * 可为 null：`resolveUserFromBearer` 只回用户不回 token 行，这一列是**认证
	 * 成立之后**补查的一次审计查询，它与那次认证之间存在一个极小的窗口
	 * （期间 token 被吊销）。窗口里补查落空只让这一列变成 null，
	 * **不影响已经成立的认证**——审计信息缺一条，不该把一次合法会话打回。
	 */
	apiTokenId: string | null;
	/** `as:options.externalRef`，Phase D 与 automation_executions 关联用。 */
	externalRef: string | null;
	/** `as:options.name`，纯展示。 */
	label: string | null;
	projectId: string;
	user: User;
}

export type FarmAuthOutcome =
	| { kind: "forbidden"; message: string }
	| { kind: "ok"; identity: FarmIdentity }
	| { kind: "unauthorized"; message: string };

/**
 * token → 用户 → 项目成员。**不区分「项目不存在」与「你不是这个项目的成员」**：
 * 区分了就等于告诉调用者「这个 uuid 是一个真实项目，只是不归你」，
 * 那本身就是一次信息泄露（与 `farm-session-repository.requestKill` 同一条取舍）。
 *
 * 但「项目压根不存在」这一步仍然要查：不查的话，平台 admin 拿着一个拼错的
 * projectId 能一路走到建库行那一步，然后死在外键上——那时候容器都拉起来了，
 * 报错信息还指向数据库。
 */
export async function authenticateFarmRequest(
	options: AsOptions
): Promise<FarmAuthOutcome> {
	const user = await resolveUserFromBearer(`Bearer ${options.token}`);
	if (user === null) {
		return {
			kind: "unauthorized",
			message: "token 无效、已吊销，或其主人的账号已停用",
		};
	}
	const known = await projectExists(options.projectId);
	if (!(known && (await tokenCanEnterProject(user, options.projectId)))) {
		return {
			kind: "forbidden",
			message: `无权访问项目 ${options.projectId}（项目不存在或你不是它的成员）`,
		};
	}
	return {
		identity: {
			apiTokenId: await resolveApiTokenId(options.token),
			externalRef: options.externalRef ?? null,
			label: options.name ?? null,
			projectId: options.projectId,
			user,
		},
		kind: "ok",
	};
}

/** 审计用的 token 行 id；查不到或查失败一律 null（理由见 `FarmIdentity.apiTokenId`）。 */
async function resolveApiTokenId(plaintext: string): Promise<string | null> {
	try {
		const token = await findActiveApiTokenByHash(await hashApiToken(plaintext));
		return token?.id ?? null;
	} catch (error) {
		console.warn("补查 API Token 行失败，会话的 api_token_id 记为 null", error);
		return null;
	}
}

/** CDP 连接串上的全部参数：凭据部分与 WebDriver 的 `as:options` 一一对应。 */
export interface CdpConnectParams {
	browserName: string | null;
	browserVersion: string | null;
	options: AsOptions;
}

export type CdpQueryParse =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; params: CdpConnectParams };

function queryValue(query: URLSearchParams, key: string): string | null {
	const value = query.get(key);
	return value !== null && value.length > 0 ? value : null;
}

/**
 * `ws://farm:3002/cdp?token=...&projectId=...&browser=chromium&version=140` 的解析。
 *
 * `node`（点名槽位来源，plan §12）同样按这条对应关系走：它在 caps 那边叫
 * `as:options.node`，在这里就叫 `node`。
 *
 * 参数名与 `as:options` 的字段名刻意保持一致（token / projectId / name /
 * externalRef），只有浏览器那两个短一些（`browser` / `version`）：CDP 这条路径
 * 上没有 capabilities 这个东西，`browserName` 这个名字在 query string 里除了长
 * 没有任何额外含义。
 *
 * ⚠️ token 出现在 URL 里，会进 access log。这是 `connectOverCDP()` 的形态决定的
 * （它只接一个 ws URL，没有地方放 header），不是我们选的。farm 自己的 hono
 * logger 打的是 hono 的路由路径不含 query，但**任何放在 farm 前面的反代都要
 * 显式关掉 query 记录**——这条约束写在部署文档里，代码这一层管不住。
 */
export function parseCdpQuery(query: URLSearchParams): CdpQueryParse {
	const token = queryValue(query, "token");
	const projectId = queryValue(query, "projectId");
	if (!(token && projectId)) {
		return {
			kind: "invalid",
			message: "连接串缺少 token 或 projectId 查询参数",
		};
	}
	const options: AsOptions = { projectId, token };
	const name = queryValue(query, "name");
	if (name !== null) {
		options.name = name;
	}
	const externalRef = queryValue(query, "externalRef");
	if (externalRef !== null) {
		options.externalRef = externalRef;
	}
	const node = queryValue(query, "node");
	if (node !== null) {
		options.node = node;
	}
	return {
		kind: "ok",
		params: {
			browserName: queryValue(query, "browser"),
			browserVersion: queryValue(query, "version"),
			options,
		},
	};
}
