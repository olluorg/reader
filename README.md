# Reader

A serverless markdown editor where the document lives entirely inside the share link. No backend, no database, no account — the URL *is* the document.

Live: <https://olluorg.github.io/reader/>

[Русская версия](./README.ru.md)

## How it works

The markdown is compressed (Brotli where available, deflate-raw as a fallback), optionally encrypted with AES-256-GCM, and packed into the URL fragment. Because the fragment never leaves the browser, the document is never sent to any server — including the one hosting this app.

- **Write.** Markdown renders live as you type.
- **Share.** Click *Share* and get a self-contained URL.
- **Encrypt.** Add a password and the link becomes AES-256 ciphertext.
- **Roles.** Generate distinct links for *view*, *comment*, or *edit*.
- **Split.** Documents that overflow the URL limit can be cut into linked parts.
- **Versions.** Each share appends a compressed diff so the link history is auditable.

## Stack

- [Vite](https://vitejs.dev/) + TypeScript
- [Milkdown](https://milkdown.dev/) (ProseMirror-based WYSIWYG)
- Web Crypto API for encryption
- `CompressionStream` for Brotli / deflate-raw
- IndexedDB for the local library (history, bookmarks, your own shares)

Hosted on GitHub Pages as a fully static bundle.

## Local development

Requires [Bun](https://bun.sh/).

```sh
bun install
bun run dev      # vite dev server
bun run build    # type-check + production build to dist/
bun run preview  # serve the production build
```

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds with Bun and publishes `dist/` to GitHub Pages.

## Privacy

Document content lives in the URL fragment (after `#`), which browsers do not send in HTTP requests. The local library (history, bookmarks, your own shares) is stored in IndexedDB on your device. Nothing is synced or transmitted.

The static site itself is served by GitHub Pages, so GitHub sees standard request metadata (IP, user agent, requested path) — but not the fragment, and therefore not your document.

## Limits

- URLs are capped at ~50 KB to stay under cross-browser and messenger limits. Long documents are split into multiple linked parts at the share step.
- The WYSIWYG editor disables itself above ~300k characters and falls back to a raw textarea (you can override the limit if you want to try anyway).

## License

Not yet specified. Until a license is added, default copyright applies — the source is public for reading, but reuse requires the owner's permission.
