import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it } from "vitest";

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
