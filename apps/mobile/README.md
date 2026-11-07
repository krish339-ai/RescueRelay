# RescueRelay · Native client

A real Expo / React Native application—not a WebView wrapper. The same source renders native Android and iOS interfaces, with a React Native Web preview for additional browser QA. The responsive web coordinator application lives separately in `apps/web`.

## Implemented

- Email/password sign-in, new isolated organization registration, and explicit synthetic demo roles.
- Coordinator dashboard, rescue board, explainable recovery candidates, hard-constraint checks, policy citations, reasoning trace, and two-step approval. Recovery defaults to the deterministic local planner.
- Coordinator **AI Assist**: local capability status, Fireworks/Nebius/OpenAI investigation selection, optional Pinecone retrieval and LangSmith trace, and a separate exact transfer-consent preview. External execution is OFF/unconfigured by default and never approves assignments. Adapters are mock-verified, not live-tested.
- Volunteer availability, assignment acceptance, pickup, delivery, and cancellation with a required reason. Interruptions after pickup escalate custody rather than automatically reassigning.
- Recipient delivery view and receipt confirmation.
- Coordinator escalation and human resolution with required notes.
- Versioned API mutations, stale-state handling, idempotent recovery approvals, pull-to-refresh, foreground refresh, and clear loading/error/empty states.
- OS-protected session storage with Expo SecureStore on supported native devices; memory-only sessions in the browser. Tokens are never an environment variable, log entry, or browser local-storage item.
- Safe-area handling, native controls, screen-reader labels, large touch targets, and keyboard-friendly forms.

Partner/entity creation, account invitations, CSV utilities, and detailed organization administration remain in the responsive web coordinator workspace. A newly registered organization is deliberately empty; set it up there, then refresh the native app. No live GPS/navigation, push/SMS/email delivery, background dispatch, payments, or food-safety certification is implemented. Only sealed shelf-stable donations are supported.

## AI Assist scope and consent

Opening AI Assist performs only a local authenticated `GET /api/ai/capabilities`. It does not test a vendor connection, upload data, start a model, or enable a service. **Configured**, **enabled**, **execution available**, and **live-tested** are different states. No API key, credit balance, subscription entitlement, model access, or zero-retention guarantee is inferred. Keys belong in server configuration only, never `EXPO_PUBLIC_*`, the phone, screenshots, or chat.

1. Select Fireworks AI, Nebius Token Factory, or OpenAI API. Pinecone retrieval and redacted LangSmith tracing are individually optional and initially unchecked.
2. **Prepare data-transfer preview** sends a local consent request for the current recovery incidents and snapshot version. Preparation works while providers are disabled; it does not contact them.
3. Review the server's exact providers, data categories, payload preview and SHA-256, maximum request budget, expiry, and retention warning. Open the expandable payload to review the actual sanitized evidence/model envelope; confirmation stays disabled until it has been opened. The request count is **not a monetary/credit spending cap**. Execution stays blocked when a required service is unavailable.
4. Only **Confirm this data transfer** submits the captured operation once. Changes to selections discard the preview; expired or stale consent cannot run. Cancel, navigation away, and sign-out do not run a prepared request. Navigating away after confirmation does not undo an already submitted transfer.
5. Review the returned proposal in **Recovery**. Assignment approval remains the existing separate two-step action with current-version and hard-constraint validation.

Consent lives in memory only. The mobile controller consumes it before dispatch, in addition to the server's one-use checks. It never automatically replays an operation after an HTTP failure or timeout, and never silently switches provider. A vendor request may already have completed when the client loses connection; refresh and review server/vendor activity before preparing a new consent. **Read recent operation receipts** performs a manual local API read and shows retained outcome status, provider/request counts, known vendor identifiers, and recovery guidance. An empty receipt list does not prove that no external work occurred. No background polling or automatic recovery action is scheduled. The operation transport allows 190 seconds for the server's bounded investigation, while ordinary API requests remain 15 seconds. A server-side bounded rate-limit retry, if allowed by an adapter, remains inside the disclosed request budget; the client never resubmits the consent.

| Workflow | Native client in this phase | Web coordinator workspace |
| --- | --- | --- |
| Capability status for all optional services | Read-only status; no keys or connection probe | Status and operator setup guidance |
| Fireworks / Nebius / OpenAI investigation | Provider selection → local consent → explicit one-use confirmation → recovery review | Same consent boundary |
| Pinecone retrieval / LangSmith trace | Optional investigation flags, separately disclosed in consent | Investigation flags and dedicated policy lookup where supported |
| Retained operation receipts | Manual read-only inspection, including uncertain outcomes; no replay action | Receipt inspection and relevant draft review |
| Document parsing / audio transcription | Not implemented on native; use web workspace | Upload and review workflows |
| Source discovery / structured preferences / reference-draft review | Use web workspace; no inactive native action buttons | Web workflows |
| Offline deterministic planning and assignment approval | Implemented independently of external integrations | Implemented independently of external integrations |

No file picker, microphone permission, background upload, vendor SDK, or provider credential storage was added to native. See [the shared AI contract](../../docs/ai-api-contract.md). External activation and any live validation require the owner's credentials, explicit approval, appropriate data-transfer permission, and account/cost review; none were supplied or used for this delivery.

## Pinned platform baseline

The lockfile is authoritative. This client uses **Expo 54.0.38**, **React Native 0.81.5**, **React 19.1.0**, SecureStore **15.0.8**, StatusBar **3.0.9**, Safe Area Context **5.6.2** (compatible `~5.6.0` range), and React Native Web **0.21.x**. Expo's installed `bundledNativeModules.json` was checked against the requested package ranges. The npm scripts disable Expo telemetry by default and keep Expo CLI state in ignored `apps/mobile/.expo-home/`, so builds do not require a writable user home. An explicitly supplied `EXPO_HOME` or `__UNSAFE_EXPO_HOME_DIRECTORY` is respected. Expo 54 uses the latter internal setting; the launcher maps the former to it, and this mapping must be rechecked on an SDK upgrade. Use **Node 24.x** and npm from the repository root; do not install another dependency tree inside this workspace.

Expo SDK 54 is intentionally pinned for reproducibility, not advertised as the latest SDK or guaranteed to satisfy future app-store requirements. Revalidate SDK/runtime and store policies before distribution. See [Expo's SDK 54 release notes](https://expo.dev/changelog/sdk-54).

## 1. Clone and install

From the cloned repository root:

```bash
npm ci
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
```

Do not overwrite an existing configured `.env` without reviewing it. No Expo account, EAS service, paid subscription, or signing credential is needed to typecheck, test, or export JavaScript bundles.

## 2. Point the client at a reachable API

`apps/mobile/.env` must set **the API root including `/api`**:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api
```

Replace the example IP; it is not automatically discovered. `EXPO_PUBLIC_*` values are embedded into client bundles and are public. Never put a session, password, provider key, or other secret there. Stop and restart Expo with `npm run start -w @rescuerelay/mobile -- --clear` (or rebuild the export) after changing this value. Export scripts clear Metro’s transform cache so an old embedded URL cannot survive a configuration change. There is deliberately no automatic localhost fallback.

| Client | Typical API URL |
| --- | --- |
| Android Studio emulator on the API computer | `http://10.0.2.2:4000/api` |
| iOS simulator on the API Mac | `http://127.0.0.1:4000/api` |
| Physical Android/iPhone on a trusted Wi-Fi network | `http://YOUR_COMPUTER_LAN_IP:4000/api` |
| Release/distributed build | Your actual **HTTPS** API origin, ending in `/api` |

`localhost` on a physical phone means the phone, not the development computer. The phone must be able to reach the API and Metro host; VPNs, Wi-Fi client isolation, or firewall rules can prevent this. Review your own network configuration; this project does not change it or create a tunnel.

### API for simulator/desktop-only development

```bash
npm run dev:api
```

The API defaults to loopback. The Android emulator's special host address may require a host binding appropriate to your setup; never assume a physical phone can reach a loopback-only listener.

### Optional physical-device demo on a trusted private LAN

The developer must explicitly opt in. In a separate terminal at the repository root:

```bash
HOST=0.0.0.0 DEMO_MODE=true ALLOW_LAN_DEMO=true npm run dev:api
```

PowerShell equivalent:

```powershell
$env:HOST="0.0.0.0"
$env:DEMO_MODE="true"
$env:ALLOW_LAN_DEMO="true"
npm run dev:api
```

**Do not run LAN demo mode on a public, shared, or untrusted network.** Demo accounts do not require a password and share synthetic state. Only use fake data. Turn off the listener when done. Production must disable demo mode, use TLS, and have appropriate access controls. Provider credentials stay on the server.

## 3. Android local native build

Install Android Studio, its SDK/emulator tools, and a compatible JDK (the Expo 54 / React Native 0.81 toolchain uses JDK 17 and targets Android API 36). Configure `ANDROID_HOME` and `adb` according to the Android Studio installation. Start an emulator or connect a development-enabled phone you control.

For a local **HTTP** development API, explicitly enable the development networking configuration while generating/building native projects:

```bash
RESCUERELAY_ALLOW_HTTP_DEV=true npm run android -w @rescuerelay/mobile
```

For an HTTPS API, omit that flag:

```bash
npm run android -w @rescuerelay/mobile
```

`expo run:android` generates the native project, builds a local debug application, installs it to the selected device/emulator, and starts Metro. No APK/AAB or Android device run was produced in the Linux build environment used for this delivery; install/run verification is still required on your machine.

## 4. iOS local native build

**Requires macOS**, Xcode with an iOS Simulator, and the matching native build dependencies/CocoaPods. Linux cannot run an iOS simulator or produce a locally signed iOS binary.

```bash
# Local HTTP development API only:
RESCUERELAY_ALLOW_HTTP_DEV=true npm run ios -w @rescuerelay/mobile

# HTTPS API:
npm run ios -w @rescuerelay/mobile
```

Physical iPhone installation additionally requires an appropriate Apple signing/development setup. Accept local-network access when connecting to a development API. No Apple/Expo account, signing setup, device registration, app-store record, or release was created for you.

### HTTP-development flag

`plugins/withLocalDevelopment.cjs` sets Android cleartext permission and iOS transport exceptions only when **`RESCUERELAY_ALLOW_HTTP_DEV=true`**. It is a build-time setting, not a secret. Use it only for local synthetic development. **Never use the flag in a release/store build.** The default disallows Android cleartext traffic and general iOS arbitrary loads. After changing the flag, regenerate native projects before rebuilding; do not reuse an old native build and assume its policy changed:

```bash
cd apps/mobile
# Generated ios/ and android/ folders are disposable unless you added manual native changes.
# Review/back up any manual native changes before --clean.
npx expo prebuild --clean --no-install
```

The default iOS local-network exception and native debug/Metro requirements are not permission to run a public HTTP API. Use HTTPS for real accounts/data.

## 5. Daily development and browser preview

After the local native build is installed:

```bash
npm run dev:mobile
```

Use the compatible local development app. **Do not assume the latest Expo Go app supports this pinned SDK.** Prefer the local builds above; Expo Go is optional only when its runtime matches SDK 54. Each Expo Go build contains one SDK; current platform-specific availability and account requirements are described in [Expo’s compatibility guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/). This delivery does not promise that an arbitrary installed App Store/Play Store Expo Go will open it. The documented local native builds avoid that assumption.

For React Native Web preview (not a substitute for Android/iOS device validation):

```bash
npm run web -w @rescuerelay/mobile
```

If testing the web preview against a different API origin, add its exact browser origin to the API's `WEB_ORIGINS` allowlist. Native requests are not governed by browser CORS. The main supported production web experience is `apps/web`.

## Validation commands

From the repository root:

```bash
npm run typecheck -w @rescuerelay/mobile
npm run test -w @rescuerelay/mobile
npm run test:integration -w @rescuerelay/mobile
npm run build -w @rescuerelay/mobile
```

`build` runs `expo export --platform all`, producing Android/iOS Hermes JavaScript bundles plus web assets in `apps/mobile/dist`. **A successful export is not an APK, AAB, IPA, signed build, simulator run, or app-store release.** The native projects are generated from `app.json` and config plugins; `ios/` and `android/` are intentionally ignored for Expo continuous native generation.

The integration test exercises this client's actual transport against the real Fastify API with an isolated in-memory SQLite database, without opening sockets or contacting outside services. It checks role-filtered snapshots, recovery evidence and approval, replay safety, acceptance/pickup/delivery, recipient confirmation, cancellation/recovery, stale writes, and revocation. It also checks default-OFF AI status with zero vendor calls, coordinator authorization, and mocked Fireworks/Nebius/OpenAI consent → read-only investigation → separate recovery approval. Provider HTTP is replaced with in-process synthetic responses; this is not live validation of credentials, vendor contracts, credit balances, or model behavior. It does not test touch handling, SecureStore at runtime, or native networking.

### Verified vs. not verified

| Check | Delivery status |
| --- | --- |
| Strict TypeScript check | Passed |
| Nineteen mobile transport/domain/consent unit tests | Passed; exact captured payload, explicit confirmation, one-use timeout/error behavior, expired/stale/session/disabled/discarded consent |
| Mobile transport → real API integration | Passed, isolated in-memory database |
| AI investigation adapters via mobile consent controller | Passed with in-process Fireworks/Nebius/OpenAI mocks; persisted success receipts and unknown-outcome receipt/no-replay check; zero real vendor calls |
| Live AI credentials, provider connectivity, credits, cost or retention | Not verified; integrations remain OFF by default |
| Metro web export | Passed |
| Metro Android Hermes export | Passed |
| Metro iOS Hermes export | Passed |
| Android/iOS config-plugin introspection | Passed; default HTTPS-first and explicit HTTP-development modes checked |
| Browser-rendered mobile UI/API smoke | Passed at 430px canvas: demo login/logout/role switch, recovery evidence and two-step approval, volunteer acceptance/cancellation, active-commitment error feedback |
| Browser-rendered AI Assist UI | Passed at 430px canvas: default-OFF status, provider/optional-transfer selection, expandable actual evidence/model disclosure, unavailable execution blocked, option-change invalidation, discard/navigation cleanup, manual receipt refresh and honest empty state; no horizontal overflow |
| Android Gradle compile, emulator or device install | Not run; Android SDK/adb unavailable in this environment |
| iOS Xcode compile, simulator or physical device | Not run; requires macOS/Xcode/signing |
| SecureStore read/write/restart on native hardware | Not run; validate on device |
| Store signing, submission and review | Not performed |

## Managed visual-QA harness

`npm run dev -w @rescuerelay/mobile` is a **preview-only test harness**, not Metro development or a production hosting command. It exports React Native Web with an explicit browser-only `same-origin` API setting, serves it with the real Fastify API through in-process injection, uses a fresh in-memory synthetic database, and explicitly forces `AI_EXTERNAL_CALLS_ENABLED=false` as well as disabling the legacy external reasoning provider. State is lost when the harness stops. It does not change the production API's binding/demo policy. In the managed cloud workspace, use only `sites-preview start <absolute-path-to-apps/mobile>` and its exact returned browser URL; do not start a second preview server.

A screenshot from this harness is a **React Native Web preview**, not an Android/iOS device or simulator screenshot. `same-origin` is intentionally not accepted for native builds; native clients require a concrete API URL.

## Connectivity and session behavior

A failed refresh leaves an already-loaded snapshot visible but **read-only**. No write is queued or reported as saved without a server response. A timed-out mutation may have reached the server; refresh before trying again. A version conflict fetches current state and asks for review rather than replaying an approval. Recovery approval uses an idempotency key. Browser and native clients do not persist authenticated snapshot data to a disk cache; restarting offline cannot restore a workspace.

When returning to the foreground, the app refreshes its server snapshot. It does not claim live subscriptions. Session expiration returns to sign-in. Sign-out attempts server revocation and clears local storage; if the API cannot confirm revocation, the UI warns that the remote session expires on its server schedule. If secure device storage fails, the UI labels the session as memory-only.

## Before real deployment

Replace the example application/bundle identifier with one your organization controls. Revalidate SDK/native dependency support, accessibility on real devices, offline/reconnect and session lifecycle, network security, privacy disclosures, authorization, backup/operations, observability, device signing, and current store requirements. Review the repository security notes and audit results, including any upstream dependency advisories. None of these release/enterprise gates are completed by a JavaScript export.

## Visual references

The [welcome](screenshots/01-native-web-welcome.jpg), [coordinator dashboard](screenshots/02-native-web-dashboard.jpg), and [recovery evidence](screenshots/03-native-web-recovery-evidence.jpg) captures are actual **React Native Web previews at a 430px canvas**, taken through the supported browser against the isolated synthetic API. They are **not** native-device or simulator screenshots.

The AI extension adds [default-OFF status](screenshots/04-native-web-ai-status.jpg), [transfer disclosure](screenshots/05-native-web-ai-consent.jpg), [blocked execution with retention warning](screenshots/06-native-web-ai-execution-blocked.jpg), and [local receipt inspection](screenshots/07-native-web-ai-receipts.jpg). These use the same browser-only test harness; no vendor request was executed during visual QA.
