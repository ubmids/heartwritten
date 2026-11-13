# Fonts

Heartwritten sets everything in **Literata** (The Literata Project Authors,
https://github.com/googlefonts/literata), licensed under the SIL Open Font
License 1.1. The licence is in [OFL.txt](OFL.txt).

The two files here are cut down from the upstream variable fonts so the reader
stays one small file:

- `Literata-Regular.woff2`: optical size 16, weight 400
- `Literata-Italic.woff2`: optical size 18, weight 400

Both keep Latin, Latin-1, Latin Extended-A and common punctuation, with small
caps (`smcp`, `c2sc`), old-style and lining figures, kerning and ligatures.
Text outside that range falls back to the reader's own serif.

`scripts/build.mjs` inlines them into the reader as `data:` URLs, so the page
still loads nothing from anywhere. The writer loads the same files from its
own folder.

Made with fontTools:

```
fonttools varLib.instancer "Literata[opsz,wght].ttf" opsz=16 wght=400 -o r.ttf
fonttools varLib.instancer "Literata-Italic[opsz,wght].ttf" opsz=18 wght=400 -o i.ttf
pyftsubset r.ttf --flavor=woff2 --no-hinting --desubroutinize \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2015,U+2018-201E,U+2020-2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2190-2193,U+2212" \
  --layout-features="kern,liga,smcp,c2sc,onum,pnum,tnum,lnum,ccmp,locl,mark,mkmk,case"
```
