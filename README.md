# Alculator

A tool to help find the cheapest drinks, per standard.

Live deployment can be found [here](https://alculator.zachmanson.com).

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app), and is currently deployed on Vercel.

Datasets are scraped APIs used by the Dan Murphy's website every 24 hours.

## Local Development

Use the pinned project shell (Node/npm/Prisma/PostgreSQL tools; no global installs):

```bash
nix develop
npm ci
# Copy .example.env to .env locally and configure a disposable local PostgreSQL DB.
npm run dev
```

Hosting preparation, reproducible builds, focused tests and the owner-only migration/cutover runbook are in [nix/README.md](nix/README.md). This change does not deploy or change Vercel/DNS.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
