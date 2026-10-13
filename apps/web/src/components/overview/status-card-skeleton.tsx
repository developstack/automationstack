import { Card, CardContent } from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { BARCODE_BOX_CLASSES } from "@/components/barcode/barcode-box";
import {
	STATUS_CARD_CLASS,
	STATUS_CARD_CONTENT,
	STATUS_COUNT_GRID,
	STATUS_DETAIL_COLUMN,
	STATUS_TOTAL_COLUMN,
} from "@/components/overview/overview-layout";
import { STATUS_ORDER } from "@/components/overview/status-barcode";

export function StatusCardSkeleton() {
	return (
		<Card aria-hidden="true" className={STATUS_CARD_CLASS}>
			<CardContent className={STATUS_CARD_CONTENT}>
				<div className={STATUS_TOTAL_COLUMN}>
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-12 w-28" />
				</div>
				<div className={STATUS_DETAIL_COLUMN}>
					<div className={STATUS_COUNT_GRID}>
						{STATUS_ORDER.map((status) => (
							<div className="flex flex-col gap-1" key={status}>
								<Skeleton className="h-4 w-10" />
								<Skeleton className="h-8 w-16" />
							</div>
						))}
					</div>
					<div className="flex flex-col gap-3">
						<Skeleton className={BARCODE_BOX_CLASSES.md} />
						<Skeleton className="h-5 w-48" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
