import type {
	PresenceEntry,
	ServerMessage,
} from "@automationstack/api/realtime/protocol";

type StoreListener = () => void;

export const EMPTY_PRESENCE: PresenceEntry[] = [];

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

const compareEntries = (a: PresenceEntry, b: PresenceEntry): number => {
	if (a.joinedAt !== b.joinedAt) {
		return a.joinedAt - b.joinedAt;
	}
	if (a.clientId === b.clientId) {
		return 0;
	}
	return a.clientId < b.clientId ? -1 : 1;
};

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
