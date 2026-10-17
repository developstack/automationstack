import { Button } from "@automationstack/ui/components/button";
import { PlusIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useRef } from "react";

import { SCREENSHOT_ACCEPT } from "@/components/cases/step-screenshot-group";

interface AddScreenshotButtonProps {
	/** 可以选择的文件类型。默认只有图片；实际附件还可以选择录屏。 */
	accept?: string;
	/** 按钮的无障碍名称和鼠标悬停的提示，例如「给第 2 步添加操作截图」。 */
	label: string;
	onAdd: (files: File[]) => void;
}

/** 缩略图条末尾的「+」按钮：40×40，与缩略图同样大小，点击后选择文件。 */
export function AddScreenshotButton({
	accept = SCREENSHOT_ACCEPT,
	label,
	onAdd,
}: AddScreenshotButtonProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const pick = useCallback(() => inputRef.current?.click(), []);
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const files = [...(event.target.files ?? [])];
			event.target.value = "";
			if (files.length > 0) {
				onAdd(files);
			}
		},
		[onAdd]
	);
	return (
		<li>
			<Button
				aria-label={label}
				className="size-10 border-dashed"
				onClick={pick}
				size="icon"
				title={label}
				type="button"
				variant="outline"
			>
				<PlusIcon />
			</Button>
			<input
				accept={accept}
				aria-hidden="true"
				className="hidden"
				multiple={true}
				onChange={handleChange}
				ref={inputRef}
				tabIndex={-1}
				type="file"
			/>
		</li>
	);
}
