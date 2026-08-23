import type { PublicUser } from "@automationstack/db/schema/users";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

/**
 * 当前会话。未登录时 `auth.me` 返回 null 而不是报错，因此这条查询
 * 在登录页也能正常跑，不会触发全局的错误 toast。
 */
export function sessionQueryOptions() {
	return orpc.auth.me.queryOptions();
}

/** 当前登录用户；未登录（或还在加载）为 null。 */
export function useSession(): {
	isPending: boolean;
	user: PublicUser | null;
} {
	const query = useQuery(sessionQueryOptions());
	return { isPending: query.isPending, user: query.data ?? null };
}

/**
 * 登录闸门之内使用：拿不到用户就说明闸门写漏了，直接抛而不是渲染空壳。
 */
export function useCurrentUser(): PublicUser {
	const { user } = useSession();
	if (user === null) {
		throw new Error("useCurrentUser 必须在登录闸门内使用");
	}
	return user;
}

/**
 * 登录 / 登出后重置整个查询缓存。
 *
 * 不是只 invalidate 会话那一条：上一个用户留下的项目、用例、脑图缓存都得清掉，
 * 否则换人登录后会先看到前一个人的数据，等后台请求回来才刷新。
 */
export function useResetSessionCache(): () => Promise<void> {
	const queryClient = useQueryClient();
	return useCallback(async () => {
		queryClient.clear();
		await queryClient.invalidateQueries();
		/*
		 * 缓存清空后马上把会话取回来：调用方紧接着就会跳转，而根组件要靠会话
		 * 决定是否套上应用外壳，缓存空着的那几帧会让目标页面在没有外壳时渲染。
		 * 登出同样走这里，那次拿回的是 null，是正常结果而非失败。
		 */
		await queryClient.ensureQueryData(sessionQueryOptions());
	}, [queryClient]);
}
