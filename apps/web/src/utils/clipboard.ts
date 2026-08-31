/**
 * 写剪贴板：所有「只读 + 一键复制」控件共用的那一份。
 *
 * 收拢前全仓有三份逐字节相同的实现，跨两个目录：settings/jira-webhook-url.tsx、
 * settings/agent-copy-block.tsx、api-tokens/api-token-plaintext.tsx。前两份的
 * 注释说「各自独立演化的代价小于立一个中间层」，第三份的注释说「等哪次能一起动
 * 就该收进共用 utils」——三份从来没有分头演化过，倒是那段「非安全上下文里
 * navigator.clipboard 根本不存在」的坑得记在三个地方，下一个改的人只改一处，
 * 另外两处就悄悄退回抛 TypeError。
 *
 * 这是个不依赖 React、没有组件形态的纯函数，抽到 utils 里并没有多出中间层；
 * 三个调用方分处两个目录，也不存在「放进某个组件目录顺带导出」的位置。
 */

export async function copyText(value: string): Promise<boolean> {
	/*
	 * navigator.clipboard 在非安全上下文（http 且非 localhost）里根本不存在，
	 * 直接调会抛 TypeError 而不是被 catch 里那句 toast 说清楚，所以先探一下。
	 */
	if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
		return false;
	}
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		// 用户拒绝了剪贴板权限，或页面此刻不在前台
		return false;
	}
}
