import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

/** 存储设置页面中的警告：已保存的密钥不能解密，或保存失败。 */
export function StorageSettingsNotice({
	children,
	role,
	title,
}: {
	children: ReactNode;
	role: "alert" | "status";
	title: string;
}) {
	return (
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role={role}
		>
			<TriangleAlertIcon
				aria-hidden="true"
				className="icon-stroke-medium mt-0.5 size-3.5 shrink-0"
			/>
			<div className="flex flex-col gap-1">
				<p className="font-medium">{title}</p>
				<p>{children}</p>
			</div>
		</div>
	);
}
