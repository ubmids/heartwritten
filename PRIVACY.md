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
  allow it) a smile score. Six seconds of the pulse wave for the seal.
- **Never kept:** video, photos, frames or anything that shows your face.
  Words you delete are dropped unless you chose to share them.

## Where it goes

- **While you write**, nothing is saved to disk. The letter exists only in
  the app's memory.
- **The SmartSpectra SDK** measures on your computer. Presage's documentation
  says all metric computation runs on-device and the SDK calls Presage's
  service only to check the API key, so it needs a network connection while
  measuring. Presage says its telemetry does not include frames or vitals. Telemetry
  is off in Heartwritten unless you turn it on; if you do, Presage receives
  session summaries and device details linked to your API key.
- **When you seal it**, the letter is packed into a token that lives in the link
  (after the `#`, which browsers don't send to servers) or in an HTML file you
  save. Heartwritten has no server and no account. Nobody has the letter until
  you send the link or file to them.
- **The reader page** can't send anything: its Content Security Policy blocks
  every network request, and it loads nothing from anywhere else.

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
