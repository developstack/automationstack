import { useEffect, useMemo, useRef, useState } from "react";

/** 粘贴的图片在上传完成前用本地的 blob 地址预览。键是占位的 token，上传成功后改为附件 ID。 */
export interface LocalUrlActions {
	register: (key: string, url: string) => void;
	release: (key: string) => void;
	rename: (from: string, to: string) => void;
}

export function useLocalImageUrls() {
	const [urls, setUrls] = useState<ReadonlyMap<string, string>>(
		() => new Map()
	);
	const latest = useRef(urls);
	latest.current = urls;

	useEffect(
		() => () => {
			for (const url of latest.current.values()) {
				URL.revokeObjectURL(url);
			}
		},
		[]
	);

	const actions = useMemo<LocalUrlActions>(
		() => ({
			register: (key, url) => setUrls((prev) => new Map(prev).set(key, url)),
			release: (key) => {
				const url = latest.current.get(key);
				if (url !== undefined) {
					URL.revokeObjectURL(url);
				}
				setUrls((prev) => {
					if (!prev.has(key)) {
						return prev;
					}
					const next = new Map(prev);
					next.delete(key);
					return next;
				});
			},
			rename: (from, to) =>
				setUrls((prev) => {
					const url = prev.get(from);
					if (url === undefined) {
						return prev;
					}
					const next = new Map(prev);
					next.delete(from);
					next.set(to, url);
					return next;
				}),
		}),
		[]
	);

	return { actions, urls };
}
