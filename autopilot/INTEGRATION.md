# Video workflow and product hub integration

## Source and scope

The existing v1.3 source was imported without rebuilding the application from memory. Existing three-product planning, SQLite experiments, Supervisor, manual metrics and OAuth analytics are retained. Added: single-product planning, cloud campaign preparation, saved run snapshots and gated hub proposals.

The public product hub remains at https://jinsei-no-sitsu.quality-life.workers.dev/ . Only the root public directory is deployed. The local management UI, database, campaign results, media and credentials are never static-site assets.

## Routine operation in chat

1. The user shares a product URL. The assistant checks identity, manufacturer specifications, affiliate destination and material permissions. A URL is not permission to reuse images.
2. The assistant updates the researched product record in `autopilot/data/products.seed.json`, then writes one `data/campaigns/<id>.json` request. The user need not enter product names, copy or deployment commands.
3. `Prepare Affiliate Campaign` builds the application, runs integration tests and creates an experiment, storyboard, local Supervisor review, media manifest, YouTube copy and hub proposal. No paid model or paid service is used by this workflow.
4. The private Actions artifact contains the actual preparation files. `data/campaign-results/<id>.json` records the outcome for the connected assistant to read. Missing materials produce a successful preparation with `hubReady:false`, not a pretend finished advertisement.
5. Reviewed materials and their original snapshots may be placed in `campaign-assets/<id>/`. Set the request mode to `publish` only when those records are true and the final video has been inspected. The runner retains the original experiment ID; it does not regenerate a replacement review.
6. Only a ready proposal updates root `data/products.json`. The same workflow deploys and verifies production, since commits using GITHUB_TOKEN do not start another push workflow.

Requests accept one or three unique product IDs. Campaign IDs and filenames must match. Scoring uses the existing heuristic scores; it is not live market or sales research.

## Publication evidence

The reviewed campaign directory requires `products.json`, `experiment.json`, `supervisor-review.json`, `asset-manifest.json`, `media/`, `shorts-final.mp4` and `video-publication.json`.

Asset entries must match the saved product IDs and actual files. Each requires `rights:"verified"`, the exact booleans `allowCommercialVideo:true` and `allowAffiliateAdvertising:true`, and an HTTPS evidence URL. These fields record actual research; they are not an automatic legal verification service.

`video-publication.json` records original runId and experimentId, finalVideoReviewed, disclosureReviewed, youtubeVideoId, destinationEvidenceUrl, publishedAt and the final file's SHA-256. Only records with all checks completed may be supplied. The runner checks identity, unchanged bytes, actual video duration of 14–16 seconds and 1080×1920 dimensions. A silent draft is insufficient without a separately inspected final video and publication record.

`GET /api/experiments/<id>/hub-proposal` exports the same gate from the local UI server. A draft render or Supervisor GO alone does not authorize publication. Product link anchors use existing product numbers, so the clip stays `#product-003`.

## Current limits

Japanese TTS, burned-in subtitles, actual YouTube upload and automatic affiliate conversion collection remain unimplemented. No new production advertisement is claimed by this integration. The clip's real product media permission is still unverified. New media must show the real product, without invented demonstrations.

## Verification

`npm ci --ignore-scripts --no-audit --no-fund` and `npm test` in autopilot run full TypeScript checking and four integration tests. Tests cover one-product preparation, unchanged three-product planning, a synthetic 15-second video fixture, successful reviewed proposal export, unchanged experiment identity on publish, rejection of changed final bytes, rejection of empty manifests and string permission flags. The synthetic footage is test-only and never uploaded or delivered as an advertisement.

The root website keeps its existing build and deployment checks. Actual cloud execution and production checks must be inspected before claiming success.
