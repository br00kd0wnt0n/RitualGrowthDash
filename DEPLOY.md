# Claude Code Prompt: Deploy Ritual Powders Dashboard to Railway via GitHub

## Context
This is a Vite + React single-page dashboard app for Ritual Powders B2B growth modeling. The codebase is ready to deploy. It builds to static files and serves them via the `serve` package.

## What I need you to do

### 1. Initialize Git and push to GitHub
- Initialize a git repo in this project directory
- Create a new GitHub repo called `ritual-powders-dashboard` (private)
- Add all files, commit with message "Initial commit: Ritual Powders B2B Growth Dashboard"
- Push to main branch

### 2. Deploy to Railway
- Install the Railway CLI if not already available: `npm install -g @railway/cli`
- Login to Railway: `railway login`
- Create a new Railway project: `railway init`
- Link this repo to the Railway project
- Deploy: `railway up`
- The app should be accessible via a Railway-generated public URL

### 3. Verify
- Confirm the build succeeds (Nixpacks will detect Node.js, run `npm install && npm run build`, then `npm start`)
- Share the public URL once deployed
- The `railway.toml` is already configured with the correct build and start commands

## Project structure
```
ritual-powders-dashboard/
  index.html          # Vite entry HTML
  package.json        # Dependencies: react, recharts, serve
  vite.config.js      # Vite + React plugin config
  railway.toml        # Railway build/deploy config
  .gitignore          # Excludes node_modules and dist
  src/
    main.jsx          # React entry point
    Dashboard.jsx     # Full dashboard component (~700 lines)
```

## Key details
- Build: `npm run build` (outputs to /dist)
- Start: `serve dist -s -l $PORT` (Railway injects PORT env var)
- No env vars needed, no database, no API keys
- Single static SPA, all calculations run client-side

## If Railway CLI isn't available
Alternative: connect Railway to the GitHub repo directly via the Railway dashboard (https://railway.app). Just point it at the repo, it will auto-detect the railway.toml and deploy.
