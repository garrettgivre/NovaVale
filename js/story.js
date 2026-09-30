// The case: tasks, hotspots, conversations, phone calls, days, endings, the map and postcards.
// Nova's voice: a know-it-all who really does know it all. Bratty, never cruel; she calls people
// out when the evidence lets her.
import { S, has, set, hasItem, giveItem, addDoc, night, checkpoint, secondChance, save, PHASE_NAME } from './state.js';
import { openTalk, closeTalk, say, choose, caption, panel, closePanel, fade, screen, closeScreen, toast, portrait, PEOPLE } from './ui.js';
import { ITEMS, DOCS, icon } from './items.js';
import { aquaOS, switchboard, acrostic, recipe, constellation, drawerDial, starDoor } from './puzzles.js';
import { sfx, ghostVoice, ambience } from './audio.js';
import { whereIs, sync, POSTCARDS } from './world.js';

let E; // engine: { go(node, opts), room(), refresh(), focus(who), unfocus(), resume() }
export function setEngine(e) { E = e; }
const junior = () => S.diff === 'junior';
const SUSPECTS = ['vesper', 'cherry', 'dex', 'juniper', 'opal'];
const metAll = () => SUSPECTS.every(w => has('met_' + w));
const pcCount = () => POSTCARDS.filter(([n]) => has('pc_' + n)).length;

// ---------- Nova thinking out loud ----------
async function think(lines) {
  if (typeof lines === 'string') lines = [lines];
  openTalk(null);
  await say('nova', lines.map(l => (l.startsWith('*') ? l : 'N: ' + l)));
  closeTalk();
}

// ---------- Tasks ----------
const SUITE = 'Your room is Suite 2, up the Grand Staircase in the Guest Wing. Click the bed.';
function taskList() {
  const p = S.phase, T = [];
  const add = (t, d, show = true, hint) => { if (show) T.push({ t, d: !!d, hint }); };
  if (p === 'd1') {
    add('Examine the empty display case in the lobby', has('case_seen'), true,
      ['The display case is in the lobby, between the Kitchen door and the Terrace doors.', 'Start where the crown was last seen.']);
    const n = SUSPECTS.filter(w => has('met_' + w)).length;
    add(`Meet everyone staying at the Aquadome (${n}/5)`, metAll(), true,
      ['Vesper is in the spa, Cherry is by the fountain, Dex is in the tech office, Juniper is in the kitchen and Opal is in the archive.', 'Five people were in the building on Tuesday night.']);
    add('Get a look at the display case\'s access log', has('log_read'), true,
      [has('asked_dex_crown') ? 'The log is in SecureLog on Dex\'s computer. His sticky note and his photo help with the password, and the plaque on the lobby fountain has the year.' : 'Ask Dex about the display case. Keypads keep logs.', 'Keypads remember who pressed them.']);
    add('Find out who dropped the brass star pin', has('opal_pin') || has('pin_known'), hasItem('pin'),
      ['Ask people about the pin, or look at the old photograph in the Guest Wing.', 'Someone will recognise it.']);
    add('Rest in your suite until tonight', false, has('case_seen') && metAll() && has('log_read'), [SUITE, 'You\'ve done enough for one day.']);
  } else if (p === 'n1') {
    add('Find out where the singing is coming from', has('switch_done'), true,
      ['The speakers are controlled from the switchboard in the tech office. Turn zones off one at a time until the singing stops.', 'Somebody controls those speakers.']);
    add('Search the planetarium', has('holo_card'), has('switch_done'),
      ['Look around the star projector in the middle of the planetarium.', 'The singing came from the planetarium.']);
    add('Talk to whoever is up at this hour', has('cherry_night'), has('switch_done'),
      ['Someone is on the planetarium stage.', 'You\'re not the only one awake.']);
    add('Rest in your suite until morning', false, REST_NEED.n1(), [SUITE, 'Get some sleep.']);
  } else if (p === 'd2') {
    add('Get the truth out of Dex', has('dex_confess'), true,
      ['Dex is in the tech office. Ask him about the hologram card from the planetarium.', 'That card belongs to someone.']);
    add('Find out what Vesper is hiding', has('vesper_clear'), true,
      [has('vesper_mail') ? 'Vesper\'s lyric sheet is on the table by the loungers in the spa. She wrote "first letters in gold". Read the first letter of each line.' : 'Vesper\'s lyric sheet is in the spa. Also, Dex\'s Mail program has an email to her.', 'Songs can hide things.']);
    add('Check Juniper\'s alibi', has('juniper_clear'), true,
      ['Ask Juniper if you can help with the cake, then swap each ingredient for a vegan one.', 'Juniper says the oven can vouch for her.']);
    add('Find out what Opal is hiding', has('drawer_open'), true,
      [!has('memo_read') ? 'Read the relaunch memo in the Mail program on Dex\'s computer, then ask Opal about it.'
        : !has('opal_left') ? 'Ask Opal about Celeste\'s relaunch memo.'
          : !hasItem('sketch') ? 'Opal has left the archive. Take the sketch from her drafting table.'
            : !has('const_done') ? '"The stars remember." Use the planetarium\'s projector console with Opal\'s sketch.'
              : 'Try the numbers from the dome on the locked drawer in the archive.', 'Opal loves this building more than anyone.']);
    add('Wait for nightfall in your suite', false, REST_NEED.d2(), [SUITE, 'Tonight you find the Star Room.']);
  } else if (p === 'n2') {
    add('Open the service door behind the planetarium stage', has('hatch_open'), true,
      ['The Service door is to the right of the planetarium stage. You have the key.', 'You have a key for it.']);
    add('Open the door at the end of the tunnel', has('door_open'), has('hatch_open'),
      ['The blueprint says: outer ring ringed planet, middle ring moon, inner ring comet. Tap a ring to turn it.', 'Check the blueprint in your inventory.']);
    add('Confront whoever took the crown', has('finale_done'), has('door_open'),
      ['Talk to the person in the Star Room.', 'Choose your words carefully.']);
  }
  return T;
}
export function tasks() { return taskList(); }
function nextHint() {
  const t = taskList().find(x => !x.d);
  return t ? t.hint[junior() ? 0 : 1] : 'Honestly? I think you\'ve already solved it and you\'re calling so I\'ll tell you how smart you are.';
}

// ---------- Days ----------
const REST_NEED = {
  d1: () => has('case_seen') && metAll() && has('log_read'),
  n1: () => has('switch_done') && has('holo_card') && has('cherry_night'),
  d2: () => has('dex_confess') && has('vesper_clear') && has('juniper_clear') && has('drawer_open'),
};
async function rest() {
  if (S.phase === 'n2') return think('Sleep? Now? The Star Room is right there. Absolutely not.');
  if (!REST_NEED[S.phase]()) {
    const t = taskList().find(x => !x.d);
    return think(['I don\'t leave cases half-solved to take naps.', t ? 'Still to do: ' + t.t.toLowerCase() + '.' : '']);
  }
  const next = { d1: 'n1', n1: 'd2', d2: 'n2' }[S.phase];
  await fade(async () => { S.phase = next; save(); sync(); E.refresh(); onRoom('suite'); }, 700);
  sfx('door');
  if (next === 'n1') await think(['*You fall asleep to the old building ticking as it cools.', '*Hours later, you wake with a start.', 'Someone is singing. Not in the walls. In the speakers.', 'No words, just "ooh" and "aah", slightly flat. If that\'s a ghost, it needs a vocal coach.']);
  if (next === 'd2') {
    await think(['*Grey morning light comes in through the dome.', 'Recap: Cherry has a secret rehearsal, somebody in a long coat has a flashlight, and "D.H." has a hologram card with his initials on it.', 'Today, everybody tells me the truth. Whether they plan to or not.']);
    ring('dot');
  }
  if (next === 'n2') await think(['*The Aquadome goes quiet. Even the fountain is switched off.', 'A key to the service door and a blueprint for a room that isn\'t on any other plan.', 'Opal thinks the stars remember. Let\'s see if they remember me.']);
}

// ---------- The map: fast travel between places you've been ----------
const PLACES = {
  lobby: ['L1', 'Rotunda Lobby'], plan: ['P1', 'Planetarium'], spa: ['S1', 'Spa & Pools'], tech: ['T1', 'Tech Office'], kitchen: ['K1', 'Kitchen'],
  archive: ['A1', 'Archive'], terrace: ['E1', 'Lakeside Terrace'], wing: ['W1', 'Guest Wing'], suite: ['R1', 'Suite 2'], tunnel: ['U1', 'Service Tunnel'], star: ['X1', 'Star Room'],
};
export function openMap() {
  const here = E.room(), V = r => has('v_' + r);
  const spot = (r, x, y, w, h, shape = 'rect') => {
    const cls = `mp ${V(r) ? 'seen' : 'unseen'} ${r === here ? 'here' : ''}`;
    const body = shape === 'circle' ? `<circle cx="${x}" cy="${y}" r="${w}"/>` : `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="4"/>`;
    return `<g class="${cls}" data-r="${r}">${body}<text x="${x}" y="${y + 4}">${V(r) ? PLACES[r][1] : '?'}</text></g>`;
  };
  const b = panel(`<div class="map"><svg viewBox="0 0 360 430">
      <text class="mh" x="180" y="18">GROUND FLOOR</text>
      <g class="mlines"><line x1="180" y1="150" x2="180" y2="62"/><line x1="180" y1="150" x2="286" y2="92"/><line x1="180" y1="150" x2="300" y2="190"/><line x1="180" y1="150" x2="60" y2="190"/><line x1="180" y1="150" x2="74" y2="92"/><line x1="180" y1="150" x2="180" y2="250"/></g>
      ${spot('plan', 180, 58, 108, 34)}${spot('spa', 290, 92, 100, 32)}${spot('tech', 300, 190, 96, 32)}${spot('kitchen', 60, 190, 96, 32)}${spot('archive', 70, 92, 96, 32)}
      ${spot('lobby', 180, 150, 42, 0, 'circle')}${spot('terrace', 180, 258, 150, 34)}
      <text class="mh" x="90" y="312">UPPER FLOOR</text>${spot('wing', 90, 342, 120, 30)}${spot('suite', 90, 386, 80, 28)}
      <text class="mh" x="270" y="312">BELOW</text>${has('hatch_open') ? spot('tunnel', 270, 342, 120, 30) + spot('star', 270, 386, 90, 28) : '<text class="mq" x="270" y="350">nothing known</text>'}
    </svg><p class="small">${junior() ? 'Tap a place you have visited to go straight there.' : 'Tap a visited place to go there.'}</p></div>`, { cls: 'map-p', title: 'The Aquadome' });
  b.querySelectorAll('.mp.seen').forEach(g => g.onclick = () => {
    const r = g.dataset.r; if (r === here) return closePanel();
    if ((r === 'tunnel' || r === 'star') && S.phase !== 'n2') return toast('Not with everyone awake.');
    sfx('click'); closePanel(true); goRoom(PLACES[r][0]);
  });
}

// ---------- Hotspots ----------
const goRoom = (node, look) => E.go(node, { fade: true, look });
function showDoc(id) { addDoc(id); E.refresh(); panel(DOCS[id].html, { cls: 'doc', title: DOCS[id].t }); }

const HOT = {
  // doors and ways through
  door_plan: () => goRoom('P1'), door_spa: () => goRoom('S1'), door_tech: () => goRoom('T1'), door_kitchen: () => goRoom('K1'), door_archive: () => goRoom('A1'),
  door_stairs: () => goRoom('W1'), door_terrace: () => goRoom('E1'), door_suite: () => goRoom('R1'),
  exit_spa: () => goRoom('L3', [0, 0]), exit_tech: () => goRoom('L3', [0, 0]), exit_kitchen: () => goRoom('L2', [0, 0]), exit_archive: () => goRoom('L2', [0, 0]),
  exit_plan: () => goRoom('L4', [0, 0]), exit_wing: () => goRoom('L1', [0, 0]), exit_terrace: () => goRoom('L1', [0, 0]), exit_suite: () => goRoom('W2', [0, -12]),
  exit_tunnel: () => goRoom('P2', [0, 0]), exit_star: () => goRoom('U2', [0, 4]),

  // the lobby
  case: async () => {
    const first = !has('case_seen'); set('case_seen');
    await think(first ? ['The glass lid is sitting a hair crooked. No scratches, no pry marks, lock untouched.', 'So nobody smashed anything. Somebody typed the code. People always think a keypad is a secret. It\'s a diary.', 'And the velvet still has a dent where the crown sat. Hello, crime scene.', !has('pin') ? 'Also: something is glinting on the floor. Nobody else noticed? Really?' : '']
      .filter(Boolean) : 'Opened with a code, not forced. Whoever did this didn\'t have to try very hard.');
  },
  pin: async () => {
    giveItem('pin'); sfx('take'); set('pin'); sync(); E.refresh();
    await think(['A brass star pin. "AQ 03" stamped on the back.', 'Dropped right beside the case. Somebody was in a hurry, and somebody\'s lapel is missing something.']);
  },
  plaque: () => { set('plaque_seen'); showDoc('plaque'); },
  guestbook: () => showDoc('guestbook'),
  desk: () => caption('The reception desk. A beige booking computer, a brass bell and a guest book. The bell is the only thing here that still works properly.'),

  // the tech office
  computer: () => aquaOS(id => { if (id === 'log') toast('New in your notebook: the access log'); if (id === 'memo') toast('New in your notebook: the relaunch memo'); }),
  sticky: () => showDoc('sticky'),
  catphoto: () => showDoc('catphoto'),
  switchboard: () => openSwitchboard(),

  // the spa
  lyrics: () => {
    addDoc('lyrics');
    if (has('acrostic')) return showDoc('lyrics');
    acrostic(() => {
      set('acrostic'); E.refresh();
      setTimeout(() => think(['L-I-P-S-Y-N-C. She hid it in the first letters. Of her own song.', 'That\'s what her manager meant by a "backup track". Vesper Vox is going to mime at her own comeback.', 'Honestly? Iconic. Also: she has some explaining to do.']), 900);
    });
  },

  // the kitchen
  recipeboard: () => showDoc('recipeboard'),
  oven: () => { set('oven_seen'); caption('The oven keeps a log. Last bake: Tuesday, 11:40 PM to 12:30 AM. Ovens don\'t lie. People do.'); },
  cake: () => caption('A test cake for the gala. Lemon and maple. I\'m not saying I\'d steal a slice. I\'m saying nobody would ever prove it.'),

  // the planetarium
  console: () => {
    if (has('const_done')) return caption('7 · 2 · 9, still glowing on the dome. The stars remember. So do I.');
    constellation(async () => {
      set('const_done'); sync();
      await think(['*The projector whirs. Five stars blaze across the dome in a cross, and between them, numbers.', '7... 2... 9.', '"The stars remember where I left them." Opal hid a combination in her own opening-night sky. That\'s either very romantic or very sneaky. Both. It\'s both.']);
    });
  },
  holocard: async () => {
    giveItem('holocard'); set('holo_card'); sfx('take'); sync(); E.refresh();
    await think(['A glowing memory card, tucked under the projector.', '"GHOST OF THE DOME, test v3, D.H." D.H. as in Dex Halloway. Subtle.']);
  },
  hatch: async () => {
    if (has('hatch_open')) return goRoom('U1', [0, -15]);
    if (!hasItem('key')) return think('A service door, locked. "SERVICE, PLANETARIUM." An old-fashioned keyhole. Somebody has the key. Somebody always does.');
    if (S.phase !== 'n2') return think('The key fits. But I\'m not sneaking into tunnels with half the building awake. I\'m bold, not sloppy.');
    set('hatch_open'); sfx('door');
    await think('The old key turns with a groan. Stairs, going down into the dark. Naturally.');
    goRoom('U1', [0, -15]);
  },

  // the tunnel and the Star Room
  stardoor: () => {
    if (has('door_open')) return goRoom('X1');
    checkpoint();
    starDoor(async () => {
      set('door_open'); E.refresh();
      await think(['*The rings clunk into place. Something heavy slides inside the door.', 'It swings open. There\'s candlelight on the other side.']);
      goRoom('X1');
    });
  },
  orrery: () => caption('A brass orrery, still ticking. Somebody winds this. Recently.'),
  crown: () => { if (!has('finale_done')) return think('I could just grab it. But Opal is right there, and I want the whole story.'); },

  // the archive
  sketch: async () => {
    giveItem('sketch'); set('sketch'); sfx('take'); sync(); E.refresh();
    await think(['A pencil sketch: five stars joined in a cross. "Opening night, 2003."', junior() ? 'That\'s a constellation. And I bet I know where it goes.' : 'Stars again. Of course.']);
  },
  drafting: () => caption('Opal\'s drafting table. Everything labelled in tiny, perfect handwriting. I respect it. I also want to read all of it.'),
  opalnote: () => { set('note_read'); showDoc('opalnote'); },
  books: () => { set('clip_read'); showDoc('clipping'); },
  drawer: async () => {
    if (has('drawer_open')) return caption('Empty now. Thank you, stars.');
    const at = whereIs('opal');
    if (at && at[0] === 'archive') return think('A locked flat-file drawer with a number dial. Not while Opal\'s watching. I have manners. Some.');
    drawerDial(async () => {
      set('drawer_open'); giveItem('key'); giveItem('blueprint'); addDoc('blueprint'); sfx('take'); E.refresh();
      await think(['7-2-9. Obviously.', 'An old brass key on a star-shaped tag: "SERVICE, PLANETARIUM."', 'And a blueprint for a round room at the end of a service tunnel. "STAR ROOM." It isn\'t on any other plan in this building.', 'If the crown is anywhere, it\'s down there. Tonight, when everyone\'s asleep.']);
    });
  },
  model: () => caption('A scale model of the Aquadome. Under the planetarium, a thin line runs off the edge of the base, towards nothing. Architects don\'t draw lines to nothing.'),

  // the guest wing
  door_vsuite: () => think(has('vesper_clear')
    ? ['*You knock.*', 'From inside: "Darling. I adore you. Go away."', 'Fair.']
    : ['A card on the handle: "VOCAL REST. DO NOT KNOCK. THIS MEANS YOU."', '*You knock anyway. Nothing.*', 'She\'s in the spa, steaming her secrets. I\'ll find her there.']),
  door_csuite: () => think(S.phase === 'n1'
    ? ['*No answer, and no light under the door.*', 'Cherry\'s not in bed. At this hour. Interesting.']
    : ['A garment bag hangs on the handle: "COSTUME. DO NOT TOUCH. THIS MEANS YOU, VESPER."', 'Interesting that she felt she had to specify.']),
  door_linen: () => caption('The linen closet. Towels folded with military precision. That\'s either Juniper or someone with a lot of feelings about corners.'),
  windowseat: () => think(['The whole lake from up here.', 'And the boathouse on the shore, with a shiny new padlock on a rusty old chain.', 'Nobody puts a new lock on something they don\'t care about. Filing that away.']),
  flowers: () => caption('Fresh lilies. Someone is trying very hard to make this place feel open again.'),
  cart: () => caption('A housekeeping cart. Clean towels, tiny soaps, and a mint I am absolutely taking.'),
  crewphoto: async () => {
    showDoc('crewphoto');
    if (hasItem('pin') && !has('pin_known')) {
      set('pin_known');
      setTimeout(() => think(['Four people on opening day, four brass star pins on four lapels.', 'Exactly like the one in my pocket. And one of these four is still in the building.']), 400);
    }
  },

  // the terrace
  tbench: () => caption('A bench facing the lake. Excellent for brooding. I\'ll come back and brood later.'),
  dockpost: () => caption('A dock post with a rope burn round it. Something was tied here, tightly, and not long ago.'),
  rowboat: () => caption('A rowboat called the Solstice. Oars stowed, rope dry. Nobody\'s rowed this in years.'),
  boathouse: () => think(['Padlocked. The chain\'s rusted solid, but the padlock is brand new.', 'Somebody cares a lot about what\'s in there. Not my case.', '...Yet.']),

  // my suite
  bed: () => rest(),
  cdplayer: () => caption('My CD player. "SKY MIX 2003", burned by Dot. Track four is embarrassing. Track four is perfect.'),
  suitcase: () => caption('Seven outfits for a three-day case. That\'s not overpacking, that\'s preparation.'),
};

export function onHot(id) {
  if (id.startsWith('pc_')) return postcard(+id.slice(3));
  const f = HOT[id];
  if (f) f(); else caption('Nothing useful. Which is also useful to know.');
}

async function postcard(n) {
  set('pc_' + n); sync(); sfx('take'); E.refresh();
  showDoc('pc' + n);
  toast(`Postcard ${pcCount()} of ${POSTCARDS.length}`);
}

// ---------- The switchboard and the ghost ----------
const zones = [true, true, true, true, true, true];
function ghostOn() { return S.phase === 'n1' && !has('switch_done'); }
function openSwitchboard() {
  if (ghostOn()) checkpoint();
  switchboard({
    zones, solved: has('switch_done'),
    onChange: async (z, body) => {
      if (!ghostOn()) return;
      if (!z[4]) {
        ghostVoice(false); set('switch_done'); sfx('solve'); E.refresh();
        body.querySelector('.sw-note').textContent = 'The singing stopped when zone 5 went off.';
        setTimeout(async () => { closePanel(true); await think(['Silence. Thank you.', 'Zone 5. The label\'s worn to "PL_N_T__ _M". Planetarium. Ghosts don\'t need speaker wire.']); }, 900);
      } else toast(z.filter(v => !v).length ? 'The singing carries on.' : 'All zones on.');
    },
    onMain: () => { closePanel(true); badEnding('blackout'); },
  });
}

// ---------- Conversations ----------
const hiLine = {
  vesper: () => has('vesper_clear') ? 'Nova, darling. My secret keeper.' : 'Back again, darling? The steam is doing wonders.',
  cherry: () => S.phase === 'n1' ? 'Still here? Me too. The stage never sleeps.' : 'Nova! My favourite little know-it-all!',
  dex: () => has('dex_confess') ? 'Hey, Nova. Ghost-free zone in here. For real now.' : 'Oh! Hi. Hi again. Is this... about me?',
  juniper: () => has('juniper_clear') ? 'There\'s my sous-chef. Hungry?' : 'Hello, love. Hungry?',
  opal: () => has('opal_pin') ? 'Miss Vale. You\'re very persistent.' : 'Miss Vale.',
};

const INTRO = {
  vesper: ['*A tall woman in a silver gown lounges by the pool, sunglasses on indoors.', 'Oh. A new face. If you\'re press, darling, the exit is behind you.', 'N: Nova Vale. Ms. Arden hired me. And I\'m not press. I ask much better questions.', 'A detective! How deliciously retro. Fine, ask. But keep your voice down. I\'m resting mine.'],
  cherry: ['*A drag queen in hot pink stands by the fountain, beehive first.', 'Well HELLO, new girl! Miss Cherry Pop: host of the Starfall Revue, queen of this entire dome.', 'N: Nova Vale, detective. And for the record, that beehive is at least three inches over the fire code.', '...Oh, she\'s got BITE. I love her already. Finally, a plot twist I didn\'t have to write myself.'],
  dex: ['*A young man in a teal hoodie jumps and nearly knocks over a lava lamp.', 'Oh! Hi! Sorry. You\'re the... detective? Celeste said. I\'m Dex. I do the tech. All of it. Everything with a plug.', 'N: Nova Vale. Relax, Dex. If I thought you did it, you\'d already know.', '...That\'s not as comforting as you think it is.'],
  juniper: ['*A chef in a leaf-green headscarf is whisking something with great calm.', 'Hello, love. Juniper. I run the kitchen. You look like you skipped breakfast.', 'N: Nova Vale. I\'m investigating the crown. And yes, I skipped breakfast, and yes, I\'ll take the lemon bread.', 'Ha! Straight to business. Vegan, like everything I\'m making for this gala. Eat.'],
  opal: ['*An older woman in a long lavender coat is studying blueprints. She takes her time looking up.', 'You must be Celeste\'s detective. Opal Finch. I designed this building, a long time ago.', 'N: Nova Vale. I know. A glass dome on a stone drum, every door facing the fountain, and the planetarium at the north end, where the sky is darkest.', '*For the first time, she really looks at you.', 'You\'ve done your homework. "A sky you can swim under." That\'s what I promised them in 2002.'],
};

const pinQ = { q: 'Do you recognise this pin?', when: () => hasItem('pin') };
const TOPICS = {
  vesper: [
    { id: 'crown', q: 'What do you know about the Prism Crown?', lines: ['It\'s a crown, darling, and I adore a crown. I was going to place it on the winner\'s head myself.', 'Then someone stole my big moment. Rude.', 'N: Where were you on Tuesday night, around midnight? And "beauty sleep" is not an alibi.', 'Asleep in the Spa Suite, with cucumber on my eyes and a humidifier going like a jet engine.', 'N: So your only witnesses are vegetables.', 'The cucumbers were VERY discreet.'] },
    { id: 'ghost', q: 'Have you heard the singing at night?', lines: ['The "ghost"? Honey, if a ghost is singing in this building it had better be singing MY songs.', 'It\'s thin. Wobbly. No breath support.', '*She says it lightly, but her hand drifts to her throat.'] },
    { id: 'song', q: 'What are you performing on Saturday?', lines: ['"Starfall." Brand new. Written for this very dome.', 'The sheet is on the side table, if you must. Don\'t smudge it.', 'N: I never smudge. I annotate.'] },
    { id: 'track', q: 'Nobody needs a "backup track" for a nap, Vesper.', hot: 1, when: () => has('vesper_mail'), lines: ['You read my EMAIL?', 'N: It was on a hotel computer with the password on a sticky note. That\'s not privacy, that\'s a suggestion.', '...Touché, darling. A backup track is a precaution. Every professional has one. Next question.'] },
    { id: 'lipsync', q: '"First letters in gold." L-I-P-S-Y-N-C.', hot: 1, when: () => has('acrostic'), lines: ['*Vesper slowly takes off her sunglasses. Her eyes are red.', '...Two weeks ago my voice cracked in rehearsal. The doctor said no singing for a month.', 'Saturday is my comeback, darling. I couldn\'t cancel. So I\'ll mouth my own song over my own recording.', 'Stealing the crown is the LAST thing I\'d do. This gala is the only thing keeping my career afloat.', 'N: Then prove it. Where were you at 11:52 on Tuesday?', 'On a video call with my vocal coach, half eleven to half twelve, doing silent breathing exercises. Glamorous. She\'ll swear to it.', 'N: For what it\'s worth, hiding it in the song was smart. I only caught it because I\'m smarter.', '*Despite herself, Vesper laughs.', 'Please. Not a word to Cherry.'], after: () => { set('vesper_clear'); toast('Vesper has an alibi'); } },
    { id: 'pin', ...pinQ, lines: ['Brass? On a gown? Never, darling.', 'Although... the people who built this place all wore little pins like that. There\'s an old photograph upstairs.'] },
  ],
  cherry: [
    { id: 'crown', q: 'Tell me about the Prism Crown.', when: () => S.phase !== 'n1', lines: ['Silver band, seven points, a star cut from a real meteorite. It\'s the most gorgeous object in this building, and I include myself.', 'The winner of the Revue wears it. I\'m hosting, so I can\'t win, before you ask.', 'N: I wasn\'t going to ask. You\'d have worn it already.', 'Rude! Correct, but rude.', 'N: Where were you on Tuesday night?', 'In my suite, doing my face for a photo shoot that got cancelled. Alone, fully painted, for nothing. Iconic, honestly.'] },
    { id: 'people', q: 'What do you think of the others?', when: () => S.phase !== 'n1', lines: ['Vesper\'s a legend, but she hasn\'t sung one note in rehearsal. Weird, right?', 'Dex is sweet, nervous, and basically lives in that tech office.', 'Juniper feeds us all like a fairy godmother. And Opal designed this whole place. She walks around touching the walls like they\'re her babies.'] },
    { id: 'ghost', q: 'Have you heard the ghost?', when: () => S.phase !== 'n1', lines: ['Heard it? Babe, I\'ve HARMONISED with it.', 'It comes on late at night. Last week it sang for an hour. My wig stood up by itself.', 'N: It\'s flat on the high notes. Ghosts should have better pitch. They have nothing but time.'] },
    { id: 'seen', q: 'Have you seen anything strange up here?', hot: 1, when: () => S.phase === 'n1', lines: ['Tuesday night, around midnight, I snuck in here to practise. Someone was already here with a flashlight.', 'They went behind the stage, towards that old Service door. I thought it was the ghost, so I RAN.', 'N: You ran from a flashlight.', 'I ran from the CONCEPT of a flashlight. There\'s a difference.', 'N: Did you see who was holding it?', 'Just the light. And a coat, I think. Long. Not a look I\'d serve.'], after: () => set('cherry_light') },
    { id: 'singing', q: 'Did you hear the singing tonight?', when: () => S.phase === 'n1', lines: ['It was coming out of the ceiling speakers in here. Loudest in here, for sure.', 'Then it just stopped. Was that you? You\'re my hero.', 'N: I know.'] },
    { id: 'number', q: 'About your surprise number...', when: () => S.phase === 'd2' && has('cherry_night'), lines: ['Shh! Not a word to Vesper. It\'s a tribute to her. She\'s been so stressed lately.', 'N: Your secret\'s safe. I only expose people who deserve it.', 'But that flashlight still gives me chills.'] },
    { id: 'pin', ...pinQ, lines: ['That\'s an original Aquadome staff pin! The build crew got them on opening night in 2003.', 'They\'re super rare. I\'ve only seen one person wear one around here...', 'Opal. On her coat.'], after: () => set('pin_known') },
  ],
  dex: [
    { id: 'crown', q: 'What happened with the display case?', lines: ['It has a keypad. Codes only, no keys. I set all the staff codes myself.', 'It wasn\'t forced, so whoever opened it had a code. Which looks bad for me. I know. I KNOW.', 'N: Can I see the access log?', 'It\'s in SecureLog on my computer. I\'d open it for you, but I\'m really, really busy with the gala lights.', 'N: That was a yes. I\'ll let myself in.', 'That was NOT a... okay. Just don\'t touch anything else.'], after: () => set('asked_dex_crown') },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', when: () => !has('dex_confess') && !has('dex_partial'), lines: ['Asleep! In my room! By like... eleven? Ish?', '*He doesn\'t quite meet your eyes.*', 'N: "Ish." Noted.'] },
    { id: 'callout', q: '"Asleep by eleven"? Your own email says ghost test, Tuesday, 11pm.', hot: 1, when: () => has('holo_mail') && !has('dex_confess') && !has('dex_partial'), lines: ['You read my... okay, that\'s a privacy thing, we should talk about—', 'N: We can talk about privacy right after we talk about lying to a detective.', 'Fine! FINE. I was in the planetarium until about 11:40. Testing a thing. A secret thing. I can\'t say what.', 'N: You\'ll tell me. They always do.'], after: () => set('dex_partial') },
    { id: 'ghost', q: 'What do you make of the ghost?', when: () => !has('dex_confess'), lines: ['Ghosts aren\'t real. It\'s probably a feedback loop in the old speakers. Technically.', '*He laughs a little too loudly.*', 'N: Technically, you\'re sweating.'] },
    { id: 'maint', q: 'Who is MAINT-0?', when: () => has('log_read'), lines: ['MAINT-0 is an old master code from when the dome was built. I thought I deleted it when I rebuilt the system!', 'N: You thought. That\'s the problem with thinking. You have to actually check.', 'Somebody who knew it opened the case at 11:52. That wasn\'t me. I promise.'] },
    { id: 'holo', q: 'I found your hologram card in the planetarium.', hot: 1, when: () => hasItem('holocard') && S.phase === 'd2', lines: ['...Oh no.', 'Okay. OKAY. Yes. The ghost is me. It\'s a hologram show for the gala: the singing ghost of the dome. Spooky, fun, very 2003.', 'I was testing it Tuesday and it glitched. Now it switches itself on every night. I didn\'t want Celeste to know until it worked.', 'N: So you were in the planetarium until 11:40. Told you you\'d tell me.', 'The projector log stops at 11:41, you can check. Then I went to bed. For real this time.', 'N: And MAINT-0?', 'Only the 2003 build team ever knew that code. Four of them. Three moved away years ago.', 'The fourth is Opal.'], after: () => { set('dex_confess'); toast('Dex has an alibi'); } },
    { id: 'pin', ...pinQ, lines: ['Staff pin, 2003 vintage! Collector\'s item.', 'Opal wears one on her coat. Or... she did? I don\'t think I\'ve seen it this week.'], after: () => set('pin_known') },
  ],
  juniper: [
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['Here, nearly all night. The gala cake failed and I had to start again.', 'N: "Nearly all night" is doing a lot of work in that sentence.', 'The oven can vouch for me, if you know how to read it.', '*She seems to be testing you.*'] },
    { id: 'oven', q: 'Your oven says the cake went in at 11:40. Not "all night".', hot: 1, when: () => has('oven_seen') && !has('juniper_clear'), lines: ['*Juniper laughs, properly.*', 'Sharp. I like sharp.', 'The first cake failed. The second went in at 11:40. If you want the rest of the story, earn it. Help me with the cake.'] },
    { id: 'cake', q: 'Can I help with the cake?', hot: 1, when: () => !has('juniper_clear'), lines: ['Ha! All right. Here\'s my Nana\'s recipe. It isn\'t vegan. Tell me what you\'d swap, and we\'ll see if you\'re as clever as you think you are.', 'N: I\'m exactly as clever as I think I am. That\'s the whole point of me.'], puzzle: 'recipe' },
    { id: 'window', q: 'You were baking all night. Did you see anything?', when: () => has('juniper_clear'), lines: ['Just before midnight, a flashlight crossed the lobby towards the planetarium. Someone in a long coat.', 'Only one person here wears a long coat indoors in June.'] },
    { id: 'people', q: 'What do you think of the others?', lines: ['Vesper doesn\'t eat. Worrying. Cherry eats everything, bless her. Dex eats crisps in the dark.', 'And Opal brings her own tea and talks to the walls. She loves this place more than any of us.'] },
    { id: 'pin', ...pinQ, lines: ['Opal wears one exactly like that. Or she did.', 'It was missing on Wednesday morning. She looked like she\'d lost a tooth.'], after: () => set('pin_known') },
  ],
  opal: [
    { id: 'crown', q: 'What do you know about the Prism Crown?', lines: ['Celeste had it made for the relaunch. Silver and a meteorite. Very... marketable.', 'Crowns come and go, Miss Vale. Buildings stay. Or they should.'] },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['Here, with my plans. Then to bed. I\'m sixty-three; I don\'t do midnights.', 'N: Funny. Midnight seems to do you.'] },
    { id: 'history', q: 'Tell me about the Aquadome.', lines: ['It opened on the summer solstice in 2003. The planetarium was its heart. People floated in the spa, then lay back under my stars.', 'It closed nine years ago. I used to let myself into the empty dome and switch the projector on for no one.'] },
    { id: 'pin', ...pinQ, lines: ['*Her hand flies to her lapel.*', '...Where did you find that?', 'N: Under the display case. And pins don\'t fall off lapels, Ms. Finch. You have to take them off, or catch them on something in a hurry.', 'I must have dropped it some time. I cross that lobby every day.', '*She takes a moment too long to say it.*'], after: () => set('opal_pin') },
    { id: 'coat', q: 'Two people saw a long coat with a flashlight at midnight.', hot: 1, when: () => has('cherry_light') && has('juniper_clear'), lines: ['N: You own the only long coat in the building. I checked.', 'Then I suppose I\'m the only one here who feels the cold.', '*She holds your gaze without blinking.*', 'N: That\'s not a no.'] },
    { id: 'note', q: '"The stars remember where I left them"?', when: () => has('note_read'), lines: ['It means what it says. Some things are written in the sky, if you know how to look.', 'N: Then it\'s a good thing I always know how to look.'] },
    { id: 'maint', q: 'Did you know the MAINT-0 code?', when: () => has('dex_confess'), lines: ['Everyone on the build team knew it. That was twenty-three years ago.', 'N: You didn\'t say no.', '*She doesn\'t.*'] },
    { id: 'relaunch', q: 'I read Celeste\'s memo about the planetarium.', hot: 1, when: () => has('memo_read'), lines: () => S.phase === 'd2'
      ? ['*Opal goes very still.*', 'A VIP lounge. They are going to put a bar where my stars are.', 'N: I thought you\'d want to know I know.', 'You\'ll excuse me, Miss Vale. I need some air.', '*She walks out of the archive without closing the door.*']
      : ['*Opal turns back to her blueprints.*', 'Please. Not today.'],
    after: () => { if (S.phase === 'd2') set('opal_left'); } },
  ],
};

async function doTopic(who, t) {
  const lines = typeof t.lines === 'function' ? t.lines() : t.lines;
  await say(who, lines);
  S.asked[who + ':' + t.id] = true;
  if (t.puzzle === 'recipe') {
    await new Promise(res => recipe(async () => {
      await say(who, ['*She tastes the batter and closes her eyes.*', 'Oh, that\'s lovely. You\'d be welcome in my kitchen.', 'That\'s exactly what I did on Tuesday. The first cake went in with the wrong milk; I only noticed at eleven, so I remade it.', 'It went in at 11:40 and came out at 12:30. I stood at the window the whole time.', 'N: And what did you see from the window? Because you saw something. You\'ve been dying to tell somebody.', 'Ha! Yes. Just before midnight, a flashlight went across the lobby towards the planetarium. Someone in a long coat.', 'Only one person here wears a long coat indoors in June.']);
      set('juniper_clear'); toast('Juniper has an alibi');
      res();
    }));
  }
  if (t.after) t.after();
  save();
}

export async function onTalk(who) {
  if (who === 'opal' && S.phase === 'n2') return finale();
  E.focus(who);
  openTalk(who);
  const firstNight = who === 'cherry' && S.phase === 'n1' && !has('cherry_night');
  if (!has('met_' + who)) { set('met_' + who); await say(who, INTRO[who]); }
  else if (!firstNight) await say(who, [hiLine[who]()]);
  if (firstNight) {
    await say(who, ['*Cherry is on the stage in a sparkly robe, mid-twirl. She shrieks.*', 'NOVA! You scared the lashes off me!', 'N: It\'s one in the morning, Cherry. What are you doing on a stage in the dark?', '...Rehearsing. A surprise number for Vesper at the gala. Nobody knows. Keep it quiet, okay?', 'N: Fine. But you owe me.']);
    set('cherry_night');
  }
  E.refresh();
  while (true) {
    const list = TOPICS[who].filter(t => !t.when || t.when());
    const opts = list.map(t => ({ text: t.q, dim: S.asked[who + ':' + t.id], hot: t.hot && !S.asked[who + ':' + t.id] }));
    opts.push({ text: 'Goodbye', bye: true });
    const i = await choose(opts);
    if (i === list.length) break;
    await doTopic(who, list[i]);
    E.refresh();
    if (who === 'opal' && has('opal_left')) { sync(); break; }
  }
  closeTalk(); E.unfocus(); E.refresh();
}

// ---------- The finale ----------
async function finale() {
  checkpoint();
  E.focus('opal');
  openTalk('opal');
  await say('opal', ['*Opal sits beside the crown under a small painted sky, as if she\'s been waiting.*', 'I wondered who would find this room first. I hoped it would be someone who deserved to.', 'We built it for ourselves, the four of us. A secret Star Room at the end of the tunnel. We toasted opening night right here.']);
  let i = await choose([{ text: 'You took the crown to stop the relaunch.' }, { text: 'I\'m calling the police. Right now.' }, { text: 'Nice room. Now tell me why the crown is in it.' }]);
  if (i === 1) { closeTalk(); E.unfocus(); return badEnding('locked'); }
  await say('opal', ['...Yes.', 'I opened the case with the old code at 11:52 and carried the crown down here in my coat pocket. I lost my pin on the way. Sloppy.', 'N: Very sloppy. I found it in about four seconds.', 'If there\'s no crown, there\'s no gala. If there\'s no gala, maybe Celeste reconsiders. Maybe my stars stay.', 'It was a foolish plan. But it was the only one I had.']);
  i = await choose([{ text: 'You\'ll never work on another building again.' }, { text: 'It was a terrible plan. Let me give you a better one.' }]);
  if (i === 0) { closeTalk(); E.unfocus(); return badEnding('locked'); }
  await say('opal', ['N: The planetarium matters. You don\'t save it by hiding a crown in a basement. You save it by showing Celeste what it can do. With me in the room, so she actually listens.', '*Opal is quiet for a long moment. Then she laughs, softly.*', 'You\'re insufferable, Miss Vale. You sound exactly like me, twenty-three years ago.', 'All right. Take it back up. Tell Celeste everything. I won\'t make you drag me.']);
  set('finale_done'); set('crown_back'); sync(); sfx('solve');
  closeTalk(); E.unfocus();
  await think(['*You lift the Prism Crown off its cushion. The meteorite star glints violet in the candlelight.*', 'Case closed. As predicted. By me.']);
  await call('celeste', ['Nova? It\'s nearly one in the morning, is everything...', 'N: I found the crown. You\'re welcome. And you\'re going to hear Opal out about the planetarium, because you\'re about to make a very expensive mistake.', '*Celeste listens for a long time.*', '...A VIP lounge can go anywhere. The old laundry is bigger anyway.', 'Tell Opal her stars stay. And tell her she\'s running the planetarium show at the gala.']);
  ending();
}

// ---------- Endings ----------
const BAD = {
  blackout: ['Lights Out', 'You flip the big red MAIN switch. Every light in the Aquadome dies at once, and the pumps shudder to a stop.', 'In the dark, footsteps hurry past the tech office. Somewhere below, a heavy door closes.', 'By the time the power is back, whoever it was is long gone, and Celeste has called off the gala. For once, you have nothing clever to say.'],
  locked: ['Locked In', 'Opal\'s face closes like a door. "Then I\'m sorry, Miss Vale."', 'She slips past you and swings the vault door shut. The rings spin. The lock clunks.', 'It\'s morning before Dex finds you. By then, Opal and the Prism Crown are long gone. Being right about everything turns out not to help much from inside a vault.'],
};
export function badEnding(k) {
  ghostVoice(false); sfx('bad');
  const [t, ...p] = BAD[k];
  const s = screen(`<div class="end bad"><h1>${t}</h1>${p.map(x => `<p>${x}</p>`).join('')}<div class="row"><button class="btn big" id="sc">Second Chance</button><button class="btn ghost" id="tt">Title screen</button></div></div>`, 'dark');
  s.querySelector('#sc').onclick = () => { closeScreen(); if (secondChance()) E.resume(); };
  s.querySelector('#tt').onclick = () => location.reload();
}

function ending() {
  S.phase = 'end'; save(); ambience('day');
  const mins = Math.max(1, Math.round((Date.now() - S.t0) / 60000)), pc = pcCount();
  const s = screen(`<div class="end good"><div class="paper letter">
    <p class="lh">THE AQUADOME · Lakeshore Spa &amp; Planetarium</p>
    <p>Dear Nova,</p>
    <p>The gala was the most beautiful night this building has seen in nine years, and it happened because of you (as you reminded me, twice).</p>
    <p>Opal ran the planetarium show herself. When five stars lit up in a cross over the stage, half the room cried. The other half was Cherry.</p>
    <p>Vesper "sang" "Starfall" perfectly, and then Cherry performed a surprise tribute that made Vesper cry so hard she had to take off her sunglasses. Dex's singing ghost finally hit the high notes. Juniper's cake was gone in eleven minutes.</p>
    <p>The planetarium stays. The Prism Crown is back where it belongs, and so, I think, is the Aquadome.</p>
    <p>With endless thanks,</p><p class="sig">Celeste Arden</p>
    <p class="ps">P.S. Opal asked me to send you something: a little brass star pin. She says you've earned it, and that you are "insufferable, in the best way".</p>
    ${pc ? `<p class="ps">P.P.S. The front desk says you "borrowed" ${pc} of our old postcards. Keep them.</p>` : ''}</div>
    <h1>Case Closed</h1><p class="sub">A Nova Vale Mystery · ${S.diff === 'senior' ? 'Senior' : 'Junior'} Detective · ${mins} min · Postcards ${pc}/${POSTCARDS.length}</p>
    <button class="btn big" id="again">Play again</button></div>`, 'sky');
  s.querySelector('#again').onclick = () => { localStorage.removeItem('novavale.aquadome.v1'); location.reload(); };
}

// ---------- Phone ----------
const CONTACTS = ['dot', 'remy', 'celeste'];
const CALLS = {
  dot: () => [{ id: 'hint', q: 'I\'m stuck. Any ideas?', lines: () => ['Nova! How\'s the haunted spa? Very Grey Gardens?', 'N: Faded marble, dust on the chandelier, five suspects and a ghost that can\'t hold a note. I\'m thriving. Mostly.', 'Okay, read me your list. Mm-hm. Mm-hm.', nextHint(), 'Go get \'em. And stop correcting people\'s grammar, you\'re there to catch a thief.'] }],
  remy: () => [
    { id: 'history', q: 'What can you find on the Aquadome?', lines: ['Opened June 21, 2003, designed by an architect called Opal Finch. Famous for its planetarium: "a sky you can swim under."', 'It closed nine years ago after money trouble. Celeste Arden bought it last year.', 'N: I knew all of that. But thank you for confirming I\'m right.', 'You\'re welcome, I guess?'] },
    { id: 'maint', q: 'What\'s a "MAINT-0" code?', when: () => has('log_read'), lines: ['Old building systems often had a maintenance master code for the people who installed them.', 'The 2003 press kit says the build team was four people, led by the designer, Opal Finch.'] },
    { id: 'vesper', q: 'Anything on Vesper Vox?', when: () => has('met_vesper'), lines: ['Her last album was huge. But she cancelled two shows last month. Her team said "vocal rest".'] },
    { id: 'opal', q: 'Anything on Opal Finch?', when: () => has('met_opal'), lines: ['She fought hard against the Aquadome closing. I found an old magazine interview.', 'Quote: "I built a secret into that dome that only the stars know about."', 'Spooky, right?', 'N: Not spooky. Specific.'] },
    { id: 'boathouse', q: 'Why would a boathouse have a brand new padlock?', when: () => has('v_terrace'), lines: ['Uh, because somebody doesn\'t want anyone in the boathouse?', 'N: Brilliant, Remy. Truly. Look up who owned the Aquadome\'s boats before it closed.', 'On it. That might take a while.', 'N: That\'s fine. It\'s not this case.'] },
  ],
  celeste: () => [{ id: 'update', q: 'Just checking in.', lines: () => S.phase === 'd1' ? ['Nova. Any progress? The gala is on Saturday and I haven\'t slept.', 'N: Progress is my whole personality. Give me a day.'] : S.phase === 'n1' ? ['You\'re up too? That singing again. I\'m starting to believe in ghosts.', 'N: Don\'t. It\'s a speaker. I\'ll prove it.'] : S.phase === 'd2' ? ['Day two. The press arrives tomorrow. Please tell me you\'re close.', 'N: I\'m close. I\'m always close. Today I\'m closer.'] : ['Be careful down there, Nova.'] }],
};

async function call(who, lines) { openTalk(who, { pt: true }); await say(who, lines); closeTalk(); }
function ring() { const b = document.querySelector('#btnPhone'); b.classList.add('ring'); sfx('ring'); setTimeout(() => b.classList.remove('ring'), 4000); }

export function openPhone() {
  const body = panel(`<div class="phone"><div class="ph-ear"></div><div class="ph-scr"><div class="ph-top"><span>Yl</span><b>${PHASE_NAME[S.phase] || ''}</b><span>[===]</span></div>
    <div class="ph-h">CONTACTS</div><div id="phs"></div></div><div class="ph-brand">CELLTONE</div>
    <div class="ph-keys">${'123456789*0#'.split('').map(k => `<i>${k}</i>`).join('')}</div></div>`, { cls: 'phone-p', title: '' });
  const scr = body.querySelector('#phs');
  scr.innerHTML = CONTACTS.map(c => `<button class="ph-c" data-c="${c}"><b>${PEOPLE[c].n.toUpperCase()}</b><small>${{ dot: 'best friend', remy: 'cousin', celeste: 'client' }[c]}</small></button>`).join('');
  scr.querySelectorAll('.ph-c').forEach(b => b.onclick = async () => {
    const who = b.dataset.c; closePanel(true);
    const list = CALLS[who]().filter(t => !t.when || t.when());
    if (list.length === 1) { await call(who, typeof list[0].lines === 'function' ? list[0].lines() : list[0].lines); return; }
    openTalk(who, { pt: true });
    await say(who, ['Hey, cuz. What do you need?']);
    while (true) {
      const i = await choose([...list.map(t => ({ text: t.q, dim: S.calls[who + ':' + t.id] })), { text: 'Hang up', bye: true }]);
      if (i === list.length) break;
      await say(who, list[i].lines);
      S.calls[who + ':' + list[i].id] = true; save();
    }
    closeTalk();
  });
}

// ---------- Notebook ----------
const NOTES = {
  vesper: () => [has('met_vesper') && 'Pop diva headlining the gala. Says she was asleep on Tuesday night. Her witnesses are cucumbers.', has('vesper_mail') && 'Her manager wrote: "the backup track is loaded... no one will know."', has('vesper_clear') && 'CLEARED: she\'s lip-syncing the gala (voice rest). On a video call with her coach at 11:52.'],
  cherry: () => [has('met_cherry') && 'Drag queen hosting the Starfall Revue. Says she was alone in her suite on Tuesday night.', has('cherry_night') && 'Secretly rehearsing a tribute number for Vesper on the planetarium stage at night.', has('cherry_light') && 'Saw a flashlight and a long coat go behind the stage around midnight on Tuesday.', has('cherry_night') && 'Not our thief. Too loud to be sneaky.'],
  dex: () => [has('met_dex') && 'Tech manager. Set the display case codes himself. Nervous about Tuesday night.', has('holo_mail') && 'Emailed himself about a "ghost test" in the planetarium on Tuesday at 11pm.', has('dex_partial') && 'Admitted he was in the planetarium until 11:40, "testing a thing".', has('dex_confess') && 'CLEARED: the ghost is his hologram show. Left at 11:41. Says only the 2003 build team knew MAINT-0, and the only one still here is Opal.'],
  juniper: () => [has('met_juniper') && 'Chef. Says she was baking "nearly all night" on Tuesday.', has('oven_seen') && 'Oven log: baking from 11:40 PM to 12:30 AM.', has('juniper_clear') && 'CLEARED: remade the cake vegan at 11:40. Saw a flashlight and a long coat cross the lobby just before midnight.'],
  opal: () => [has('met_opal') && 'Designed the Aquadome in 2002. Wears a long lavender coat.', has('opal_pin') && 'Got flustered when I showed her the brass pin.', has('pin_known') && 'The brass pins went to the 2003 build crew. Opal\'s is missing.', has('memo_read') && 'Celeste plans to turn Opal\'s planetarium into a VIP lounge after the gala.', has('dex_confess') && 'Knew the MAINT-0 code.', has('drawer_open') && 'Kept a key and a secret blueprint: the Star Room at the end of the service tunnel.'],
};

export function openNotebook(tab = 'tasks') {
  const TABS = [['tasks', 'Tasks'], ['sus', 'Suspects'], ['docs', 'Documents'], ['items', 'Items'], ['pc', `Postcards ${pcCount()}/${POSTCARDS.length}`]];
  const body = panel(`<div class="nb"><div class="nb-tabs">${TABS.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div class="nb-page"></div></div>`, { cls: 'nb-p', title: 'Nova\'s Case Notebook' });
  const page = body.querySelector('.nb-page');
  const show = k => {
    body.querySelectorAll('.nb-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === k));
    if (k === 'tasks') {
      page.innerHTML = `<h3>${PHASE_NAME[S.phase]}</h3><ul class="tasks">${taskList().map(t => `<li class="${t.d ? 'done' : ''}">${t.t}</li>`).join('')}</ul>${junior() ? '<p class="hint">Stuck? Call Dot on your phone.</p>' : ''}`;
    } else if (k === 'sus') {
      page.innerHTML = SUSPECTS.filter(w => has('met_' + w)).map(w => `<div class="sus">${portrait(w)}<div><b>${PEOPLE[w].n}</b><ul>${NOTES[w]().filter(Boolean).map(n => `<li>${n}</li>`).join('')}</ul></div></div>`).join('') || '<p class="empty">You haven\'t met anyone yet.</p>';
    } else if (k === 'docs') {
      const list = ['letter', ...S.docs.filter(d => d !== 'letter' && !/^pc\d/.test(d))];
      page.innerHTML = list.map(d => `<button class="nb-doc" data-d="${d}">${DOCS[d].t}</button>`).join('');
      page.querySelectorAll('.nb-doc').forEach(b => b.onclick = () => { const d = DOCS[b.dataset.d]; panel(d.html + '<button class="btn" id="nbback">Back to notebook</button>', { cls: 'doc', title: d.t }).querySelector('#nbback').onclick = () => openNotebook('docs'); });
    } else if (k === 'pc') {
      page.innerHTML = `<p class="hint">Old postcards from 2003 are hidden around the Aquadome. They're optional, but they know things.</p>` + POSTCARDS.map(([n]) => has('pc_' + n) ? `<button class="nb-doc" data-d="pc${n}">${DOCS['pc' + n].t}</button>` : `<p class="empty">Postcard ${n}: not found yet</p>`).join('');
      page.querySelectorAll('.nb-doc').forEach(b => b.onclick = () => { const d = DOCS[b.dataset.d]; panel(d.html + '<button class="btn" id="nbback">Back to notebook</button>', { cls: 'doc', title: d.t }).querySelector('#nbback').onclick = () => openNotebook('pc'); });
    } else {
      page.innerHTML = S.inv.map(i => `<div class="nb-item">${icon(i)}<div><b>${ITEMS[i].n}</b><p>${ITEMS[i].d}</p></div></div>`).join('') || '<p class="empty">Nothing yet.</p>';
    }
  };
  body.querySelectorAll('.nb-tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
  show(tab);
}

export function examineItem(id) {
  if (id === 'blueprint') return showDoc('blueprint');
  panel(`<div class="nb-item big">${icon(id)}<div><b>${ITEMS[id].n}</b><p>${ITEMS[id].d}</p></div></div>`, { cls: 'doc', title: ITEMS[id].n });
}

// ---------- Entering a room: remember it for the map, set the sound ----------
const FIRST_VISIT = {
  wing: ['The Guest Wing. Runner carpet, dim sconces, and every door shut.', 'Hotels always feel like they\'re keeping secrets. This one\'s probably keeping five.'],
  terrace: ['Fresh air. The lake, the dock, a boathouse, and the whole dome glowing behind me like a snow globe somebody forgot to shake.'],
  tunnel: ['Concrete, pipes, and one flickering bulb every ten feet. Opal, you absolute dramatist.'],
};
export function onRoom(room) {
  const first = !has('v_' + room);
  set('v_' + room);
  ambience(room === 'tunnel' || room === 'star' ? 'tunnel' : night() ? 'night' : 'day');
  if (ghostOn()) ghostVoice(true, room === 'plan' ? 1 : 0.5, room === 'plan');
  else ghostVoice(false);
  if (first && FIRST_VISIT[room]) setTimeout(() => think(FIRST_VISIT[room]), 700);
}

// ---------- Start ----------
export async function intro() {
  addDoc('letter');
  panel(DOCS.letter.html + '<button class="btn big" id="lgo">Take the case</button>', { cls: 'doc', title: 'A letter arrives...', noClose: true })
    .querySelector('#lgo').onclick = async () => {
      closePanel(true); sfx('door');
      await think(['So this is the Aquadome. Nine years closed, and it still smells like chlorine and old money.', 'Marble floors, brass everywhere, and dust on the chandelier. Whoever cleaned for the relaunch skipped everything you have to look up to see. People always do.', 'The display case should be here in the lobby. Crime scenes don\'t investigate themselves.']);
    };
}
