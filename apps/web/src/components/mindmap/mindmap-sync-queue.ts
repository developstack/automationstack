// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
const noop = () => {};

export class MindmapSyncQueue {
	private readonly chains = new Map<string, Promise<unknown>>();
	private readonly realIds = new Map<string, string>();

	clear(): void {
		this.chains.clear();
		this.realIds.clear();
	}

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

	link(tempId: string, realId: string): void {
		this.realIds.set(tempId, realId);
		const chain = this.chains.get(tempId);
		if (chain !== undefined) {
			this.chains.set(realId, chain);
		}
	}

	resolve(id: string): string {
		return this.realIds.get(id) ?? id;
	}
}
