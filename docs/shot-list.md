# Demo video shot list (target 80 seconds, hard limits 60 to 90)

This is the cut-down, shot-by-shot version of [demo-script.md](demo-script.md).
The script is the story. This is what to capture and in what order.

## Before you record

- Real key in `.smartspectra-key`, then `npm start` (not `start:sim`). The
  "Simulated heartbeat" pill must not be on screen in any shot.
- Light on your face from the front, nothing bright behind you. Wait for the
  hint to stop asking for light or distance and for the bpm to show a number.
- Quiet room. Notifications off (Focus mode). Hide the Dock and menu bar extras.
- App window at its default size. Record the screen at 1920 by 1080, 30 fps.
- Decide the letter beforehand: about four sentences, to a real person, with
  one line that matters to you and one that makes you smile. Fill "To" and
  "From" with first names only.
- Never show the key, the `.smartspectra-key` file, a terminal with the
  environment printed, or anyone else's face.
- Two sources:
  - **SCREEN**: the screen recording of the app, then the browser.
  - **CAM**: your face. The app's own camera tile (top right of the sheet,
    where a stamp would go, with the red dot) is enough. A separate picture-in-picture of you is
    optional and belongs in shot 2 only.

## Shots

| # | Time | Length | Source | What is on screen | Action | Voice-over or caption |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0:00 to 0:06 | 6 s | SCREEN | A plain typed chat message, then cut to the Heartwritten front page (heartwritten.vercel.app), a letter writing itself with the heartline in its margin | Let it write for three seconds, slow push in | "Handwritten letters told you how they felt to write. Typed ones don't." |
| 2 | 0:06 to 0:18 | 12 s | SCREEN + CAM | The consent screen. Open "What the camera reads, and where it goes" for a beat. Tick "I'm the only person on camera, and I agree to this". Press **Turn on the camera**. The sheet appears with the camera tile where the stamp goes (red dot), and in the margin strip the live pulse wave and the beats-a-minute figure appear and settle | Move the pointer slowly. Hold two seconds on the strip once the figure shows | "Heartwritten asks first. Then it reads your pulse, breathing and smiles through the webcam, with the Presage SmartSpectra SDK. The measurement runs on this laptop." |
| 3 | 0:18 to 0:38 | 20 s | SCREEN (camera tile visible) | Typing the letter. The words take their ink as they are typed, and the heartline grows down the margin strip beside them. The figure and the line jump at the line that matters. The "smiling" mark shows once and those words get a pencil stroke. A real pause of a few seconds before the last line | Type at your real pace. Speed this shot up to 2x in the edit if it runs long, but leave the pause at real speed | No voice. Typing sound only. Caption: "Live from the camera. Ink follows the heart rate." |
| 4 | 0:38 to 0:46 | 8 s | SCREEN | Press **Seal it with my heartbeat**. The wax seal appears, with "Sealed." and the private link | Hold on the seal for two seconds, then press **Copy link** | "You seal it with six seconds of your own pulse wave. No two seals are alike." |
| 5 | 0:46 to 1:08 | 22 s | SCREEN (browser, no camera) | Paste the link into a browser. The envelope with the seal. Press the seal, it breaks. The letter writes itself: the heartline drawing down the margin strip beside each line, tall and red at the line that mattered as the ink warms, the figure and its beating mark at the pen's tip, the pencil stroke under the smiling words, "paused ... seconds" in the right margin, and the one-time note "the ink warms where ...'s heart sped up" | Leave it on "Their pace" for the line that matters, then press **Faster** | "They watch it written again, at your pace. The line in the margin is your heartbeat, and the ink warms where it sped up." |
| 6 | 1:08 to 1:16 | 8 s | SCREEN | Press **Show all**. The whole heartline down the margin and the postscript: "P.S.", "Quickest at", "Steadiest at" | Slow scroll to the postscript, hold | "At the end, where your heart was quickest, and where it was steadiest." |
| 7 | 1:16 to 1:20 | 4 s | SCREEN | Back to the envelope view with the line "This letter lives only in its link." | Still | "No server, no account, no video kept. Heartwritten." |

Total: 80 seconds. If you need to cut to 60, drop shot 1 to 3 seconds, shot 3
to 14 seconds (at 2x) and shot 5 to 16 seconds.

## What the judges need to see

The challenge page says judges check SmartSpectra use from the repo and the
demo video, and the template asks for a video "showing the live Presage
signal(s)". So these must be visible:

1. The consent tick before the camera turns on (shot 2).
2. The live pulse wave and the beats-a-minute figure in the margin strip
   changing while you are on camera (shots 2 and 3). Keep the camera tile
   (top right of the sheet) in frame so it is plain the signal is live.
3. The signal changing the result: the margin heartline, ink colour, seal,
   the pencil stroke under a smile (shots 3 to 6).

## Words to avoid in voice-over and captions

Say "heart rate", "pulse", "breathing", "camera estimates". Do not say that
it measures stress, anxiety, health, mood or emotion, and do not call any
number good, bad, normal or high. The challenge rules do not allow diagnosis
or treatment claims.

## Getting it onto DEV

Checked on 12 November 2026 against DEV's editor guide and the challenge page:

- DEV's editor guide describes no direct video upload for posts, and states no
  video size or length limit. Video goes in as an embed.
- `{% embed URL %}` supports YouTube, Vimeo, Loom, Mux and Twitch for video.
  Example: `{% embed https://www.youtube.com/watch?v=VIDEO_ID %}`
- The challenge page gives no maximum video length and no required host. It
  only says to embed or link a demo video.
- Images: the only stated limit is for GIFs, 200 megapixels per frame. The
  cover image is best at 1000 by 420.
- At most four tags per post.

Suggested export: MP4 (H.264), 1920 by 1080, 30 fps, uploaded to YouTube as
Public or Unlisted (not Private, or the embed will not play for judges).
Then replace the placeholder in [dev-post.md](dev-post.md) with the link.
