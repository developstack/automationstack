# 部署到一台服务器，镜像来自阿里云 ACR

我们不再使用 k8s。服务部署在阿里云的一台服务器上，数据库是阿里云 RDS。GitHub Actions 构建 server 和 web 的镜像，并把它们推送到 ACR。服务器用 `make up:prod` 拉取镜像，不构建。镜像 tag 来自服务器上的当前提交，所以 compose 文件和镜像总是来自同一个提交。

## Considered Options

- **在服务器上构建镜像**：这个方案被拒绝。构建使用服务器的内存和 CPU，这会影响正在运行的服务。
- **继续使用 GHCR**：这个方案被拒绝。服务器在阿里云中，从 ACR 拉取可以使用 VPC 地址。
- **web 在运行时读取前端地址**：这个方案目前没有采用。它要修改前端。只有一个域名时，构建时写入地址就够了。

## Consequences

- 推送 `main` 不更新服务器。在服务器上执行 `make deploy:prod` 后，服务器才更新。
- 修改域名时必须重新构建 web 镜像。web 镜像的地址与 `DOMAIN` 不同时，`make up:prod` 停止。
- CI 没有完成时，`make deploy:prod` 拉取不到镜像，然后停止。正在运行的旧服务不变。
