/**
 * Token 表单的服务端错误行。原与 TokenNameField 同住
 * api-token-form-fields.tsx，按「一个文件一个对外组件」拆开。
 */

/**
 * 服务端错误就地显示（创建校验失败、吊销时 NOT_FOUND）。
 * role="alert" 让读屏在提交失败时立即播报，位置紧贴提交按钮上方。
 */
export function ApiTokenFormError({
	message,
}: {
	message: string | undefined;
}) {
	if (message === undefined) {
		return null;
	}
	return (
		<p className="text-destructive text-xs" role="alert">
			{message}
		</p>
	);
}
