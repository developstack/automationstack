/**
 * 建会话前的三次「造对象」：选镜像、造内存会话、造库行。
 *
 * 从 `launch.ts` 拆出来：那份文件到了 413 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这三步有一个共同的
 * 性质——**它们都还没有申请任何外部资源**。跑到这里为止失败都不需要清理（没有
 * 容器、没有槽位、没有工作目录），而 `launch.ts` 剩下的那一半恰恰全是「失败了要
 * 放掉什么」。把「造」与「清」分在两个文件里，读的时候不必反复切换心智。
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { FarmBrowser } from "@automationstack/db/schema/farm-browsers";
import type { NewFarmSession } from "@automationstack/db/schema/farm-sessions";

import { farmConfig } from "./config";
import { finalizeSession } from "./finalize";
import type { FarmDataPlaneDeps, LaunchSessionInput } from "./launch";
import { createLiveSession, type LiveSession } from "./session";

type BrowserPick =
	| { kind: "error"; message: string }
	| { kind: "ok"; row: FarmBrowser };

/**
 * 选镜像（D3）：点名了版本就按 (族, 版本) 精确取，没点名就走目录里的 default。
 *
 * 三种失败要分开说，因为用户该做的事完全不同：平台没这个版本（换一个）、
 * 版本被停用了（找管理员）、连默认浏览器都没有（平台没配好，用户做什么都没用）。
 */
export async function pickBrowser(
	deps: FarmDataPlaneDeps,
	browserName: string | null,
	browserVersion: string | null
): Promise<BrowserPick> {
	if (browserVersion === null) {
		const fallback = await deps.browsers.findDefaultBrowser();
		return fallback === null
			? { kind: "error", message: "平台没有配置可用的默认浏览器" }
			: { kind: "ok", row: fallback };
	}
	const name = browserName ?? "chromium";
	const row = await deps.browsers.findBrowserByNameVersion(
		name,
		browserVersion
	);
	if (row === null) {
		return {
			kind: "error",
			message: `平台不提供 ${name} ${browserVersion}`,
		};
	}
	if (!row.enabled) {
		return {
			kind: "error",
			message: `${name} ${browserVersion} 已被管理员停用，请改用其它版本`,
		};
	}
	return { kind: "ok", row };
}

export function buildSessionRow(
	input: LaunchSessionInput,
	session: LiveSession,
	row: FarmBrowser
): NewFarmSession {
	return {
		apiTokenId: input.identity.apiTokenId,
		browser: row.browser,
		externalRef: input.identity.externalRef,
		id: session.id,
		image: row.image,
		label: input.identity.label,
		projectId: input.identity.projectId,
		protocol: input.protocol,
		// 已剥掉 as:options（`wd/capabilities.ts` 文件头第 1 条），这里存的是安全的那一份。
		requestedCapabilities: input.requestedCapabilities ?? null,
		status: "starting",
		userId: input.identity.user.id,
		version: row.version,
	};
}

/** 建内存会话对象。超时回调统一走收尾，两种超时对应同一个终态 `timed_out`。 */
export function createSessionShell(
	input: LaunchSessionInput,
	row: FarmBrowser
): LiveSession {
	const id = randomUUID();
	return createLiveSession({
		browser: row.browser,
		id,
		// CDP 不设空闲超时：一条开着的 WS 上多久没有帧不代表会话空闲（§5.2）。
		idleTimeoutMs:
			input.protocol === "webdriver" ? farmConfig.session.idleTimeoutMs : null,
		image: row.image,
		maxLifetimeMs: farmConfig.session.maxLifetimeMs,
		onExpired: (session, reason) => {
			// biome-ignore lint/complexity/noVoid: 计时器回调不能是 async，收尾本来就是 fire-and-forget
			void finalizeSession({
				deps: input.deps,
				reason,
				session,
				status: "timed_out",
			});
		},
		projectId: input.identity.projectId,
		protocol: input.protocol,
		version: row.version,
		workDir: join(farmConfig.workDir, "sessions", id),
	});
}
