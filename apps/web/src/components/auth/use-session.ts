import type { PublicUser } from "@automationstack/db/schema/users";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

export function sessionQueryOptions() {
	return orpc.auth.me.queryOptions();
}

export function useSession(): {
	isPending: boolean;
	user: PublicUser | null;
} {
	const query = useQuery(sessionQueryOptions());
	return { isPending: query.isPending, user: query.data ?? null };
}

export function useCurrentUser(): PublicUser {
	const { user } = useSession();
	if (user === null) {
		throw new Error("useCurrentUser 必须在登录闸门内使用");
	}
	return user;
}

export function useResetSessionCache(): () => Promise<void> {
	const queryClient = useQueryClient();
	return useCallback(async () => {
		queryClient.clear();
		await queryClient.invalidateQueries();
		await queryClient.ensureQueryData(sessionQueryOptions());
	}, [queryClient]);
}
