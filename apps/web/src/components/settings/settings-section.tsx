import type { ReactNode } from "react";

export interface SettingsSectionProps {
	children: ReactNode;
	description: string;
	headingId: string;
	title: string;
}

export function SettingsSection(props: SettingsSectionProps) {
	return (
		<section aria-labelledby={props.headingId} className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm" id={props.headingId}>
					{props.title}
				</h2>
				<p className="text-muted-foreground text-xs">{props.description}</p>
			</div>
			{props.children}
		</section>
	);
}
