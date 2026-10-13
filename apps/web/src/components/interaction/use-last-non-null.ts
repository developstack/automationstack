import { useState } from "react";

/**
 * 返回最近一次不是 null 的值。
 * 对话框用 null 表示关闭时，关闭动画期间仍可以显示原来的内容。
 */
export function useLastNonNull<T>(value: T | null): T | null {
	const [last, setLast] = useState(value);
	if (value !== null && value !== last) {
		setLast(value);
		return value;
	}
	return value ?? last;
}
