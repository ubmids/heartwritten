---
title: "Heartwritten: letters that carry the heartbeat you wrote them with"
tags: presagechallenge, devchallenge, electron, javascript
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).*

## What I Built

A handwritten letter used to tell you things the words didn't: where the pen pressed harder, where the writer stopped, the line they crossed out. Typed messages lost all of that.

**Heartwritten** brings it back with the one signal that never lies about how a sentence felt to write: your heartbeat.

You write a letter on your laptop. While you type, SmartSpectra reads your pulse, breathing and smiles through the webcam, and each word takes the ink of the heartbeat that wrote it. When you're done you seal it with a wax seal pressed from six seconds of your own pulse wave, so no two seals are alike.

The person you send it to taps the seal, it cracks, and they watch your letter being written again at your real pace:

- the **ink warms** from blue-black through claret to vermilion where your heart sped up, and cools again as you calmed down
- a small **heart in the margin beats** at your rate, sentence by sentence
- the **paper rises and falls** with your breathing
- words you wrote **while smiling glow**
- **pauses** stay in, and the long ones are noted in the margin beside the line ("paused 14 seconds")
- under your signature, a **heartline** draws your whole heart rate across the letter
- if you allow it, they see the words you **typed and took back**

At the end, a card shows where your heart was quickest and where it was steadiest, with the sentences.

There's no server and no account. A sealed letter lives entirely inside its link (in the part after `#`, which browsers never send anywhere) or in a single HTML file you can attach to an email.

## Demo

<!-- Embed the demo video here: {% embed https://youtu.be/... %} -->

<!-- Optional: a link to open a sample letter in the browser -->

## Code

<!-- {% github ubmids/heartwritten %} -->

Setup is in the README: `npm install`, add your SmartSpectra key, `npm start`. `npm run start:sim` runs the whole thing with simulated signals if you want to try it without a key.

## How It Responds to Human Signals

Every signal changes something you can see or hold in the finished letter. None of them is a number on a dashboard.

| SmartSpectra signal | What it becomes |
| --- | --- |
| `cardio.pulseRate` (stable readings only) | The colour of each character's ink, measured against *your own* median for that letter, so a calm writer and an anxious one both get a full range. It also sets the beat of the margin heart, and finds the quickest and steadiest sentences. |
| `cardio.arterialPressureTrace` | The wax seal. Six seconds of the pulse wave, wrapped into a ring around your initial. |
| `breathing.upperTrace`, `breathing.rate` | The page breathing during replay. |
| `face.expression` (happy) | The glow on words you wrote smiling. Optional, and it's the only face metric I request. |
| Validation status | Gentle hints while you write: "move a little closer or further", "a little more light, please". |

A few things I cared about:

- **The signal follows the writing, not the clock.** Typing is recorded as timed edits and vitals at 4 Hz, and the replay lines them up, so the ink colour of a word is your heart rate *when you typed that word*.
- **Only trustworthy readings count.** Pulse values that SmartSpectra doesn't mark stable are ignored, and old readings go stale after six seconds rather than painting the rest of the letter.
- **Relative, not clinical.** The ink compares you to yourself in that letter. It never says a number is good or bad.
- **Graceful degradation.** If a key isn't allowed expressions, the app drops smiles and keeps going. If you stop the camera halfway, the rest of the letter simply carries no heartbeat.

Under the hood it's an Electron app following Presage's quickstart pattern (main process binds the SDK IPC, the renderer runs `SmartSpectraSDK` with the camera), plus a reader page built into one self-contained HTML file. The letter is packed into a compact, deflated, URL-safe token, so a full page of writing with its heartbeat fits in a link of a few thousand characters. The repo has 25 tests, including the reader replaying a whole letter and the writer going from consent to a sealed letter.

## Prize Categories

Most Creative or Delightful Use.

## Consent and Data Handling

- **Consent first.** The app opens on a consent screen. The camera stays off until you confirm you're the only person on camera and agree. A red dot shows while it's on, and you can stop it at any time.
- **What's read:** heart rate, pulse wave, breathing and smiles, estimated by SmartSpectra from your face. Measurement runs on your computer; per Presage's docs, the SDK contacts Presage's service only to check the API key.
- **What's kept:** the text, when each character was typed, and numbers sampled four times a second. Never video, photos or frames. Words you delete are dropped unless you choose to share them.
- **Storage:** nothing is saved while you write. A sealed letter exists only in the link or file you choose to send. Heartwritten has no server, no database and no account.
- **Sharing:** only with whoever you send the link or file to. The reader page has a Content Security Policy that blocks every network request, so opening a letter sends nothing anywhere, and the `#` part of a link never reaches the host.
- **Retention and deletion:** a letter lasts as long as its link or file. Delete those and it's gone. Closing the writer forgets an unsent letter.
- **SDK telemetry:** off by default (`enableTelemetry: false`). You can turn it on in the consent screen; Presage says its telemetry contains session summaries and device details linked to the key, never frames or vitals.
- **AI:** none. All the physiology comes from SmartSpectra.
- **Not medical:** camera estimates for feeling, not medicine. No diagnosis, no health advice, and not for monitoring anyone.

The full write-up is in [PRIVACY.md](https://github.com/ubmids/heartwritten/blob/main/PRIVACY.md).

<!-- Optional: ## Agent Session -->
