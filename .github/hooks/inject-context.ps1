# BBScoring - subagentStart hook
# 在子代理啟動時注入專案規範，確保子代理了解本專案的技術約束

$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8

$jsonPath = Join-Path $PSScriptRoot "context.json"
$content = [System.IO.File]::ReadAllText($jsonPath, $utf8)
[Console]::Out.Write($content.Trim())
