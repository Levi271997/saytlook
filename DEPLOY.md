# Deploying Saytlook QA with a live analysis backend

The site has two parts, and they deploy to different places:

| Part | What it is | Where it runs |
| --- | --- | --- |
| **Web** (`apps/web`) | Static React build | GitHub Pages (already set up), or Vercel/Netlify |
| **API** (`apps/api`) | Express + Playwright Chromium, renders pages | A container host: Render, Fly.io, Railway, or a VPS |

GitHub Pages and Vercel only serve static files. Rendering a page needs a real
Chromium process, so the API must run on a host that can run a long-lived
container. The web app finds the API through one build-time setting,
`VITE_API_BASE_URL`. Until that is set, the site shows the "Preview build - no
analysis backend" banner.

This guide covers:

1. [Test the API image locally](#1-test-the-api-image-locally)
2. [Deploy the API to Render](#2-deploy-the-api-to-render)
3. [Connect the web app to the API](#3-connect-the-web-app-to-the-api)
4. [Verify it works](#4-verify-it-works)
5. [Other hosts](#5-other-hosts)
6. [Troubleshooting](#6-troubleshooting)

---

## What is already in place

- **`Dockerfile`** at the repo root builds the API with Chromium preinstalled.
- **`.dockerignore`** keeps `node_modules` and local data out of the image.
- **`apps/api/src/config.ts`** reads `PORT` and `PUBLIC_BASE_URL` from the environment.
- **`apps/api/src/index.ts`** enables `cors()` for every route, including the
  `/screenshots` files, so the GitHub Pages origin can call the API and load
  screenshots onto a canvas for the pixel diff.
- **`.github/workflows/deploy-pages.yml`** passes the repo variable
  `VITE_API_BASE_URL` into the web build. If the variable is empty, the build
  stays a preview.

You need to add nothing to the code. The steps below are configuration.

---

## 1. Test the API image locally

You need Docker Desktop (or any Docker engine) running. From the repo root:

```bash
docker build -t saytlook-api .

docker run --rm -p 8787:8787 \
  -e PUBLIC_BASE_URL=http://localhost:8787 \
  saytlook-api
```

In a second terminal, check the health endpoint:

```bash
curl http://localhost:8787/api/health
```

You should get a JSON response. Then render a page through the API:

```bash
curl -X POST http://localhost:8787/api/render \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","viewport":{"width":1440,"height":900}}'
```

The response should contain a `snapshot` with a `screenshot` URL starting with
`http://localhost:8787/screenshots/`. If the render succeeds, the image works.
Continue to step 2.

If the build fails at `pnpm install`, run `pnpm install` locally and confirm it
passes. If the `FROM` line fails to pull, see [Troubleshooting](#6-troubleshooting).

---

## 2. Deploy the API to Render

Render builds the `Dockerfile` for you and gives the service a public HTTPS URL.

### 2a. Push the new files

Commit and push the `Dockerfile`, `.dockerignore`, and `DEPLOY.md` to GitHub.
Render deploys from the repo, so it needs them there.

```bash
git add Dockerfile .dockerignore DEPLOY.md .github/workflows/deploy-pages.yml
git commit -m "Add API Dockerfile and deployment guide"
git push
```

Pushing to `main` also redeploys GitHub Pages. That is harmless, because the
variable is still unset, so the site stays in preview mode until step 3.

### 2b. Create the service

1. Sign in at https://render.com and click **New +** → **Web Service**.
2. Connect the GitHub repo `Levi271997/saytlook` and pick the branch `main`.
3. Fill in the settings:

   | Setting | Value |
   | --- | --- |
   | Name | `saytlook-api` (this becomes part of the URL) |
   | Region | Closest to you |
   | Language / Runtime | **Docker** |
   | Root Directory | leave blank (the repo root) |
   | Dockerfile Path | `./Dockerfile` |
   | Instance Type | **Standard** (2 GB RAM) or larger |

   Chromium needs more memory than the free or Starter tier provides. Starter
   (512 MB) often crashes during a render with an out-of-memory error.

4. Under **Health Check Path**, enter `/api/health`.
5. Under **Environment Variables**, add:

   | Key | Value |
   | --- | --- |
   | `PUBLIC_BASE_URL` | `https://saytlook-api.onrender.com` (use your real URL) |

   Render sets `PORT` itself, and the API reads it. You don't need to add it.

   You don't know the final URL until the service is created. Create the
   service first with any value, copy the URL Render shows, then come back and
   set `PUBLIC_BASE_URL` to it. Render redeploys on save.

6. Click **Create Web Service**. The first build takes several minutes, because
   the Playwright image is large.

### 2c. Copy the public URL

When the deploy shows **Live**, copy the URL from the top of the service page.
It looks like `https://saytlook-api.onrender.com`. Use it in the next step. Do
not add a trailing slash.

> **Free tier note:** Render's free plan spins the service down after about 15
> minutes without traffic. The first request after that can take 30-60 seconds
> while the container starts, and the render may time out in the browser. The
> Standard plan stays running.

---

## 3. Connect the web app to the API

The web app reads `VITE_API_BASE_URL` at build time, so the value has to be set
before the build runs.

1. On GitHub, open the repo and go to **Settings** → **Secrets and variables**
   → **Actions**.
2. Click the **Variables** tab, then **New repository variable**.
3. Enter:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://saytlook-api.onrender.com` (your URL from step 2c)
4. Click **Add variable**.

It must be a **variable**, not a secret. Vite inlines it into the public
JavaScript, so anyone can read it anyway, and secrets are not exposed to the
build.

### Redeploy the site

Either push any commit to `main`, or run the workflow by hand:

1. Open the **Actions** tab.
2. Select **Deploy web app to GitHub Pages** in the left sidebar.
3. Click **Run workflow** → **Run workflow**.

When the run finishes, reload https://levi271997.github.io/saytlook/. The
amber banner should be gone.

---

## 4. Verify it works

1. Open https://levi271997.github.io/saytlook/.
2. Paste a URL such as `https://example.com` and run **Render**. The page
   should show a screenshot with overlays.
3. Run a check that loads screenshot pixels, such as the Figma overlay diff,
   to confirm the canvas is not blocked by CORS.
4. If the first render is slow, that is the free-tier cold start. Run it again.

To inspect the API directly, open `https://saytlook-api.onrender.com/api/health`
in a browser.

---

## 5. Other hosts

The same `Dockerfile` works on any host that runs containers. Set the same two
things on each one: `PUBLIC_BASE_URL` on the API, and `VITE_API_BASE_URL` on
the web build.

- **Fly.io:** `fly launch` detects the Dockerfile. Pick a VM with at least 2 GB
  of memory (`fly scale memory 2048`). Set the secret with
  `fly secrets set PUBLIC_BASE_URL=https://<your-app>.fly.dev` (secrets are fine
  here, since this is server-side).
- **Railway:** create a service from the repo. Railway uses the Dockerfile
  automatically. Set `PUBLIC_BASE_URL` in the service variables and generate a
  public domain under **Settings** → **Networking**.
- **A VPS (Ubuntu, DigitalOcean, Hetzner):** install Docker, run the image with
  `-e PUBLIC_BASE_URL=https://api.example.com`, and put Caddy or Nginx in front
  of it for HTTPS on port 443.

**Do not host the API on Vercel.** Vercel's serverless functions cannot run a
full Chromium browser within their size and time limits.

The web app can stay on GitHub Pages, or move to Vercel or Netlify. If you move
it, set `VITE_API_BASE_URL` in that host's environment settings instead of the
GitHub variable.

---

## 6. Troubleshooting

**The banner still shows after redeploying.**
The build did not get the variable. Check that it is a repository *variable*
named exactly `VITE_API_BASE_URL`, not a secret. Then re-run the workflow. Vite
only reads it during the build, so changing it does nothing until a new deploy.

**Render returns "failed to launch" or a Chromium error.**
Check the instance memory. Move to Standard or larger.

**`docker build` cannot pull the base image.**
The Playwright image tag must match the version in `pnpm-lock.yaml`. Find the
pinned version with `grep "playwright@" pnpm-lock.yaml`. Then change the tag in
the `FROM` line of `Dockerfile` to `mcr.microsoft.com/playwright:v<version>-noble`.
If `-noble` doesn't exist for that version, try `-jammy`.

**The browser can't reach the API: CORS error in the console.**
The API already sends `Access-Control-Allow-Origin: *` on every route. A CORS
error usually means `VITE_API_BASE_URL` is wrong or includes a trailing slash.
Confirm it matches the API URL exactly.

**Screenshots load in the preview but the diff is blank or errors.**
Screenshot URLs come from `PUBLIC_BASE_URL`. If that doesn't match the public
address of the API, the browser loads the wrong URL. Set it to the exact public
URL and redeploy.

**Renders work once, then fail after a while.**
A render that hangs can leave the shared browser in a bad state. Restart the
service in Render. If it happens often, raise `RENDER_TIMEOUT_MS` or reduce
`MAX_ELEMENTS` as environment variables.

**Screenshot links stop working after a redeploy.**
Render's disk is cleared on each deploy. Screenshots are written to the local
disk and pruned after 24 hours. New renders are fine, but old snapshot links
break. To keep them, attach a persistent disk in Render and set
`SCREENSHOT_DIR` to its mount path.
