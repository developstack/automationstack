import { AsyncLocalStorage } from "node:async_hooks";

const clientIpStorage = new AsyncLocalStorage<string>();

export function runWithClientIp<T>(clientIp: string | null, run: () => T): T {
	if (clientIp === null) {
		return run();
	}
	return clientIpStorage.run(clientIp, run);
}

export function getClientIp(): string | null {
	return clientIpStorage.getStore() ?? null;
}
