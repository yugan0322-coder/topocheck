# TopoCheck 部署说明

## 当前项目结构说明

当前仓库实际是 `app/page.tsx` + Next/Vinext 构建结构，`public/` 只存放 Three.js 模块、静态资源和客户端脚本，并不存在可以直接作为入口的 `public/index.html`。

因此 `vercel.json` 与 `netlify.toml` 使用 Next 构建流程，不能把输出目录误设为 `/public`。

## GitHub 初始化与推送

先在 GitHub 创建一个全新的空仓库，不要勾选 README、`.gitignore` 或 License。将下面的 `<你的仓库地址>` 替换为 GitHub 提供的 HTTPS 或 SSH 地址：

```bash
git init
git add .
git commit -m "Initial TopoCheck release"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

如果当前目录已经是 Git 仓库，只需从 `git add .` 开始；不要重复执行 `git init` 或重复添加 `origin`。

## Vercel

1. 打开 Vercel，选择 **Import Git Repository**。
2. 选择刚推送的 GitHub 仓库。
3. 确认 **Root Directory** 为仓库根目录（包含 `package.json`、`app/` 和 `vercel.json` 的目录）。
4. Vercel 会读取 `vercel.json`：安装使用 pnpm lockfile，执行 `pnpm run build:vercel`（即 `next build`），输出目录为 `.next`。
5. 点击 Deploy。首次部署失败时，优先检查 Node.js 版本是否为 22 及以上、Package Manager 是否识别为 pnpm。

## Netlify 备用方案

将仓库连接到 Netlify 后，`netlify.toml` 会执行同样的 `pnpm run build:vercel` Next 构建，并启用 `@netlify/plugin-nextjs`。刷新页面时由 Next Runtime 处理路由，静态资源不会被通配回退规则覆盖。

## 纯静态部署的注意事项

如果以后真的要改成无构建步骤的纯静态站点，需要先生成一个真正的 `index.html`，并将客户端 CSS/JS 一并放入同一个静态发布目录；届时 Vercel 的 Output Directory 才应设置为该目录（例如 `public`），Netlify 的 `publish` 也应指向同一目录。当前版本不满足这个条件。
