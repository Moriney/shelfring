# TODO

- [ ] Storefront designs: let a seller select one of 3–5 preset designs. v1 has one simple seller page (name, photo, short text, cover image, item grid).
- [ ] Member groups: groups with members and join rules (invite link, work email domain). v1 uses only area and password.
- [ ] Distance-based area: let a seller limit a listing to a distance from the item (for example 25 km). v1 uses named cities and regions.
- [ ] Own-agent connector: a remote MCP server, so that sellers can use their own Claude or ChatGPT for listing work. The model cost is then on the seller's subscription. Seller tools first: read draft photos, write text, publish, read bids, accept a buyer.
- [ ] Browse nearby: a feed of public listings plus the listings for the visitor's area. v1 discovery is shared links only.
- [ ] Keyword search: search by words, category and price (D1 full-text search, FTS5).
- [ ] Search engines: server-rendered public listing pages and a sitemap. Area and password listings stay out of the index.
- [ ] AI moderation: the AI draft call also flags likely prohibited items (no extra request). Flags go to the admin page. Remove high-confidence cases automatically and send the seller the reason (EU Digital Services Act). v1 has the report button only.
- [ ] Location fallback: when the IP location places a visitor outside the area, offer "Use my location" (browser GPS) and map the position to the nearest city (city list with coordinates). v1 shows a message only.
- [ ] Fake-bid protection: Turnstile bot check and a bid limit per device per hour on the forms without login. v1 trusts bidders; the seller can remove bids.
