# `video-playlist` — Video Playlist

> **Family:** Visitor / video
> **Purpose:** Curated video playlist from the Visitor Layer v0.8 video surface.
> **Typical transport:** Marketplace, local.

## Content directory layout

```text
manifest.json
contents/video-playlist/<playlist-id>/
  ├── playlist.json
  └── items/
```

## Apply behaviour

Inserts into `video_playlists` + `video_playlist_items`.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `video_playlists`, `video_playlist_items`, `video_uploads`, `video_variants`, `video_views`

