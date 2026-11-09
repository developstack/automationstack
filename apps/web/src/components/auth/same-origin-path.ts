/** 浏览器解析地址时会把制表符、换行等控制字符去掉，所以要在这里拒绝它们（Unicode Cc 类）。 */
const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * 登录后跳转的地址只接受本站的路径：以 / 开头，不以 // 开头，没有反斜杠和控制字符。
 * 其他值（完整地址、协议相对地址等）返回 undefined，防止开放重定向。
 */
export function sameOriginPath(value: string | undefined): string | undefined {
	const isPath =
		value?.startsWith("/") === true &&
		!value.startsWith("//") &&
		!value.includes("\\") &&
		!CONTROL_CHARACTER.test(value);
	return isPath ? value : undefined;
}
