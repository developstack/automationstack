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
import type { AuthProviderValue } from "@/components/auth-settings/auth-settings-form-values";
import {
	PROVIDER_LABELS,
	providerChangeConsequences,
} from "@/components/auth-settings/auth-settings-labels";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ProviderChangeDialogProps {
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
	pending: boolean;
	target: AuthProviderValue;
}

export function ProviderChangeDialog(props: ProviderChangeDialogProps) {
	const handleOpenChange = useCloseOnDismiss(props.onCancel);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={props.open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						把认证方式改为「{PROVIDER_LABELS[props.target]}」？
					</AlertDialogTitle>
					<AlertDialogDescription>
						保存后立即生效。请确认以下后果：
					</AlertDialogDescription>
				</AlertDialogHeader>
				<ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
					{providerChangeConsequences(props.target).map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={props.pending}>取消</AlertDialogCancel>
					<AlertDialogAction disabled={props.pending} onClick={props.onConfirm}>
						{props.pending ? "保存中…" : "确认保存"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
