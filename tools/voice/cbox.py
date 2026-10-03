# Expressive voices with Chatterbox (Resemble AI, MIT licence), on the GPU. Each person speaks in a voice cloned from a
# reference clip (refs/<who>.wav, made from their Kokoro lines, so nobody real is cloned), and each line can carry an
# intensity (exaggeration). Several takes are made per line and the one whose transcript (faster-whisper) best matches
# the text is kept (Whisper small.en), which weeds out garbled takes.
# Usage (Chatterbox venv on D:): python cbox.py lines.json [takes]
#   lines.json: [[who, text, exaggeration?], ...]  -> assets/voice/<who>/<key>.mp3, same keys as voice.py
import json, os, re, sys, difflib
import numpy as np, soundfile as sf, torch
sys.path.insert(0, os.path.dirname(__file__))
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
from voice import key, spoken   # same hash and text clean-up as the Kokoro voices
# who: (exaggeration, cfg_weight). Higher exaggeration = more emotion; lower cfg = slower, more deliberate delivery.
STYLE = {'nova': (0.6, 0.45)}

def norm(t): return re.sub(r'[^a-z0-9 ]', '', t.lower().replace('-', ' ')).split()
def score(a, b): return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()

def main():
    lines = json.load(open(sys.argv[1], encoding='utf-8')); takes = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    from chatterbox.tts import ChatterboxTTS
    from transformers import pipeline
    tts = ChatterboxTTS.from_pretrained(device='cuda')
    # Whisper through transformers (faster-whisper's ctranslate2 segfaults beside torch on this PC)
    asr = pipeline('automatic-speech-recognition', model='openai/whisper-small.en', device='cuda', torch_dtype=torch.float16)
    idx_p = os.path.join(REPO, 'assets', 'voice', 'index.json'); idx = json.load(open(idx_p))
    for row in lines:
        who, text = row[0], row[1]
        ex, cfg = STYLE.get(who, (0.5, 0.5))
        if len(row) > 2: ex = row[2]
        ref = os.path.join(HERE, 'refs', who + '.wav')
        best = None
        for t in range(takes):
            torch.manual_seed(1000 + t)
            wav = tts.generate(spoken(text), audio_prompt_path=ref, exaggeration=ex, cfg_weight=cfg).squeeze(0).cpu().numpy()
            tmp = os.path.join(HERE, 'refs', '_take.wav'); sf.write(tmp, wav, tts.sr)
            heard = asr({'raw': wav.astype(np.float32), 'sampling_rate': tts.sr})['text']
            sc = score(spoken(text), heard)
            print(f'  {who} take {t}: {sc:.2f} | {heard.strip()[:80]}', flush=True)
            if not best or sc > best[0]: best = (sc, wav)
            if sc > 0.97: break
        kk = key(text); out = os.path.join(REPO, 'assets', 'voice', who, kk + '.mp3')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sf.write(out, best[1], tts.sr)
        idx.setdefault(who, []); kk in idx[who] or idx[who].append(kk)
        print(f'{who} {kk} kept {best[0]:.2f} | {text[:60]}', flush=True)
    json.dump(idx, open(idx_p, 'w'), separators=(',', ':'))

if __name__ == '__main__': main()
