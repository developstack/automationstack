// Casdoor 登录失败时，服务端跳转到前端登录页：/login?authError=<错误码>。
// 这个文件没有服务端依赖，前端也可以导入。

export const CASDOOR_LOGIN_ERROR_PARAM = "authError";

export const CASDOOR_LOGIN_ERROR_MESSAGES = {
	"access-denied": "Casdoor 拒绝了登录请求，请重新登录",
	"account-disabled": "账号已停用，请联系管理员",
	"identity-rejected": "Casdoor 账号不符合要求，不能登录。请联系管理员",
	"not-configured": "Casdoor 连接参数不完整，请联系管理员",
	"not-enabled": "当前认证方式不是 Casdoor",
	"settings-changed": "认证配置已变更，请重新登录",
	"state-invalid": "登录请求已过期或无效，请重新登录",
	"token-failed": "不能完成 Casdoor 登录，请重新登录。问题持续时请联系管理员",
	unavailable: "暂时不能连接 Casdoor，请稍后再试",
	"username-conflict":
		"Casdoor 用户名与本系统中已有的用户名相同，不能登录。请联系管理员处理",
} as const;

export type CasdoorLoginErrorCode = keyof typeof CASDOOR_LOGIN_ERROR_MESSAGES;

export function isCasdoorLoginErrorCode(
	value: string
): value is CasdoorLoginErrorCode {
	return Object.hasOwn(CASDOOR_LOGIN_ERROR_MESSAGES, value);
}
