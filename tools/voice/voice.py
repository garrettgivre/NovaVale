# Voices for dialogue lines. Each line is saved as assets/voice/<who>/<key>.mp3 where key = FNV-1a of the line text as
# the game shows it (same hash as voiceKey() in js/audio.js); assets/voice/index.json lists every key that exists.
# Usage: python voice.py lines.json [who,who]   (lines.json: a list of [who, text], from extract.py; the optional second
# argument remakes those speakers' lines, e.g. after changing their voice in CAST)
import json, os, re, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.environ.get('KOKORO_DIR', r'C:\Users\Garrett\dev\kokoro')
# who: (Kokoro voice, or a blend 'a*0.6+b*0.4'; speed; pitch). Pitch above 1 resamples higher (Jojo is a kid), below 1
# lower (Opal, Gus); the speed is compensated so the pace stays as set.
CAST = {
    'nova': ('af_heart', 1.06, 1),
    'dex': ('am_puck', 1.12, 1),
    'celeste': ('af_sarah*0.6+bf_emma*0.4', 1.0, 1),
    'vesper': ('af_bella', 1.0, 0.97),
    'cherry': ('am_echo*0.55+af_bella*0.45', 1.1, 1.03),
    'juniper': ('af_river*0.7+af_kore*0.3', 1.04, 1),
    'opal': ('bf_alice', 0.93, 0.94),
    'regent': ('af_alloy*0.5+am_onyx*0.5', 0.97, 1),
    'harper': ('af_aoede', 1.07, 1),
    'kenji': ('am_michael', 0.95, 0.97),
    'priya': ('bf_lily', 1.02, 1),
    'jojo': ('am_liam', 1.1, 1.2),
    'rashad': ('am_eric', 1.04, 1),
    'gus': ('am_onyx', 0.92, 0.95),
    'silas': ('am_fenrir', 1.12, 1),
    'nate': ('am_adam', 0.97, 0.98),
    'dot': ('af_nova', 1.1, 1),
    'remy': ('am_liam*0.6+am_eric*0.4', 1.08, 1),
}
ACRONYMS = {'MAINT-0': 'maint zero', 'KMORIMOTO': 'K Morimoto', 'CD-R': 'C D R', 'VIP': 'V I P', 'AQ 03': 'A Q oh three',
            'D.H.': 'D H', 'L-I-P-S-Y-N-C': 'L, I, P, S, Y, N, C'}
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
        h = NUM[hh] if hh <= 12 else str(hh)
        return h if mm == 0 and hh <= 12 else h + ' ' + ('hundred' if mm == 0 else ('oh ' + NUM[mm]) if mm < 10 else str(mm))
    t = re.sub(r'\b(\d{1,2}):(\d{2})\b', clock, t)
    t = re.sub(r'\b([A-Z]{2,})\b', lambda m: m.group(1).capitalize(), t)   # shouting in caps reads as letters otherwise
    return t.replace('—', ', ').replace('...', '… ')

FORCE = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else set()
def main():
    lines = json.load(open(sys.argv[1], encoding='utf-8'))
    k = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
    idx_p = os.path.join(REPO, 'assets', 'voice', 'index.json')
    idx = json.load(open(idx_p)) if os.path.exists(idx_p) else {}
    styles, done = {}, 0
    for who, text in lines:
        if who not in CAST: continue
        kk = key(text); out = os.path.join(REPO, 'assets', 'voice', who, kk + '.mp3')
        if os.path.exists(out) and kk in idx.get(who, []) and who not in FORCE: continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        v, sp, pitch = CAST[who]
        if '*' in v:
            if v not in styles: styles[v] = sum(k.get_voice_style(n) * float(w) for n, w in (p.split('*') for p in v.split('+')))
            v = styles[v]
        a, sr = k.create(spoken(text), voice=v, speed=sp / pitch, lang='en-us')
        if pitch != 1: a = np.interp(np.arange(0, len(a) - 1, pitch), np.arange(len(a)), a).astype(np.float32)
        sf.write(out, a, sr)
        idx.setdefault(who, []); kk in idx[who] or idx[who].append(kk)
        done += 1; print(who, kk, text[:60], flush=True)
        if done % 20 == 0: json.dump(idx, open(idx_p, 'w'), separators=(',', ':'))
    json.dump(idx, open(idx_p, 'w'), separators=(',', ':'))
main()
