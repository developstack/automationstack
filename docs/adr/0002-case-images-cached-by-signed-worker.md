---
status: superseded by ADR-0003
---

# 用例图片经过签名校验的 Cloudflare Worker 在边缘缓存

用例图片可能包含测试环境的真实业务数据，所以 R2 bucket 保持私有。我们在 `trendf.top` 下部署一个 Cloudflare Worker，Worker 绑定 R2 bucket。服务端给每张图片签发短期链接，Worker 校验签名后返回图片。Worker 在边缘缓存图片，缓存键不包含签名。

## Considered Options

- **公开 bucket 加自定义域名和缓存规则**：配置最少，完全免费。这个方案被拒绝，原因是任何人拿到链接都可以永久看到图片。
- **只用浏览器缓存**：不需要 Cloudflare 配置。这个方案被拒绝，原因是每个新访客仍然从 R2 下载图片，没有边缘缓存。

## Consequences

- 部署需要一个 Worker 和一个服务端与 Worker 共用的签名密钥。
- Worker 免费计划每天有 100,000 次请求的限制。
- 对象键是 UUID，对象写入后不再改变，所以删除图片时不需要清除边缘缓存。
