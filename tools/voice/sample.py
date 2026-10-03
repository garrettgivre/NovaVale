# Voice auditions: one Nova line and one Dex line in several Kokoro voices.
import soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro('kokoro-v1.0.onnx', 'voices-v1.0.bin')
nova = "Nova Vale. Ms. Arden's intern. The insurers want to know how the display case works, and she said you'd know."
dex = "Oh! Hi! Sorry, nobody comes in here. Are you lost? The spa's the other way."
for v in ['af_heart', 'af_bella', 'af_nicole', 'af_nova', 'af_sky', 'af_jessica']:
    a, sr = k.create(nova, voice=v, speed=1.05, lang='en-us'); sf.write(f'out/nova_{v}.mp3', a, sr)
for v in ['am_puck', 'am_echo', 'am_michael', 'am_liam', 'am_eric', 'am_adam']:
    a, sr = k.create(dex, voice=v, speed=1.12, lang='en-us'); sf.write(f'out/dex_{v}.mp3', a, sr)
print('done', sr)
