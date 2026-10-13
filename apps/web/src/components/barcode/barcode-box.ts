// 条形码式进度条的尺寸。进度条和它的骨架屏都从这里取高度，保证骨架屏与最终布局一致。

export type BarcodeSize = "md" | "sm";

export const BARCODE_BOX_CLASSES: Record<BarcodeSize, string> = {
	md: "h-10 gap-px sm:gap-0.5",
	sm: "h-5 gap-px",
};
