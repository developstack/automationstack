import { buttonVariants } from "@automationstack/ui/components/button";

/** Casdoor 登录入口。登录在服务端完成，所以使用普通链接，不使用前端路由。 */
export function CasdoorLoginButton({ url }: { url: string }) {
	return (
		<a className={buttonVariants({ variant: "outline" })} href={url}>
			使用 Casdoor 登录
		</a>
	);
}
