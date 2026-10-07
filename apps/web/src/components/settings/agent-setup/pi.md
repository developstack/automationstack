**pi 没有 MCP 客户端**，所以这一格没有配置文件可抄，只有 skill 要装。

- 没有 MCP 配置文件要写，只装 skill；它会直接扫 `.agents/skills/`，符号链接都不需要。
- **它的 README 逐字写着 “No MCP”**。别给它配 MCP，配了也不会生效。要在 pi 上用这个端点，得自己按标准 JSON-RPC over HTTP（`tools/list` / `tools/call`）直连。
- 想让它认全局的 `~/.agents/skills`，在 `~/.pi/agent/settings.json` 里加 `{ "skills": ["~/.agents/skills"] }`——脚本不替你改这个文件。
- 约定文件它**两个都读**：`AGENTS.md` 与 `CLAUDE.md`。
