# TopoCheck

TopoCheck 是一个基于 Three.js 的低模自动化评测工具。它面向建模、减面和实时资产检查场景，直接遍历 `BufferGeometry` 数据计算几何指标，不使用随机数模拟评分。

当前版本包含：

- Slot A 低模上传与实时 3D 预览
- Slot B 高模参考上传、包围盒对齐和半透明显示
- D1 拓扑完整性诊断
- D2 低模到高模表面的几何偏差检测
- D3 面片质量检测
- D4 Edge Flow 极点检测
- D5 面数效率统计
- D1/D3/D4 诊断着色、D2 偏差热力图和 D4 极点标记
- PK 双模型分屏对比、共享 OrbitControls、一键交换模型
- Chart.js 六维雷达图、详细评分卡片、智能优化建议和加载状态提示

> D6 目前是产品面板中的占位维度，暂定显示 50 分，不参与几何计算。

## 在线访问

项目当前的 Sites 预览地址：

<https://topocheck-geometry-mvp.yugan0322.chatgpt.site>

## 项目链接

- GitHub 仓库：[yugan0322-coder/topocheck](https://github.com/yugan0322-coder/topocheck)
- Vercel 部署地址：[topocheck.vercel.app](https://topocheck.vercel.app)

## AI 协同开发矩阵（AI Collaboration Matrix）

本项目摒弃了单一 AI 依赖，采用**多模型协同（Multi-Agent Collaboration）**的开发范式：

| 阶段 | 核心 AI 工具 | 职责描述 |
| :--- | :--- | :--- |
| **规范制定** | DeepSeek / 千问 / 豆包 | 结合个人经验进行头脑风暴，交叉验证低模拓扑评分标准的合理性。 |
| **架构设计** | 千问（Qwen） | 充当技术架构师，规划 Web Demo 框架、UI 布局与核心展示逻辑。 |
| **Prompt 构建** | 综合经验 | 将规范与架构转化为结构化指令，确保 AI 生成代码的准确性。 |
| **代码实现** | Codex | 承接高阶 Prompt，完成 Web Demo 的工程化代码编写。 |
| **部署与文档** | Vercel / 千问 | 实现 GitHub 到 Vercel 的自动化部署；协同梳理项目文档与 README。 |

## 本地项目位置

```text
C:\Users\Regan\Documents\Codex\2026-07-26\role-webgl-three-js-project-topocheck
```

## 技术栈

- Next.js 兼容的 `app/` 页面结构，由 Vinext 支持本地开发
- 原生 JavaScript ES Modules
- Three.js `0.160.1`
- Three.js `BufferGeometry`、`Raycaster`、`OrbitControls`
- Chart.js `4.4.4`（通过 CDN 引入）
- Node.js `>=22.13.0`
- pnpm（仓库包含 `pnpm-lock.yaml`）

## 快速开始

在项目根目录执行：

```bash
pnpm install
pnpm run dev
```

然后打开终端输出的本地地址，通常是 <http://localhost:5173>。

常用命令：

```bash
# Vinext 本地构建
pnpm run build

# Vercel/Next 兼容构建
pnpm run build:vercel

# 运行核心几何算法测试
node --test tests/analyzer.test.mjs

# ESLint 检查
pnpm run lint
```

## 使用流程

1. 点击左侧 **低模 / Slot A**，选择 `.obj` 或 `.glb` 文件；也可以将文件拖到 3D 视口。
2. 等待 D1、D3、D4、D5 分析完成，左侧面板会显示面数、顶点数、坏面占比和评分。
3. 如需进行 D2 精度评测，点击 **高模参考 / Slot B** 上传参考模型。
4. Slot B 加载后会自动与 Slot A 做居中和等比包围盒对齐，视口进入分屏模式。
5. D2 计算结束后，点击 **几何偏差热力图** 查看蓝—绿—红偏差分布。
6. 点击 **拓扑诊断** 查看 D1 红色问题面、D3 黄色问题面和 D4 红色极点球体。
7. 同时存在 Slot A 和 Slot B 时，右侧显示 `PK MODE ACTIVE`。可以拖动中间分割线，或点击 **Swap A & B** 交换两个模型。
8. 点击 Slot A/B 旁的 `×` 可以清空对应模型；清空任一槽位后会自动退出 PK 模式。

## 评测算法

### D1：拓扑完整性

`analyzeGeometry()` 从索引或非索引几何体中读取三角面：

- 索引几何体：使用 `geometry.index.count / 3` 统计面数。
- 非索引几何体：使用 `position.count / 3` 统计面数。
- 使用无向邻接集合检测重复索引和退化三角形。
- `D1 坏面占比 = badFaceCount / faceCount × 100%`。

诊断视图中，D1 问题面显示为红色。

### D3：面片质量

对每个三角形顶点 `A、B、C`，先计算三条边长度，令最长边为 `L`。三角形面积的两倍为：

```text
doubleArea = |(B - A) × (C - A)|
```

以最长边为底时，最短高为：

```text
shortestAltitude = doubleArea / L
```

因此长宽比为：

```text
aspectRatio = L / shortestAltitude
            = L² / doubleArea
```

同时使用点积和反余弦计算三个内角，取最小值作为 `minAngle`。默认判定标准：

- `aspectRatio > 10`：面条面，标记为 D3 问题面。
- `minAngle < 10°`：退化三角形，标记为 D3 问题面。
- 重复索引也会被计入退化问题面。

D3 问题面在诊断视图中显示为亮黄色。

### D4：Edge Flow 极点

算法为每个逻辑顶点建立无向邻接集合，邻居数量就是顶点价数（Valence）。当前重点检测：

- 5 价极点
- 7 价极点

每个极点会返回顶点索引、价数和坐标。诊断视图会在对应位置生成红色发光球体。

```text
D4 score = max(0, 100 - poleCount / vertexCount × 100)
```

### D5：面数效率

D5 使用真实三角面数，不从文件名或随机数推断。当前面板采用 100,000 个三角面作为效率参考上限：

```text
D5 score = max(0, 100 - faceCount / 100000 × 100)
```

### D2：几何精度

D2 只在 Slot A 和 Slot B 同时存在时计算。对低模顶点：

1. 读取顶点世界坐标和世界法线。
2. 沿法线正方向发射一条 `Raycaster` 射线。
3. 沿反法线方向再发射一条射线。
4. 取高模表面的最近交点距离作为该顶点偏差。
5. 两个方向都没有命中时，将该顶点记为未映射。

为避免大模型阻塞主线程：

- 每个 Mesh 最多均匀采样 5,000 个顶点。
- 每处理 100 个顶点让出浏览器线程，并更新进度条。
- 对相同的低模/高模对象组合使用 `WeakMap` 缓存结果。

D2 评分规则：

| 平均偏差 | 基础分 |
| --- | ---: |
| `< 0.01` | 100 |
| `0.01 – < 0.05` | 80 |
| `0.05 – < 0.1` | 60 |
| `>= 0.1` | 40 |

若未映射顶点占采样顶点比例超过 20%，额外扣 20 分，最低为 0 分。

热力图颜色映射：蓝色表示低偏差，绿色表示中等偏差，红色表示高偏差；未映射顶点显示为洋红色。

## 项目结构

```text
topocheck/
├─ app/
│  ├─ page.tsx              # 页面骨架、上传区、评分面板和 3D 视口容器
│  └─ globals.css           # Dark Mode 布局与交互样式
├─ public/js/
│  ├─ main.js               # 应用入口、Slot 状态和分析流程编排
│  ├─ analyzer.js           # D1/D2/D3/D4/D5 几何算法
│  ├─ loader.js             # OBJ/GLB 加载、模型对齐和参考材质
│  ├─ viewer.js             # Three.js 场景、相机、渲染器、分屏和控制器
│  ├─ visualizer.js         # 诊断材质、顶点颜色、热力图和极点球体
│  ├─ dashboard.js          # Chart.js 雷达图、评分卡片、建议和 Toast
│  └─ pkManager.js          # Slot A/B、PK 激活、清空和交换逻辑
├─ tests/
│  └─ analyzer.test.mjs     # BufferGeometry、D2 和 PKManager 测试
├─ vercel.json              # Vercel 构建配置
├─ netlify.toml             # Netlify 备用配置
├─ DEPLOYMENT.md            # GitHub、Vercel、Netlify 部署指南
├─ package.json
└─ pnpm-lock.yaml
```

## 支持的模型与注意事项

- 支持 `.obj` 和 `.glb`。
- 评测对象需要包含可用的 `position` 属性；没有 Mesh 几何体的文件会被提示并拒绝。
- D2 是低模到高模的单向评测：Slot A 为被评测模型，Slot B 为参考表面。
- 模型会根据包围盒自动居中和缩放；如果两个文件的坐标系、朝向或比例语义不同，建议先在 Blender 中对齐。
- 超过 5,000 个低模顶点时 D2 使用确定性的均匀采样，而不是随机采样，因此同一组模型会得到可复现结果。
- OBJ 的非索引顶点会按坐标焊接为逻辑顶点用于 D4 邻接分析，但渲染仍保留原始几何数据。

## 测试建议

### 制造 D3 细长面

在 Blender 中创建一个三角形，将一个顶点沿边方向拉到很远，或将第三个顶点压到接近同一直线的位置。导出 OBJ 后，预期：

- D3 坏面数量增加。
- 诊断视图出现亮黄色面。
- 最小内角低于 10° 或长宽比大于 10。

### 制造 D4 五价极点

创建一个中心顶点，并让五个三角面围绕它连接。导出后上传 Slot A，预期：

- D4 极点数量至少为 1。
- 诊断视图在中心顶点出现红色发光球体。

### 验证 D2 偏差

在 Blender 中创建一个高细分球体，复制一份并使用 Decimate 修改器生成低模，分别上传到 Slot B 和 Slot A。预期：

- 平坦/贴合区域偏差较低，偏蓝或偏绿。
- 低模与高模轮廓差异较大的区域偏差较高，偏红。
- D2 面板显示平均偏差、最大偏差、未映射数量和分数。

### 自动化测试

```bash
node --test tests/analyzer.test.mjs
```

测试覆盖真实的三角面计数、细长三角形、内角、5 价极点、重复索引、D2 平面偏差和 PK 状态切换。

## 部署

### Vercel

仓库根目录已经提供 `vercel.json`：

- Root Directory：仓库根目录（包含 `package.json` 和 `app/`）。
- Install Command：`pnpm install --frozen-lockfile`。
- Build Command：`pnpm run build:vercel`。
- Output Directory：`.next`。

在 Vercel 中选择 **Import Git Repository** 导入 GitHub 仓库即可部署。详细 GitHub 推送、Vercel 和 Netlify 步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

### Netlify

`netlify.toml` 已配置：

- Node.js 22
- `pnpm run build:vercel`
- `.next` 输出目录
- `@netlify/plugin-nextjs`

## GitHub 首次推送

先在 GitHub 创建一个空仓库，然后在本地项目根目录执行：

```bash
git init
git add .
git commit -m "Initial TopoCheck release"
git branch -M main
git remote add origin https://github.com/<你的账号>/<你的仓库>.git
git push -u origin main
```

如果当前目录已经存在 Git 仓库，请从 `git add .` 开始，并确认 `origin` 没有重复配置。

## 已知限制与后续方向

- D6 仍是占位维度，后续可以接入 UV、材质槽或法线一致性评测。
- 当前 D2 使用顶点到高模表面的双向射线距离；它不是完整的 Hausdorff 距离，也不会对低模三角形内部进行连续采样。
- D4 当前只把 5 价和 7 价作为重点极点，边界顶点、三角网格特殊价数和面环方向可以在后续版本细化。
- Chart.js 通过 CDN 加载，离线环境需要改为本地依赖或自托管资源。

## 许可证

当前仓库未单独声明开源许可证。如需公开发布，请根据团队或项目要求补充 `LICENSE` 文件。
