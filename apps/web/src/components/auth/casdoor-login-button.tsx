import { buttonVariants } from "@automationstack/ui/components/button";

import { casdoorLoginHref } from "@/components/auth/login-casdoor";

interface CasdoorLoginButtonProps {
	/** 登录后跳转的本站路径。不是本站路径时忽略。 */
	redirectTo?: string;
	url: string;
}

/** Casdoor 登录入口。登录在服务端完成，所以使用普通链接，不使用前端路由。 */
export function CasdoorLoginButton({
	redirectTo,
	url,
}: CasdoorLoginButtonProps) {
	return (
		<a className={buttonVariants()} href={casdoorLoginHref(url, redirectTo)}>
			使用 Casdoor 登录
		</a>
	);
}
