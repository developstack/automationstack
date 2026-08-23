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

/**
 * 协作身份 = 登录用户名，没有本地昵称这一层。
 * 颜色用与服务端同一个 colorForName，所以服务端回发 presence 之前
 * 本端先画出来的头像不会变色。
 * clientId 只在水合后的 effect 里取（区分标签页，与身份无关），
 * SSR 阶段保持 null，连接因此不会在服务端建立。
 */
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

/** 本端 presence 条目：服务端 sync 只含他人，自己的头像由前端注入。 */
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
		// 刚连上时还没打开任何用例；抽屉挂载后由 useCasePresence 上报
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

/**
 * clientId 就绪后建立连接并把入站消息路由到两个 store。
 * onReconnect / identity / view 走 ref：切视图不触发重连
 * （改由 useViewSync 发 presence:update）。
 */
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

/**
 * 切视图后发 presence:update 同步给房间（无需重连）。
 * 补丁里只有 view：name / color 被 presencePatchSchema 排除在外，
 * 客户端一旦带上，整条消息会被服务端判为非法而丢弃。
 */
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

/** 重连成功后先全量 invalidate 补漏，再交给外部回调。 */
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

/** 组装并缓存下发给 hook 的 context 值。 */
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
	/** 额外的重连回调；Provider 自身已经做过全量 invalidate 补漏。 */
	onReconnect?: () => void;
	projectId: string;
	/** 默认取 env.VITE_SERVER_URL。 */
	serverUrl?: string;
	/** 初始视图标识（如 list / mindmap）。 */
	view?: string;
}

/**
 * 实时协作 Provider（plan §5）：管理 WS 连接生命周期、presence 外部 store，
 * 并把 `data:invalidate` 接到 TanStack Query 缓存上。
 * 身份直接取登录会话，因此必须挂在登录闸门之内（项目工作区布局路由）。
 */
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
