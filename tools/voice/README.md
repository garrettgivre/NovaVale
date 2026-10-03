# Voices (Kokoro TTS)

Dialogue lines can have recorded voices, made locally with Kokoro (open source, Apache 2.0) through `kokoro-onnx`.
Pilot (Oct 2026): Dex's first conversation only (intro, the case, Tuesday, the callout, the ghost), Nova as af_heart, Dex as am_puck.
Garrett is choosing voices; nothing else is voiced yet.

Setup on Garrett's PC (already done): `C:\Users\Garrett\dev\kokoro` has a venv (`kokoro-onnx`, `soundfile`, and
`onnxruntime==1.19.2`, because newer onnxruntime DLLs fail to load on this PC) plus `kokoro-v1.0.onnx` and `voices-v1.0.bin`
from the kokoro-onnx GitHub release `model-files-v1.0`. Set `KOKORO_DIR` if they live elsewhere.

- `sample.py`: auditions, one Nova line and one Dex line in six voices each.
- `pilot_dex.py`: writes `pilot_dex.json`, a list of `[who, text]`.
- `voice.py lines.json`: makes `assets/voice/<who>/<key>.mp3` for each line and updates `assets/voice/index.json`.
  `CAST` maps each person to a Kokoro voice and speed; `spoken()` rewrites text for speech (clock times, caps, acronyms).

In the game, `voice(who, text)` in `js/audio.js` plays a line if `index.json` lists its key (`voiceKey`, FNV-1a of the
line exactly as shown, without the `N:` prefix). Changing a line's text needs a new recording. Narration (`*...*`)
and topic questions are not voiced. Menu: Voices On/Off.
Scaling up needs an extractor that collects every spoken line (INTRO, TOPICS, hiLine, CALLS, finales, think()), including
lines built by functions in several flag states.
