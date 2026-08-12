/**
 * manifest-permissions.test.ts — an Android app may not ask for a permission no
 * code in it uses.
 *
 * android-pay and android-business were cloned from android-comm, and they inherited
 * its manifest wholesale. Comm genuinely has an event location picker and a photo
 * library; the two financial apps have neither. They nonetheless shipped declarations
 * for ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, READ_MEDIA_IMAGES,
 * READ_MEDIA_VIDEO, READ_EXTERNAL_STORAGE and RECORD_AUDIO — six sensitive
 * permissions, with no Geolocation plugin registered and not one reference to
 * geolocation, image picking or audio capture anywhere under src/pay or src/business.
 * Their scanners are pure web and call getUserMedia({ video: … }), no audio track.
 *
 * This is not cosmetic. On Google Play each of those obliges a Data Safety
 * declaration and a prominent-disclosure justification, for data the app never
 * touches — on payment apps, where a reviewer looks hardest. "Requests your precise
 * location" also appears on the store listing, next to a wallet.
 *
 * The test is written as a per-app allowlist rather than a scan for specific bad
 * names, because the failure mode is not "someone adds location back", it is "someone
 * clones this app again and inherits the next manifest wholesale". An allowlist
 * catches the whole class; a denylist catches only what has already gone wrong once.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * SCOPE. This reads the app's own manifest, not the merged one Gradle produces. The
 * shipped APK also carries whatever the plugins declare — as of this writing
 * RECEIVE_BOOT_COMPLETED and WAKE_LOCK from @capacitor/local-notifications, and
 * VIBRATE from @capacitor/haptics. Those are the plugin's business and are not
 * removable from here, so asserting on them would only produce a test that fails
 * whenever a dependency is upgraded.
 *
 * The distinction matters for the fix this file guards: it is only worth removing a
 * permission from the source manifest if no dependency puts it back. Verified for all
 * six — none of the plugins registered by these two apps declares location, media
 * access or RECORD_AUDIO, so the merged manifest really does lose them.
 */
function declared(appDir: string): string[] {
  const manifest = join(process.cwd(), appDir, 'app/src/main/AndroidManifest.xml');
  const xml = readFileSync(manifest, 'utf8');
  return [...xml.matchAll(/<uses-permission[^>]*android:name="android\.permission\.([A-Z_]+)"/g)]
    .map((m) => m[1])
    .sort();
}

/**
 * What each app is allowed to ask for. Adding an entry here should mean pointing at
 * the code that uses it — the review question is "which screen needs this?", and if
 * there isn't an answer the entry does not belong.
 */
const ALLOWED: Record<string, string[]> = {
  // Wallet + QR scanner + payment reminders. No location, no library, no microphone.
  'android-pay': [
    'ACCESS_NETWORK_STATE', 'CAMERA', 'INTERNET', 'NFC', 'POST_NOTIFICATIONS',
    'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM',
  ],
  // Merchant terminal: barcode + certificate scanners, reminders, NFC.
  'android-business': [
    'ACCESS_NETWORK_STATE', 'CAMERA', 'INTERNET', 'NFC', 'POST_NOTIFICATIONS',
    'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM',
  ],
};

const manifestPath = (app: string) => join(process.cwd(), app, 'app/src/main/AndroidManifest.xml');

/**
 * android-pay, android-business, android-comm and android-agent are gitignored in
 * their entirety (.gitignore lines 124–132), so on CI — and on any fresh clone —
 * these directories do not exist and there is nothing to check.
 *
 * Skipping rather than failing, because a red build would say "the permissions are
 * wrong" when the truth is "the app is not in the repository". But the skip is
 * deliberately loud in the test name, because a guard that silently evaporates
 * everywhere except one laptop is barely a guard, and the untracked native trees are
 * themselves the more serious finding: the manifests, Gradle config, signing setup
 * and HCE service definitions for four apps about to ship exist on one machine, with
 * no history and no review.
 */
const haveApps = Object.keys(ALLOWED).every((a) => existsSync(manifestPath(a)));
const d = haveApps ? describe : describe.skip;

d('the financial apps declare only permissions they use (skipped: app trees are gitignored)', () => {
  for (const [app, allowed] of Object.entries(ALLOWED)) {
    describe(app, () => {
      it('has a manifest to check', () => {
        // Without this the loop could silently iterate over a moved/renamed app and
        // every assertion below would pass over an empty list.
        expect(existsSync(manifestPath(app)), `${app} manifest missing`).toBe(true);
        expect(declared(app).length).toBeGreaterThan(2);
      });

      it('declares nothing outside the allowlist', () => {
        const extra = declared(app).filter((p) => !allowed.includes(p));
        expect(
          extra,
          `${app} declares permissions with no corresponding feature: ${extra.join(', ')}.\n` +
          'Either point at the screen that uses it and add it to ALLOWED, or delete the declaration.',
        ).toEqual([]);
      });

      it('specifically asks for no location, media library or microphone', () => {
        // Named so a regression reports the actual policy problem rather than a diff.
        const d = declared(app);
        for (const p of [
          'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO',
          'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_EXTERNAL_STORAGE',
        ]) {
          expect(d, `${app} must not request ${p}`).not.toContain(p);
        }
      });

      it('still asks for the camera, which the scanner genuinely needs', () => {
        // The paired positive: a manifest stripped to nothing would satisfy every
        // assertion above and break the scanner.
        expect(declared(app)).toContain('CAMERA');
      });
    });
  }
});

(existsSync(manifestPath("android-comm")) ? describe : describe.skip)("android-comm keeps the permissions it actually uses", () => {
  // The clone source. These are legitimate there, and this test exists so the fix
  // above is not mistaken for "location is banned everywhere" and copied onward.
  it('still declares location, because it has a location picker', () => {
    const d = declared('android-comm');
    expect(d).toContain('ACCESS_FINE_LOCATION');
    const geo = join(process.cwd(), 'src/comm/services/geo.ts');
    expect(existsSync(geo), 'the feature that justifies the permission must exist').toBe(true);
  });
});
