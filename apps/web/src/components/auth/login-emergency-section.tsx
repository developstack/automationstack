import { Button } from "@automationstack/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import { ChevronDownIcon } from "lucide-react";

import {
	LoginPasswordForm,
	type LoginPasswordFormProps,
} from "@/components/auth/login-password-form";

/**
 * Casdoor 认证生效时的应急登录：只有本地管理员可以用它登录（plan 021 D7）。
 * 默认折叠，用户点击标题后展开。展开后的表单与内置认证的表单相同。
 */
export function LoginEmergencySection({ onLogin }: LoginPasswordFormProps) {
	return (
		<Collapsible className="group/emergency flex flex-col gap-3">
			<h2>
				<CollapsibleTrigger
					render={
						<Button
							className="w-full justify-between text-muted-foreground"
							type="button"
							variant="ghost"
						>
							本地管理员应急登录
							<ChevronDownIcon
								aria-hidden="true"
								className="transition-transform group-data-open/emergency:rotate-180"
								data-icon="inline-end"
							/>
						</Button>
					}
				/>
			</h2>
			<CollapsibleContent className="-mx-1 px-1 pb-1">
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-xs">
						只有本地管理员账号可以使用。其他用户请使用 Casdoor 登录。
					</p>
					<LoginPasswordForm onLogin={onLogin} />
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
