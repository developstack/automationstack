export class FakeStorage implements Storage {
	private readonly map = new Map<string, string>();

	get length(): number {
		return this.map.size;
	}

	clear(): void {
		this.map.clear();
	}

	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.map.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.map.delete(key);
	}

	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
}

export class HostileStorage extends FakeStorage {
	override get length(): number {
		throw new Error("storage disabled");
	}

	override getItem(): string | null {
		throw new Error("storage disabled");
	}

	override removeItem(): void {
		throw new Error("storage disabled");
	}

	override setItem(): void {
		throw new Error("storage disabled");
	}
}

export function installStorage(store: Storage = new FakeStorage()): Storage {
	(globalThis as { window?: unknown }).window = { localStorage: store };
	return store;
}

export function uninstallStorage(): void {
	(globalThis as { window?: unknown }).window = undefined;
}
