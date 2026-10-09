import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { TriangleAlertIcon } from "lucide-react";

type CredentialProblem = NonNullable<AuthSettingsView["credentialProblem"]>;

const DETAIL: Record<CredentialProblem, string> = {
	"master-key-missing":
		"服务端没有配置 SECRET_ENCRYPTION_KEY，已保存的密钥不能解密。配置这个环境变量后即可恢复，数据没有损坏。",
	undecryptable:
		"已保存的密钥不能解密：主密钥已更换，旧密文不能恢复。请重新填写密钥并保存。",
};

export function AuthCredentialNotice({
	reason,
}: {
	reason: CredentialProblem;
}) {
	return (
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="status"
		>
			<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			<div className="flex flex-col gap-1">
				<p className="font-medium">已保存的 Casdoor 密钥不可用</p>
				<p>{DETAIL[reason]}</p>
			</div>
		</div>
	);
}
