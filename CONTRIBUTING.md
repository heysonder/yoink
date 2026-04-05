# contributing

PRs are welcome. if you have a bug report or feature request, the fastest way to reach us is through the [feedback form on the site](https://yoinkify.com/feedback).

## setup

```bash
git clone https://github.com/heysonder/yoink.git
cd yoink
npm install
cp .env.example .env.local
# fill in your env vars (see README)
npm run dev
```

requires [ffmpeg](https://ffmpeg.org/download.html) installed locally.

## guidelines

- keep PRs focused — one feature or fix per PR
- match the existing code style (no prettier, no eslint autofix changes)
- test your changes locally before submitting
- don't commit `.env` files or secrets
