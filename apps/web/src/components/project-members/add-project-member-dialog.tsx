import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";

import { AddProjectMemberForm } from "@/components/project-members/add-project-member-form";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface AddProjectMemberDialogProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
}

export function AddProjectMemberDialog({
	onClose,
	open,
	projectId,
}: AddProjectMemberDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>添加成员</DialogTitle>
					<DialogDescription>
						把一个已有的账号加进本项目；他登录后就能看到这个项目。
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<AddProjectMemberForm onClose={onClose} projectId={projectId} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
