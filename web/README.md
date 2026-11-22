# Production Engineering Warfare Portal

A Next.js mission dashboard that discovers published labs from `../labs/*/README.md` during the build.

## Local development
```bash
cd web
npm install
npm run dev
```

## Vercel
Connect GitHub repository `bapuoldtown/production-engineering-warfare`; set **Root Directory = web** and **Framework = Next.js**. Pushes to `main` redeploy the site and pull requests generate preview deployments.

## Adding a mission
Add `labs/006-startup-probe/README.md` and associated runnable files, merge to main, and Vercel rebuilds a new mission card and full README page automatically. No manually maintained mission registry.

The site renders docs; Docker, kind, Kafka, and PostgreSQL labs execute locally. Lab numbering is shared across independent tracks, so repeated numbers are intentional.
