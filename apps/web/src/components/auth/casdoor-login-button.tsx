import { buttonVariants } from "@automationstack/ui/components/button";
import { Loader2Icon } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";

import { casdoorLoginHref } from "@/components/auth/login-casdoor";

interface CasdoorLoginButtonProps {
	/** 登录后跳转的本站路径。不是本站路径时忽略。 */
	redirectTo?: string;
	url: string;
}

/** 普通的左键点击，在当前页跳转。按住修饰键的点击在新标签页或新窗口打开，当前页不跳转。 */
function navigatesCurrentPage(event: MouseEvent<HTMLAnchorElement>): boolean {
	const hasModifier =
		event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
	return event.button === 0 && !hasModifier;
}

/**
 * 点击后进入 pending 状态，直到浏览器跳转。pending 期间阻止再次点击。
 * 用户从 Casdoor 后退时，浏览器可能从往返缓存（bfcache）恢复页面，
 * 恢复后的页面还是 pending 状态，所以在 pageshow（persisted）时恢复。
 */
function useRedirectPending() {
	const [isPending, setIsPending] = useState(false);

	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) {
				setIsPending(false);
			}
		};
		window.addEventListener("pageshow", onPageShow);
		return () => {
			window.removeEventListener("pageshow", onPageShow);
		};
	}, []);

	const onClick = useCallback(
		(event: MouseEvent<HTMLAnchorElement>) => {
			if (isPending) {
				event.preventDefault();
				return;
			}
			if (navigatesCurrentPage(event)) {
				setIsPending(true);
			}
		},
		[isPending]
	);

	return { isPending, onClick };
}

/**
 * Casdoor 登录入口。登录在服务端完成，所以使用普通链接，不使用前端路由。
 * 点击后显示转圈图标和"正在跳转到 Casdoor…"，并且不可再次点击。
 */
export function CasdoorLoginButton({
	redirectTo,
	url,
}: CasdoorLoginButtonProps) {
	const { isPending, onClick } = useRedirectPending();

	return (
		<a
			aria-disabled={isPending ? true : undefined}
			className={buttonVariants()}
			href={casdoorLoginHref(url, redirectTo)}
			onClick={onClick}
		>
			{isPending ? (
				<>
					<Loader2Icon
						aria-hidden="true"
						className="animate-spin"
						data-icon="inline-start"
					/>
					正在跳转到 Casdoor…
				</>
			) : (
				"使用 Casdoor 登录"
			)}
		</a>
	);
}
