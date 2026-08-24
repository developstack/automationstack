/**
 * 「新建用例」草稿的本地缓存：键的格式、读写删、枚举与老键迁移。
 * 结构定义与不可信输入的解析在 `case-draft-parse.ts`。
 *
 * ## 为什么是 localStorage 而不是数据库草稿行
 *
 * 新建用例刻意**不在数据库里建草稿行**：那会让版本历史从 v0 开始、让列表里长出
 * 一堆没人认领的半成品，还要额外一个清理定时任务。代价是「浏览器意外关掉」时
 * 用户白打了一屏字——这个模块补的就是这一处，把正文与「图片对照表」留在本机。
 *
 * 用 localStorage 而不是 sessionStorage：用户的原话是「浏览器意外关掉了就没了」，
 * 而 sessionStorage 恰恰就是「关掉标签页即失效」，那等于没补。
 *
 * ## 为什么键是 {projectId}.{caseId}
 *
 * 原来是 `{projectId}.{moduleId}`，含义是「一个模块最多一份草稿」。后果是用户
 * 在有草稿的模块里点「新建用例」再敲一个字，就把上一份**静默覆盖**掉了；而且
 * 「新建」永远只能是「把那份草稿恢复出来」，想建全新的一条只能先删草稿。
 *
 * 改成按草稿自己的 caseId 寻址之后：同一个模块可以并存任意多份草稿，每一份都
 * 能被单独恢复、单独删除。moduleId 挪进 value（见 `CaseDraft.moduleId`）。
 * 跨模块混淆的老顾虑没有消失，只是换了个地方兜住：清单里每条都显示所属模块，
 * 「继续编辑」带着 moduleId 一起导航，恢复出来的内容一定回到它原来的模块。
 *
 * SSR：除了 `subscribeCaseDrafts`（一个不碰 window 的模块级订阅表，见其旁注），
 * 本文件只导出纯函数，`typeof window` 的判断在里面；调用方必须在
 * `useEffect` 里调（这一页会 SSR，首帧读存储会触发 hydration 报错，
 * 理由见 `workspace/use-module-expansion.ts` 文件头）。
 */
import {
	type CaseDraft,
	parseCaseDraft,
} from "@/components/cases/case-draft-parse";

const STORAGE_PREFIX = "automationstack.case-draft.";

function localStore(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage;
	} catch {
		// Safari 隐私模式等场景下光是访问 localStorage 就会抛，降级为不缓存。
		return null;
	}
}

function draftKey(projectId: string, caseId: string): string {
	return `${STORAGE_PREFIX}${projectId}.${caseId}`;
}

/**
 * 同一个标签页内的草稿变更通知。
 *
 * ## 为什么非要有它
 *
 * `storage` 事件**只在别的标签页写入时**触发，写入它的那个标签页自己永远收不到。
 * 于是最常见的那条路径——「在本页的抽屉里写了一份草稿」——侧栏的「未完成草稿」
 * 那一行一个通知都拿不到；而它在数量为 0 时整行不渲染，用户连一个「打开时顺带
 * 重读」的入口都没有，只能刷新整页才看得见。变更的发起方就在本模块里，
 * 让它写完自己说一声，比让每个读者去猜什么时候该重读要短得多。
 *
 * ## ⚠️ 只有公开的写/删会发通知，迁移不发
 *
 * `listCaseDrafts` 里的老键迁移（`canonicalize`）同样会写 localStorage，但刻意
 * **不**走这里：订阅者的回调正是回头去调 `listCaseDrafts`，迁移一发通知就成了
 * 「读 → 迁 → 通知 → 再读」的自激。迁移是幂等的（第二趟已经没有键可迁，一个
 * 字都不再写），所以就算发了也最多多转一圈就收敛，不会真的转不停；但那一圈纯属
 * 白烧——迁移只是把同一份草稿换个键存，清单的内容一个字没变，本来就无事可通知。
 */
const draftListeners = new Set<() => void>();

/** 订阅本标签页内的草稿变更；返回退订函数。跨标签页请另外听 `storage` 事件。 */
export function subscribeCaseDrafts(listener: () => void): () => void {
	draftListeners.add(listener);
	return () => {
		draftListeners.delete(listener);
	};
}

function notifyCaseDrafts(): void {
	// 先拷一份再遍历：回调里退订是常态（React 组件卸载就会这么干），
	// 而「遍历途中被就地改掉的 Set 还会不会把剩下的走完」是个要翻规范才敢下
	// 结论的问题。拷贝把它变成不用想的事，代价是几个函数引用。
	for (const listener of [...draftListeners]) {
		listener();
	}
}

/**
 * 把一条记录搬到它该在的键上，并把老键删掉。
 *
 * 迁移而不是「忽略老键」：老键里躺着的是用户**现在就能在侧栏看到**的草稿，
 * 忽略等于当着他的面把内容弄没了（还会留下一批再也没人引用的 R2 图）。
 * 迁移只发生在本来就要做的那次遍历里，代价是一次 setItem + 一次 removeItem。
 *
 * 顺带把「键后缀和 caseId 对不上」的记录也一起归位（手改过、或将来某次格式
 * 变更留下的）：删除是按 `{projectId}.{caseId}` 算键的，键要是对不上，那条
 * 草稿在界面上就会变成一条删不掉的幽灵。
 *
 * setItem 先于 removeItem：写失败（配额满/隐私模式）就保持原样，下次再迁一遍，
 * 绝不会出现「老的删了新的没写进去」。
 *
 * ⚠️ 这里直接操作 `store`，**不走 `writeCaseDraft` 也不发 `notifyCaseDrafts`**：
 * 除了 savedAt 会被盖掉，还因为通知的订阅者回头就来调 `listCaseDrafts`，
 * 而迁移正发生在 `listCaseDrafts` 里边——自激的详细账在订阅表那段旁注。
 */
function canonicalize(
	store: Storage,
	projectId: string,
	key: string,
	draft: CaseDraft
): void {
	const canonical = draftKey(projectId, draft.caseId);
	if (canonical === key) {
		return;
	}
	try {
		// 原样写回而不是走 writeCaseDraft：savedAt 必须保持原值，
		// 迁移不是一次编辑，把它盖成 now 会让一份放了半个月的草稿显示成「刚刚」。
		store.setItem(canonical, JSON.stringify(draft));
		store.removeItem(key);
	} catch {
		// 迁不动就先留着，内存里那份已经是修正过的，本次使用完全不受影响。
	}
}

/**
 * 老格式（键 = `{projectId}.{moduleId}`）的 value 里没有 moduleId，
 * 只能从键的后缀把它捡回来。
 *
 * 只有在「后缀不等于 caseId」时才这么认：新格式的后缀就是 caseId，要是
 * 它的 value 又恰好缺了 moduleId（被改坏），把 caseId 当成模块 id 会造出一条
 * 指向不存在模块的草稿，「继续编辑」点进去必然创建失败。这种就让它留着空串，
 * 按孤儿走「只能删」那条路。
 */
function withModuleId(draft: CaseDraft, keySuffix: string): CaseDraft {
	if (draft.moduleId !== "" || keySuffix === draft.caseId) {
		return draft;
	}
	return { ...draft, moduleId: keySuffix };
}

/** 按草稿自己的 caseId 取回一份。找不到（已被删/从来没有）回 null。 */
export function readCaseDraft(
	projectId: string,
	caseId: string
): CaseDraft | null {
	try {
		const direct = parseCaseDraft(
			localStore()?.getItem(draftKey(projectId, caseId)) ?? null
		);
		if (direct !== null && direct.moduleId !== "") {
			return direct;
		}
	} catch {
		// 读本身也可能抛（配额/权限策略），交给下面的遍历再试一次。
	}
	/*
	 * 直读落空还要再遍历一遍：这份草稿可能还在老键上——用户完全可能没打开过
	 * 侧栏那份清单（迁移就发生在那儿），而是直接从别处点了「继续编辑」。
	 * 遍历顺带把它迁成新格式，所以这条慢路每份草稿最多只走一次。
	 */
	return (
		listCaseDrafts(projectId).find((item) => item.caseId === caseId) ?? null
	);
}

/**
 * 写入。**失败一律静默**：草稿缓存是锦上添花，绝不能因为它（配额写满、
 * 隐私模式、企业策略禁用存储）让新建用例这件事整个不能用。
 */
export function writeCaseDraft(
	projectId: string,
	draft: Omit<CaseDraft, "savedAt">
): void {
	try {
		localStore()?.setItem(
			draftKey(projectId, draft.caseId),
			// savedAt 由这里盖章而不是让调用方传：它的语义就是「写进去的那一刻」，
			// 而且这样调用方要写的那个对象就不含时间戳，可以直接拿来做防抖比对
			// （否则每次渲染时间都变，比对永远认为「内容变了」，防抖等于不存在）。
			JSON.stringify({ ...draft, savedAt: Date.now() })
		);
	} catch {
		// 写不进去只是这次意外关闭恢复不了，本次编辑一个字都不受影响。
		// 提前收工：什么都没变，发通知只会让每个订阅者白扫一遍全部键。
		return;
	}
	notifyCaseDrafts();
}

export function clearCaseDraft(projectId: string, caseId: string): void {
	try {
		localStore()?.removeItem(draftKey(projectId, caseId));
	} catch {
		// 同上：删不掉最多是清单里多留一条，用户再点一次删除。
		return;
	}
	notifyCaseDrafts();
}

/**
 * 这个项目在本机留下的全部草稿，按写入时刻从新到旧。同一个模块可以有多份。
 *
 * 只能靠遍历 localStorage 来找：草稿是一条一个键存的，没有任何索引，
 * 而维护一份索引就意味着两处写入要保持一致，任何一次写崩都会让索引与实际
 * 长期对不上——遍历几十个键的代价远小于那份不一致。
 *
 * 遍历到的东西一律当不可信输入：别的应用/别的项目的键靠前缀滤掉，
 * 内容一律过 `parseCaseDraft`（坏 JSON、老版本结构都会回 null 而被跳过），
 * 绝不在这里另写一套宽松解析。整个过程再包一层 try：Safari 隐私模式下
 * `store.length` / `key()` 同样会抛，抛了就当作这台机器上没有草稿——
 * 侧栏不能因为读不到缓存就整块崩掉。
 */
export function listCaseDrafts(projectId: string): CaseDraft[] {
	const store = localStore();
	if (store === null) {
		return [];
	}
	const prefix = `${STORAGE_PREFIX}${projectId}.`;
	const found: { draft: CaseDraft; key: string }[] = [];
	try {
		for (let index = 0; index < store.length; index += 1) {
			const key = store.key(index);
			if (key === null || !key.startsWith(prefix)) {
				continue;
			}
			const suffix = key.slice(prefix.length);
			const draft = suffix === "" ? null : parseCaseDraft(store.getItem(key));
			if (draft !== null) {
				found.push({ draft: withModuleId(draft, suffix), key });
			}
		}
	} catch {
		return [];
	}
	/*
	 * 迁移放在遍历**之后**：`store.key(index)` 的下标随键集合变化，
	 * 边遍历边删会让后面的键整体前移，必漏读。
	 */
	for (const item of found) {
		canonicalize(store, projectId, item.key, item.draft);
	}
	return found.map((item) => item.draft).sort((a, b) => b.savedAt - a.savedAt);
}
