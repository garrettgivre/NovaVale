# Voices for dialogue lines. Each line is saved as assets/voice/<who>/<key>.mp3 where key = FNV-1a of the line text as
# the game shows it (same hash as voiceKey() in js/audio.js); assets/voice/index.json lists every key that exists.
# Usage: python voice.py lines.json   (a list of [who, text]; who 'nova' for Nova's lines)
import json, os, re, sys
import soundfile as sf
from kokoro_onnx import Kokoro
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.environ.get('KOKORO_DIR', r'C:\Users\Garrett\dev\kokoro')
CAST = {   # voice, speed
    'nova': ('af_heart', 1.06),
    'dex': ('am_puck', 1.12),
}
ACRONYMS = {'MAINT-0': 'maint zero', 'CD-R': 'C D R', 'VIP': 'V I P'}
NUM = 'zero one two three four five six seven eight nine ten eleven twelve'.split()

def key(text):
    h = 0x811c9dc5
    for ch in text:
        h ^= ord(ch); h = (h * 0x01000193) & 0xffffffff
    return format(h, '08x')

def spoken(t):
    for a, b in ACRONYMS.items(): t = t.replace(a, b)
    def clock(m):
        hh, mm = int(m.group(1)), int(m.group(2))
        return NUM[hh] if hh <= 12 else str(hh) + (' ' + ('oh ' + NUM[mm] if 0 < mm < 10 else str(mm)) if mm else " o'clock")
    t = re.sub(r'\b(\d{1,2}):(\d{2})\b', lambda m: (NUM[int(m.group(1))] if int(m.group(1)) <= 12 else m.group(1)) + ('' if m.group(2) == '00' else ' ' + (('oh ' + NUM[int(m.group(2))]) if int(m.group(2)) < 10 else m.group(2))), t)
    t = re.sub(r'\b([A-Z]{2,})\b', lambda m: m.group(1).capitalize(), t)   # shouting in caps reads as letters otherwise
    return t.replace('—', ', ').replace('...', '… ')

def main():
    lines = json.load(open(sys.argv[1], encoding='utf-8'))
    k = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
    idx_p = os.path.join(REPO, 'assets', 'voice', 'index.json')
    idx = json.load(open(idx_p)) if os.path.exists(idx_p) else {}
    for who, text in lines:
        if who not in CAST: continue
        kk = key(text); out = os.path.join(REPO, 'assets', 'voice', who, kk + '.mp3')
        if os.path.exists(out) and kk in idx.get(who, []): continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        v, sp = CAST[who]
        a, sr = k.create(spoken(text), voice=v, speed=sp, lang='en-us')
        sf.write(out, a, sr)
        idx.setdefault(who, []); kk in idx[who] or idx[who].append(kk)
        print(who, kk, text[:60])
    json.dump(idx, open(idx_p, 'w'), separators=(',', ':'))
main()
