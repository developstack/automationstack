# 用例图片通过 R2 自定义域名公开，由 Cloudflare 缓存规则缓存

这个决定替换 ADR-0002。维护者选择最简单的方案：R2 bucket 通过自定义域名 `img.trendf.top` 公开，Cloudflare 的缓存规则缓存图片。这个方案不需要 Worker、签名密钥和 wrangler，所有配置都在 Cloudflare 后台完成。服务端直接返回固定的公开链接，所以浏览器和边缘都可以缓存图片。

## Considered Options

- **签名校验的 Worker（ADR-0002）**：bucket 保持私有。这个方案被拒绝，原因是部署和维护 Worker 的成本太高。

## Consequences

- 任何人拿到图片链接，都可以永久看到这张图片。对象键包含随机 UUID，无法猜测，但是链接一旦泄露就不能收回。
- 执行页的附件与用例图片在同一个 bucket 中。一条 WAF 自定义规则阻止 `img.trendf.top` 上 `/test-cases/` 以外的路径，所以执行页的附件不能通过公开域名访问。执行页的附件继续使用 R2 签名链接。
- 删除用例或截图后，对象仍然可以通过链接访问，直到对象从 R2 中删除。
