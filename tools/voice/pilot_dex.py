# The pilot: Dex's first conversation (intro and the Day 1 topics), copied from js/story.js
import json
intro = ['Oh! Hi! Sorry, nobody comes in here. Are you lost? The spa\'s the other way.', 'N: Nova Vale. Ms. Arden\'s intern. The insurers want to know how the display case works, and she said you\'d know.', 'Oh. Yeah. Sure. The insurers. Right.', 'I\'m Dex. I do the tech. All of it. I can explain the case. It\'s a very normal case. Nothing weird about it.', 'N: I didn\'t say it was weird.', '...No. You didn\'t.']
crown = ['It has a keypad. Codes only, no keys. I set all the staff codes myself.', 'It wasn\'t forced, so whoever opened it had a code. Which looks bad for me. I know. I KNOW.', 'N: The insurers will want a copy of the access log.', 'It\'s in SecureLog on my computer. I\'d print it for you, but I\'m really, really busy with the gala lights.', 'N: No problem. I\'ll print it myself.', 'That\'s not... okay. Just don\'t touch anything else.']
tues = ['Asleep! In my room! By like... eleven? Ish?', 'N: Eleven ish. Got it.']
call = ['You read my... okay, that\'s a privacy thing, we should talk about—', 'N: We can talk about privacy right after we talk about lying to me.', 'Wait. Interns don\'t read people\'s email. Who ARE you?', 'N: Somebody Celeste trusts to find her crown. Quietly. Keep it that way.', 'Fine! FINE. I was in the planetarium until about 11:40. Testing a thing. A secret thing. I can\'t say what.', 'N: You\'ll tell me. They always do.']
ghost = ['Ghosts aren\'t real. It\'s probably a feedback loop in the old speakers. Technically.', 'N: Technically, you\'re sweating.']
qs = ['N: What happened with the display case?', 'N: Ms. Arden wants to know where everyone was on Tuesday night.', 'N: "Asleep by eleven"? Your own email says ghost test, Tuesday, 11pm.', 'N: What do you make of the ghost?']
out = []
for l in intro + crown + tues + call + ghost + qs:
    out.append(['nova', l[2:].strip()] if l.startswith('N:') else ['dex', l])
json.dump(out, open('pilot_dex.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out))
