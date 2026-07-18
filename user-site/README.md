# jamesmittlerii.github.io

User-site landing page for [https://jamesmittlerii.github.io](https://jamesmittlerii.github.io).

Dynamically lists public repositories with **GitHub Pages** enabled (`has_pages: true`), linking each to `https://jamesmittlerii.github.io/<repo>/`.

## Required repo name

The repository **must** be named exactly:

```text
jamesmittlerii.github.io
```

If it is currently named `GitHub.io`, rename it:

1. Open the repo on GitHub → **Settings** → **General**
2. **Repository name** → `jamesmittlerii.github.io` → **Rename**

Only that name claims the root user-site URL.

## Enable Pages on this repo

1. **Settings** → **Pages**
2. Build and deployment → Source: **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)` → **Save**

## Deploy these files

Copy everything in this folder to the **root** of `jamesmittlerii.github.io` (not into a subfolder):

- `index.html`
- `styles.css`
- `app.js`
- `favicon.svg`
- `.nojekyll`
- `README.md`

Then commit and push to `main`.

## Grant Cursor write access (optional)

So the cloud agent can push updates directly:

1. GitHub → **Settings** → **Applications** → **Cursor** (GitHub App)
2. **Repository access** → add `jamesmittlerii.github.io`
3. Re-run the agent or ask it to push the user site

## Project sites

Each app repo still enables Pages separately. Example:

| Site | URL |
| --- | --- |
| This directory | https://jamesmittlerii.github.io/ |
| RAT 700 Simulator | https://jamesmittlerii.github.io/rat700-simulator/ |
