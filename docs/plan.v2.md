# KimiCC v2 Plan

## feature#1 reset subcommand

添加 reset 子命令删除 .kimicc.json 配置文件。

DONE: PR#3

## feature#2 inject environment to shell config

添加 inject 子命令，实现以下能力：

假如仅使用单一版本 kimi k2 版本，则可以设置到 shell（如根据情况写入 export env key 到 .bashrc 或 .zshrc）。这样 claude code 默认启动就采用设定的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL，方便其他程序调用。

zsh用户：
echo 'export ANTHROPIC_BASE_URL="https://api.moonshot.cn/anthropic/"' >> ~/.zshrc
echo 'export ANTHROPIC_AUTH_TOKEN="你的实际API密钥"' >> ~/.zshrc
source ~/.zshrc

bash用户：
echo 'export ANTHROPIC_BASE_URL="https://api.moonshot.cn/anthropic/"' >> ~/.bashrc
echo 'export ANTHROPIC_AUTH_TOKEN="你的实际API密钥"' >> ~/.bashrc
source ~/.bashrc

## feature#3 multi profiles

为了可以使用多个服务供应商并发多个 kimicc 实例，可以在 .kimicc.json 配置文件中添加 `{'profiles':{ $slug: { url: $url, key: $apikey }, ... }}` 的配置，并在启动时选择不同 profile 设定。

提供子命令
- profile list ：列出所有 profile。
- profile add --slug $slug $url $apikey ：添加新的profile，自动将 url 中的 hostname，如 123.example.com => examplecom 作为 slug，也可指定 slug。
- profile del $slug ：删除某个 profile，需要用户输入作为确认。
- profile del -i ：交互式删除，列出 profile 与序号，用户输入一个或多个数字（逗号隔开），按照选择删除。

profile add 时，支持添加 --model 可选选项，添加到 profile 配置中，以 model 为 key 存储；如果 profile 设定了 model，则将 ANTHROPIC_MODEL 与 ANTHROPIC_SMALL_FAST_MODEL 环境变量设定为 profile 的 model。


启动时 kimicc --profile 选择不同的 profile，选择后读取配置中的 url 与 key 设定到 claude 启动的进程环境变量中。

向前兼容，执行 profile add 时，假如从未添加过 profile，并且设置过 apiKey，则自动把默认的 ANTHROPIC_BASE_URL=https://api.moonshot.cn/anthropic/ 以及 apiKey 迁移到 profile 形式，并设定为 default。

配置优先级，理论上应当保持这三种状态，要么有 profile 没有 apiKey，要么没有 profile 有 apiKey，要么都没有。
