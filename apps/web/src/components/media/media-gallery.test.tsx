import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MediaGallery } from "@/components/media/media-gallery";
import type { MediaItem } from "@/components/media/media-item";

function items(count: number): MediaItem[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `i${index + 1}`,
		kind: "image",
		name: `预期截图 ${index + 1}`,
		url: `blob:shot-${index + 1}`,
	}));
}

function renderGallery(count: number, trailing?: string) {
	return render(
		<MediaGallery
			items={items(count)}
			label="第 1 步预期截图"
			titlePrefix="第 1 步 · 预期截图"
		>
			{trailing === undefined ? null : (
				<li>
					<button type="button">{trailing}</button>
				</li>
			)}
		</MediaGallery>
	);
}

const strip = () => screen.getByRole("list", { name: "第 1 步预期截图" });

describe("MediaGallery：缩略图条和这一组的大图浏览", () => {
	it("takes no space when the group is empty", () => {
		const { container } = renderGallery(0);
		expect(container.innerHTML).toBe("");
	});

	it("keeps the trailing items when the group is empty", () => {
		renderGallery(0, "添加");
		expect(within(strip()).getByRole("button", { name: "添加" })).toBeTruthy();
	});

	it.each([
		[1, ["查看预期截图 1"]],
		[3, ["查看预期截图 1", "查看预期截图 2", "查看预期截图 3"]],
		[
			5,
			["查看预期截图 1", "查看预期截图 2", "查看预期截图 3", "查看另外 2 个"],
		],
	])("with %i items shows at most 3 thumbnails, then +N", (count, names) => {
		renderGallery(count);
		const buttons = within(strip()).getAllByRole("button");
		expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(
			names
		);
	});

	it.each([
		["查看预期截图 2", "第 1 步 · 预期截图 2/5"],
		["查看另外 2 个", "第 1 步 · 预期截图 4/5"],
	])("clicking %s opens the lightbox at %s", (name, heading) => {
		renderGallery(5);
		fireEvent.click(screen.getByRole("button", { name }));
		expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
	});

	it("shows +N as text", () => {
		renderGallery(9);
		expect(
			screen.getByRole("button", { name: "查看另外 6 个" }).textContent
		).toBe("+6");
	});
});
