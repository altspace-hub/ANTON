# `career-profile` — Career Profile

> **Family:** Talent
> **Purpose:** Opt-in talent / mobility profile — aspiration, skills, sanitised CV.
> **Typical transport:** AAP (consenting peers only).

## Content directory layout

```text
manifest.json
contents/career-profile/profile.json   # base32 contact-hash variant
```

## Apply behaviour

Inserts into `talent_aspiration_profiles`. Manager-blind by default.

## Signing

REQUIRED — profile data is sensitive.

## Related

- Service: `server/services/portals/career-profile.ts`
- Tables: `talent_aspiration_profiles`
- Architecture: [`/docs/architecture/future/f-51-talent-discovery.md`](../../architecture/future/f-51-talent-discovery.md)
