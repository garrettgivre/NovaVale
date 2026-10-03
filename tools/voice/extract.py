# Collects every spoken line in js/story.js with its speaker, for voice.py.
#   python extract.py lines.json             (stderr: counts, and anything it couldn't place)
# It tokenises the source (strings, templates, regexes, comments) and tracks brackets, so each string knows the call or
# table it sits in:
#   think(...)                  -> Nova (inner thoughts)
#   say('opal', ...)            -> that person; say(who, ...) inside doTopic's puzzle follow-ups -> SAY_WHO below
#   INTRO / hiLine / TOPICS / CALLS tables -> the person whose key (two-space indent) the string sits under
#   LOCKED, FIRST_VISIT         -> Nova
#   cine narration (the arrival flyover) -> Nova
# 'N: ...' strings are always Nova; '*...*' narration, topic questions (q:), ids, flags, toasts and captions are skipped,
# as are strings joined with + (their full text only exists at runtime) and templates with ${}.
import json, os, re, sys
SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'js', 'story.js')
s = open(SRC, encoding='utf-8').read()
TABLES = {'INTRO', 'hiLine', 'TOPICS', 'CALLS'}
NOVA_TABLES = {'LOCKED', 'FIRST_VISIT'}
SKIP_CALLS = {'has', 'set', 'toast', 'caption', 'sfx', 'giveItem', 'addDoc', 'showDoc', 'hasItem', 'goRoom', 'onRoom', 'closePanel',
              'panel', 'checkpoint', 'badEnding', 'getElementById', 'querySelector', 'setItem', 'getItem', 'includes', 'startsWith',
              'test', 'replace', 'join', 'split', 'find', 'filter', 'map', 'indexOf', 'push', 'Error', 'tasks', 'place', 'refresh'}
SAY_WHO = {'tape': 'silas', 'recipe': 'juniper'}   # say(who, ...) after a topic puzzle, by the puzzle it follows

out, unknown, n = [], [], len(s)
stack = []          # frames: {'ch': '(' | '[' | '{', 'name': call name, 'arg': first argument text}
section = None      # the top-level const/function we're in
key = None          # the current two-space-indent key inside a table
prev = ''           # previous significant character (to tell a regex from division)
i = 0
def skip_template(i):
    # i at the opening backtick; returns the index after the closing one, skipping ${...} with nested strings/templates
    j = i + 1
    while s[j] != '`':
        if s[j] == '\\': j += 2; continue
        if s.startswith('${', j):
            j += 2; depth = 1
            while depth:
                ch = s[j]
                if ch == '`': j = skip_template(j); continue
                if ch in '\'"': j = read_string(j, ch)[1]; continue
                depth += ch == '{'; depth -= ch == '}'; j += 1
            continue
        j += 1
    return j + 1
def line_at(p): return s.count('\n', 0, p) + 1
def read_string(i, q):
    j, buf = i + 1, []
    while s[j] != q:
        if s[j] == '\\':
            nxt = s[j + 1]; buf.append({'n': '\n', 't': '\t'}.get(nxt, nxt)); j += 2; continue
        buf.append(s[j]); j += 1
    return ''.join(buf), j + 1
while i < n:
    c = s[i]
    # line starts: top-level sections and table keys
    if i == 0 or s[i - 1] == '\n':
        m = re.match(r'(?:export )?(?:const|let|async function|function) (\w+)', s[i:i + 80])
        if m and not stack: section, key = m.group(1), None
        m2 = re.match(r'  (\w+): ', s[i:i + 40])
        if m2 and len(stack) == 1: key = m2.group(1)
    if s.startswith('//', i): i = s.index('\n', i); continue
    if s.startswith('/*', i): i = s.index('*/', i) + 2; continue
    if c in '\'"`':
        start = i
        if c == '`':
            j = skip_template(i)
            txt, i = s[i + 1:j - 1], j
            if '${' in txt: prev = 'x'; continue
            txt = txt.replace("\\'", "'")
        else:
            txt, i = read_string(i, c)
        before = s[max(0, start - 12):start].rstrip()
        after = s[i:i + 3].lstrip()
        prev = 'x'
        if before.endswith('+') or after.startswith('+') or re.search(r'\b(q|id|puzzle|room|kind|at|label|name)\s*:$', before): continue
        if len(txt) < 2 or not re.search(r'[a-zA-Z]', txt) or re.fullmatch(r'[\w.:-]+', txt) and ' ' not in txt: continue
        # who says it
        who, why = None, ''
        call = next((f for f in reversed(stack) if f['ch'] == '(' and f['name']), None)
        if txt.startswith('*'): continue
        if call and call['name'] in SKIP_CALLS: continue
        if call and call['name'] in ('choose', 'screen'): continue
        if section == 'taskList' and call and call['name'] == 'add' and stack[-1]['ch'] == '[': who = 'dot'   # Dot's hints
        elif section == 'nextHint': who = 'dot'
        elif call and call['name'] == 'think': who = 'nova'
        elif call and call['name'] in ('say', 'call'):
            a = call['arg']
            if re.fullmatch(r"'\w+'", a): who = a.strip("'")
            elif a == 'who' and section in TABLES: who = key
            elif a == 'who' and section == 'doTopic':
                p = s.rfind("t.puzzle === '", 0, start); who = SAY_WHO.get(s[p + 14:s.index("'", p + 14)]) if p >= 0 else None
            elif a == 'who' and section == 'onTalk':
                who = 'cherry' if 'Cherry is on the stage' in s[call['pos']:start + 200] else None
            elif a == 'who' and txt.startswith('Hey, cuz'): who = 'remy'
            elif a == 'who': who = key if section in TABLES else None
        elif call and call['name'] == 'cine': who = 'nova'
        elif section in TABLES and key: who = key
        elif section in NOVA_TABLES: who = 'nova'
        elif call is None and section not in ('BAD', 'NOTES', 'PLACES', 'ROOMNAME', 'MILESTONES', 'REST_NEED', 'EVIDENCE', 'HOT') and section:
            unknown.append((line_at(start), section, txt[:70])); continue
        if txt.startswith('N:'): who, txt = 'nova', txt[2:].strip()
        if not who:
            unknown.append((line_at(start), str(section) + '/' + (call['name'] if call else '-'), txt[:70])); continue
        out.append([who, txt])
        continue
    if c == '/' and prev in '(,=:[!&|?{};+-*%<>~^' + '\n':
        j = i + 1; cls = False
        while True:
            if s[j] == '\\': j += 2; continue
            if s[j] == '[': cls = True
            elif s[j] == ']': cls = False
            elif s[j] == '/' and not cls: break
            j += 1
        i = j + 1
        while i < n and s[i].isalpha(): i += 1
        prev = 'x'; continue
    if c in '([{':
        name, arg = None, ''
        if c == '(':
            m = re.search(r'([\w$]+)\s*$', s[max(0, i - 40):i]); name = m.group(1) if m else None
            m = re.match(r"\s*('[^']*'|\w+)", s[i + 1:i + 60]); arg = m.group(1) if m else ''
        stack.append({'ch': c, 'name': name, 'arg': arg, 'pos': i})
    elif c in ')]}':
        if stack: stack.pop()
    if not c.isspace() or c == '\n': prev = c if c != '\n' else prev
    i += 1

seen, uniq = set(), []
for w, t in out:
    if (w, t) not in seen and t: seen.add((w, t)); uniq.append([w, t])
json.dump(uniq, open(sys.argv[1], 'w', encoding='utf-8') if len(sys.argv) > 1 else sys.stdout, ensure_ascii=False, indent=0)
from collections import Counter
print('\n', Counter(w for w, _ in uniq), len(uniq), file=sys.stderr)
for u in unknown: print('?', *u, file=sys.stderr)
