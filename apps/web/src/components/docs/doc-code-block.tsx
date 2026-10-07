import { Button } from "@automationstack/ui/components/button";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

export interface DocCodeBlockProps {
	code: string;
	language: string | undefined;
}

export function DocCodeBlock({ code, language }: DocCodeBlockProps) {
	const handleCopy = useCallback(() => {
		copyText(code).then((copied) => {
			if (copied) {
				toast.success("已复制");
				return;
			}
			toast.error("复制失败，请手动选中内容复制");
		});
	}, [code]);

	return (
		<div className="relative">
			<pre className="overflow-x-auto rounded-md border bg-muted p-3 pr-12 font-mono text-xs leading-relaxed">
				<code>{code}</code>
			</pre>
			<Button
				aria-label={
					language === undefined ? "复制代码块" : `复制 ${language} 代码块`
				}
				className="absolute top-2 right-2"
				onClick={handleCopy}
				size="icon-sm"
				type="button"
				variant="outline"
			>
				<CopyIcon aria-hidden="true" />
			</Button>
		</div>
	);
}
