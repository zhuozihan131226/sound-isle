# 声屿 · SOUND ISLE

一个在本地运行的音频提取工作台：

- **视频转 MP3**：上传 MP4 / MOV / MKV / WEBM，提取音轨并编码为 128 / 192 / 320 kbps 的 MP3，保留标题、歌手、专辑 ID3 标签。
- **歌词提取**：上传 MP3 / WAV / M4A / FLAC，先读取内嵌歌词，再从 LRCLIB 与网易云音乐匹配同步歌词；没有结果时，用本地 Whisper 模型听写补全。
- 结果支持试听、逐句跳转、简体/原文切换、翻译显示、复制，以及 LRC / TXT 下载。
- 所有文件只在本机处理；临时文件 2 小时后自动清理。
- 可选 HTTP Basic Auth（`APP_PASSWORD`），用于局域网或公网部署。

## 环境要求

- Node.js **20+**（开发与测试使用 Node.js 24）
- **ffmpeg / ffprobe** 在 `PATH` 中
- 使用本地 AI 听写时，ffmpeg 需要带 `whisper` 滤镜（`ffmpeg -filters | grep whisper`）
- 首次启用 AI 听写会下载 `models/ggml-base.bin`（约 141 MB）。也可以手动预置：

```bash
npm run download-model
```

## 启动

```bash
npm install
npm start
```

打开 <http://127.0.0.1:4310>。

默认监听 `0.0.0.0:4310`，同一局域网内的其他电脑可以访问：

```text
http://<这台电脑的局域网 IP>:4310/
```

例如本机局域网 IP 是 `192.168.111.8`，其他电脑就打开 `http://192.168.111.8:4310/`。`127.0.0.1` 永远只指向访问者自己的电脑，不能用于跨设备访问。

如果 Windows 防火墙拦截了 4310 端口，请在**管理员 PowerShell**中执行一次：

```powershell
New-NetFirewallRule -DisplayName "Sound Isle 4310" -Direction Inbound `
  -Protocol TCP -LocalPort 4310 -Action Allow -Profile Private,Domain `
  -RemoteAddress LocalSubnet
```

跨互联网访问需要额外的内网穿透或路由器端口转发，不建议直接把未加鉴权的端口暴露到公网。

想让服务在公网运行（GitHub + Render、GitHub Codespaces、VPS Docker），见 [DEPLOY.md](DEPLOY.md)。公网部署可以通过环境变量启用登录保护：

```powershell
$env:APP_PASSWORD = "换成一串足够长的密码"
npm start
```

默认用户名是 `soundisle`，可用 `APP_USER` 修改。`/api/health` 不鉴权，便于托管平台健康检查。

只想让本机访问时，可以关闭局域网监听：

```powershell
$env:HOST = "127.0.0.1"
npm start
```

撤销防火墙规则：

```powershell
Remove-NetFirewallRule -DisplayName "Sound Isle 4310"
```

自定义端口：

```powershell
$env:PORT = "8080"
npm start
```

## 测试

```bash
npm test
```

测试覆盖 LRC / SRT 解析、繁简转换、文件名与相似度工具，以及 MP4 转 MP3、内嵌歌词、下载与上传校验的 API 流程。测试需要本机 ffmpeg，且会在临时端口启动一个隔离的应用实例。

## 工作方式

### 视频转 MP3

1. `multer` 将文件写入 `data/incoming`，随后移入按任务隔离的临时目录。
2. `ffprobe` 检查音轨与时长。
3. `ffmpeg -map 0:a:0 -codec:a libmp3lame` 转码，并把进度写入文件后实时轮询，避免依赖子进程管道。
4. 结果写入 `data/uploads/<job-id>`，只通过 `/api/download/:id` 提供下载。

### 歌词提取

1. `music-metadata` 读取标签、时长、封面，以及 USLT / SYLT / 内嵌歌词。
2. 没有内嵌歌词时，按「歌名 + 歌手」搜索：
   - [LRCLIB](https://lrclib.net/)（优先，通常带 LRC 时间轴）
   - 网易云音乐歌词接口（补充华语歌词与翻译）
3. 按标题相似度、歌手匹配、时长差值排序，避免匹配到现场版或翻唱版。
4. 未命中时调用 `ffmpeg` 的 whisper.cpp 滤镜，在本地生成 SRT，再转换为 LRC 时间轴。
5. 繁体歌词会生成简体版本（OpenCC），下载时可选 `variant=simp|orig`。

## 目录

```text
sound-isle/
├─ public/              前端（无框架，原生 HTML / CSS / JS）
├─ src/
│  ├─ app.js            Express 路由、上传、任务编排
│  ├─ asr.js            whisper.cpp 模型下载与听写
│  ├─ jobs.js           内存任务队列
│  ├─ lrc.js            LRC / SRT 解析与格式化
│  ├─ lyrics.js         内嵌歌词 + 在线匹配 + ASR 兜底
│  ├─ media.js          ffmpeg / ffprobe、标签与封面
│  └─ util.js           文件名、相似度与格式化工具
├─ scripts/download-model.js
├─ test/                自动化测试与测试用音频
├─ models/              Whisper 模型（体积较大，可按需下载）
└─ server.js
```

## API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/convert` | multipart：`file`、`bitrate` |
| `POST` | `/api/lyrics` | multipart：`file`、`language`、`asr` |
| `GET` | `/api/jobs/:id` | 任务状态、进度、结果 |
| `POST` | `/api/jobs/:id/rematch` | 用新的歌名/歌手重新匹配歌词 |
| `GET` | `/api/download/:id` | 下载转换后的 MP3 |
| `GET` | `/api/audio/:id` | 歌词任务的原音频试听（支持 Range） |
| `GET` | `/api/lyrics/:id/file` | `format=lrc\|txt`，`variant=simp\|orig` |
| `GET` | `/api/cover/:id` | 内嵌封面 |

## 说明与边界

- 在线歌词依赖本机访问 `lrclib.net` 与 `music.163.com`；网络不可用时自动转到本地 AI 听写（若开启）。
- AI 听写对**唱歌**的识别精度低于对白，可能出现错字、漏句或幻觉，结果会标注来源并提示校对。
- 上传上限：视频 300 MB，音频 120 MB。任务结果保留 2 小时；进程重启后内存任务会丢失，临时目录会在后续清理中删除。
- 这是一个单机工具，默认只监听 `127.0.0.1`，未做多用户隔离与公网部署加固。
