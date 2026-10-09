// Casdoor 的路由都放在 /api/auth/casdoor/ 下（plan 021 D12）。
// 这个文件没有服务端依赖，前端也可以导入。

export const CASDOOR_CALLBACK_PATH = "/api/auth/casdoor/callback";

export const CASDOOR_WEBHOOK_PATH = "/api/auth/casdoor/webhook";

/** k8s 部署中 Casdoor 调用 webhook 的集群内地址（plan 021 T11）。其他部署方式的地址不同。 */
export const CASDOOR_WEBHOOK_URL_IN_CLUSTER = `http://automationstack-server.automationstack.svc.cluster.local${CASDOOR_WEBHOOK_PATH}`;

/** Casdoor 的 built-in 组织：其中的每个用户都是 Casdoor 的全局管理员，不能使用。 */
export const CASDOOR_BUILT_IN_ORGANIZATION = "built-in";
