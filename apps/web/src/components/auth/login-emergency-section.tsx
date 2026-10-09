import { LoginPasswordForm } from "@/components/auth/login-password-form";

const HEADING_ID = "login-emergency-heading";

/** Casdoor 模式下的用户名密码表单。只有本地管理员可以用它登录（plan 021 D7）。 */
export function LoginEmergencySection({ redirectTo }: { redirectTo?: string }) {
	return (
		<section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm" id={HEADING_ID}>
					本地管理员应急登录
				</h2>
				<p className="text-muted-foreground text-xs">
					只有本地管理员账号可以使用。其他用户请使用 Casdoor 登录。
				</p>
			</div>
			<LoginPasswordForm redirectTo={redirectTo} />
		</section>
	);
}
