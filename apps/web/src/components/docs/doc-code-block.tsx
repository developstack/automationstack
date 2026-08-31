/**
 * 文档里的代码块：一段等宽正文 + 右上角一颗复制按钮。
 *
 * 复制这件事全仓只有一份实现（`@/utils/clipboard` 的 copyText），这里也只是调它。
 * 那份文件顶部记着「非安全上下文里 navigator.clipboard 根本不存在」这条坑，以及
 * 三份拷贝各自演化的旧账——**别在这里再写第二份**。
 *
 * 换成 `<pre>` + 浮动按钮，而不是沿用被它取代的 agent-copy-block.tsx 那种
 * 「Label + 只读 Textarea + 按钮」：那一份的形状是给**表单里的只读字段**设计的
 * （它自己的注释说得很清楚，做法照抄 jira-webhook-url.tsx），而这里的每一块都
 * 长在一篇文档的正文里，套一个输入框的外壳会把「这是一段可读的示例」念成
 * 「这是一个你可以改的设置」。选中复制、横向滚动这两件事 `<pre>` 本来就会做。
 *
 * 按钮常驻，不做 hover 才显形：悬停显形的按钮对键盘与触屏用户等于不存在，而
 * 复制正是这一整页的主要动作。`pr-12` 给它让出位置，避免压住最长的那一行。
 */
import { Button } from "@automationstack/ui/components/button";
import { CopyIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyText } from "@/utils/clipboard";

export interface DocCodeBlockProps {
	/** 围栏之间的原文，逐字节照抄，不做任何转义或重新排版。 */
	code: string;
	/** 围栏上标的语言；只用来给复制按钮一个说得出口的可访问名。 */
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
