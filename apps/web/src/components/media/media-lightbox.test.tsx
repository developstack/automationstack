import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { MediaItem } from "@/components/media/media-item";
import { MediaLightbox } from "@/components/media/media-lightbox";

const ITEMS: MediaItem[] = [
	...Array.from({ length: 4 }, (_, index) => ({
		id: `i${index + 1}`,
		kind: "image" as const,
		name: `操作截图 ${index + 1}`,
		url: index === 3 ? null : `blob:shot-${index + 1}`,
	})),
	{ id: "v1", kind: "video", name: "录屏 1", url: "blob:video-1" },
];

const renderDeleteAction = (item: MediaItem) => (
	<button type="button">{`删除 ${item.name}`}</button>
);

/** 删除文件的测试：items 由外部给出，关闭时清除打开的序号。 */
function ItemsHarness({ items }: { items: MediaItem[] }) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const show = useCallback(() => setOpenIndex(1), []);
	const hide = useCallback(() => setOpenIndex(null), []);
	return (
		<>
			<button onClick={show} type="button">
				缩略图
			</button>
			<MediaLightbox
				items={items}
				onClose={hide}
				open={openIndex !== null}
				startIndex={openIndex ?? 0}
				titlePrefix="第 1 步 · 预期截图"
			/>
		</>
	);
}

/** 模拟缩略图：点击后打开大图浏览，关闭后焦点应该回到这个按钮。关闭时 startIndex 是 0。 */
function Harness({ startIndex }: { startIndex: number }) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const [thumb, setThumb] = useState<HTMLButtonElement | null>(null);
	const show = useCallback(() => setOpenIndex(startIndex), [startIndex]);
	const hide = useCallback(() => setOpenIndex(null), []);
	return (
		<>
			<button onClick={show} ref={setThumb} type="button">
				缩略图
			</button>
			<MediaLightbox
				items={ITEMS}
				onClose={hide}
				open={openIndex !== null}
				renderActions={renderDeleteAction}
				returnFocusTo={thumb}
				startIndex={openIndex ?? 0}
				titlePrefix="第 2 步 · 操作截图"
			/>
		</>
	);
}

function openAt(startIndex: number) {
	render(<Harness startIndex={startIndex} />);
	const thumb = screen.getByRole("button", { name: "缩略图" });
	fireEvent.click(thumb);
	return { dialog: screen.getByRole("dialog"), thumb };
}

const title = (text: string) => screen.getByRole("heading", { name: text });

describe("MediaLightbox：大图浏览一组图片和录屏", () => {
	it.each([
		["ArrowRight", 1, "第 2 步 · 操作截图 3/5"],
		["ArrowLeft", 1, "第 2 步 · 操作截图 1/5"],
		["ArrowLeft", 0, "第 2 步 · 操作截图 1/5"],
		["ArrowRight", 4, "第 2 步 · 操作截图 5/5"],
	])("%s from index %i shows the title %s", (key, startIndex, text) => {
		const { dialog } = openAt(startIndex);
		fireEvent.keyDown(dialog, { key });
		expect(title(text)).toBeTruthy();
	});

	it("opens at the clicked item and never shows another image first", () => {
		openAt(2);
		expect(
			screen.getByRole("img", { name: "操作截图 3" }).getAttribute("src")
		).toBe("blob:shot-3");
		expect(screen.getAllByRole("img")).toHaveLength(1);
	});

	it("the buttons step through the items and stop at the ends", () => {
		openAt(0);
		expect(
			screen.getByRole("button", { name: "上一个" }).hasAttribute("disabled")
		).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "下一个" }));
		expect(title("第 2 步 · 操作截图 2/5")).toBeTruthy();
	});

	it("shows the actions for the current item", () => {
		openAt(1);
		expect(
			screen.getByRole("button", { name: "删除 操作截图 2" })
		).toBeTruthy();
	});

	it("shows a loading state until the image loads, and a notice when it fails or has no URL", () => {
		const { dialog } = openAt(1);
		const img = screen.getByRole("img", { name: "操作截图 2" });
		expect(screen.getByText("图片加载中")).toBeTruthy();
		fireEvent.load(img);
		expect(screen.queryByText("图片加载中")).toBeNull();
		fireEvent.keyDown(dialog, { key: "ArrowRight" });
		fireEvent.error(screen.getByRole("img", { name: "操作截图 3" }));
		expect(screen.getByText("图片暂时无法显示")).toBeTruthy();
		fireEvent.keyDown(dialog, { key: "ArrowRight" });
		expect(screen.getByText("图片暂时无法显示")).toBeTruthy();
	});

	it.each([
		[800, null],
		[0, "图片暂时无法显示"],
	])(
		"an image that finished before mount (naturalWidth %i) leaves the loading state",
		(naturalWidth, notice) => {
			const proto = HTMLImageElement.prototype;
			const complete = vi.spyOn(proto, "complete", "get").mockReturnValue(true);
			const width = vi
				.spyOn(proto, "naturalWidth", "get")
				.mockReturnValue(naturalWidth);
			openAt(1);
			expect(screen.queryByText("图片加载中")).toBeNull();
			if (notice !== null) {
				expect(screen.getByText(notice)).toBeTruthy();
			}
			complete.mockRestore();
			width.mockRestore();
		}
	);

	it("plays a video with controls, and arrow keys on the video do not switch items", () => {
		openAt(4);
		const video = screen.getByLabelText("录屏 1");
		expect(video.tagName).toBe("VIDEO");
		expect(video.hasAttribute("controls")).toBe(true);
		fireEvent.keyDown(video, { key: "ArrowLeft" });
		expect(title("第 2 步 · 操作截图 5/5")).toBeTruthy();
	});

	it("stays at the same position when the current item is deleted", () => {
		const { rerender } = render(<ItemsHarness items={ITEMS} />);
		fireEvent.click(screen.getByRole("button", { name: "缩略图" }));
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
		rerender(<ItemsHarness items={ITEMS.filter((item) => item.id !== "i3")} />);
		expect(title("第 1 步 · 预期截图 3/4")).toBeTruthy();
	});

	it("closes when the last item is deleted, and does not open again when an item is added", async () => {
		const { rerender } = render(<ItemsHarness items={ITEMS.slice(0, 2)} />);
		fireEvent.click(screen.getByRole("button", { name: "缩略图" }));
		rerender(<ItemsHarness items={[]} />);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		rerender(<ItemsHarness items={ITEMS.slice(0, 1)} />);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("names a missing video as a recording, not an image", () => {
		render(
			<ItemsHarness
				items={[
					ITEMS[0] as MediaItem,
					{ id: "v2", kind: "video", name: "录屏 2", url: null },
				]}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "缩略图" }));
		expect(screen.getByText("录屏暂时无法显示")).toBeTruthy();
	});

	it("Esc closes the dialog and returns focus to the thumbnail", async () => {
		const { dialog, thumb } = openAt(2);
		fireEvent.keyDown(dialog, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(thumb));
	});
});
