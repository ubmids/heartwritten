# Consent and data handling

Heartwritten reads your face through your camera to estimate your heart rate,
pulse wave, breathing and smiles while you write a letter. This page says what
happens to that data.

## Before anything starts

The app opens on a consent screen. The camera stays off until you tick
"I'm the only person on camera, and I agree to this" and press
**Turn on the camera**. A red dot shows while the camera is on, and
**Stop camera** turns it off at any point; the rest of the letter then
carries no heartbeat.

You choose, before you start:

- whether the reader sees where you smiled (on by default)
- whether the reader sees words you typed and took back (off by default)
- whether the SmartSpectra SDK sends telemetry to Presage (off by default)

## What is kept

- **Kept:** the letter's text, when each character was typed, and numbers
  sampled four times a second: heart rate, a breathing value and (if you
  allow it) a smile score. Six seconds of the pulse wave for the seal. The
  names you type in "To" and "From", and the date you sealed it (the day
  only, no time of day).
- **Never kept:** video, photos, frames or anything that shows your face.
  Words you delete are dropped unless you chose to share them. If you turn
  "Show where I smiled" off, smiles are not requested from the SDK at all.

## Where it goes

- **While you write**, Heartwritten saves nothing to disk. The letter exists
  only in the app's memory. Nothing is recorded until you type the first
  character.
- **The SmartSpectra SDK** measures on your computer. Presage's documentation
  says all metric computation runs on-device and the SDK calls Presage's
  service only to check the API key, so it needs a network connection while
  measuring. Presage says its telemetry does not include frames or vitals. Telemetry
  is off in Heartwritten unless you turn it on; if you do, Presage receives
  session summaries and device details linked to your API key. The SDK is
  Presage's own code, so what it sends is Presage's statement, not something
  Heartwritten can enforce. Heartwritten's own code makes no network requests.
- **When you seal it**, the letter is packed into a token that lives in the link
  (after the `#`, which browsers don't send to servers) or in an HTML file you
  save. Heartwritten has no backend, no database and no account. Nobody has
  the letter until you send the link or file to them.
- **The reader page** is one static HTML file. When someone opens a link, their
  browser fetches that page from wherever it is hosted (by default
  heartwritten.vercel.app), and the host sees what any website sees: an IP
  address, a browser and a time. It does not see the letter, because the
  letter is in the `#` part of the link. Once loaded, the page can't send
  anything: its Content Security Policy blocks scripts from making network
  requests, it loads nothing from anywhere else, and it sets no cookies and
  uses no browser storage. A letter saved as a file opens with no network at
  all.
- **Link previews.** If you paste a letter's link into a chat app that draws
  link previews, that app fetches the reader page and its preview picture to
  draw one, as it would for any link. It asks for the address without the `#`
  part, so it gets the same page everyone gets and not the letter. The
  preview shows a general picture and title, never anything from your letter.
  The reader page itself never loads that picture.
- **The app itself** is built on Electron (Chromium). On Windows and Linux,
  Chromium may download a spelling dictionary the first time you type; the
  spell check itself runs on your computer. On macOS it uses the system's own
  spell checker.

## How long it lasts, and deleting it

- Closing the writer forgets the letter unless you copied the link or saved the
  file.
- A sealed letter lasts as long as the link or file does. Delete the file, or
  the message you sent the link in, to delete the letter. Anyone you've sent it
  to keeps their copy, as with any letter.
- Heartwritten stores nothing else. Your API key stays in the file or
  environment variable you put it in.

## AI

Heartwritten uses no AI model of its own. The physiological estimates come from
the SmartSpectra SDK.

## Not medical

Heart rate and breathing are camera estimates for feeling, not medicine.
Heartwritten makes no diagnosis, gives no health advice and isn't for
monitoring anyone. Only write with your own face on camera.
