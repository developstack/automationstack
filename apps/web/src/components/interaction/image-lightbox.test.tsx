import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	ImageLightbox,
	type LightboxImage,
} from "@/components/interaction/image-lightbox";

const IMAGES: LightboxImage[] = Array.from({ length: 5 }, (_, index) => ({
	fileName: `截图-${index + 1}.png`,
	url: index === 4 ? null : `blob:shot-${index + 1}`,
}));

/** 模拟缩略图：点击后打开弹窗，关闭后焦点应该回到这个按钮。 */
function Harness({ startIndex }: { startIndex: number }) {
	const [open, setOpen] = useState(false);
	const [thumb, setThumb] = useState<HTMLButtonElement | null>(null);
	const show = useCallback(() => setOpen(true), []);
	const hide = useCallback(() => setOpen(false), []);
	return (
		<>
			<button onClick={show} ref={setThumb} type="button">
				缩略图
			</button>
			<ImageLightbox
				images={IMAGES}
				onClose={hide}
				open={open}
				returnFocusTo={thumb}
				startIndex={startIndex}
			/>
		</>
	);
}

/** 像缩略图列表一样：关闭时 startIndex 是 0，点击第 n 张缩略图时才传入 n。 */
function GalleryHarness({ clickedIndex }: { clickedIndex: number }) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const show = useCallback(() => setOpenIndex(clickedIndex), [clickedIndex]);
	const hide = useCallback(() => setOpenIndex(null), []);
	return (
		<>
			<button onClick={show} type="button">
				缩略图
			</button>
			<ImageLightbox
				images={IMAGES}
				onClose={hide}
				open={openIndex !== null}
				startIndex={openIndex ?? 0}
			/>
		</>
	);
}

/** 记录页面中出现过的每个图片地址，包括后来被替换的地址。 */
function recordImageSources() {
	const observer = new MutationObserver(() => undefined);
	observer.observe(document.body, {
		attributeFilter: ["src"],
		attributeOldValue: true,
		childList: true,
		subtree: true,
	});
	return () => {
		const sources = new Set<string>();
		for (const record of observer.takeRecords()) {
			if (record.type === "attributes" && record.oldValue) {
				sources.add(record.oldValue);
			}
			for (const node of record.addedNodes) {
				if (node instanceof HTMLElement) {
					for (const img of node.querySelectorAll("img")) {
						sources.add(img.getAttribute("src") ?? "");
					}
				}
			}
		}
		for (const img of document.querySelectorAll("img")) {
			sources.add(img.getAttribute("src") ?? "");
		}
		observer.disconnect();
		return [...sources];
	};
}

function openAt(startIndex: number) {
	render(<Harness startIndex={startIndex} />);
	const thumb = screen.getByRole("button", { name: "缩略图" });
	fireEvent.click(thumb);
	return { dialog: screen.getByRole("dialog"), thumb };
}

describe("ImageLightbox：放大显示步骤截图", () => {
	it.each([
		["ArrowRight", 1, "3 / 5", "截图-3.png"],
		["ArrowLeft", 1, "1 / 5", "截图-1.png"],
		["ArrowLeft", 0, "1 / 5", "截图-1.png"],
		["ArrowRight", 3, "5 / 5", "截图-5.png"],
		["ArrowRight", 4, "5 / 5", "截图-5.png"],
	])("%s from index %i shows %s", (key, startIndex, counter, fileName) => {
		const { dialog } = openAt(startIndex);
		fireEvent.keyDown(dialog, { key });
		expect(screen.getByText(counter)).toBeTruthy();
		expect(screen.getByRole("heading", { name: fileName })).toBeTruthy();
	});

	it("shows the image with its file name as alt text, and a notice when the URL is missing", () => {
		const { dialog } = openAt(3);
		expect(screen.getByRole("img", { name: "截图-4.png" })).toBeTruthy();
		fireEvent.keyDown(dialog, { key: "ArrowRight" });
		expect(screen.getByText("图片暂时无法显示")).toBeTruthy();
	});

	it.each([1, 3])(
		"opening from thumbnail %i never shows another image first",
		(clickedIndex) => {
			render(<GalleryHarness clickedIndex={clickedIndex} />);
			const sources = recordImageSources();
			fireEvent.click(screen.getByRole("button", { name: "缩略图" }));
			expect(sources()).toEqual([`blob:shot-${clickedIndex + 1}`]);
		}
	);

	it("shows a loading state until the image loads, then shows the image", () => {
		openAt(1);
		const img = screen.getByRole("img", { name: "截图-2.png" });
		expect(screen.getByText("图片加载中")).toBeTruthy();
		expect(img.dataset.loaded).toBe("false");
		fireEvent.load(img);
		expect(screen.queryByText("图片加载中")).toBeNull();
		expect(img.dataset.loaded).toBe("true");
	});

	it.each([
		[800, "图片加载中", null],
		[0, "图片加载中", "图片暂时无法显示"],
	])(
		"an image that finished before mount (naturalWidth %i) leaves the loading state",
		(naturalWidth, gone, notice) => {
			const proto = HTMLImageElement.prototype;
			const complete = vi.spyOn(proto, "complete", "get").mockReturnValue(true);
			const width = vi
				.spyOn(proto, "naturalWidth", "get")
				.mockReturnValue(naturalWidth);
			openAt(1);
			expect(screen.queryByText(gone)).toBeNull();
			if (notice !== null) {
				expect(screen.getByText(notice)).toBeTruthy();
			}
			complete.mockRestore();
			width.mockRestore();
		}
	);

	it("shows a notice when the image fails to load", () => {
		openAt(1);
		fireEvent.error(screen.getByRole("img", { name: "截图-2.png" }));
		expect(screen.getByText("图片暂时无法显示")).toBeTruthy();
		expect(screen.queryByText("图片加载中")).toBeNull();
	});

	it("the buttons step through the images too", () => {
		openAt(0);
		expect(
			screen.getByRole("button", { name: "上一张" }).hasAttribute("disabled")
		).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "下一张" }));
		expect(screen.getByText("2 / 5")).toBeTruthy();
	});

	it("Esc closes the dialog and returns focus to the thumbnail", async () => {
		const { dialog, thumb } = openAt(2);
		fireEvent.keyDown(dialog, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(thumb));
	});
});
