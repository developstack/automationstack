import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LoginBackdrop } from "@/components/auth/login-backdrop";
import { LoginPanel } from "@/components/auth/login-panel";
import { sameOriginPath } from "@/components/auth/same-origin-path";
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
			throw redirect({ href: sameOriginPath(search.redirect) ?? "/projects" });
		}
	},
	component: LoginPage,
	head: () => ({ meta: [{ title: "登录 · 测试用例平台" }] }),
	validateSearch: loginSearchSchema,
});

function LoginPage() {
	const { redirect: redirectTo } = Route.useSearch();
	return (
		<PageTransition className="grid min-h-svh md:grid-cols-2">
			<LoginBackdrop />
			<div className="flex items-center justify-center px-4 py-10">
				<LoginPanel redirectTo={sameOriginPath(redirectTo)} />
			</div>
		</PageTransition>
	);
}
