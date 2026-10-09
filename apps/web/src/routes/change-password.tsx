import { createFileRoute } from "@tanstack/react-router";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { PageTransition } from "@/components/layout/page-transition";

export const Route = createFileRoute("/change-password")({
	component: ChangePasswordPage,
	head: () => ({ meta: [{ title: "修改密码 · 测试用例平台" }] }),
});

function ChangePasswordPage() {
	return (
		<PageTransition className="flex min-h-svh items-center justify-center px-4 py-10">
			<ChangePasswordForm />
		</PageTransition>
	);
}
