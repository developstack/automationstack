import type { ReactNode } from "react";

export const TOKENS_SCOPE_NOTE =
	"这里是你自己的 Token，别人看不到，也不跟着项目走。";

export const AGENT_SCOPE_NOTE =
	"这一格是一份接入说明，全平台通用，不随项目变，也没有需要保存的设置。接上之后 agent 的身份与权限，就是你用来连接的那枚 API Token 主人的身份与权限。";

export function SettingsScopeNote({ children }: { children: ReactNode }) {
	return (
		<p className="rounded-lg bg-muted p-3 text-muted-foreground text-xs">
			{children}
		</p>
	);
}
