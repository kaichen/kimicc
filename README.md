# KIMICC

一步命令 `npx kimicc` 使用 Kimi K2 运行 Claude Code。

或者 `npm install -g kimicc` 安装 KimiCC。

这是一个轻量的 nodejs 的 npm 包，在启动时设置好环境变量，让 Claude Code 调用 Kimi K2 模型。

## 为什么使用 Kimi K2 运行 Claude Code

1. Claude 由于特殊原因难以稳定订阅；
2. Claude 订阅价格相对于发展中国家的广大群众难以负担以及支付；
3. Kimi K2 是当前 Agentic 特性最高的开源模型，足以驾驭 Claude Code 这个系统；
4. Kimi K2 API 价格仅有 Claude 的 1/5 到 1/6，支持多种支付方式；
5. 让更多人体验最先进的开发工具，让厂商卷起来。

## 这个工具包做了什么？

这个工具做一些微小的工作，帮你节省时间去处理配置的工作。底层是在启动 claude 之前设定好 API Key 和 Base URL 环境变量参数。

对比其他教程让你配置文件，或者在启动时加长长的参数，使用本工具会节省你宝贵的时间精力。

## 使用方式

- 第一步，访问 [开发者平台](https://platform.moonshot.cn/playground) 获取 Kimi API Key；
- 第二步，在你本地有 Nodejs 环境的前提下，运行 `npx kimicc` 安装并启动，或者使用 `npm install -g kimicc`；
- 第三步，在安装后可使用 kimicc 直接启动，并在提示下输入 API Key。

首次初始化会提示你输入 API Key，下次就无需再次设置。

⚠️注意⚠️，启动时 Claude Code 会询问 API KEY，默认是 NO(recommended），此时要选 YES。

Do you want to use this API key? SELECT YES!!!

![screenshot](assets/screenshot.png)

如何卸载： `npm uninstall kimicc`

完全卸载 claude code：`npm uninstall @anthropic-ai/claude-code`

### 附加命令功能

- `kimicc reset` 重制配置。
- `kimicc inject` 将配置写入 shell 配置中，后续可以用 claude 直接启动，无需再通过 kimicc。注意，可以用 `kimicc inject --reset` 删除写入的配置。

## 已知问题

- 本项目先在 Mac 上开发并测试，不保证 Linux 以及 Windows 系统运行，欢迎反馈问题以及提交 PR。
- 由于 Kimi K2 不支持多模态，无法粘贴和读取图片。
- Kimi 在不同充值档位对请求频率和每日请求量有限制，可能需要至少充值 50 元达到一档才能符合基本使用需求，具体查看[官方接口限速说明](https://platform.moonshot.cn/docs/pricing/limits)。
- 由于这个工具只是修改环境变量，会让 kimicc 也写入 Claude 的数据目录，会共享 session 和数据统计数据。

👏 欢迎遇到问题或想要更多功能提出 Issue。

## License

MIT. Kai<kai@thekaiway.com>
