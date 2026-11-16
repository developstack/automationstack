import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";
import { Button } from "@automationstack/ui/components/button";
import { CopyCheckIcon } from "lucide-react";
import { useCallback, useState } from "react";

import type { MediaItem } from "@/components/media/media-item";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface StepAdoptExpectedButtonProps {
	/** 实际附件。录屏不复制为预期截图，所以只数图片。 */
	attachments: readonly MediaItem[];
	editing: boolean;
	onAdopt: (stepId: string) => void;
	pending: boolean;
	/** 步骤的序号（从 1 开始）。 */
	position: number;
	stepId: string;
	/** 实际结果的文字。 */
	text: string;
}

/** 确认框中列出的变化：哪些内容被替换、哪些保留。 */
function adoptionChanges(hasText: boolean, imageCount: number): string[] {
	return [
		hasText
			? "预期结果的文字改为实际结果的文字。"
			: "实际结果没有文字，预期结果的文字保留不变。",
		imageCount > 0
			? `预期截图改为实际附件中的 ${imageCount} 张图片。录屏和日志不复制。`
			: "实际结果没有图片，预期截图保留不变。",
		"用例生成一个新版本，版本历史中记录这次修改来自这个测试任务。",
		"这一步判定为通过，其他步骤的判定和实际结果一起保存。",
	];
}

interface AdoptConfirmDialogProps {
	hasText: boolean;
	imageCount: number;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
	position: number;
}

function AdoptConfirmDialog({
	hasText,
	imageCount,
	onCancel,
	onConfirm,
	open,
	position,
}: AdoptConfirmDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onCancel);
	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{`把实际结果设为第 ${position} 步的预期结果？`}</AlertDialogTitle>
					<AlertDialogDescription>
						实际结果正确、预期结果过时的时候使用。用例库中的这条用例会改变：
					</AlertDialogDescription>
				</AlertDialogHeader>
				<ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
					{adoptionChanges(hasText, imageCount).map((change) => (
						<li key={change}>{change}</li>
					))}
				</ul>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						设为预期结果
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * 「设为预期结果」：实际结果与预期结果不同、但团队认为实际结果正确时使用。
 * 只在编辑中、并且实际结果有文字或图片时显示。点击后先确认，确认框说明用例中哪些内容会改变。
 */
export function StepAdoptExpectedButton({
	attachments,
	editing,
	onAdopt,
	pending,
	position,
	stepId,
	text,
}: StepAdoptExpectedButtonProps) {
	const [open, setOpen] = useState(false);
	const show = useCallback(() => setOpen(true), []);
	const hide = useCallback(() => setOpen(false), []);
	const confirm = useCallback(() => {
		setOpen(false);
		onAdopt(stepId);
	}, [onAdopt, stepId]);
	const hasText = text.trim() !== "";
	const imageCount = attachments.filter(
		(item) => item.kind === "image" && item.status === undefined
	).length;
	if (!(editing && (hasText || imageCount > 0))) {
		return null;
	}
	return (
		<>
			<Button
				className="self-start"
				onClick={show}
				pending={pending}
				size="sm"
				type="button"
				variant="outline"
			>
				<CopyCheckIcon data-icon="inline-start" />
				设为预期结果
			</Button>
			<AdoptConfirmDialog
				hasText={hasText}
				imageCount={imageCount}
				onCancel={hide}
				onConfirm={confirm}
				open={open}
				position={position}
			/>
		</>
	);
}
