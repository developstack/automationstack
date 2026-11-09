import { FlaskConicalIcon } from "lucide-react";

import {
	LoginPasswordForm,
	type LoginPasswordFormProps,
} from "@/components/auth/login-password-form";
import { BRAND_NAME } from "@/components/layout/sidebar-brand";

export interface LoginPanelContentProps {
	onLogin: LoginPasswordFormProps["onLogin"];
}

/** 登录页右栏的内容：产品名、标题、说明、用户名密码表单和忘记密码的提示。 */
export function LoginPanelContent({ onLogin }: LoginPanelContentProps) {
	return (
		<div className="flex w-full max-w-sm flex-col gap-8">
			<header className="flex flex-col gap-6">
				<p className="flex items-center gap-2 font-medium text-sm">
					<FlaskConicalIcon
						aria-hidden="true"
						className="icon-stroke-medium size-4"
					/>
					{BRAND_NAME}
				</p>
				<div className="flex flex-col gap-1.5">
					<h1 className="font-semibold text-2xl tracking-tight">登录</h1>
					<p className="text-muted-foreground text-sm">
						使用管理员创建的账号登录。
					</p>
				</div>
			</header>
			<LoginPasswordForm onLogin={onLogin} />
			<p className="text-muted-foreground text-xs">忘记密码请联系管理员</p>
		</div>
	);
}
