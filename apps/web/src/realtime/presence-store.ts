import type {
	PresenceEntry,
	ServerMessage,
} from "@automationstack/api/realtime/protocol";

type StoreListener = () => void;

export const EMPTY_PRESENCE: PresenceEntry[] = [];

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

	private commit(): void {
		const merged = new Map(this.entries);
		if (this.self !== null && !merged.has(this.self.clientId)) {
			merged.set(this.self.clientId, this.self);
		}
		this.snapshot = [...merged.values()].sort(
			(a, b) => a.joinedAt - b.joinedAt
		);
		for (const listener of this.listeners) {
			listener();
		}
	}
}
