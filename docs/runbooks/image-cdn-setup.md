# 用例图片的公开域名配置说明

本文说明怎样配置 R2、公开域名、WAF 规则、缓存规则和服务端。完成后，浏览器从 `img.trendf.top` 读取用例图片，Cloudflare 在边缘缓存用例图片。设计原因见 `docs/adr/0003-case-images-served-from-public-r2-domain.md`。

## 1. 公开的后果

开始前，阅读本节。

- 任何人拿到公开链接，都可以永久看到这张图片。
- 公开链接不需要登录，也不会过期。
- 公开链接泄露后，你不能收回这个公开链接。
- 对象键包含随机的 UUID。所以没有公开链接的人不能猜出用例图片的地址。
- 删除用例或步骤截图后，平台不删除 R2 中的对象。对象在 R2 中时，公开链接继续可用。
- 浏览器缓存保存用例图片 1 年。断开公开域名后，浏览器缓存中的用例图片继续保留。

如果用例图片包含不能公开的内容，不要执行本文的步骤。

## 2. 术语

| 术语 | 意义 |
| --- | --- |
| 对象键 | 对象在 bucket 中的名称。服务端在代码中把对象键叫作 `storageKey`。 |
| 用例图片 | 用例附件中的图片。对象键以 `test-cases/` 开头。 |
| 执行页附件 | 执行页上传的截图、录屏和日志。对象键以 `test-runs/` 开头。执行页附件总是使用 R2 签名链接。 |
| bucket | 保存用例图片和执行页附件的 R2 bucket。 |
| 公开域名 | `img.trendf.top`。公开域名是 bucket 的 R2 自定义域名。 |
| 公开链接 | 服务端为用例图片返回的链接，格式是 `https://img.trendf.top/<对象键>`。公开链接没有查询参数。 |
| R2 签名链接 | 服务端用 R2 API token 签发的链接。R2 签名链接 15 分钟后过期。 |
| WAF 规则 | Cloudflare 的一条 WAF 自定义规则。WAF 规则阻止公开域名上 `/test-cases/` 以外的路径。 |
| 缓存规则 | Cloudflare 的一条缓存规则。缓存规则设定边缘缓存和浏览器缓存的时间。 |
| 边缘缓存 | Cloudflare 数据中心中的缓存。 |
| 浏览器缓存 | 用户电脑上的浏览器中的缓存。 |
| GitOps 仓库 | `developstack/k8s-gitops`。生产环境的配置在 `automationstack/k8s` 目录中。 |

## 3. 准备条件

- 你有 Cloudflare 账号的管理权限。`trendf.top` 的 DNS 在这个账号中。
- bucket 和 `trendf.top` 在同一个 Cloudflare 账号中。
- 你可以修改 GitOps 仓库。推送 GitOps 仓库的 main 分支后，ArgoCD 部署生产环境。
- `img.trendf.top` 没有 DNS 记录。连接公开域名时，Cloudflare 创建这条 DNS 记录。
- 你的电脑上有 curl。

## 4. 准备 R2

如果生产环境有 `R2_*` 环境变量，跳到第 5 节。

### 4.1 创建 bucket

1. 登录 Cloudflare 控制台。
2. 打开 **R2 Object Storage**。
3. 点击 **Create bucket**。
4. 填写 bucket 的名称，例如 `automationstack-attachments`。
5. 点击 **Create bucket**。

### 4.2 创建 API token

1. 在 **R2 Object Storage** 页面，点击 **Manage API tokens**。
2. 点击 **Create API token**。
3. 在 **Permissions** 中选择 **Object Read & Write**。
4. 在 **Specify bucket(s)** 中只选择第 4.1 节的 bucket。
5. 点击 **Create API Token**。
6. 记录 **Access Key ID** 和 **Secret Access Key**。页面关闭后，你不能再查看 Secret Access Key。
7. 记录 **Account ID**。Account ID 在 R2 页面的右侧。

### 4.3 填写 R2 环境变量

服务端读取下面的环境变量。变量的说明在 `apps/server/.env.example` 中。

| 变量 | 值 | GitOps 仓库中的位置 |
| --- | --- | --- |
| `R2_BUCKET` | 第 4.1 节的 bucket 名称 | ConfigMap `automationstack-config` |
| `R2_ACCOUNT_ID` | 第 4.2 节的 Account ID | ConfigMap `automationstack-config` |
| `R2_ACCESS_KEY_ID` | 第 4.2 节的 Access Key ID | Secret `automationstack-secrets` |
| `R2_SECRET_ACCESS_KEY` | 第 4.2 节的 Secret Access Key | Secret `automationstack-secrets` |

1. 在 GitOps 仓库中打开 `automationstack/k8s` 目录。
2. 在 ConfigMap `automationstack-config` 中加入 `R2_BUCKET` 和 `R2_ACCOUNT_ID`。
3. 在 Secret `automationstack-secrets` 中加入 `R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY`。
4. 用 GitOps 仓库的 `scripts/seal.sh` 重新封装 Secret。
5. 确认封装后的 Secret 包含全部现有的键和值。

第 9 节说明怎样推送修改。你可以在第 9 节一起推送全部修改。

## 5. 配置 R2 的 CORS

浏览器直接把图片上传到 bucket。上传使用 PUT 请求和 `content-type` 请求头。所以 bucket 必须允许生产前端的来源。

1. 在 **R2 Object Storage** 页面，打开第 4.1 节的 bucket。
2. 打开 **Settings** 标签。
3. 在 **CORS Policy** 中，点击 **Add CORS policy**。
4. 把下面的 JSON 粘贴到编辑框。

   ```json
   [
     {
       "AllowedOrigins": ["https://testcase.trendf.top", "http://localhost:5173"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. 点击 **Save**。

`https://testcase.trendf.top` 是生产前端的来源。这个值必须与服务端的 `CORS_ORIGIN` 相同。`http://localhost:5173` 是本地开发的前端来源。如果本地开发不使用这个 bucket，删除 `http://localhost:5173`。

浏览器用 `<img>` 显示用例图片。所以 GET 请求不需要 CORS。

## 6. 添加 WAF 规则

bucket 也保存执行页附件。WAF 规则阻止公开域名上 `/test-cases/` 以外的路径。所以执行页附件不能通过公开域名访问。

在第 8 节连接公开域名前，添加 WAF 规则。所以公开域名从第一个请求开始阻止执行页附件。

1. 在 Cloudflare 控制台中打开 `trendf.top`。
2. 打开 **Security → WAF → Custom rules**。
3. 点击 **Create rule**。
4. 在 **Rule name** 中填写 `img.trendf.top 只公开用例图片`。
5. 点击 **Edit expression**。
6. 把下面的表达式粘贴到编辑框。

   ```text
   (http.host eq "img.trendf.top" and not starts_with(http.request.uri.path, "/test-cases/"))
   ```

7. 在 **Choose action** 中选择 **Block**。
8. 点击 **Deploy**。

WAF 规则对匹配的请求返回 403。

## 7. 添加缓存规则

平台写入对象后，不修改这个对象。新图片使用新的对象键。所以边缘缓存和浏览器缓存可以长时间保存用例图片。

1. 在 Cloudflare 控制台中打开 `trendf.top`。
2. 打开 **Caching → Cache Rules**。
3. 点击 **Create rule**。
4. 在 **Rule name** 中填写 `img.trendf.top 缓存用例图片`。
5. 在 **Field** 中选择 **Hostname**。
6. 在 **Operator** 中选择 **equals**。
7. 在 **Value** 中填写 `img.trendf.top`。
8. 在 **Cache eligibility** 中选择 **Eligible for cache**。
9. 在 **Edge TTL** 中选择 **Ignore cache-control header and use this TTL**。
10. 把 Edge TTL 设为 30 天。如果列表中没有 30 天，选择 **1 month**。
11. 在 **Browser TTL** 中选择 **Override origin and use this TTL**。
12. 把 Browser TTL 设为 **1 year**。
13. 点击 **Deploy**。

## 8. 连接公开域名

1. 在 **R2 Object Storage** 页面，打开第 4.1 节的 bucket。
2. 打开 **Settings** 标签。
3. 在 **Custom Domains** 中，点击 **Add**。
4. 填写 `img.trendf.top`。
5. 点击 **Continue**。
6. 确认 Cloudflare 显示的 DNS 记录。
7. 点击 **Connect Domain**。
8. 等待状态变为 **Active**。
9. 在 **Public Development URL**（`r2.dev`）中，确认状态是 **Disabled**。

Cloudflare 需要几分钟才能签发证书。

不要开启 `r2.dev` 公开地址。`r2.dev` 公开整个 bucket，包括执行页附件。WAF 规则和缓存规则不能控制 `r2.dev`。

### 8.1 检查 Access

1. 打开 **Zero Trust** 中的 **Access** 应用列表。
2. 确认没有 Access 应用保护 `img.trendf.top`。

Access 保护 `img.trendf.top` 时，浏览器不能显示用例图片。

## 9. 配置服务端

服务端读取环境变量 `IMAGE_PUBLIC_BASE_URL`。这个变量有值时，用例图片使用公开链接。这个值不是密钥，所以放在 ConfigMap 中。

| 变量 | 值 | GitOps 仓库中的位置 |
| --- | --- | --- |
| `IMAGE_PUBLIC_BASE_URL` | `https://img.trendf.top` | ConfigMap `automationstack-config` |

1. 在 GitOps 仓库中打开 `automationstack/k8s` 目录。
2. 在 ConfigMap `automationstack-config` 中加入 `IMAGE_PUBLIC_BASE_URL`。
3. 把修改推送到 GitOps 仓库的 main 分支。
4. 在 ArgoCD 中确认 automationstack 的同步状态是 **Synced**。
5. 确认 server 的 Pod 重新启动。

不要把 `IMAGE_PUBLIC_BASE_URL` 放入 Secret `automationstack-secrets`。只修改 ConfigMap 时，不需要执行 `scripts/seal.sh`。

服务端只在启动时读取环境变量。如果 server 的 Pod 没有重新启动，手动重新启动 server 的 Deployment。

## 10. 验证

### 10.1 取得一个公开链接

1. 在平台中打开一个用例。
2. 在用例中粘贴一张新图片。
3. 刷新页面。
4. 在图片上点击鼠标右键，然后点击 **复制图片地址**。
5. 确认复制的链接以 `https://img.trendf.top/test-cases/` 开头。
6. 确认复制的链接中没有 `?`。

使用新图片。旧图片可能在边缘缓存中。

### 10.2 检查边缘缓存

1. 把公开链接保存到环境变量 `LINK`。

   ```sh
   LINK='<第 10.1 节的公开链接>'
   ```

2. 发送第一次请求。

   ```sh
   curl -sS -o /dev/null -D - "$LINK" | grep -iE '^HTTP|cf-cache-status|cache-control|content-type'
   ```

3. 确认状态码是 200。
4. 确认 `cf-cache-status` 是 `MISS`。
5. 确认 `content-type` 是图片的类型，例如 `image/png`。
6. 确认 `cache-control` 包含 `max-age=31536000`。这个值是 1 年。
7. 再次执行第 2 步的命令。
8. 确认 `cf-cache-status` 是 `HIT`。

边缘缓存属于各个数据中心。所以从同一台电脑发送两次请求。

### 10.3 检查 WAF 规则

1. 发送一个 `/test-runs/` 路径的请求。

   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' https://img.trendf.top/test-runs/check
   ```

2. 确认输出是 `403`。

### 10.4 检查执行页附件

1. 打开一个执行页。这个执行页必须有执行时上传的截图附件。
2. 在截图附件上点击鼠标右键，然后点击 **复制图片地址**。
3. 确认复制的链接不以 `https://img.trendf.top/` 开头。

执行页的步骤卡片也显示用例的步骤截图。步骤截图是用例图片，所以使用公开链接。

## 11. 回退

### 11.1 恢复 R2 签名链接

删除 `IMAGE_PUBLIC_BASE_URL` 后，用例图片恢复使用 R2 签名链接。

1. 在 GitOps 仓库中，从 ConfigMap `automationstack-config` 删除 `IMAGE_PUBLIC_BASE_URL`。
2. 把修改推送到 GitOps 仓库的 main 分支。
3. 确认 server 的 Pod 重新启动。
4. 用第 10.1 节的步骤复制一张用例图片的链接。
5. 确认复制的链接不以 `https://img.trendf.top/` 开头。

这个步骤不停止公开访问。公开域名连接时，以前的公开链接继续可用。

### 11.2 停止公开访问

先执行第 11.1 节。如果平台仍然使用公开链接，断开公开域名后，平台不能显示用例图片。

1. 在 **R2 Object Storage** 页面，打开第 4.1 节的 bucket。
2. 打开 **Settings** 标签。
3. 在 **Custom Domains** 中，找到 `img.trendf.top`。
4. 点击这一行右侧的 **...**。
5. 点击 **Remove domain**。
6. 在确认对话框中点击 **Remove domain**。
7. 确认 `img.trendf.top` 不在 **Custom Domains** 中。
8. 用第 10.2 节的命令请求一个以前的公开链接。
9. 确认请求失败，或者状态码不是 200。

断开公开域名后，Cloudflare 删除 `img.trendf.top` 的 DNS 记录。浏览器缓存中的用例图片保留到过期，最长 1 年。你不能删除浏览器缓存中的用例图片。

## 12. 限制

- 公开链接没有权限检查。平台的项目成员关系不控制公开链接。
- 删除对象需要单独的操作。本文不说明怎样删除 R2 中的对象。
- 修改 WAF 规则的路径前，确认新路径不包括 `/test-runs/`。
