# Heartwritten

**Letters that carry the heartbeat you wrote them with.**

You write a letter at your desk. While you type, your laptop camera reads your
heart rate, pulse wave, breathing and smiles with the
[Presage SmartSpectra SDK](https://physiology.presagetech.com). When you're
done, you seal it with a wax seal pressed from your own pulse wave.

The person you send it to opens the envelope and watches the letter being
written again at your pace: the pauses where you thought, the sentence you
rushed. Down the left margin of the paper runs a strip of chart paper with
your heartline on it, drawn beside each line as it is written. Where your
heart sped up the line stands taller and the ink warms and feathers; where
you smiled there is a pencil stroke under the words. A postscript says where
your heart was quickest and where it was steadiest.

The letter never goes to a server. A sealed letter lives inside its link (in
the part after `#`, which browsers never send) or inside a single HTML file.
There is no account and no database.

## Try it

You need Node 20 or newer and a webcam.

```
npm install
npm run start:sim
```

`start:sim` runs the whole app with simulated signals, so you can try it with
no key and no camera. Letters written this way are marked as samples,
everywhere. The first start downloads the Electron runtime (about 100 MB), so
give it a minute.

`npm test` runs the tests and needs no key either.

To read the real thing:

1. Get an API key from [physiology.presagetech.com](https://physiology.presagetech.com).
2. Put it in a file called `.smartspectra-key` in this folder (it's git-ignored),
   or set `SMARTSPECTRA_API_KEY` in your shell.
3. Check the SDK loads and the key is found: `npm run smoke`. It says where it
   found the key and never prints it. Presage checks the key itself when a
   measurement starts, so to test that too, pass a short video of a face:
   `npm run smoke -- path/to/face-clip.mp4`
4. Write a letter: `npm start`

The SDK ships native libraries for macOS on Apple silicon, Linux (x64 and arm64)
and Windows x64. Heartwritten has been run on macOS on Apple silicon only.
Measurement runs on your computer. Presage's documentation says the SDK needs a
network connection only so Presage can check the key.

To see a finished letter without the app, open the sample at
https://heartwritten.vercel.app/sample, or run `npm run sample` and open
`dist/sample-letter.html` in a browser. The sample's signals are simulated,
and it says so.

## Sharing by link

The writer can save any letter as a file. To share by link instead, host the
reader page somewhere static and tell the writer its address:

```
npm run build          # makes dist/reader/index.html, one self-contained file
```

The hosted reader is at https://heartwritten.vercel.app, and the writer uses it
by default. To host your own, deploy `dist/reader` anywhere static (a
`vercel.json` is included), then put the address in `heartwritten.config.json`:

```json
{ "readerUrl": "https://your-reader.example" }
```

or set `HEARTWRITTEN_READER_URL`. The reader has a Content Security Policy of
`default-src 'none'; connect-src 'none'` (fonts and images may only come from
inside the file itself), so once it has loaded it can't send anything
anywhere. Whoever hosts the page sees an ordinary page request (an IP
address and a browser), as any website does, but the letter in the `#` part of
the link never reaches the host or its logs.

## How it responds to human signals

| Signal (SmartSpectra) | While writing | In the letter |
| --- | --- | --- |
| Pulse rate (`cardio.pulseRate`, stable values only) | The same strip, live: the figure at the line you are on, the heartline growing beside your words, and each word taking its ink as you type it | The margin heartline: a pulse trace down a strip of chart paper bound into the left of the sheet, each line of writing beside the stretch drawn while it was written. Beats stand taller, closer and warmer where the heart was quicker, and the line goes quiet at a long pause. The live figure rides at the pen's tip with a mark that beats in time. Ink colour per character: iron-gall blue-black near the writer's own median, warming through claret to vermilion and feathering into the paper as the heart quickens, cooling to a clear blue as it settles. The postscript finds the quickest and steadiest sentences. |
| Pulse wave (`cardio.arterialPressureTrace`) | The live pulse wave at the top of the strip | The wax seal: six seconds of the wave, wrapped into a ring and pressed into wax. Every seal is different. |
| Breathing (`breathing.upperTrace`, `breathing.rate`) | Breaths a minute | A faint wash on the margin strip swells and ebbs with the writer's breathing as it replays. |
| Smiles (`face.expression`, happy) | A small mark, and a pencil stroke under the words | A hand-drawn pencil stroke under the words written while smiling. Optional. |
| Validation status | Plain-language hints: "move a little closer or further", "a little more light, please" | |

Typing is recorded as timed edits, so the replay keeps the real rhythm. Long
pauses (over eight seconds) are shortened in the replay but pencilled in the
right margin ("paused 9 seconds"). Words you delete are dropped from the
letter unless you choose to share them.

A letter keeps the heart rate four times a second, not every beat. The
heartline is drawn from that rate: the spacing and height of its beats follow
it, so it shows how fast the heart was going, not each beat as it happened.

## How it looks

A letter on a desk at night, with its heartline in the margin. Screenshots are
in [docs/screens](docs/screens) (the `margin-` files).

- The sheet fits the letter. It comes out of the envelope folded in thirds,
  opens to its first fold and grows as the writing does.
- One typeface, [Literata](src/fonts/README.md) (SIL Open Font License 1.1),
  with small capitals and old-style figures for labels and numbers. Two small
  font files are built into the reader page itself, so it still loads nothing
  from anywhere.
- The front page at https://heartwritten.vercel.app is itself a letter to the
  visitor, written the same way, with a scripted heartbeat that is labelled as
  a demonstration.
- The first time the ink warms, a pencil note in the margin says what that
  means, once.
- The camera reports in at the top of the writer's margin strip, where the
  live pulse will be: waiting for permission, looking for your face, asking
  for more light, finding your pulse, reading. If it stops, the strip says so
  and you can keep writing.
- After sealing you see the envelope as it will arrive, and copying the link
  is confirmed in words.
- The reader's icon is inside the page, and `og.png` beside it is the picture
  chat apps show when a link is pasted. Both were made from the reader
  itself; nothing is loaded from another site.

## The writer in a browser

The writer is an Electron app today because the SmartSpectra SDK it uses runs
there. Its page is written so it can also be served as a web page:

- `dist/writer` is plain HTML, CSS and one script, laid out for a laptop and
  for a phone (390 px wide). It only touches Electron through an optional
  `window.heartwritten` bridge; without the bridge it runs on simulated
  signals and says so.
- Signals reach the desk through one small interface (`start()`, `stop()`
  and the events `stream`, `validationStatus`, `metrics`, `notice`, `error`).
  `SOURCES` in `src/writer/writer.js` lists the two there are: the simulator
  and the Electron SDK. A browser source would be a third entry.
- What a web version still needs: that browser source and whatever it talks
  to, a place to serve the page (`/write`), a consent line that says where
  the measuring happens if it is no longer on the writer's own computer, and
  an update to [PRIVACY.md](PRIVACY.md) to match.

## Privacy and consent

The consent screen comes before the camera turns on, and says plainly what is
read, what is kept and where it goes. See [PRIVACY.md](PRIVACY.md) for the full
data handling, including the SDK's telemetry, which is off unless you turn it on.

Heartwritten is for feeling, not medicine. Heart rate and breathing are camera
estimates. It makes no diagnosis, gives no health advice and isn't for
monitoring anyone.

## How it's built

```
app/main.cjs           Electron main: window, camera permission, SDK IPC, key lookup
scripts/               Build, the sample letter, and the SDK load check (`npm run smoke`)
src/writer/            The writing desk (consent → write → seal)
  sdk-source.js        SmartSpectra renderer SDK, events decoded into metrics
src/reader/            The reader, built into one self-contained HTML file
src/shared/
  vitals.js            Turns SDK metrics packets into steady pulse, breath and smile values
  recorder.js          Records timed edits and 4 Hz vitals while you write
  letter-format.js     Packs a letter into a compact, deflated, URL-safe token
  playback.js          Replays the edits and maps the heart to ink
  summary.js           Quickest and steadiest sentences, smiles, words taken back
  seal.js              Draws the wax seal from the pulse wave
  heartline.js         Draws the margin heartline from the heart rate, line by line
  sheet.js             The sheet on the page: ink runs, the strip, folds (shared by reader and writer)
  sheet.css            The paper, the strip, the ink and the type (shared by reader and writer)
  composeLetter.js     Writes a letter from a script: the sample and the front page
src/fonts/             Literata, cut down to two small files, and its licence
  sim-source.js        Simulated SDK output for development and tests
test/                  node --test: the core, plus the built pages in jsdom
```

`npm test` builds everything and runs 41 tests, including the reader replaying
a full letter and the writer going from consent to a sealed letter in
simulated mode.

The Electron wiring follows Presage's `electron-quickstart` sample: the main
process binds the SDK's IPC, the preload exposes it, and the renderer runs
`SmartSpectraSDK` with the camera.

## License

MIT for this code (see [LICENSE](LICENSE)). The SmartSpectra SDK has its own
license from Presage Technologies.
