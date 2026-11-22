# Releasing

Specs land on `main`. Each push to `main` deploys a private preview. The live app changes only when the product owner releases.

There is one version number for both repos. The backend reads it from `VERSION`. The frontend reads it from the latest heading in `CHANGELOG.md`. Pass that same number to the release command in both repos.

## The two lanes

- `main` is the working branch. Vercel builds it as a preview. The frontend preview talks to the backend's stable main-branch preview.
- `release` is the live app. Vercel production builds this branch. It talks to the production backend.

Do not point production at `main`.

## The release command

From a clean `main` that is already pushed, in each repo:

```
npm run release -- 0.9.0
```

The command refuses a dirty tree or a `main` that is not the same commit as `origin/main`. It runs `verify:ship`. It fast-forwards `release` to that commit and refuses if that would need a merge commit. It tags `v0.9.0` and pushes the branch and the tag. It prints one line: `RELEASED v0.9.0 <sha>`.

The backend also refuses when `VERSION` is not that number. The frontend also refuses when `CHANGELOG.md` has no heading for that number. Update those files on `main`, and push, before the command.

The first `0.9.0` notes are a draft. Edit them before the first release. Do not run the command until both repos are ready for the same number.

## Before a release

- `npm run verify:ship` in both repos. The release command runs it again.
- The end-to-end test set, when it exists. There is not one yet.
- A five-minute click-through on the preview: Generate, Review, House style, Feedback.

## Roll back

In the Vercel project, open Deployments, find the previous Production deployment, and choose Promote to Production. That puts the live app back on that deployment. It does not move `main`. The next `npm run release` fast-forwards `release` again, so a rollback that should stay put needs a later decision before the next release.

## Database

Preview and production share one database. Migrations stay add-only. A migration that renames, drops, or rewrites a column would break whichever lane is still on the old code. Health applies a missing additive migration on production. It does not apply a migration that is not additive.

## Vercel settings the product owner sets

Do not leave production tracking `main`.

In both projects, Settings, Git, Production Branch = `release`.

Frontend, Preview environment only:

- `VITE_API_BASE_URL` = `https://brightline-content-engine-backend-git-main-brightline-5c69b471.vercel.app`

That host answered `/api/health` on 22 November 2026. It is the backend's stable preview for `main`.

Production keeps the production backend. If `VITE_API_BASE_URL` is already set there, leave it as `https://brightline-content-engine-backend.vercel.app`. Do not put the preview address on Production. If Production has no `VITE_API_BASE_URL`, the production build uses the production backend because `VERCEL_ENV` is `production`.

The backend allows this frontend's `vercel.app` hosts (the production host and preview hosts such as `brightline-content-engine-frontend-git-main-brightline-5c69b471.vercel.app`) in CORS, and as a Clerk authorized party for that request. `FRONTEND_ORIGINS` stays the production list. An unrelated origin is still refused.
