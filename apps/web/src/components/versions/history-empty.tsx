import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { HistoryIcon } from "lucide-react";

/** 没有历史版本。说明版本从哪里来，以及下一步怎么做。 */
export function HistoryEmpty() {
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<HistoryIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>还没有版本</EmptyTitle>
				<EmptyDescription>
					每次保存用例都会产生一个版本。点击「编辑」修改用例并保存，这里就会显示版本，可以对比和回滚。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
