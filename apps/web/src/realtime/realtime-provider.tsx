import { colorForName } from "@automationstack/api/realtime/presence-color";
import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { env } from "@automationstack/env/web";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { useCurrentUser } from "@/components/auth/use-session";

import { RealtimeConnection, type RealtimeStatus } from "./connection";
import { getClientId, type RealtimeProfile } from "./identity";
import { noopCleanup } from "./noop-cleanup";
import { PresenceStore } from "./presence-store";
import { RealtimeContext, type RealtimeContextValue } from "./realtime-context";
import { useInvalidateAll, useRealtimeInvalidate } from "./realtime-invalidate";

const DEFAULT_VIEW = "list";

interface RealtimeStores {
	presenceStore: PresenceStore;
}

interface IdentityState {
	clientId: string | null;
	identity: RealtimeProfile;
}

function useIdentityState(): IdentityState {
	const { username } = useCurrentUser();
	const [clientId, setClientId] = useState<string | null>(null);
	useEffect(() => {
		setClientId(getClientId());
	}, []);
	const identity = useMemo(
		() => ({ color: colorForName(username), name: username }),
		[username]
	);
	return { clientId, identity };
}

function buildSelfEntry(
	clientId: string,
	identity: RealtimeProfile,
	view: string
): PresenceEntry {
	return {
		clientId,
		color: identity.color,
		editingCaseId: null,
		joinedAt: Date.now(),
		name: identity.name,
		page: null,
		view,
		viewingCaseId: null,
	};
}

interface ConnectionParams {
	clientId: string | null;
	identity: RealtimeProfile;
	onReconnect: () => void;
	projectId: string;
	serverUrl: string;
	stores: RealtimeStores;
	view: string;
}

function useRealtimeConnection(params: ConnectionParams): {
	connection: RealtimeConnection | null;
	status: RealtimeStatus;
} {
	const { clientId, projectId, serverUrl, stores } = params;
	const [connection, setConnection] = useState<RealtimeConnection | null>(null);
	const [status, setStatus] = useState<RealtimeStatus>("closed");
	const onReconnectRef = useRef(params.onReconnect);
	const identityRef = useRef(params.identity);
	const viewRef = useRef(params.view);
	useEffect(() => {
		onReconnectRef.current = params.onReconnect;
		identityRef.current = params.identity;
		viewRef.current = params.view;
	});
	useEffect(() => {
		if (clientId === null) {
			return noopCleanup;
		}
		const nextConnection = new RealtimeConnection({
			clientId,
			onReconnect: () => onReconnectRef.current(),
			onStatusChange: setStatus,
			projectId,
			serverUrl,
			view: viewRef.current,
		});
		const unsubscribe = nextConnection.subscribe((message) => {
			stores.presenceStore.apply(message);
		});
		stores.presenceStore.setSelf(
			buildSelfEntry(clientId, identityRef.current, viewRef.current)
		);
		nextConnection.connect();
		setConnection(nextConnection);
		return () => {
			unsubscribe();
			nextConnection.dispose();
			stores.presenceStore.clear();
			setConnection(null);
		};
	}, [clientId, projectId, serverUrl, stores]);
	return { connection, status };
}

interface ViewSyncParams {
	clientId: string | null;
	connection: RealtimeConnection | null;
	identity: RealtimeProfile;
	stores: RealtimeStores;
	view: string;
}

function useViewSync({
	clientId,
	connection,
	identity,
	stores,
	view,
}: ViewSyncParams): void {
	useEffect(() => {
		if (!(clientId && connection)) {
			return noopCleanup;
		}
		connection.updatePresence({ view });
		stores.presenceStore.setSelf(buildSelfEntry(clientId, identity, view));
		return noopCleanup;
	}, [clientId, connection, identity, stores, view]);
}

function useReconnectHandler(onReconnect?: () => void): () => void {
	const invalidateAll = useInvalidateAll();
	return useCallback(() => {
		invalidateAll();
		onReconnect?.();
	}, [invalidateAll, onReconnect]);
}

interface RealtimeValueParams {
	clientId: string | null;
	connection: RealtimeConnection | null;
	status: RealtimeStatus;
	stores: RealtimeStores;
}

function useRealtimeValue({
	clientId,
	connection,
	status,
	stores,
}: RealtimeValueParams): RealtimeContextValue {
	return useMemo(
		() => ({
			clientId,
			connection,
			presenceStore: stores.presenceStore,
			status,
		}),
		[clientId, connection, status, stores]
	);
}

const createStores = (): RealtimeStores => ({
	presenceStore: new PresenceStore(),
});

interface RealtimeProviderProps {
	children: ReactNode;
	onReconnect?: () => void;
	projectId: string;
	serverUrl?: string;
	view?: string;
}

export function RealtimeProvider({
	children,
	onReconnect,
	projectId,
	serverUrl,
	view,
}: RealtimeProviderProps) {
	const [stores] = useState<RealtimeStores>(createStores);
	const { clientId, identity } = useIdentityState();
	const handleReconnect = useReconnectHandler(onReconnect);
	const resolvedView = view ?? DEFAULT_VIEW;
	const { connection, status } = useRealtimeConnection({
		clientId,
		identity,
		onReconnect: handleReconnect,
		projectId,
		serverUrl: serverUrl ?? env.VITE_SERVER_URL,
		stores,
		view: resolvedView,
	});
	useViewSync({
		clientId,
		connection,
		identity,
		stores,
		view: resolvedView,
	});
	useRealtimeInvalidate(connection, clientId);
	const value = useRealtimeValue({ clientId, connection, status, stores });
	return (
		<RealtimeContext.Provider value={value}>
			{children}
		</RealtimeContext.Provider>
	);
}
