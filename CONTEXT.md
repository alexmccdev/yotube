# Domain language

## Browser Catalog

The browser-owned collection of Card records. It contains only metadata, selected icon
descriptors, upload results, and Yoto card IDs. It never contains OAuth credentials, signed
upload URLs, audio bytes, or image bytes. `localStorage` is the source of truth.

## Card

A locally editable, ordered group of Tracks that can be published to Yoto. A Card moves from
Draft, through Sending, to On Yoto. There is no Staged state in the web product.
After publishing, a deterministic fingerprint of the title, cover, ordered tracks, ingest
results, and icons records the last state sent to Yoto. Local-only status and error fields do
not make a Card dirty.

## Track

A YouTube source URL plus editable title, selected Icon, metadata, and an optional completed
Ingest result. A Track is independently retryable.

## Ingest

The diskless transfer of one selected YouTube audio stream into Yoto's signed upload URL,
followed by Yoto transcoding. Its result is metadata that can be included in a Card publish.

## Icon

A small display image selected for one Track. Official Yoto Icons are referenced by media ID;
yotoicons.com selections are materialized into Yoto only when the Card is published.

## Publish

The operation that turns completed Track Ingest results into one ordered Yoto Card.

## Yoto Session

Encrypted OAuth credentials stored in an HttpOnly browser cookie. The application server can
decrypt them during a request but never persists them. Refresh is serialized by the browser
before an upload batch because Yoto rotates refresh tokens.
