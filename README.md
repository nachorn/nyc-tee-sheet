# NYC Tee Sheet

A mobile golf guide to 27 public courses around New York City, Westchester, Greenwich/Stamford, northern New Jersey, and Long Island.

- Date-specific reservation windows and official policy citations.
- Favorites and editable starting address stored in the current browser.
- Suggested transit stations and separate train/walk/taxi directions.
- Live tee times from supported public TeeItUp and foreUP feeds, with 9 AM–1 PM highlighted and earlier/later times retained.
- Distinct unknown, unavailable-feed, and empty-result states. No reservations are made by this app.

The six initially favorited courses are Griffith E. Harris, Bethpage Black, Lido, Middle Bay, Pelham Bay, and Split Rock. Grand Central is the shared default travel origin. A private `#start=` link can initialize another address locally; the fragment is removed immediately and never sent to the server.

## Run and check

The frontend in `dist/` is authored static HTML, CSS, and JavaScript. `node scripts/serve.mjs` serves the app and the local feed endpoint on port 4173. Run `node scripts/check.mjs` and `node --test tests/booking.test.mjs` for validation.

## Hosting

GitHub Actions publishes `dist/` to GitHub Pages on pushes to `main`. The small Cloudflare Worker in `worker/index.js` proxies only the allowlisted public Lido and Weequahic feeds, sanitizes results, and caches them for 60 seconds. `dist/config.js` specifies the deployed API origin. It accepts no booking mutations, arbitrary upstream URLs, addresses, or user credentials. Deploy it with `pnpm exec wrangler deploy` after checking the account in `wrangler.jsonc`.

Direct TeeItUp browser requests use the public routing alias and unauthenticated read-only inventory endpoint. Course feeds can change or become unavailable; the official portal remains available as the fallback. Bethpage Black, Griffith E. Harris, and other unsupported providers require a portal check. Slots show public inventory matching the selected party size and hole count; users must confirm rate eligibility in the booking portal.

Course rules were researched on September 9, 2026. Unverified release times and policy conflicts are marked in the data rather than inferred. Travel routes are suggestions, not optimized or real-time timetables.

Photo: Van Cortlandt Golf Course clubhouse sign by Shannon / shan213, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Van_Cortlandt_Golf_Course_-_Flickr.jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The original image is included unchanged.
