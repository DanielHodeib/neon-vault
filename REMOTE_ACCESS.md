# Remote Access (Minimal Setup)

## One-time setup
1. Install Tailscale app and sign in.
2. Run once:

```bash
tailscale up
```

## Daily use
Start everything (web + game server + public URL):

```bash
npm run tunnel:dev
```

Get current URL any time:

```bash
npm run tunnel:url
```

Stop public tunnel:

```bash
npm run tunnel:stop
```

## LAN only (same WiFi)

```bash
npm run dev:all
```

Then share:

```text
http://<your-local-ip>:3000
```

## URL file

```text
.tunnel-last-url.txt
```
