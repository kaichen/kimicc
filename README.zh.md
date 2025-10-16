# KIMICC

[![npm version](https://img.shields.io/npm/v/kimicc.svg)](https://www.npmjs.com/package/kimicc)

[Read english readme file](README.md)

One-step command `npx kimicc` to run Claude Code using Kimi K2 / GLM-4.6 / Qwen3-Coder / DeepSeek-v3.2.

一步命令 `npx kimicc` 使用  Kimi K2 / GLM-4.5 / Qwen3-Coder / DeepSeek-v3.1 运行 Claude Code。

或者 `npm install -g kimicc` 安装 KimiCC。

This is a lightweight Node.js npm package that sets up environment variables at startup, allowing Claude Code to call Kimi K2 / GLM-4.6 / Qwen3-Coder / DeepSeek-v3.2 models.

这是一个轻量的 nodejs 的 npm 包，在启动时设置好环境变量，让 Claude Code 调用  Kimi K2 / GLM-4.6 / Qwen3-Coder / DeepSeek-v3.2 模型。

## 为什么使用 Kimi K2 / GLM-4.5 / Qwen3-Coder / DeepSeek-v3.1 运行 Claude Code

1. Claude 由于特殊原因难以稳定订阅，并且对一些地区进行技术封锁；
2. Claude 订阅价格相对于发展中国家的广大群众难以负担以及支付；
3. 不少大模型厂商都推出了兼容 anthropic 的接口；
4. 当前好几家国产大模型都达到较高 Agentic 特性，足以驾驭 Claude Code 这个系统；
5. API 没有网络问题，价格仅有 Claude 的 1/N，支持多种支付方式；
6. 让更多人体验最先进的开发工具，让厂商卷起来。
7. v2.0 新增：支持多个不同 API 同时运行，提升并发能力，比如可以同时让多个 Kimi 账号在本地并发。

## 这个工具包做了什么？

这个工具做一些微小的工作，帮你节省时间去处理配置的工作。底层是在启动 claude 之前设定好 Auth Token 和 Base URL 环境变量参数。

对比其他教程让你配置文件，或者在启动时加长长的参数，使用本工具会节省你宝贵的时间精力。

## 使用方式

### 获取 API Key

以下是控制台地址：
- [Kimi](https://platform.moonshot.cn/console/api-keys)
- [GLM/智谱](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) [支持 60 元包月](https://www.bigmodel.cn/claude-code?ic=FHME2QL1XG)
- [Qwen/阿里云百炼](https://bailian.console.aliyun.com/?tab=globalset#/efm/api_key)
- [DeepSeek](https://platform.deepseek.com/api_keys)

### 配置与启动

- 第一步，获取 API Key
- 第二步，在你本地有 Nodejs 环境的前提下，运行 `npx kimicc` 安装并启动，或者使用 `npm install -g kimicc`；
- 第三步，在安装后可使用 kimicc 直接启动，并在提示下输入 Auth Token。

首次初始化会提示你输入 Auth Token，下次就无需再次设置。

⚠️注意⚠️，启动时 Claude Code 会询问 AUTH TOKEN，默认是 NO(recommended），此时要选 YES。

Do you want to use this auth token? SELECT YES!!!

![screenshot](assets/screenshot.png)

如何卸载： `npm uninstall kimicc`

完全卸载 claude code：`npm uninstall @anthropic-ai/claude-code`

### 使用 Kimi 以外模型的方式

默认什么参数都不添加，那么启动使用的是 kimi 模型的配置，若使用以下参数可以启动其他模型

- `--deepseek` 会设定 base_url=https://api.deepseek.com/anthropic model=deepseek-chat
- `--glm` 会设定 base_url=https://open.bigmodel.cn/api/anthropic model=glm-4.5
- `--qwen` 会设定 base_url=base_url=https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy model=qwen3-coder-plus

### 自定义大模型名称

启动或设定 Profile 时可以使用以下参数设定模型，

- `--model` 用于指定主要的大模型型号。
- `--small-fast-model` 用于指定辅助快速小模型，若没有指定则使用 `--model` 配置。

这能让用户第一时间使用上大模型发布。即在 kimi 发布 kimi-k2-0905-preview 通过 `kimicc --model=kimi-k2-0905-preview` 使用最新模型。

### 附加命令功能

- `kimicc reset` 重制配置。
- `kimicc inject` 将 Anthropic 环境变量写入 `~/.claude/settings.json` 的 `env` 字段，这样可以直接运行 `claude`。可搭配 `--profile`、`--base-url`、`--model`、`--small-fast-model` 覆盖写入的值。
- `kimicc inject --reset` 从 `~/.claude/settings.json` 中移除受管环境变量（`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`、`ANTHROPIC_SMALL_FAST_MODEL`）。
- `kimicc profile` 支持配置多个不同服务提供商。

## 实现原理

Claude Code 暴露出一些环境变量可以用于配置模型服务，其中分为三个等级 haiku sonnet opus。

- ANTHROPIC_BASE_URL 大模型服务接口地址（这个变量已经不写在官方文档中可能随时会被移除阻止第三方模型使用）
- ANTHROPIC_MODEL 假如没有以下细致配置使用的 fallback
- ANTHROPIC_DEFAULT_HAIKU_MODEL 轻量任务
- ANTHROPIC_DEFAULT_SONNET_MODEL 主力模型
- ANTHROPIC_DEFAULT_OPUS_MODEL 最高智能模型，或用于驱动 Plan 模式

注意，其中 ANTHROPIC_SMALL_FAST_MODEL 已经被废弃。

只要 claude code 运行时设定以上环境变量即可修改其使用的模型，当然也需要服务接口与 anthropic 保持一致。

对于修改环境变量有好几种方式，

1. 直接在启动命令行前，以 KEY=value 形式放在命令行之前即可；
2. 写入到对应 shell 的配置文件，如 bashrc，zshrc；
3. 写入到 `.claude/settings.json` 配置中的 "env" 下。

参考文档
- https://docs.claude.com/en/docs/claude-code/model-config#environment-variables
- https://docs.claude.com/en/docs/claude-code/settings#environment-variables

## 版本记录

- v1.x 基本功能实现
- v2.x
  - v2.0.0 支持 profile 功能，可分开启动多个配置
  - v2.1.0 默认支持  Kimi K2 / GLM-4.5 / Qwen3-Coder / DeepSeek-v3.1
  - v2.1.1 更新 glm-4.6 默认配置

## 已知问题

- 本项目先在 Mac 上开发并测试，不保证 Linux 以及 Windows 系统运行，欢迎反馈问题以及提交 PR。
- 由于 Kimi K2 不支持多模态，无法粘贴和读取图片。
- Kimi 在不同充值档位对请求频率和每日请求量有限制，可能需要至少充值 50 元达到一档才能符合基本使用需求，具体查看[官方接口限速说明](https://platform.moonshot.cn/docs/pricing/limits)。
- 由于这个工具只是修改环境变量，会让 kimicc 也写入 Claude 的数据目录，会共享 session 和数据统计数据，最新版本 v2.1.x 会写入对应模型调用，统计中会将不同模型分开显示。

👏 欢迎遇到问题或想要更多功能提出 Issue。

## License

MIT. Kai<kai@thekaiway.com>
