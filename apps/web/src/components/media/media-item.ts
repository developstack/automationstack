/** 缩略图条和大图浏览中的一个文件：图片或录屏。 */
export type MediaKind = "image" | "video";

export interface MediaItem {
	id: string;
	kind: MediaKind;
	/** 无障碍名称和替代文字，例如「操作截图 2」或文件名。 */
	name: string;
	/** 上传中或上传失败的文件。已保存的文件没有这个字段。 */
	status?: "failed" | "uploading";
	/** 文件的地址。地址还没有准备好或者无法签发时为 null。 */
	url: string | null;
}

/** 打开大图浏览：从第 index 个文件开始，关闭后焦点回到 origin（被点击的缩略图）。 */
export type MediaOpenHandler = (index: number, origin: HTMLElement) => void;
