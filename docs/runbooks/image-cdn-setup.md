# 用例图片的公开域名配置说明

本文说明怎样配置 R2、公开域名、WAF 规则、缓存规则和服务端。完成后，浏览器从 `img.trendf.top` 读取用例图片，Cloudflare 在边缘缓存用例图片。设计原因见 `docs/adr/0003-case-images-served-from-public-r2-domain.md`。

本文只适用于存储方式是 Cloudflare R2 的部署。平台管理员在「存储设置」页面中保存过配置后，服务不再读取 `R2_*` 和 `IMAGE_PUBLIC_BASE_URL`。这时，在页面的「用例图片的公开基础地址」中填写公开域名，不执行第 9 节。存储方式见 `docs/adr/0006-uploads-stored-on-server-by-default.md`。

## 1. 公开的后果

开始前，阅读本节。

- 任何人拿到公开链接，都可以永久看到这张图片。
- 公开链接不需要登录，也不会过期。
- 公开链接泄露后，你不能收回这个公开链接。
- 对象键包含随机的 UUID。所以没有公开链接的人不能猜出用例图片的地址。
- 删除用例或用例图片后，平台不删除 R2 中的对象。对象在 R2 中时，公开链接继续可用。
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

生产环境现在没有 `R2_*` 环境变量。GitOps 仓库的 `automationstack-secrets.example.yaml` 说明 R2 没有开启。所以生产环境必须执行本节。本地开发执行第 4.1 节、第 4.2 节和第 4.4 节。

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

三个值的格式如下。下面的值是示例，不能使用。

| 值 | 格式 | 示例 |
| --- | --- | --- |
| Account ID | 32 个十六进制字符 | `0123456789abcdef0123456789abcdef` |
| Access Key ID | 32 个十六进制字符 | `a1b2c3d4e5f60718293a4b5c6d7e8f90` |
| Secret Access Key | 64 个十六进制字符 | `f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f` |

页面也显示一个 S3 endpoint，例如 `https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com`。填写 Account ID 后，服务端自动使用这个地址。所以不需要填写 `R2_ENDPOINT`。

### 4.3 填写生产环境的 R2 环境变量

服务端读取下面的环境变量。变量的说明在 `apps/server/.env.example` 中。GitOps 仓库把四个变量都放在 Secret `automationstack-secrets` 中。

| 变量 | 值 | 示例 |
| --- | --- | --- |
| `R2_BUCKET` | 第 4.1 节的 bucket 名称 | `automationstack-attachments` |
| `R2_ACCOUNT_ID` | 第 4.2 节的 Account ID | `0123456789abcdef0123456789abcdef` |
| `R2_ACCESS_KEY_ID` | 第 4.2 节的 Access Key ID | `a1b2c3d4e5f60718293a4b5c6d7e8f90` |
| `R2_SECRET_ACCESS_KEY` | 第 4.2 节的 Secret Access Key | `f0e1d2c3…1e0f`（64 个字符） |

`scripts/seal.sh` 每次覆盖整个 Secret。所以 env 文件必须包含 Secret 的全部键：现有的三个键和四个 R2 键。缺少一个现有的键时，server 不能启动。

1. 从密码管理器中取得现有的三个值：`DATABASE_URL`、`SESSION_SECRET` 和 `SECRET_ENCRYPTION_KEY`。
2. 在 GitOps 仓库的根目录中，执行下面的命令。用真实的值替换每个 `<…>`。

   ```sh
   umask 077
   cat > /tmp/automationstack.env <<'EOF'
   DATABASE_URL=<现有的值>
   SESSION_SECRET=<现有的值>
   SECRET_ENCRYPTION_KEY=<现有的值>
   R2_BUCKET=automationstack-attachments
   R2_ACCOUNT_ID=<第 4.2 节的 Account ID>
   R2_ACCESS_KEY_ID=<第 4.2 节的 Access Key ID>
   R2_SECRET_ACCESS_KEY=<第 4.2 节的 Secret Access Key>
   EOF
   ```

3. 确认每个值都没有引号。`scripts/seal.sh` 不删除引号。
4. 封装 Secret。

   ```sh
   scripts/seal.sh automationstack automationstack-secrets --from-env-file /tmp/automationstack.env
   ```

5. 删除 env 文件。

   ```sh
   shred -u /tmp/automationstack.env 2>/dev/null || rm -P /tmp/automationstack.env
   ```

6. 确认 `automationstack/k8s/sealed/automationstack-secrets-sealed.yaml` 有修改。

第 9 节说明怎样推送修改和重新启动 server。你可以在第 9 节一起推送全部修改。

### 4.4 配置本地开发

本地开发使用同一组 `R2_*` 环境变量。建议本地开发使用单独的 bucket，例如 `automationstack-dev`。

1. 按第 4.1 节创建本地开发的 bucket。
2. 按第 4.2 节为这个 bucket 创建 API token。
3. 打开 `apps/server/.env`。
4. 填写下面的四个变量。用第 4.2 节的值替换示例值。

   ```sh
   R2_BUCKET=automationstack-dev
   R2_ACCOUNT_ID=0123456789abcdef0123456789abcdef
   R2_ACCESS_KEY_ID=a1b2c3d4e5f60718293a4b5c6d7e8f90
   R2_SECRET_ACCESS_KEY=f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f
   R2_ENDPOINT=
   IMAGE_PUBLIC_BASE_URL=
   ```

5. 让 `R2_ENDPOINT` 和 `IMAGE_PUBLIC_BASE_URL` 保持空值。本地开发使用 R2 签名链接。
6. 按第 5 节配置这个 bucket 的 CORS。使用第 5 节的「本地开发」JSON。
7. 重新启动服务端。
8. 在平台中新建一个用例，在步骤中添加一张截图，然后保存。
9. 确认截图显示在步骤下面。

本地开发的 bucket 不需要第 6 节到第 9 节的配置。

## 5. 配置 R2 的 CORS

浏览器直接把图片上传到 bucket。上传使用 PUT 请求和 `content-type` 请求头。所以 bucket 必须允许生产前端的来源。

1. 在 **R2 Object Storage** 页面，打开第 4.1 节的 bucket。
2. 打开 **Settings** 标签。
3. 在 **CORS Policy** 中，点击 **Add CORS policy**。
4. 把对应的 JSON 粘贴到编辑框。

   生产环境的 bucket：

   ```json
   [
     {
       "AllowedOrigins": ["https://testcase.trendf.top"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   本地开发的 bucket：

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3001"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. 点击 **Save**。

`https://testcase.trendf.top` 是生产前端的来源。这个值必须与 ConfigMap 中的 `CORS_ORIGIN` 相同，末尾没有 `/`。`http://localhost:3001` 是本地开发的前端来源。

浏览器上传图片时使用 PUT。上报 SDK 用 GET 下载附件。

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

1. 在 GitOps 仓库中打开 `automationstack/k8s/automationstack.yaml`。
2. 找到 ConfigMap `automationstack-config`。
3. 在 `data:` 下面加入一行 `IMAGE_PUBLIC_BASE_URL`。修改后的内容如下：

   ```yaml
   kind: ConfigMap
   metadata:
     name: automationstack-config
   data:
     NODE_ENV: production
     CORS_ORIGIN: https://testcase.trendf.top
     # 用例图片的公开域名。末尾没有 /。
     IMAGE_PUBLIC_BASE_URL: https://img.trendf.top
     # 其他现有的键保持不变
   ```

4. 提交修改。如果第 4.3 节修改了 Secret，一起提交 `sealed/automationstack-secrets-sealed.yaml`。
5. 把修改推送到 GitOps 仓库的 main 分支。
6. 在 ArgoCD 中确认 automationstack 的同步状态是 **Synced**。
7. 在 ArgoCD 中对 Deployment `automationstack-server` 执行 **Restart**。也可以执行下面的命令：

   ```sh
   kubectl -n automationstack rollout restart deployment/automationstack-server
   ```

8. 确认 server 的新 Pod 的状态是 **Running**。

不要把 `IMAGE_PUBLIC_BASE_URL` 放入 Secret `automationstack-secrets`。只修改 ConfigMap 时，不需要执行 `scripts/seal.sh`。

服务端只在启动时读取环境变量。修改 ConfigMap 或 Secret 后，Pod 不自动重新启动。所以必须执行第 7 步。

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
   LINK='https://img.trendf.top/test-cases/<项目 id>/<用例 id>/<uuid>.png'
   ```

2. 发送第一次请求。

   ```sh
   curl -sS -o /dev/null -D - "$LINK" | grep -iE '^HTTP|cf-cache-status|cache-control|content-type'
   ```

   第一次请求的输出示例：

   ```text
   HTTP/2 200
   content-type: image/png
   cache-control: max-age=31536000
   cf-cache-status: MISS
   ```

3. 确认状态码是 200。
4. 确认 `cf-cache-status` 是 `MISS`。
5. 确认 `content-type` 是图片的类型，例如 `image/png`。
6. 确认 `cache-control` 包含 `max-age=31536000`。这个值是 1 年。
7. 再次执行第 2 步的命令。
8. 确认 `cf-cache-status` 是 `HIT`。

   第二次请求的输出示例：

   ```text
   HTTP/2 200
   content-type: image/png
   cache-control: max-age=31536000
   cf-cache-status: HIT
   ```

边缘缓存属于各个数据中心。所以从同一台电脑发送两次请求。

### 10.3 检查 WAF 规则

1. 发送一个 `/test-runs/` 路径的请求。

   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' https://img.trendf.top/test-runs/check
   ```

2. 确认输出是 `403`。输出示例：

   ```text
   403
   ```

### 10.4 检查执行页附件

1. 打开一个执行页。这个执行页必须有执行时上传的截图附件。
2. 在截图附件上点击鼠标右键，然后点击 **复制图片地址**。
3. 确认复制的链接不以 `https://img.trendf.top/` 开头。

执行页的步骤卡片也显示步骤文字中的用例图片。用例图片使用公开链接。

## 11. 回退

### 11.1 恢复 R2 签名链接

删除 `IMAGE_PUBLIC_BASE_URL` 后，用例图片恢复使用 R2 签名链接。

1. 在 GitOps 仓库中，从 ConfigMap `automationstack-config` 删除 `IMAGE_PUBLIC_BASE_URL`。
2. 把修改推送到 GitOps 仓库的 main 分支。
3. 按第 9 节的第 7 步重新启动 server。
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
