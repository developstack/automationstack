# 用例图片的 Worker 配置说明

本文说明怎样配置 R2、部署 Worker 和配置服务端。完成后，浏览器从 `img.trendf.top` 读取用例图片，Cloudflare 在边缘缓存用例图片。设计原因见 `docs/adr/0002-case-images-cached-by-signed-worker.md`。

## 1. 术语

| 术语 | 意义 |
| --- | --- |
| 用例图片 | 用例附件中的图片。对象键以 `test-cases/` 开头。 |
| 执行页附件 | 执行页上传的截图、录屏和日志。对象键以 `test-runs/` 开头。本文的配置不改变执行页附件。 |
| bucket | 保存用例图片和执行页附件的 R2 bucket。bucket 是私有的。 |
| Worker | `apps/image-worker` 中的 Cloudflare Worker。Worker 校验签名，然后返回用例图片。 |
| 签名密钥 | 服务端和 Worker 共用的密钥。服务端用签名密钥签发 Worker 链接，Worker 用签名密钥校验 Worker 链接。 |
| Worker 链接 | 服务端为用例图片签发的链接，格式是 `https://img.trendf.top/<对象键>?exp=<unix 秒>&sig=<签名>`。同一个小时内签发的 Worker 链接相同。 |
| R2 签名链接 | 服务端用 R2 API token 签发的链接。R2 签名链接 15 分钟后过期。执行页附件总是使用 R2 签名链接。 |
| 边缘缓存 | Cloudflare 数据中心中的缓存。Worker 把用例图片放入边缘缓存 30 天。 |
| GitOps 仓库 | `developstack/k8s-gitops`。生产环境的配置在 `automationstack/k8s` 目录中。 |

## 2. 准备条件

- 你有 Cloudflare 账号的管理权限。`trendf.top` 的 DNS 在这个账号中。
- 你可以修改 GitOps 仓库。推送 GitOps 仓库的 main 分支后，ArgoCD 部署生产环境。
- 你的电脑上有 Node.js、pnpm 和 openssl。
- `img.trendf.top` 没有 DNS 记录。部署 Worker 时，wrangler 创建这条 DNS 记录。

## 3. 准备 R2

如果生产环境有 `R2_*` 环境变量，跳到第 4 节。

### 3.1 创建 bucket

1. 登录 Cloudflare 控制台。
2. 打开 **R2 Object Storage**。
3. 点击 **Create bucket**。
4. 填写 bucket 的名称，例如 `automationstack-attachments`。
5. 点击 **Create bucket**。
6. 不要给 bucket 开启公开访问。

### 3.2 创建 API token

1. 在 **R2 Object Storage** 页面，点击 **Manage API tokens**。
2. 点击 **Create API token**。
3. 在 **Permissions** 中选择 **Object Read & Write**。
4. 在 **Specify bucket(s)** 中只选择第 3.1 节的 bucket。
5. 点击 **Create API Token**。
6. 记录 **Access Key ID** 和 **Secret Access Key**。页面关闭后，你不能再查看 Secret Access Key。
7. 记录 **Account ID**。Account ID 在 R2 页面的右侧。

### 3.3 填写 R2 环境变量

服务端读取下面的环境变量。变量的说明在 `apps/server/.env.example` 中。

| 变量 | 值 | GitOps 仓库中的位置 |
| --- | --- | --- |
| `R2_BUCKET` | 第 3.1 节的 bucket 名称 | ConfigMap `automationstack-config` |
| `R2_ACCOUNT_ID` | 第 3.2 节的 Account ID | ConfigMap `automationstack-config` |
| `R2_ACCESS_KEY_ID` | 第 3.2 节的 Access Key ID | Secret `automationstack-secrets` |
| `R2_SECRET_ACCESS_KEY` | 第 3.2 节的 Secret Access Key | Secret `automationstack-secrets` |

第 6 节说明怎样修改 ConfigMap 和 Secret。你可以在第 6 节一起修改全部变量。

## 4. 配置 R2 的 CORS

浏览器直接把图片上传到 bucket。上传使用 PUT 请求和 `content-type` 请求头。所以 bucket 必须允许生产前端的来源。

1. 在 **R2 Object Storage** 页面，打开第 3.1 节的 bucket。
2. 打开 **Settings** 标签。
3. 在 **CORS Policy** 中，点击 **Add CORS policy**。
4. 把下面的 JSON 粘贴到编辑框。

   ```json
   [
     {
       "AllowedOrigins": ["https://testcase.trendf.top"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. 点击 **Save**。

生产前端的来源改变时，修改 `AllowedOrigins`。这个值必须与服务端的 `CORS_ORIGIN` 相同。浏览器用 `<img>` 显示用例图片，所以 GET 请求不需要 CORS。

## 5. 生成签名密钥

1. 执行下面的命令。

   ```sh
   openssl rand -base64 32
   ```

2. 记录输出的值。这个值是签名密钥。
3. 把签名密钥保存在密码管理器中。

签名密钥至少有 32 个字符。服务端和 Worker 必须使用同一个签名密钥。不要把签名密钥写入 Git 中的明文文件。

## 6. 部署 Worker

在仓库的 `apps/image-worker` 目录中执行本节的命令。

### 6.1 安装和登录 wrangler

本仓库不安装 wrangler。命令 `pnpm dlx wrangler` 每次下载并执行 wrangler。

1. 打开 `apps/image-worker` 目录。

   ```sh
   cd apps/image-worker
   ```

2. 登录 Cloudflare。浏览器打开授权页面。

   ```sh
   pnpm dlx wrangler login
   ```

3. 在浏览器中点击 **Allow**。
4. 检查登录的账号。

   ```sh
   pnpm dlx wrangler whoami
   ```

5. 确认输出中的账号是 `trendf.top` 所在的账号。

### 6.2 填写 bucket 绑定

1. 打开 `apps/image-worker/wrangler.toml`。
2. 把 `bucket_name` 的值改为第 3.1 节的 bucket 名称。
3. 不要修改 `binding = "CASE_IMAGES"`。Worker 的代码使用这个名称。
4. 确认 `routes` 中的 `pattern` 是 `img.trendf.top`。

`bucket_name` 必须与服务端的 `R2_BUCKET` 相同。

### 6.3 部署 Worker

1. 部署 Worker。

   ```sh
   pnpm dlx wrangler deploy
   ```

2. 确认输出中有 `img.trendf.top`。

`routes` 中的 `custom_domain = true` 给 Worker 添加自定义域名 `img.trendf.top`。第一次部署时，Cloudflare 创建 DNS 记录和证书。证书可能需要几分钟才生效。

### 6.4 设置签名密钥

1. 执行下面的命令。

   ```sh
   pnpm dlx wrangler secret put IMAGE_CDN_SIGNING_SECRET
   ```

2. 在提示中粘贴第 5 节的签名密钥。
3. 按 Enter 键。

Worker 没有签名密钥时，Worker 对每个请求返回 500。

### 6.5 检查自定义域名

1. 在 Cloudflare 控制台中打开 **Workers & Pages**。
2. 打开 Worker `automationstack-image-worker`。
3. 打开 **Settings** 标签。
4. 在 **Domains & Routes** 中，确认有 `img.trendf.top`。
5. 打开 **Zero Trust** 中的 **Access** 应用列表。
6. 确认没有 Access 应用保护 `img.trendf.top`。

Access 保护 `img.trendf.top` 时，浏览器不能显示用例图片。

## 7. 配置服务端

服务端读取两个环境变量。两个变量都有值时，用例图片使用 Worker 链接。

| 变量 | 值 | GitOps 仓库中的位置 |
| --- | --- | --- |
| `IMAGE_CDN_BASE_URL` | `https://img.trendf.top` | ConfigMap `automationstack-config` |
| `IMAGE_CDN_SIGNING_SECRET` | 第 5 节的签名密钥 | Secret `automationstack-secrets` |

1. 在 GitOps 仓库中打开 `automationstack/k8s` 目录。
2. 在 ConfigMap `automationstack-config` 中加入 `IMAGE_CDN_BASE_URL`。
3. 在 Secret `automationstack-secrets` 中加入 `IMAGE_CDN_SIGNING_SECRET`。
4. 用 GitOps 仓库的 `scripts/seal.sh` 重新封装 Secret。
5. 确认封装后的 Secret 包含全部现有的键和值。
6. 把修改推送到 GitOps 仓库的 main 分支。
7. 在 ArgoCD 中确认 automationstack 的同步状态是 **Synced**。
8. 确认 server 的 Pod 重新启动。

服务端只在启动时读取环境变量。如果 server 的 Pod 没有重新启动，手动重新启动 server 的 Deployment。

## 8. 验证

### 8.1 取得一个 Worker 链接

1. 在平台中打开一个用例。
2. 在用例中粘贴一张新图片。
3. 刷新页面。
4. 在图片上点击鼠标右键，然后点击 **复制图片地址**。
5. 确认复制的链接以 `https://img.trendf.top/test-cases/` 开头。

使用新图片。旧图片可能已经在边缘缓存中。

### 8.2 检查边缘缓存

1. 把 Worker 链接保存到环境变量 `LINK`。

   ```sh
   LINK='<第 8.1 节的 Worker 链接>'
   ```

2. 发送第一次请求。

   ```sh
   curl -sS -o /dev/null -D - "$LINK" | grep -iE '^HTTP|cf-cache-status|cache-control|content-type'
   ```

3. 确认状态码是 200。
4. 确认 `cf-cache-status` 是 `MISS`。
5. 确认 `content-type` 是图片的类型，例如 `image/png`。
6. 确认 `cache-control` 是 `private, max-age=<秒数>`。秒数不大于 7200。
7. 再次执行第 2 步的命令。
8. 确认 `cf-cache-status` 是 `HIT`。

Worker 在响应头中写入 `cf-cache-status`。边缘缓存属于各个数据中心。所以从同一台电脑发送两次请求。

### 8.3 检查签名校验

1. 修改 Worker 链接中 `sig` 的最后一个字符。例如把 `A` 改为 `B`。
2. 把修改后的链接保存到环境变量 `LINK_WITH_CHANGED_SIG`。
3. 发送请求。

   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' "$LINK_WITH_CHANGED_SIG"
   ```

4. 确认输出是 `403`。

### 8.4 检查执行页附件

1. 打开一个执行页。这个执行页必须有执行时上传的截图附件。
2. 在截图附件上点击鼠标右键，然后点击 **复制图片地址**。
3. 确认复制的链接不以 `https://img.trendf.top/` 开头。

执行页附件继续使用 R2 签名链接。执行页的步骤卡片也显示用例的步骤截图。步骤截图是用例图片，所以使用 Worker 链接。

## 9. 回退

如果 Worker 有问题，删除服务端的两个环境变量。然后用例图片恢复使用 R2 签名链接。

1. 在 GitOps 仓库中，从 ConfigMap `automationstack-config` 删除 `IMAGE_CDN_BASE_URL`。
2. 从 Secret `automationstack-secrets` 删除 `IMAGE_CDN_SIGNING_SECRET`。
3. 用 `scripts/seal.sh` 重新封装 Secret。
4. 把修改推送到 GitOps 仓库的 main 分支。
5. 确认 server 的 Pod 重新启动。
6. 用第 8.1 节的步骤复制一张用例图片的链接。
7. 确认复制的链接不以 `https://img.trendf.top/` 开头。

只删除一个变量也可以回退。服务端只在两个变量都有值时使用 Worker。

浏览器中已有的 Worker 链接在 2 小时内过期。在这段时间中，不要删除 Worker。

## 10. 限制

- Worker 的免费计划每天最多处理 100,000 个请求。
- CI 不部署 Worker。修改 `apps/image-worker` 后，用第 6.3 节的命令手动部署。
- 修改签名算法时，必须同时修改服务端和 Worker。两边的测试使用同一组测试向量（`packages/api/src/lib/image-cdn-signature-vectors.ts`）。
- 更换签名密钥时，必须同时修改 Worker 和服务端。在修改期间，一部分 Worker 链接返回 403。
