import type { Project } from "@automationstack/db/schema/projects";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectCards } from "@/components/projects/project-cards";
import { ProjectListSkeleton } from "@/components/projects/project-list-skeleton";
import {
	hoverTooltipText,
	markTruncated,
	renderRoutes,
} from "@/test-dom-fixtures";

const LONG_NAME = "一个名称很长很长很长很长很长很长很长很长很长很长的项目";
const LONG_DESCRIPTION = "描述".repeat(200);
/** 卡片的固定尺寸：宽 288px、高 146px（见 project-card-layout.ts）。 */
const CARD_SIZE = ["w-72", "h-36.5"];

const PROJECT: Project = {
	createdAt: new Date("2026-10-01T00:00:00Z"),
	description: LONG_DESCRIPTION,
	id: "p1",
	name: LONG_NAME,
	updatedAt: new Date("2026-10-02T00:00:00Z"),
};

async function renderCardsAndSkeleton() {
	renderRoutes({
		initialPath: "/",
		routes: {
			"/": () => (
				<>
					<ProjectCards
						canCreate
						onDelete={vi.fn()}
						onEdit={vi.fn()}
						projects={[PROJECT]}
					/>
					<ProjectListSkeleton />
				</>
			),
		},
	});
	return await screen.findByRole("link", { name: LONG_NAME });
}

describe("ProjectCards：卡片尺寸固定，网格从左排列", () => {
	it("卡片与骨架屏的卡片尺寸相同，网格也相同", async () => {
		const link = await renderCardsAndSkeleton();
		const card = link.closest("[data-slot='card']");
		const skeletonGrid = screen.getByRole("status").lastElementChild;
		const skeletonCard = skeletonGrid?.firstElementChild;

		for (const element of [card, skeletonCard]) {
			expect(CARD_SIZE.every((name) => element?.classList.contains(name))).toBe(
				true
			);
		}
		expect(skeletonGrid?.className).toBe(card?.parentElement?.className);
	});

	it("项目名只占一行，被截断时悬停用 Tooltip 显示完整名称；描述最多两行", async () => {
		const link = await renderCardsAndSkeleton();
		const name = within(link).getByText(LONG_NAME);

		expect(name.classList.contains("truncate")).toBe(true);
		markTruncated(name);
		expect(await hoverTooltipText(name)).toBe(LONG_NAME);
		expect(
			screen.getByText(LONG_DESCRIPTION).classList.contains("line-clamp-2")
		).toBe(true);
	});
});
