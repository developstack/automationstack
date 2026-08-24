/**
 * 「最近访问的项目」——设置页在 URL 没带 projectId 时的默认选中项。
 *
 * 为什么要有它：一级侧栏是全局作用域的，而设置页里两项配置都是项目级的
 * （见 plan §7.5）。从侧栏点进来时地址栏里没有项目，此时落到「列表第一个」
 * 对多项目团队几乎必然是错的——人刚才在哪个项目里干活，就该配哪个项目。
 *
 * 用 localStorage 而不是 sessionStorage：设置是低频操作，往往是「昨天想起来
 * 要改」，跨会话记住才有意义（对比 ai-session-storage.ts 的会话恢复，那件事
 * 出了这个标签页就没意义了）。存的只是一个 uuid，不是凭据。
 */

const STORAGE_KEY = "automationstack.recent-project";

function localStore(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage;
	} catch {
		// Safari 隐私模式等场景下访问 localStorage 会抛，降级为不记忆。
		return null;
	}
}

export function readRecentProjectId(): string | null {
	try {
		return localStore()?.getItem(STORAGE_KEY) ?? null;
	} catch {
		// 读取本身也可能抛（配额/权限策略），记不住不该影响页面可用。
		return null;
	}
}

export function rememberRecentProjectId(projectId: string): void {
	try {
		localStore()?.setItem(STORAGE_KEY, projectId);
	} catch {
		// 写不进去只是下次进设置页要重新挑一次，不影响本次操作。
	}
}
