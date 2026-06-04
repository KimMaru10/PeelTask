#!/bin/bash
set -e

cd "$(dirname "$0")/../backend"

echo "Building Backnote backend..."

# macOS arm64
echo "  → darwin/arm64"
CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 \
  CC="clang -arch arm64" CXX="clang++ -arch arm64" \
  go build -o dist/darwin/arm64/backnote-backend ./cmd/main.go

# macOS x64
echo "  → darwin/amd64"
CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 \
  CC="clang -arch x86_64" CXX="clang++ -arch x86_64" \
  go build -o dist/darwin/x64/backnote-backend ./cmd/main.go

# Windows x64
echo "  → windows/amd64"
GOOS=windows GOARCH=amd64 go build -o dist/win32/x64/backnote-backend.exe ./cmd/main.go

# Linux x64
echo "  → linux/amd64"
GOOS=linux GOARCH=amd64 go build -o dist/linux/x64/backnote-backend ./cmd/main.go

# Dev 用 (electron-vite dev が backend/bin/backnote-backend を読みに行くため、
# 配布用ビルドと同じタイミングで dev バイナリも更新しておく)。
# このステップは開発機のローカル実行を想定しており、ホスト OS 向け (GOOS/GOARCH 未指定 = ネイティブ) に固定。
# 配布パイプライン (.github/workflows/release.yml) は dist/ を直接組み立てるためこの行は使われない。
echo "  → bin (dev)"
go build -o bin/backnote-backend ./cmd/main.go

echo "Done!"
