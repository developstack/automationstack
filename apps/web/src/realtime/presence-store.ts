import type {
	PresenceEntry,
	ServerMessage,
} from "@automationstack/api/realtime/protocol";

type StoreListener = () => void;

export const EMPTY_PRESENCE: PresenceEntry[] = [];

/**
 * 逐字段浅比较两个 entry。
 *
 * 字段清单严格对应 `presenceEntrySchema`（packages/api/src/realtime/protocol.ts:28-37）。
 * entry 每次都是从 WS JSON 帧新反序列化出来的对象，引用永远不等，只能比值。
 * protocol 里新增字段时必须同步补到这里：漏一个，该字段的变化就静默不重渲。
 */
const isSameEntry = (a: PresenceEntry, b: PresenceEntry): boolean =>
	a.clientId === b.clientId &&
	a.color === b.color &&
	a.editingCaseId === b.editingCaseId &&
	a.joinedAt === b.joinedAt &&
	a.name === b.name &&
	a.page === b.page &&
	a.view === b.view &&
	a.viewingCaseId === b.viewingCaseId;

const isSameSnapshot = (a: PresenceEntry[], b: PresenceEntry[]): boolean => {
	// 长度先比：人数变了必然是变化，省掉逐项。
	if (a.length !== b.length) {
		return false;
	}
	for (const [index, entry] of a.entries()) {
		const other = b[index];
		if (other === undefined || !isSameEntry(entry, other)) {
			return false;
		}
	}
	return true;
};

/**
 * joinedAt 相同时用 clientId 兜底定序。
 *
 * 只按 joinedAt 排时，并列项的次序取决于 Map 插入序，而 `presence:sync`
 * 会按服务端给的数组顺序整个重建 Map——同毫秒加入的两个人会在每次重连后
 * 交换位置，既让头像重排，也让下面的快照比较白白判定为「变了」。
 */
const compareEntries = (a: PresenceEntry, b: PresenceEntry): number => {
	if (a.joinedAt !== b.joinedAt) {
		return a.joinedAt - b.joinedAt;
	}
	if (a.clientId === b.clientId) {
		return 0;
	}
	return a.clientId < b.clientId ? -1 : 1;
};

/**
 * useSyncExternalStore 兼容的在线状态外部 store。
 * 快照数组按 joinedAt 排序并做引用缓存：内容不变时引用不变，避免多余重渲。
 * 方法均为箭头函数字段，可直接作为 hook 参数传递（this 已绑定）。
 *
 * 服务端的 `presence:sync` 只包含「其他人」，因此本端身份由 `setSelf`
 * 单独注入；一旦服务端回发了本端的 `presence:update`，以服务端版本为准。
 */
export class PresenceStore {
	private entries = new Map<string, PresenceEntry>();
	private readonly listeners = new Set<StoreListener>();
	private self: PresenceEntry | null = null;
	private snapshot: PresenceEntry[] = EMPTY_PRESENCE;

	apply = (message: ServerMessage): void => {
		switch (message.type) {
			case "presence:sync": {
				this.entries = new Map(
					message.entries.map((entry) => [entry.clientId, entry])
				);
				break;
			}
			case "presence:join":
			case "presence:update": {
				this.entries.set(message.entry.clientId, message.entry);
				break;
			}
			case "presence:leave": {
				if (!this.entries.delete(message.clientId)) {
					return;
				}
				break;
			}
			default:
				return;
		}
		this.commit();
	};

	clear = (): void => {
		if (this.entries.size === 0 && this.self === null) {
			return;
		}
		this.entries.clear();
		this.self = null;
		this.commit();
	};

	getSnapshot = (): PresenceEntry[] => this.snapshot;

	/** 注入/清除本端身份（服务端 sync 不含自己）；改名不改 joinedAt，避免头像重排。 */
	setSelf = (entry: PresenceEntry | null): void => {
		const previous = this.self;
		const keepsPlace =
			entry !== null &&
			previous !== null &&
			previous.clientId === entry.clientId;
		this.self = keepsPlace ? { ...entry, joinedAt: previous.joinedAt } : entry;
		this.commit();
	};

	subscribe = (listener: StoreListener): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	/**
	 * 合成快照；内容与上一次全等则保留旧数组引用且不通知。
	 *
	 * 消费者是 useSyncExternalStore，它只按引用判断是否重渲。原来这里无条件
	 * 新建数组，于是任何一条 presence 消息（同事从列表页切到脑图这种完全无关的
	 * 事件）都会让所有消费者判定为「变了」：case-table 的 CaseRow、以及没有分页的
	 * run-case-list 的几百个 RunCaseRow 都没有 memo，会整列表重渲。
	 *
	 * 比较对象刻意选的是合成后的 snapshot，而不是 entries / self 这些输入：
	 * self 的注入是「entries 里没有才补」的条件逻辑，只看输入判不出最终可见结果，
	 * 比如服务端已回发了自己的 presence:update 后再 setSelf(null)，输入变了但
	 * 快照没变，此时正确的行为恰恰是不通知。
	 */
	private commit(): void {
		const merged = new Map(this.entries);
		if (this.self !== null && !merged.has(this.self.clientId)) {
			merged.set(this.self.clientId, this.self);
		}
		const next = [...merged.values()].sort(compareEntries);
		if (isSameSnapshot(this.snapshot, next)) {
			return;
		}
		this.snapshot = next;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
