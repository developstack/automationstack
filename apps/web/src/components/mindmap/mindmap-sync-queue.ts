/**
 * Ordering for the optimistic mindmap sync.
 *
 * Structural edits are discrete, so nothing is debounced — but two edits that
 * touch the same node (or a node and its brand-new parent) must reach the
 * server in the order the user made them. Every task therefore waits on the
 * in-flight chain of each entity id it depends on, while unrelated nodes keep
 * running in parallel. The queue also remembers the tempId → real id mapping
 * the server returns, so a rename that raced its own create still targets the
 * right row.
 */

const noop = () => {
	// chain bookkeeping only: the caller owns the rejection
};

export class MindmapSyncQueue {
	private readonly chains = new Map<string, Promise<unknown>>();
	private readonly realIds = new Map<string, string>();

	/** Drops every chain; used when the canvas unmounts. */
	clear(): void {
		this.chains.clear();
		this.realIds.clear();
	}

	/** Runs `task` after every task already queued for one of `keys`. */
	enqueue<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
		const pending = keys.map(
			(key) => this.chains.get(key) ?? Promise.resolve()
		);
		const next = Promise.allSettled(pending).then(task);
		const settled = next.catch(noop);
		for (const key of keys) {
			this.chains.set(key, settled);
		}
		return next;
	}

	/** Records the id the server minted for a tempId and keeps the chain. */
	link(tempId: string, realId: string): void {
		this.realIds.set(tempId, realId);
		const chain = this.chains.get(tempId);
		if (chain !== undefined) {
			this.chains.set(realId, chain);
		}
	}

	/** Real entity id for a possibly temporary id. */
	resolve(id: string): string {
		return this.realIds.get(id) ?? id;
	}
}
