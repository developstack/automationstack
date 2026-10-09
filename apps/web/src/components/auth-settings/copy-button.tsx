import { Button } from "@automationstack/ui/components/button";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

/** 复制按钮。label 是被复制内容的名称，例如「回调地址」。 */
export function CopyButton({ label, value }: { label: string; value: string }) {
	const handleCopy = useCallback(() => {
		copyText(value).then((copied) => {
			if (copied) {
				toast.success(`已复制${label}`);
				return;
			}
			toast.error("复制失败，请手动选中后复制");
		});
	}, [label, value]);

	return (
		<Button
			aria-label={`复制${label}`}
			disabled={value === ""}
			onClick={handleCopy}
			size="icon"
			type="button"
			variant="outline"
		>
			<CopyIcon aria-hidden="true" />
		</Button>
	);
}
