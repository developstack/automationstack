// Casdoor 的路由都放在 /api/auth/casdoor/ 下（plan 021 D12）。
// 这个文件没有服务端依赖，前端也可以导入。

export const CASDOOR_ROUTE_PREFIX = "/api/auth/casdoor";

export const CASDOOR_LOGIN_PATH = `${CASDOOR_ROUTE_PREFIX}/login`;

export const CASDOOR_CALLBACK_PATH = `${CASDOOR_ROUTE_PREFIX}/callback`;

export const CASDOOR_WEBHOOK_PATH = `${CASDOOR_ROUTE_PREFIX}/webhook`;

/** Casdoor 调用 webhook 时，用这个请求头发送共享密钥（plan 021 §11.10 第 8 项）。 */
export const CASDOOR_WEBHOOK_SECRET_HEADER = "X-Casdoor-Webhook-Secret";

/** 登录入口的查询参数：登录完成后跳转的前端地址。只接受与前端同源的地址。 */
export const CASDOOR_LOGIN_REDIRECT_PARAM = "redirect";

/** k8s 部署中 Casdoor 调用 webhook 的集群内地址（plan 021 T11）。其他部署方式的地址不同。 */
export const CASDOOR_WEBHOOK_URL_IN_CLUSTER = `http://automationstack-server.automationstack.svc.cluster.local${CASDOOR_WEBHOOK_PATH}`;

/** Casdoor 的 built-in 组织：其中的每个用户都是 Casdoor 的全局管理员，不能使用。 */
export const CASDOOR_BUILT_IN_ORGANIZATION = "built-in";
