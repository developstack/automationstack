import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

export interface SettingsSkeletonField {
	hint: boolean;
	id: string;
	width: string;
}

export interface SettingsSkeletonAction {
	id: string;
	width: string;
}

export function SettingsFieldsSkeleton({
	actions,
	fields,
}: {
	actions: readonly SettingsSkeletonAction[];
	fields: readonly SettingsSkeletonField[];
}) {
	return (
		<output aria-busy="true" className="flex flex-col gap-4">
			{fields.map((field) => (
				<div className="flex flex-col gap-2" key={field.id}>
					<Skeleton className="h-3.5 w-24" />
					<Skeleton className={cn("h-8", field.width)} />
					{field.hint ? <Skeleton className="h-4 w-2/3" /> : null}
				</div>
			))}
			<div className="flex justify-end gap-2">
				{actions.map((action) => (
					<Skeleton className={cn("h-8", action.width)} key={action.id} />
				))}
			</div>
		</output>
	);
}
