# Voices (Kokoro TTS)

Every spoken line in the game is voiced (Oct 2026), made locally with Kokoro (open source, Apache 2.0) through
`kokoro-onnx`. Each person has their own voice: `CAST` in `voice.py` (a Kokoro voice or a blend of two, a speed, and a
pitch shift for Jojo, Opal, Gus and a few others). Narration (`*...*`), topic questions and captions are not voiced.

Setup on Garrett's PC (already done): `C:\Users\Garrett\dev\kokoro` has a venv (`kokoro-onnx`, `soundfile`, and
`onnxruntime==1.19.2`, because newer onnxruntime DLLs fail to load on this PC) plus `kokoro-v1.0.onnx` and `voices-v1.0.bin`
from the kokoro-onnx GitHub release `model-files-v1.0`. Set `KOKORO_DIR` if they live elsewhere.

## After changing dialogue
    python extract.py lines.json                                  # any Python 3
    C:\Users\Garrett\dev\kokoro\venv\Scripts\python.exe voice.py lines.json
Only lines without a recording are made (about 8 a minute on CPU). To recast someone, change `CAST` and pass their id:
`voice.py lines.json opal`. Old recordings of edited lines stay on disk unused; they're small.

- `extract.py` walks `js/story.js` and gives each string a speaker from where it sits: `think()` and the LOCKED/FIRST_VISIT
  tables are Nova, `say('opal', ...)` is Opal, INTRO/hiLine/TOPICS/CALLS strings belong to the key they're under, the hint
  arrays in `taskList` are Dot's (she reads them out on the phone), `N:` lines are Nova. It skips strings joined with `+` and
  templates with `${}` (their text only exists at runtime), so a few dynamic lines stay silent. stderr lists strings it
  couldn't place; check it after adding a new kind of dialogue.
- `voice.py`: makes `assets/voice/<who>/<key>.mp3` and updates `assets/voice/index.json`. `spoken()` rewrites text for
  speech (clock times, caps, acronyms like MAINT-0); add to `ACRONYMS` when a word is read wrong.
- `sample.py`: auditions, one line in several voices.

## In the game
`voice(who, text)` in `js/audio.js` plays a line through Web Audio (decoded buffers; phone browsers block `<audio>`
elements started outside a tap) when `index.json` lists its key (`voiceKey`, FNV-1a of the line exactly as shown, without
the `N:` prefix), so an edited line is silent until it's made again, never wrong. `ui.say` preloads a conversation's lines
and plays each as it appears; the speaker's figure keeps talking until the recording ends. Cutscene narration in `cine()`
(main.js) plays in Nova's voice line after line, the camera holding until she's done. Menu: Voices On/Off; sound settings
are per device, and the title screen says when sound or voices are off.

## Chatterbox (expressive, being trialled Oct 2026)
`cbox.py` remakes lines with Chatterbox (Resemble AI, MIT), which acts: each line can carry an intensity (exaggeration).
Voices are cloned from `refs/<who>.wav`, built from that person's own Kokoro lines, so nobody real is cloned. It makes up
to N takes per line and keeps the one Whisper transcribes closest to the text. Trial so far: Nova's opening
(`opening.json`, the flyover and Suite 2). Install (on D:, C: is nearly full): venv `D:\NovaVoice\chatterbox` with
`chatterbox-tts`, torch 2.6.0+cu124, set `HF_HOME=D:\NovaVoice\hf`; RTX 3060 laptop (6 GB) runs it at ~25 it/s.
faster-whisper segfaults beside torch here, so the checker uses transformers' Whisper.
