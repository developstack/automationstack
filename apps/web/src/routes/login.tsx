import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { LoginForm } from "@/components/auth/login-form";
import { sessionQueryOptions } from "@/components/auth/use-session";
import { PageTransition } from "@/components/layout/page-transition";

const loginSearchSchema = z.object({
	/** 被闸门拦下时记下的原地址，登录后送回去。 */
	redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context, search }) => {
		// 已登录的人不该再看到登录页（比如手输 /login 或点了后退）
		const user = await context.queryClient.ensureQueryData(
			sessionQueryOptions()
		);
		if (user !== null) {
			// href 而不是 to：回跳地址是运行时来的字符串，不是某条静态路由
			throw redirect({ href: search.redirect ?? "/projects" });
		}
	},
	component: LoginPage,
	head: () => ({ meta: [{ title: "登录 · 测试用例平台" }] }),
	validateSearch: loginSearchSchema,
});

function LoginPage() {
	const { redirect: redirectTo } = Route.useSearch();
	return (
		<PageTransition className="flex min-h-svh items-center justify-center px-4 py-10">
			<LoginForm redirectTo={redirectTo} />
		</PageTransition>
	);
}
