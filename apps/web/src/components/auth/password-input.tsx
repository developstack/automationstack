import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { cn } from "@automationstack/ui/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, useCallback, useState } from "react";

export type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

// 眼睛按钮只切换 input 的 type，不改变值；type="button" 保证点击不提交外层表单
export function PasswordInput({ className, ...props }: PasswordInputProps) {
	const [revealed, setRevealed] = useState(false);
	const toggle = useCallback(() => setRevealed((previous) => !previous), []);
	const Icon = revealed ? EyeOffIcon : EyeIcon;

	return (
		<div className="relative">
			<Input
				className={cn("pr-8", className)}
				{...props}
				type={revealed ? "text" : "password"}
			/>
			<Button
				aria-label={revealed ? "隐藏密码" : "显示密码"}
				className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
				disabled={props.disabled}
				onClick={toggle}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<Icon aria-hidden="true" />
			</Button>
		</div>
	);
}
