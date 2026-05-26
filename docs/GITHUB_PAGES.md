# GitHub Pages 公网托管指南

本指南说明如何把行业情报雷达的静态网页发布到 GitHub Pages，让你在手机或电脑上随时访问，并让 NAS 日更后自动触发更新。

## 前置条件

- 本地已有项目 Git 仓库，Gitea remote 命名为 `origin`
- 已安装 Git，能从 NAS 访问公网

---

## 当前部署目标

- GitHub 用户：`lazydog08`
- 仓库：`industry-radar-public`
- Remote URL：`https://github.com/lazydog08/industry-radar-public.git`
- 公网访问地址：`https://lazydog08.github.io/industry-radar-public/`
- Gitea origin（不会被本流程改动）：`http://192.168.31.50:3000/lazydog/industry-radar-kb.git`

## 步骤一：新建 GitHub 仓库

1. 登录 [https://github.com](https://github.com)，点击 **New repository**
2. Owner 选 `lazydog08`，Repository name 填 `industry-radar-public`
3. 可见性选 **Public**（GitHub Pages 免费版对私有仓库需要 Pro）
4. **不要**勾选 Initialize this repository with a README、.gitignore、license

## 步骤二：开启 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 选 **GitHub Actions**
3. 保存即可；不需要选 Jekyll 或主题

## 步骤三：添加 GitHub remote

在本地或 NAS 项目目录执行：

```bash
git remote add github https://github.com/lazydog08/industry-radar-public.git
```

验证：

```bash
git remote -v
# 应该看到：
# origin  http://192.168.31.50:3000/lazydog/industry-radar-kb.git (fetch/push)
# github  https://github.com/lazydog08/industry-radar-public.git  (fetch/push)
```

## 步骤四：第一次手动推送

```bash
# 如果 public-data/ 还没生成，先跑一次导出
pnpm export:site

# 强制将 public-data 加入 Git（默认被 .gitignore）
git add -f public-data/
git commit -m "chore: initial GitHub Pages deploy"
git push github main
```

首次推送会要求 GitHub 凭据。推荐用 Personal Access Token（fine-grained 即可，权限给 `Contents: Read and write` + `Pages: Read and write`），或先 `gh auth login`。

推送后约 1-2 分钟，访问：

```
https://lazydog08.github.io/industry-radar-public/
```

页面会自动进入「线上只读模式」，读取 `public-data/overview.json` 展示情报数据。

## 步骤五：NAS 日更自动推送

在 NAS 的 `.env.local` 中追加以下配置：

```bash
ENABLE_GITHUB_PAGES_PUSH=true
GITHUB_REMOTE=github
GITHUB_BRANCH=main
```

之后每次 `pnpm nas:daily -- noon|night` 成功完成后，脚本会自动把最新 `public-data/` 推送到 GitHub，触发 Pages 重新部署。

如果 GitHub 推送失败，**不会影响 NAS 本地结果**，只会在日志中记录错误。

## 关于 .gitignore 与 public-data/

项目默认在 `.gitignore` 中排除 `public-data/`，以避免把大量生成物提交进主线历史。

`scripts/publish-github-pages.sh` 使用 `git add -f public-data/` 强制将该目录加入每次提交，仅用于 GitHub Pages 部署推送，不影响 Gitea 上的主代码历史（Gitea 的 origin 始终不会被该脚本推送）。

## 访问地址

```
https://lazydog08.github.io/industry-radar-public/
```

## 快速排障

| 现象 | 检查 |
|------|------|
| 推送时提示 `remote 'github' not found` | 执行步骤三的 `git remote add` |
| Pages 显示 404 | 确认 Settings → Pages → Source 已选 **GitHub Actions** |
| 页面加载但无数据 | 确认 `public-data/overview.json` 已被推送进仓库 |
| NAS 推送失败但本地正常 | 查看日志中 `[publish-github-pages]` 行，检查网络或 token 权限 |
| 推送报「Permission denied」 | 在 NAS 上配置 GitHub PAT 或 `gh auth login`，参考 `git credential.helper store` |
