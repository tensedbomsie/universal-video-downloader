# Universal Video Downloader

A tiny desktop app: paste a link from almost any video site, pick MP4 or MP3 and a quality, download. Built on [yt-dlp](https://github.com/yt-dlp/yt-dlp), which means it works with YouTube, TikTok, Twitter/X, Instagram, Facebook, Vimeo, Twitch, and 1,800+ other sites out of the box.

> Status: early prototype, built for personal use. Fork it, rip out what you don't need. PRs and issues welcome.

![screenshot](docs/screenshot.png)

## Features

- Paste (or type) any video URL — the site is auto-detected, no picker needed
- MP4 (choose 1080p/720p/480p/360p or best available) or MP3 (128/192/320 kbps)
- Live progress with speed readout
- One click to open the folder the file landed in
- No account, no ads, no upload of your link to any third-party server — everything runs locally via the bundled `yt-dlp` + `ffmpeg` binaries

## Quick start (from source)

1. Install [Node.js](https://nodejs.org/) 18+.
2. Download the two binaries this app shells out to and place them in a `bin/` folder at the project root:
   - `bin/yt-dlp.exe` — from the [yt-dlp releases page](https://github.com/yt-dlp/yt-dlp/releases/latest) (grab `yt-dlp.exe`)
   - `bin/ffmpeg.exe` — from [gyan.dev's ffmpeg builds](https://www.gyan.dev/ffmpeg/builds/) (the "essentials" build is enough; take `ffmpeg.exe` out of its `bin/` folder)
3. Install dependencies and run:

   ```
   npm install
   npm start
   ```

## Building an installer

```
npm run dist
```

Produces a Windows installer (NSIS) in `dist/` with `yt-dlp.exe` and `ffmpeg.exe` bundled inside — end users don't need to download anything separately.

## How it works

- `main.js` — Electron main process. Spawns `yt-dlp.exe` per download, parses its `--progress-template` output for live progress, and reports back to the renderer over IPC.
- `preload.js` — exposes a small `window.api` surface to the renderer via `contextBridge` (no Node integration in the UI itself).
- `ui.html` — the whole UI, vanilla HTML/CSS/JS, no build step.

Downloaded files land in `~/Downloads/UniversalVideoDownloader/`.

## Known limitations

- Windows only for now (paths and the bundled binaries are Windows-specific).
- Some sites occasionally need a browser-cookie export to download private/age-gated content — not wired up yet.
- YouTube periodically tightens its extraction requirements; if downloads start failing, updating `bin/yt-dlp.exe` to the latest release usually fixes it.

## License

MIT
