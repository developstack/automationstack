import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

export function TestRunRowDisabledItem({
	label,
	reason,
}: {
	label: string;
	reason: string;
}) {
	return (
		<DropdownMenuItem disabled={true}>
			{label}
			<span className="ml-auto pl-4 text-muted-foreground text-xs">
				{reason}
			</span>
		</DropdownMenuItem>
	);
}
