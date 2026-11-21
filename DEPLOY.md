# 部署说明

## 先说明：GitHub Pages 不能直接跑这个项目

GitHub Pages 只能托管静态 HTML / CSS / JS。声屿需要：

- Node.js 服务端
- FFmpeg / ffprobe
- 本地 Whisper 模型

所以不能把完整功能部署到 GitHub Pages。把前端放到 Pages 上，上传和歌词提取都会失效。

GitHub 适合托管**源码**；真正运行服务建议用下面两种方式之一。

---

## 方案 A：GitHub + Render（推荐，长期可访问）

这是最接近“部署在 GitHub 上”的完整方案：代码放在 GitHub，Render 从 GitHub 拉取并运行 Docker。

### 1. 把代码推到 GitHub

在 GitHub 新建一个空仓库，例如 `sound-isle`，然后把本项目推上去：

```bash
git init
git add .
git commit -m "feat: sound isle audio workspace"
git branch -M main
git remote add origin https://github.com/<你的用户名>/sound-isle.git
git push -u origin main
```

没有 Git 也可以直接使用工作区里的 `sound-isle-github.zip`，在 GitHub 仓库页面选择 **Add file → Upload files**，把解压后的内容拖进去。

注意：

- 上传的是**解压后的文件内容**，不是 zip 本身
- 确认仓库根目录直接能看到 `package.json`、`server.js`、`Dockerfile`
- `.github/` 和 `.devcontainer/` 是隐藏目录，网页拖拽可能会漏掉；用 GitHub Desktop 或 Git 上传可以保留它们。只部署 Render 的话，这两个目录不是必需的

本项目根目录已经有 `Dockerfile`、`render.yaml` 和 `.github/workflows/ci.yml`。

> 不要提交 `node_modules/`、`models/*.bin` 和 `data/`，`.gitignore` 已经排除。Docker 镜像默认会在第一次使用 AI 听写时自动下载模型；如果想在构建时就烘焙模型，使用 `docker build --build-arg BAKE_MODEL=1 .`。

### 2. 在 Render 创建 Blueprint

1. 打开 <https://render.com/> 并登录（可直接用 GitHub 登录）
2. **New → Blueprint**
3. 选择刚创建的 GitHub 仓库
4. Render 会读取 `render.yaml`，点击 **Apply**
5. 等待 Docker 构建和部署完成

部署完成后会得到一个类似下面的公网地址：

```text
https://sound-isle-xxxx.onrender.com
```

### 3. 设置访问密码

`render.yaml` 已经声明了 `APP_PASSWORD`（`sync: false`）。在 Render 服务页面的 **Environment** 中设置：

```text
APP_PASSWORD = 你自己的一串密码
```

默认用户名为 `soundisle`，也可以用 `APP_USER` 修改。

设置后打开网站会弹出浏览器登录框：

```text
用户名：soundisle
密码：你设置的 APP_PASSWORD
```

`/api/health` 保持公开，供 Render 做健康检查。

### 4. 免费版限制

- Render 免费实例在闲置后会休眠，首次打开需要几十秒唤醒
- 内存约 512 MB，视频转 MP3、在线歌词通常没问题
- 本地 Whisper 听写比较吃内存，免费实例上可能失败；失败时仍可使用内嵌歌词和在线歌词
- 运行期间上传的临时文件在实例重启后会丢失，这是正常现象

---

## 方案 B：GitHub Codespaces（最快，临时公网地址）

适合演示，不需要另找服务器；Codespace 停止后公网地址就会失效。

1. 把代码推到 GitHub（同上）
2. 打开仓库页面 → **Code → Codespaces → Create codespace on main**
3. `.devcontainer/devcontainer.json` 会自动安装 FFmpeg（带 whisper 滤镜）和模型
4. 在终端运行：

```bash
npm start
```

5. 打开底部 **Ports** 面板，找到 `4310`，把 Port Visibility 改成 **Public**
6. 复制 `https://<codespace-name>-4310.app.github.dev`，这就是别人可以访问的地址

Codespaces 默认有免费额度；关闭或闲置超时后服务停止。

---

## 方案 C：任意 Docker 主机 / VPS

项目自带 Dockerfile：

```bash
docker build -t sound-isle .
docker run -d --name sound-isle \
  -p 4310:4310 \
  -e APP_PASSWORD="换成你的密码" \
  sound-isle
```

打开：

```text
http://<服务器 IP>:4310/
```

如果要放到公网，建议在前面加 Nginx/Caddy 反向代理并配置 HTTPS，同时务必设置 `APP_PASSWORD`。

---

## 安全提醒

- 公网部署**一定要设置 `APP_PASSWORD`**，否则任何人都能上传文件、调用 FFmpeg 和 Whisper
- 不要把未加鉴权的 4310 端口直接暴露到公网
- 上传大小上限：视频 300 MB，音频 120 MB
- 任务结果保留 2 小时，之后自动清理
- 在线歌词会向 LRCLIB / 网易云发送歌名、歌手和时长；音频本身不会上传

---

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4310` | 监听端口；Render 会自动设置 |
| `HOST` | `0.0.0.0` | Docker / 公网部署保持默认 |
| `APP_USER` | `soundisle` | HTTP Basic Auth 用户名 |
| `APP_PASSWORD` | 空 | 设置后启用登录保护；公网必填 |
| `NODE_ENV` | `production` | 生产环境 |

---

## 为什么 GitHub Actions 只跑测试

`.github/workflows/ci.yml` 在每次 push 时跑测试，确保代码可用。GitHub Actions 不是长期运行的服务器，不能替代 Render / VPS；任务结束后进程就会被回收。
