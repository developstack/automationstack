const CLIENT_ID_STORAGE_KEY = "realtime:client-id";

export interface RealtimeProfile {
	color: string;
	name: string;
}

export function getClientId(): string {
	if (typeof window === "undefined") {
		return crypto.randomUUID();
	}
	const existing = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
	if (existing) {
		return existing;
	}
	const clientId = crypto.randomUUID();
	window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
	return clientId;
}
