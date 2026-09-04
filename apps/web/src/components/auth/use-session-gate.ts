/**
 * 根布局的会话闸门：唯一决定「现在能不能把 <Outlet /> 放出去」的地方，
 * 同时把 `utils/session-expiry.ts` 的那个回调槽接上真正的导航。
 *
 * 与根 `beforeLoad` 里那道闸门的分工：那一道只在**导航时**跑，管的是「点进来
 * 的人有没有登录」；这一道在**渲染时**跑，管的是「已经停在页面上的人会话没了」。
 * 后者没有任何导航发生，所以前者永远不会被触发——标签页停在项目页、会话到期、
 * 点一下窗口触发 refetchOnWindowFocus，全靠这一道把人送出去。
 */

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { sessionQueryOptions } from "@/components/auth/use-session";
import {
	isLoginPathname,
	LOGIN_PATHNAME,
	notifySessionExpired,
	resetSessionExpiredNotice,
	setSessionExpiredHandler,
} from "@/utils/session-expiry";

type AppRouterInstance = ReturnType<typeof useRouter>;

async function redirectToLogin(
	router: AppRouterInstance,
	queryClient: QueryClient
): Promise<void> {
	const { href, pathname } = router.state.location;
	// 已经在登录页就什么都不用做：再跳一次只会把 redirect 参数覆盖掉
	if (isLoginPathname(pathname)) {
		return;
	}
	/*
	 * 先把会话这一条就地改成 null 再跳：登录页自己的 beforeLoad 会读它，读到上一轮
	 * 还没过 staleTime 的旧用户就会把人原路送回来，两边来回弹。服务端刚回过
	 * UNAUTHORIZED，null 就是此刻的事实，不必再发一次请求去确认。
	 */
	queryClient.setQueryData(sessionQueryOptions().queryKey, null);
	await router.navigate({
		replace: true,
		search: { redirect: href },
		to: LOGIN_PATHNAME,
	});
	/*
	 * 其余缓存等导航落地之后再清：清在跳转之前，还挂在页面上的 useSuspenseQuery
	 * 会当场重取一批注定 401 的请求，把整页推进路由的错误屏——那正是这次要修掉的
	 * 症状之一。上一个人的项目、用例、脑图必须清掉，否则换人登录会先看到前一个人
	 * 的数据（与 useResetSessionCache 同一个理由）。
	 */
	queryClient.clear();
}

/** 会话回填中 = 先占位；ready = 可以渲染受保护的页面。 */
export type SessionGateState = "ready" | "waiting";

export function useSessionGate(): SessionGateState {
	const router = useRouter();
	const queryClient = useQueryClient();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const session = useQuery(sessionQueryOptions());

	useEffect(() => {
		setSessionExpiredHandler(() => {
			// 跳转真出了岔子就把去重开关放回去，下一条 401 还能再试一次，
			// 而不是一次失败之后这条出路就永久哑掉
			redirectToLogin(router, queryClient).catch(resetSessionExpiredNotice);
		});
		return () => setSessionExpiredHandler(null);
	}, [queryClient, router]);

	/*
	 * 只认「查询成功且结果是 null」这一种失效。查询报错（断网、服务端 500）时
	 * data 同样是空的，但那不是「你被登出了」，把人踢到登录页反而让他丢掉正在
	 * 看的页面——那种情况留给全局的错误 toast 和它的重试。
	 */
	const expired = session.isSuccess && session.data === null;

	useEffect(() => {
		if (session.data) {
			// 重新登录成功：复位去重开关，下一次失效仍然跳得动
			resetSessionExpiredNotice();
			return;
		}
		/*
		 * 登录页本来就不需要会话，别把停在那儿的人再跳一次。
		 *
		 * 显式登出也会路过这里——它把会话改成 null，在缓存里和「会话失效」长得
		 * 一模一样，无从分辨。结果一样是去登录页，差别只是多带一个 redirect：
		 * 登出后再登录回到刚才那一页是合理的，而 useLogout 自己那次跳转随后
		 * 落地时也只是从 /login 走到 /login。
		 */
		if (expired && !isLoginPathname(pathname)) {
			notifySessionExpired();
		}
	}, [expired, pathname, session.data]);

	return session.data ? "ready" : "waiting";
}
