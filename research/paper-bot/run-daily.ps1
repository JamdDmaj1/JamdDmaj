# Runs the paper bot once. No orders, no web.
# Schedule this with Windows Task Scheduler for a daily paper log.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node bot.mjs --top 10
node evaluate.mjs
