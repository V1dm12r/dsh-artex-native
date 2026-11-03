# 用 Docker 构建这个插件，物理机不留 node_modules。
#
# 依赖装在一个 named volume 里（artex-native-node-modules），源码通过 bind mount
# 进容器，产物 dist/ 直接写回工作区。物理机上只会留下源码 + dist/client.js。
#
# 用法：
#   .\build.ps1
# 清理（连依赖缓存一起删）：
#   docker volume rm artex-native-node-modules

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$volume = 'artex-native-node-modules'
$image = 'node:22-bookworm-slim'
$registry = 'https://registry.npmmirror.com'

Write-Host "workdir : $scriptDir"
Write-Host "deps    : docker volume '$volume'"
Write-Host "image   : $image"
Write-Host ''

docker volume create $volume | Out-Null

# Windows 路径交给 Docker Desktop 转换；MSYS 风格的 /app 是容器内路径。
docker run --rm `
    -v "${scriptDir}:/app" `
    -v "${volume}:/app/node_modules" `
    -w /app `
    -e CI=1 `
    $image `
    sh -c "npm install --registry=$registry --no-audit --no-fund --legacy-peer-deps && npx vite build"

if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host '构建成功：dist/client.js' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host '构建失败，见上面的日志' -ForegroundColor Red
    exit 1
}
