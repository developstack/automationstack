import { Input } from "@automationstack/ui/components/input";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

const KEYWORD_DEBOUNCE_MS = 300;

interface KeywordFilterProps {
	keyword: string;
	/** 输入框的无障碍名称和占位文字。 */
	label: string;
	onChange: (keyword: string) => void;
}

/** 按名称搜索的输入框。停止输入 300 毫秒后才调用 onChange。 */
export function KeywordFilter({
	keyword,
	label,
	onChange,
}: KeywordFilterProps) {
	const [text, setText] = useState(keyword);

	useEffect(() => {
		setText(keyword);
	}, [keyword]);

	useEffect(() => {
		const timer = setTimeout(() => onChange(text), KEYWORD_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [onChange, text]);

	const handleInput = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value),
		[]
	);

	return (
		<Input
			aria-label={label}
			className="w-64"
			onChange={handleInput}
			placeholder={label}
			value={text}
		/>
	);
}
