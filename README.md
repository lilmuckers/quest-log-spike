# quest-log-spike

Throwaway test repo for Quest Log automation: spike **A0**
([lilmuckers/quest-log-actions#1](https://github.com/lilmuckers/quest-log-actions/issues/1)) plus a
real Web Push from end to end. Safe to delete once the findings are written back into
`plans/README.md` (D7, D12, D13). The secrets here are dummies or spike-only keys.

| Piece | What it tests |
|---|---|
| `.github/workflows/quest.yml` | The real stub on `lilmuckers/quest-log-actions@main`: validate, check run, PR comment |
| `.github/workflows/a0-probe.yml` | D12 secrets via `toJSON(secrets)` into a composite action, masking, the stub's token permissions, D7 core download timing, and a `quest-status` artifact |
| `site/` on [Pages](https://lilmuckers.github.io/quest-log-spike/) | Subscribe a device, register it in `spike/notify.json`, log arrivals; [`artifacts.html`](https://lilmuckers.github.io/quest-log-spike/artifacts.html) tests the D13 browser download under the app's CSP |
| `.github/workflows/send-push.yml` | Sends a push to every registered device with the notify module's settings (aes128gcm, VAPID, TTL 12h) |

Secrets: `QUEST_FOO` and `OTHER_BAR` (dummies), `QUEST_VAPID_PRIVATE_KEY` (spike-only; its public
half is `site/vapid.json`).

## Device test (by hand)

On each of **Android Chrome**, **desktop Chrome**, **Firefox** and **iOS Safari**:

1. Open <https://lilmuckers.github.io/quest-log-spike/>.
   - iPhone/iPad: Share → **Add to Home Screen**, then open **Quest Spike** from the home screen.
     Push only works there.
2. Check the **VAPID key check** line is ✅.
3. **Allow notifications and subscribe.** Then **Show a local test notification**: it should
   appear (this needs no server).
4. Paste a fine-grained token (this repo only, **Contents: read and write**) and **Save device
   to repo**. Or copy the device JSON and send it over.
5. Actions → **Send push** → Run workflow. Optionally set `only` to the device id.
6. Record for each device:
   - did it arrive, and the delay shown in **Received** (screen on, and again with the phone
     locked or the browser closed)
   - does tapping it open the page with "Opened from a notification click"
   - the push service host in the job summary
7. Expiry: **Unsubscribe** on one device, run **Send push** again, and check the summary shows
   404/410 and `expiredDevices` lists it.

## Other checks

- **Fork PR (D12):** from another account, fork and open a PR. The A0 probe should report no
  secrets and the stub should still validate, with annotations instead of a check run.
- **Artifact download (D13):** open `artifacts.html`, paste a token with Actions read, run the
  test. It records whether the zip download works under the app's CSP, and the redirect host.

## Results

Filled in as the spike runs. ⏳ = waiting on you (approval or a device).

| Check | Result |
|---|---|
| D12 `toJSON(secrets)` in a workflow | ⚠️ **Held for approval, per file version.** GitHub marks every workflow that passes `toJSON(secrets)` "may be malicious" and won't run it until someone with write access approves it. Once approved, that exact file runs freely (push and dispatch both ran). **Any edit to the file is held again** (one comment-only step added → `action_required`). So every stub re-render would need the user to approve again |
| D12 named secrets (fallback) | ✅ Runs with no approval. `QUEST_FOO` and `QUEST_VAPID_PRIVATE_KEY` arrive in the composite action, and echoing them prints `***` |
| D12 values masked | ✅ both ways. `toJSON(secrets)` delivers `OTHER_BAR, QUEST_FOO, QUEST_VAPID_PRIVATE_KEY, github_token`; the action keeps the two `QUEST_*` and the echo prints `***` |
| D12 same-repo PR | ✅ after approval (PR #1): secrets arrive, stub validates |
| D12 fork PR | ⏳ needs a second account |
| Stub token: checks / contents / pull-requests write | checks ✅ (`Quest validate` and `A0 probe check` written), pull-requests ✅ (validate comment and probe comment on PR #1), contents ⏳ (only in the job summary; the next approved `a0-probe` run prints it to the log) |
| D7 pointer + asset download from runner | ✅ no token needed. Pointer 264–391 ms, download + sha256 check 421–624 ms, whole stub run ~14 s. A PR run's cache isn't visible to `main` (first `main` run missed `quest-core-1.0.0`), as the plan expects |
| D13 artifact download | CORS ✅: `api.github.com` answers 302 with `Access-Control-Allow-Origin: *`, and the zip comes from `productionresultssa<N>.blob.core.windows.net`, also `*`. **CSP ❌ confirmed in a browser**: under the app's policy the redirect is blocked (`connect-src` violation; `fetch` throws `TypeError`). ⏳ `artifacts-allow.html` adds `https://*.blob.core.windows.net` to check that's enough |
| Push: Android Chrome | ⏳ |
| Push: desktop Chrome | ⏳ |
| Push: Firefox | ⏳ |
| Push: iOS home screen | ✅ received. `web.push.apple.com` answered 201 in 135 ms (Send push, 2026-10-27) |
| 404/410 on an unsubscribed device | ⏳ |
| Stub end to end on `@main` | ✅ core 1.0.0 resolved, verified and cached; `Quest validate` check ✅ 10 files; upserted PR comment |
| WebCrypto VAPID keys with `web-push` | ✅ offline test (`npm run test:send`): aes128gcm, TTL, urgency, JWT `aud`/`sub` |

### Notes for G4 (app push)

- iOS home-screen app: a push the service worker logs to IndexedDB isn't visible to the page
  that's already open, only after the app restarts. The page now asks the worker for the log
  (`postMessage('log')`) and refreshes when it comes back to the foreground. The app should do
  the same for anything the worker records (for example arrivals or subscription changes).
- Log before `showNotification`: iOS may stop the worker once the notification is up.

### Bugs the spike found

- The stub's `concurrency: { group: quest-${{ github.ref }}, … }` is invalid YAML: the `}}` ends
  the flow mapping. Block style works. (Fixed in the plan, here, and in
  lilmuckers/quest-log-actions#11.)
- An action's input **description** containing `${{ toJSON(secrets) }}` is evaluated by the runner,
  and the action fails to load (`Unrecognized named-value: 'secrets'`). The real action had this
  on `main`. (lilmuckers/quest-log-actions#11.)
