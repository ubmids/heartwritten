---
title: "Heartwritten: letters that carry the heartbeat you wrote them with"
published: false
tags: devchallenge, presagechallenge, electron, javascript
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).*

## What I Built

A handwritten letter used to tell you things the words didn't: where the pen pressed harder, where the writer stopped, the line they crossed out. Typed messages lost all of that.

**Heartwritten** brings some of it back with a signal you can't easily edit: your heartbeat while you wrote.

You write a letter on your laptop. While you type, SmartSpectra reads your pulse, breathing and smiles through the webcam, and each word takes the ink of the heartbeat that wrote it. When you're done you seal it with a wax seal pressed from six seconds of your own pulse wave, so no two seals are alike.

The person you send it to taps the seal, it cracks, and they watch your letter being written again at your real pace:

- the **ink warms** from blue-black through claret to vermilion where your heart sped up, and cools again as you calmed down
- a **heartline runs down the margin**, on a strip of chart paper bound into the letter, drawn beside each line as it is written: taller, tighter and warmer where your heart was quicker, with the figure and a beating mark at the pen's tip
- the quick-hearted words **feather** a little into the paper, and the calm ones stay crisp
- a faint wash on the strip **swells and ebbs** with your breathing
- words you wrote **while smiling** get a pencil stroke under them
- **pauses** stay in, and the long ones are pencilled in the margin beside the line ("paused 9 seconds")
- if you allow it, they see the words you **typed and took back**

The letter ends with a postscript: where your heart was quickest and where it was steadiest, with the sentences.

There's no backend, no database and no account. A sealed letter lives entirely inside its link (in the part after `#`, which browsers never send anywhere) or in a single HTML file you can attach to an email.

## Demo

<!-- TODO BEFORE POSTING: record the demo video (docs/shot-list.md), upload it, and replace the next line with the real link. -->
{% embed DEMO_VIDEO_LINK_GOES_HERE %}

The video shows the live SmartSpectra signals (pulse trace, heart rate, breathing and smiles) while a real letter is written, then the same letter being opened.

Open a sample letter in your browser: [heartwritten.vercel.app/sample](https://heartwritten.vercel.app/sample). That sample's heartbeat is simulated and labelled as such; the video shows a real one.

## Code

{% github ubmids/heartwritten %}

Repo: [github.com/ubmids/heartwritten](https://github.com/ubmids/heartwritten) (MIT).

Setup is in the README: `npm install`, put your SmartSpectra key in `.smartspectra-key`, then `npm start`. `npm run start:sim` runs the whole thing with simulated signals if you want to try it without a key or a camera, and `npm test` runs the 28 tests.

## How It Responds to Human Signals

Every signal changes something you can see or hold in the finished letter. None of them is a number on a dashboard.

| SmartSpectra signal | What it becomes |
| --- | --- |
| `cardio.pulseRate` (stable readings only) | The colour of each character's ink, measured against *your own* median for that letter, so a writer with a slow heart and one with a quick heart both get a full range. It also draws the heartline down the margin, sets the beat of the mark at the pen's tip, and finds the quickest and steadiest sentences. |
| `cardio.arterialPressureTrace` | The wax seal. Six seconds of the pulse wave, wrapped into a ring around your initial. |
| `breathing.upperTrace`, `breathing.rate` | A faint wash on the margin strip that swells and ebbs during replay. |
| `face.expression` (happy) | The pencil stroke under words you wrote smiling. Optional, and it's the only face metric I request. |
| Validation status | Gentle hints while you write: "move a little closer or further", "a little more light, please". |

A few things I cared about:

- **The signal follows the writing, not the clock.** Typing is recorded as timed edits and vitals at 4 Hz, and the replay lines them up, so the ink colour of a word is your heart rate *when you typed that word*.
- **Only trustworthy readings count.** Pulse values that SmartSpectra doesn't mark stable are ignored, and old readings go stale after six seconds rather than painting the rest of the letter.
- **Relative, never a verdict.** The ink compares you to yourself in that letter. It never says a number is good or bad, and it doesn't name a feeling. It shows where your heart was quicker or steadier and leaves the meaning to the two of you.
- **Graceful degradation.** If a key isn't allowed expressions, the app drops smiles and keeps going. If you stop the camera halfway, the rest of the letter simply carries no heartbeat.

Under the hood it's an Electron app following Presage's quickstart pattern (main process binds the SDK IPC, the renderer runs `SmartSpectraSDK` with the camera), plus a reader page built into one self-contained HTML file. The letter is packed into a compact, deflated, URL-safe token, so a full page of writing with its heartbeat fits in a link of a few thousand characters. It all happens live: the pulse trace, heart rate and breathing update on screen as you write, and each word is inked the moment you type it. The repo has 28 tests, including the reader replaying a whole letter and the writer going from consent to a sealed letter.

## Prize Categories

I'm entering both.

**Most Creative or Delightful Use.** The idea came from old letters, where you can see the pen press harder or stop. I wanted a typed letter to carry something like that. So the heartbeat isn't shown as a chart. It becomes the ink, the wax seal and the pace of the page, and the person reading watches the letter being written again by the heart that wrote it.

**Best Thoughtful Real-World Use.** The need is ordinary: people who are far apart, writing something that matters, with nothing but flat text to send. It's for anyone writing to someone they care about. To keep it usable, the reader needs nothing but a link (no app, no account, works on a phone), the writer gets plain-language hints about light and distance, and the app keeps working if a signal drops. Consent comes before the camera, the letter keeps numbers and never video, and there is no backend to trust (details below).

## Consent and Data Handling

- **Consent first.** The app opens on a consent screen that says what is read, what is kept and where it goes. The camera stays off until you confirm you're the only person on camera and agree. A red dot shows while it's on, and **Stop camera** turns it off at any time. Heartwritten is for writing with your own face on camera, never for watching someone else.
- **What's read:** heart rate, pulse wave, breathing and smiles, estimated by SmartSpectra from your face. Measurement runs on your computer. Per Presage's docs, the SDK contacts Presage's service only to check the API key.
- **What's kept:** the text, the names you put in To and From, the date, when each character was typed, and numbers sampled four times a second. Never video, photos or frames. Words you delete are dropped unless you choose to share them, and if you turn smiles off they aren't requested from the SDK at all.
- **Storage:** nothing is saved while you write. A sealed letter exists only in the link or file you choose to send. Heartwritten has no backend, no database and no account.
- **Sharing:** only with whoever you send the link or file to. The reader is one static page. Its host sees an ordinary page request, as any website does, but never the letter, because the letter sits in the `#` part of the link. Once loaded, the page's Content Security Policy stops it sending anything anywhere. It sets no cookies and uses no browser storage.
- **Retention and deletion:** a letter lasts as long as its link or file. Delete those and it's gone, though anyone you sent it to keeps their copy, as with any letter. Closing the writer forgets an unsent letter.
- **SDK telemetry:** off by default (`enableTelemetry: false`). You can turn it on in the consent screen. Presage says its telemetry contains session summaries and device details linked to the key, never frames or vitals.
- **AI services:** none. All the physiology comes from SmartSpectra.
- **Not medical:** these are camera estimates, for feeling, not medicine. Heartwritten makes no diagnosis, gives no health advice, supports no medical decision and isn't for monitoring anyone.

The full write-up is in [PRIVACY.md](https://github.com/ubmids/heartwritten/blob/main/PRIVACY.md).

<!-- Optional: ## Agent Session (upload a transcript at https://dev.to/agent_sessions/new, check it for keys first, then embed it here) -->

<!-- BEFORE POSTING: 1. replace DEMO_VIDEO_LINK_GOES_HERE above. 2. make the repo public, or the {% github %} card and the links will not work for judges. 3. set published: true. Team entries are not allowed; one entry per person. -->
