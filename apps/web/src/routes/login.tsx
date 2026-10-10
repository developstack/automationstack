import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LoginBackdrop } from "@/components/auth/login-backdrop";
import {
	casdoorLoginErrorMessage,
	sameOriginPath,
} from "@/components/auth/login-casdoor";
import { LoginPanel } from "@/components/auth/login-panel";
import { sessionQueryOptions } from "@/components/auth/use-session";
import { PageTransition } from "@/components/layout/page-transition";

const loginSearchSchema = z.object({
	/** Casdoor 登录失败时，服务端跳转回登录页带的错误码。 */
	authError: z.string().optional(),
	redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context, search }) => {
		const user = await context.queryClient.ensureQueryData(
			sessionQueryOptions()
		);
		if (user !== null) {
			throw redirect({ href: sameOriginPath(search.redirect) ?? "/projects" });
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
	const { authError, redirect: redirectTo } = Route.useSearch();
	return (
		<PageTransition className="grid min-h-svh md:grid-cols-2">
			<LoginBackdrop />
			<div className="flex items-center justify-center px-4 py-10">
				<LoginPanel
					errorMessage={casdoorLoginErrorMessage(authError)}
					redirectTo={sameOriginPath(redirectTo)}
				/>
			</div>
		</PageTransition>
	);
}
