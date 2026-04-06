---
name: deploy
description: Commit, push to main, and verify the VPS deployment via health check
---

# Deploy to VPS

Deploy the current state to production via the GitHub Actions pipeline.

## Steps

1. **Pre-flight checks**
   - Run `npm run build` to ensure the build succeeds locally
   - Run `npm run lint` to catch any lint errors

2. **Commit and push**
   - Stage all relevant changes (exclude .env, node_modules, .next)
   - Create a descriptive commit message
   - Push to `main` branch

3. **Monitor deployment**
   - The GitHub Actions workflow will automatically trigger on push to main
   - It SSHs into the VPS, pulls the latest code, rebuilds the Docker image, and restarts the container
   - Wait ~60 seconds for the deploy to complete

4. **Verify**
   - Hit the health endpoint to confirm the deployment succeeded:
     ```bash
     curl -f https://yoinkify.com/api/health
     ```
   - If the health check fails, check the GitHub Actions run for errors:
     ```bash
     gh run list --workflow=deploy.yml --limit=1
     ```

## Important
- Only deploy from a clean working tree on the `main` branch
- If there are uncommitted changes, commit them first or stash them
- Never force push to main
