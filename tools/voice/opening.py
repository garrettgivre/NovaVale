# Nova's opening: the arrival flyover narration and her first thoughts in Suite 2 (js/story.js, the intro)
import json
lines = [
  'The Aquadome. A glass dome on the lake, closed for nine years, reopening on Saturday with a gala.',
  'On Tuesday night the gala\'s crown vanished from a locked case. Since then, something has been singing over the speakers at night.',
  'The owner, Celeste Arden, wants it all solved quietly. So as far as anyone here knows, I\'m her new summer intern.',
  'Suite 2. Clean towels, a view of the lake, and a bed I won\'t be using much.',
  'Time to go and be an intern.',
]
json.dump([['nova', l] for l in lines], open('opening.json', 'w', encoding='utf-8'), ensure_ascii=False)
