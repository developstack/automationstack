/**
 * 「上次生成会话」在 sessionStorage 里的读写。
 *
 * 提案在后端已落库，刷新后只要还记得 sessionId 就能用 `ai.getSession`
 * 把评审列表恢复出来；key 带 projectId，避免多个项目互相覆盖。
 */

const KEY_PREFIX = "automationstack.ai-session.";

function sessionStore(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.sessionStorage;
	} catch {
		// Safari 隐私模式等场景下访问 sessionStorage 会抛错，降级为不持久化。
		return null;
	}
}

function storageKey(projectId: string): string {
	return `${KEY_PREFIX}${projectId}`;
}

export function readStoredSessionId(projectId: string): string | null {
	return sessionStore()?.getItem(storageKey(projectId)) ?? null;
}

export function writeStoredSessionId(
	projectId: string,
	sessionId: string
): void {
	sessionStore()?.setItem(storageKey(projectId), sessionId);
}

export function clearStoredSessionId(projectId: string): void {
	sessionStore()?.removeItem(storageKey(projectId));
}
