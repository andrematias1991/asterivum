# Asterivum mobile app

The native iOS and Android client lives in `apps/mobile`. It uses Expo SDK 54 and the existing Railway API; it does not need a second backend or database.

## Included in the first mobile release

- English and Portuguese (Portugal), initially selected from the device locale and switchable in the header.
- Guest natal chart creation, location autocomplete, automatic coordinates/time zone and ephemerides.
- A native SVG chart wheel with Placidus house cusps, House 1 at nine o'clock, counter-clockwise progression, angle markers, degrees/minutes and aspect lines.
- Account registration/login, session restoration and logout.
- Secure native sessions stored in iOS Keychain or Android Keystore through Expo SecureStore. The API stores only the HMAC hash and accepts the opaque token through `Authorization: Bearer`.
- Authenticated saved profiles and chart reopening.
- Upgrade prompts for the detailed web features that will be added to later mobile phases: transit-strength reports, natal analysis, synastry and astrocartography.

## Local setup

Requirements: Node.js 20.19 or newer, and Expo Go or an Android/iOS development build.

```powershell
cd apps/mobile
npm ci
$env:EXPO_PUBLIC_API_URL='https://api.asterivum.com/api'
npm start
```

`EXPO_PUBLIC_API_URL` is public configuration. Never put secrets in an `EXPO_PUBLIC_*` value. If it is omitted, the production Asterivum API above is used.

For a local API, use your computer's LAN address rather than `localhost` when testing on a physical device, for example `http://192.168.1.20:3000/api`.

## Validation

```powershell
npm run mobile:typecheck
npm run mobile:test
npm run mobile:doctor
cd apps/mobile
npx expo export --platform android
```

The server security suite also covers mobile registration, Bearer authentication, authenticated writes without browser CSRF, logout and token revocation:

```powershell
npm test
```

## EAS builds

Install and authenticate the EAS CLI, link the Expo project once, then build:

```powershell
npm install --global eas-cli
cd apps/mobile
eas login
eas init
eas build --platform android --profile preview
eas build --platform all --profile production
```

The application identifiers are `com.asterivum.app` for Android and iOS. Change them before the first store build only if that identifier is already owned by another app. Store credentials remain in the relevant Apple/Google and Expo accounts, never in this repository.

## Deployment relationship

- Hostinger continues serving `www.asterivum.com`.
- Railway continues serving `api.asterivum.com` and the shared database.
- App Store / Google Play distribute the native client.
- A mobile release does not change the Railway Docker build because `apps/mobile` has its own package and lockfile.

Deploy the backend changes before distributing the app. Older backends do not return `sessionToken` for requests carrying `X-Client-Platform: mobile`.

## Security notes

- Native auth uses a random 256-bit opaque token, seven-day server-side expiry and explicit revocation on logout.
- Tokens are never placed in AsyncStorage, URLs, logs or source control.
- Browser cookie + CSRF behavior is unchanged.
- Production must remain HTTPS-only and keep a strong, stable `SESSION_SECRET` on Railway.
- No destructive `npm audit --force` upgrade was applied. Expo SDK 54 currently reports moderate findings in bundled build tooling; update to the next supported Expo SDK after compatibility testing rather than forcing a cross-SDK dependency rewrite.
