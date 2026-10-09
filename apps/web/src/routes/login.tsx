import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { LoginForm } from "@/components/auth/login-form";
import { sessionQueryOptions } from "@/components/auth/use-session";
import { PageTransition } from "@/components/layout/page-transition";

const loginSearchSchema = z.object({
	redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context, search }) => {
		const user = await context.queryClient.ensureQueryData(
			sessionQueryOptions()
		);
		if (user !== null) {
			throw redirect({ href: search.redirect ?? "/projects" });
		}
	},
	component: LoginPage,
	head: () => ({ meta: [{ title: "登录 · 测试用例平台" }] }),
	// 预先读取登录方式。读取失败时登录页显示用户名密码表单。
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(
			context.orpc.auth.config.queryOptions()
		);
	},
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
