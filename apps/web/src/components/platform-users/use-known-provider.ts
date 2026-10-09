import { useQuery } from "@tanstack/react-query";

import type { KnownProvider } from "@/components/platform-users/platform-user-access";
import { orpc } from "@/utils/orpc";

/** 当前认证方式，来自公开接口 auth.config。还没有读到时为 null。 */
export function useKnownProvider(): KnownProvider {
	const config = useQuery(orpc.auth.config.queryOptions());
	return config.data?.provider ?? null;
}
