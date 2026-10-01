// The case: tasks, hotspots, conversations, phone calls, days, endings, the map and postcards.
// Nova's voice: a know-it-all who really does know it all. Bratty, never cruel; she calls people
// out when the evidence lets her.
import { S, has, set, hasItem, giveItem, addDoc, night, checkpoint, secondChance, save, PHASE_NAME } from './state.js';
import { openTalk, closeTalk, say, choose, caption, panel, closePanel, fade, screen, closeScreen, toast, portrait, PEOPLE } from './ui.js';
import { ITEMS, DOCS, icon } from './items.js';
import { aquaOS, switchboard, acrostic, recipe, constellation, drawerDial, starDoor, contradiction, musicBox } from './puzzles.js';
import { sfx, ghostVoice, ambience } from './audio.js';
import { whereIs, sync, POSTCARDS } from './world.js';

let E; // engine: { go(node, opts), room(), refresh(), focus(who), unfocus(), resume() }
export function setEngine(e) { E = e; }
const junior = () => S.diff === 'junior';
const SUSPECTS = ['vesper', 'cherry', 'dex', 'juniper', 'opal'];
const OTHERS = ['regent', 'harper', 'kenji', 'priya', 'jojo', 'rashad', 'gus', 'silas', 'nate'];
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
    const m2 = OTHERS.filter(w => has('met_' + w)).length;
    add(`Optional: get to know the other guests (${m2}/${OTHERS.length})`, m2 === OTHERS.length, true, ['Kenji and Harper are in the lobby, Jojo in the kitchen, Priya and Velvet Regent in the planetarium, Rashad in the Guest Wing, and Gus, Silas and Ranger Begay out on the terrace.', 'The staff and the other guests see a lot.']);
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
  } else if (p === 'g') {
    add('Find out what\'s wrong with the star', has('star_fake'), true,
      [hasItem('magnet') ? 'Hold the magnet to the crown in the lobby display case.' : 'A real iron meteorite sticks to a magnet. Dex\'s office is full of old speaker parts: ask him.', 'Real meteorites have iron in them.']);
    add('Find out when the star was last real', has('appraisal_read'), has('star_fake'),
      ['The insurance papers are at the reception desk in the lobby.', 'Somebody insured that crown. Insurers check things.']);
    add('Find the lie', has('kenji_caught'), has('appraisal_read'),
      [!has('repair_seen') ? 'Kenji logs every minute of his day. Ask him to see Monday\'s page, then compare it with the case\'s access log on Dex\'s computer.' : 'Talk to Kenji. His Monday log and the keypad log can\'t both be right.', 'Who had the case open after the appraisal?']);
    add('Open Stella', has('stella_open'), has('kenji_caught'),
      [!S.docs.includes('waltzcard') ? 'Stella\'s song card is in Kenji\'s workbench drawer, right next to her.' : 'Set one pin per beat on Stella\'s cylinder. The card is in do-re-mi, the cylinder in letters: Do = C, Re = D, Mi = E, Fa = F, Sol = G.', 'Kenji keeps everything precious close by.']);
    add('Have it out with Kenji', has('g_done'), has('stella_open'),
      ['Kenji is by his workbench in the lobby.', 'He\'s waiting for you.']);
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
  const t = taskList().find(x => !x.d && !x.t.startsWith('Optional'));
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
  if (S.phase === 'g') return think('The gala is tonight, and the most expensive thing in it is fake. Naps are for people without a twist to solve.');
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
    if (S.phase === 'g') {
      if (has('star_fake')) return caption(has('stella_open') ? 'Kenji\'s replica, back on its velvet. It really is a beautiful fake.' : 'A perfect star. Perfectly fake.');
      if (!hasItem('magnet')) return think(['The Prism Crown, back where it belongs. Celeste polished the glass twice.', 'Every crystal is in place. Every glint is right. So why did it weigh nothing?', 'Real meteorites have iron in them. If I had a decent magnet, I could settle this in a second.']);
      set('star_fake'); sfx('switch'); E.refresh();
      return think(['*You hold Dex\'s magnet against the glass, right over the star. Then against the band. Then over the star again.*', 'The band: a tiny tug. Silver plate on brass, fine.', 'The star: nothing. Not a twitch.', 'Iron-nickel meteorites stick to magnets. This one doesn\'t. Which means it isn\'t one.', 'Somebody swapped the star. And not Opal: the lid had to be open for a lot longer than six minutes to unset a stone.']);
    }
    const first = !has('case_seen'); set('case_seen');
    await think(first ? ['The glass lid is sitting a hair crooked. No scratches, no pry marks, lock untouched.', 'So nobody smashed anything. Somebody typed the code. And keypads remember every code typed into them.', 'The velvet still has a dent where the crown sat. Whoever took it lifted it out carefully.', !has('pin') ? 'Also: something is glinting on the floor. Nobody else noticed? Really?' : '']
      .filter(Boolean) : 'Opened with a code, not forced. Whoever did this didn\'t have to try very hard.');
  },
  pin: async () => {
    giveItem('pin'); sfx('take'); set('pin'); sync(); E.refresh();
    await think(['A brass star pin. "AQ 03" stamped on the back.', 'Dropped right beside the case. Somebody was in a hurry, and somebody\'s lapel is missing something.']);
  },
  plaque: () => { set('plaque_seen'); showDoc('plaque'); },
  guestbook: () => showDoc('guestbook'),
  desk: () => S.phase === 'g' && has('star_fake') ? (set('appraisal_read'), E.refresh(), showDoc('appraisal'), setTimeout(() => think(['Real at 13:40 on Monday. Appraised by Kenji Morimoto.', 'Fake by Saturday morning. So who touched it in between?', 'Everyone who opened that case is in the keypad log. Everyone.']), 400)) : caption('The reception desk. A beige booking computer, a brass bell and a guest book. The bell is the only thing here that still works properly.'),

  // Kenji's corner of the lobby
  stella: () => {
    if (has('stella_open')) return caption('Stella, chest open, humming to herself. She has been very brave about all this.');
    if (!has('kenji_caught')) return think(['Stella: a 1925 singing automaton in a pink velvet dress, with a pinned brass cylinder in her base.', S.phase === 'g' ? 'Kenji hasn\'t looked away from her all morning.' : 'Kenji says she sings in three-four time. I believe him. I believe everything a man that precise tells me. Mostly.']);
    musicBox(async () => {
      set('stella_open'); giveItem('realstar'); addDoc('kenjiletter'); sfx('take'); E.refresh();
      await think(['*Stella lifts her head and sings six notes, in waltz time. With a click, a little door in her chest swings open.*', 'Inside, wrapped in silk: a dark star, heavy, full of tiny green crystals. It snaps to the magnet so hard I nearly drop it.', 'And a letter.']);
      showDoc('kenjiletter');
    });
  },
  kbench: () => {
    if (!S.docs.includes('waltzcard') && has('kenji_caught')) { addDoc('waltzcard'); E.refresh(); return showDoc('waltzcard'); }
    caption(S.docs.includes('waltzcard') ? 'Kenji\'s bench drawer. Tiny brushes, tinier screws, and the outline of where a song card used to live.' : 'Tiny brushes, a loupe, a jar of porcelain fingers. I\'m not going through a man\'s drawers without a reason. Yet.');
  },

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
      setTimeout(() => think(['L-I-P-S-Y-N-C. She hid it in the first letters. Of her own song.', 'That\'s what her manager meant by a "backup track". Vesper Vox is going to mime at her own comeback.', 'Bold of her. She still has some explaining to do.']), 900);
    });
  },

  // the kitchen
  recipeboard: () => showDoc('recipeboard'),
  oven: () => { set('oven_seen'); caption('The oven keeps a log. Last bake: Tuesday, 11:40 PM to 12:30 AM. Ovens are terrible at keeping secrets.'); },
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
    if (S.phase !== 'n2') return think('The key fits. But I\'m not sneaking into tunnels with half the building awake. I\'m bold. I\'m also not an idiot.');
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
  suitcase: () => caption('Seven outfits for a three-day case. Dot said I\'d need two. Dot was wrong.'),
};

export function onHot(id) {
  if (id.startsWith('pc_')) return postcard(+id.slice(3));
  const f = HOT[id];
  if (f) f(); else caption('Nothing there worth writing down.');
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
  vesper: () => has('vesper_clear') ? 'Nova, darling. My secret keeper.' : has('vesper_mail') ? 'You again. Ask quickly, the steam is getting cold.' : 'The intern. Again.',
  cherry: () => S.phase === 'n1' ? 'Still up? Me too. The stage never sleeps.' : has('cherry_night') ? 'Nova! My favourite little know-it-all!' : 'Intern! Come to measure my hair against the fire code again?',
  dex: () => has('dex_confess') ? 'Hey, Nova. It\'s a ghost-free zone in here now. For real.' : 'Oh. Hi. Hi again. Is this... about me?',
  juniper: () => has('juniper_clear') ? 'There\'s my sous-chef. Hungry?' : 'Back again, love? Sit. Eat something.',
  opal: () => has('opal_pin') ? 'Miss Vale. You\'re very persistent.' : 'Miss Vale.',
  silas: () => S.phase === 'n1' ? 'Shh! You\'ll scare it off. Whatever it is.' : has('tape_seen') ? 'My favourite viewer. Seen anything spooky?' : 'Hey, intern. Seen anything weird yet?',
  jojo: () => has('jojo_asked') ? 'Detective! Want to see me do a spin? I can do a spin.' : 'Intern! Want to see me do a spin?',
  priya: () => has('priya_red') ? 'Nova. The stars are still up there. For now.' : 'Hello again.',
  kenji: () => S.phase === 'g' ? 'Miss Vale.' : has('kenji_money') ? 'Gently, please. Stella is listening.' : '*He nods without looking up from the doll.*',
  rashad: () => 'The detective returns. Chapter two.',
  gus: () => S.phase === 'n1' ? 'Rounds. Don\'t mind me.' : has('gus_key') ? 'Miss Vale.' : 'Intern.',
  harper: () => has('harper_alibi') ? 'My favourite intern. Say something quotable.' : 'The intern! Carried any interesting boxes today?',
  regent: () => has('regent_clear') ? 'My alibi\'s favourite detective.' : 'My critic returns.',
  nate: () => has('nate_alibis') ? 'Nova.' : 'Morning.',
};

const INTRO = {
  vesper: ['*A tall woman in a silver gown lounges by the pool, sunglasses on indoors.*', 'If you\'re bringing towels, darling, put them on the lounger and go.', 'N: I\'m Nova Vale. Ms. Arden\'s intern.', 'Celeste has an intern now. How lovely for her.', 'N: She also has a missing crown. She asked me to talk to everyone who was here on Tuesday.', '*Vesper lowers her sunglasses an inch and studies you over them.*', 'A child with a notebook. Fine. You may ask me questions until my steam cycle ends, and then you may go away.'],
  cherry: ['*A drag queen in hot pink stands by the fountain, beehive first.*', 'Well, hello. You\'re new. Miss Cherry Pop: host of the Starfall Revue, and the reason anyone bought a ticket.', 'N: Nova Vale. I\'m Ms. Arden\'s intern for the relaunch.', 'Celeste said she was getting an intern. She didn\'t say you\'d stare at my wig like it owes you money.', 'N: It\'s about three inches over the fire code.', '*Cherry blinks. Then she laughs, loud enough to echo off the dome.*', 'Oh, I\'m going to keep my eye on you.'],
  dex: ['*A young man in a teal hoodie jumps and nearly knocks over a lava lamp.*', 'Oh! Hi! Sorry, nobody comes in here. Are you lost? The spa\'s the other way.', 'N: Nova Vale. Ms. Arden\'s intern. She said you\'re the person to ask about the display case.', '...She did? Why does an intern need to know about the display case?', 'N: Because the crown isn\'t in it.', 'Right. Right. I\'m Dex. I do the tech. All of it. And I didn\'t take it, in case that\'s where this is going.', 'N: I hadn\'t said anything.', '...You were going to, though.'],
  juniper: ['*A chef in a leaf-green headscarf looks up from the mixing bowl.*', 'Kitchen\'s closed, love. Unless you\'re the new intern, in which case you look like you skipped breakfast.', 'N: Nova Vale. I am, and I did.', '*She cuts a slice of lemon bread without asking and slides it across.*', 'Juniper. I run this kitchen. Eat that, and then you can tell me why Celeste\'s intern keeps looking at everyone\'s shoes.', 'N: I\'m helping her find out what happened to the crown.', 'Are you, now. Well. We\'ll see.'],
  opal: ['*An older woman in a long lavender coat is studying blueprints. She takes her time looking up.*', 'Celeste\'s intern. She told us you\'d be wandering about. Opal Finch. I designed this building, a long time ago.', 'N: Nova Vale. A glass dome on a stone drum, every door facing the fountain, and the planetarium at the north end, where the sky is darkest.', '*For the first time, she really looks at you.*', 'You\'ve done your reading. Most interns don\'t.', '"A sky you can swim under." That\'s what I promised them in 2002.'],
  silas: ['*A young man in a patched denim jacket is filming the dome with a camcorder, narrating to nobody.*', '...and that, Static Heads, is where the Grey Lady was last seen. Oh. Hey. You\'re in my shot.', 'N: You\'re in my lobby. Nova Vale. I work here, sort of.', 'Silas Boone, "Static Hour". Six hundred subscribers. Celeste lets me film as long as I don\'t post anything until after the gala.', 'Wait, you work here. Have you seen her? The Grey Lady? Anything weird at all?', 'N: Plenty of weird things. No ladies.'],
  jojo: ['*A young man on roller skates is leaning on the counter, eating lemon bread straight out of the tin.*', 'Tía said ONE slice, and technically this is one slice, it\'s just very long. Oh, hi. Jojo Reyes. Juniper\'s nephew. I run Roller Nights over in Millbrook.', 'N: Nova Vale. I\'m interning for Ms. Arden.', 'Interning! Brutal. Do they pay you in bread too?', 'N: Not yet. I\'m also asking around about the crown.', 'Oh, that\'s way more interesting than interning. Ask me anything. I\'m an open book. A skating book.'],
  priya: ['*A woman with a clipboard of star charts is frowning at the projector.*', 'Sorry, this area\'s... oh, you\'re staff? Dr. Priya Anand, Lakeshore Observatory. I\'m here to take this projector apart.', 'N: Nova Vale. Ms. Arden\'s intern. The Zeiss is coming out?', 'Celeste sold it to us. It comes out after the gala so they can put in a... bar.', '*She says "bar" the way other people say "mould".*'],
  kenji: ['*A man in a tweed waistcoat is repainting the eyelashes of a porcelain doll with a very small brush.*', 'Please don\'t make any sudden movements. She\'s a hundred and one years old.', 'N: I\'ll stand very still. Nova Vale, Ms. Arden\'s intern.', 'Kenji Morimoto, conservator. This is Stella, a singing automaton from 1925. She stood in this lobby from opening night until they closed. I\'m making her sing again for the gala.', '*He goes back to the eyelashes. He clearly expects you to leave.*'],
  rashad: ['*A teenage bellhop in a varsity jacket is reading a battered paperback on the linen cart.*', 'If you need towels, they\'re on the cart.', 'N: Nova Vale. Ms. Arden\'s intern.', '*He looks at you over the book for a long moment.*', 'Rashad Okafor. And you\'re not an intern. You checked every door hinge on the way down this corridor.', 'N: Maybe I like hinges.', 'Nobody likes hinges. You\'re looking for the crown. Relax, I won\'t tell anyone. I\'ve read enough mysteries to know the detective always needs a sidekick.', 'N: I don\'t need a sidekick.', 'They always say that.'],
  gus: ['*A heavyset man with a ring of keys the size of a dinner plate is checking the lamps.*', 'You\'ll be the intern. Celeste said. Gus Haddad, caretaker.', 'N: Nova Vale. You kept this place going the whole nine years it was closed?', 'Me and the raccoons. Kept it dry. Kept it locked.', 'N: Locked. So who has keys to what?', '*He squints at you.*', 'That\'s a funny question for an intern.'],
  harper: ['*A woman in a red blazer is recording the fountain with a professional microphone.*', '...the quiet of a building that\'s been asleep for nine years. Cut. Oh, hello. Harper Vance, "Lakeshore Unsolved". And you are?', 'N: Nova Vale. Ms. Arden\'s intern.', 'An intern. At a spa that isn\'t open yet, the same week a crown walks out of a locked case. What interesting timing.', 'N: I mostly carry boxes.', '*She smiles, and clearly doesn\'t believe a word of it.*', 'Of course you do. Come and find me when you\'ve got something better to carry. I pay in coffee.'],
  regent: ['*A performer in a white tailcoat lined with lavender is rehearsing a bow, cane first.*', 'Oh! An audience. Well? How was the bow?', 'N: The cane came down a beat early.', '*They freeze mid-bow.*', '...It did. Nobody has noticed that in three weeks. Velvet Regent. Favourite to win the Revue, and to wear the crown, once somebody finds it.', 'N: Nova Vale. Ms. Arden\'s intern.', 'An intern with notes. How alarming.'],
  nate: ['*A ranger in a green fleece vest is scanning the lake with binoculars.*', 'Morning. Nate Begay, Lakeshore State Park. The lake\'s my patch, the dome isn\'t. You with the hotel?', 'N: Nova Vale. Ms. Arden\'s intern. Anything interesting on the water?', 'Loons. Two kids in a rowboat last summer. And a light in the boathouse at two in the morning, which is either interesting or none of my business.'],
};

const pinQ = { q: 'Do you recognise this pin?', when: () => hasItem('pin') };
const TOPICS = {
  vesper: [
    { id: 'crown', q: 'What do you know about the Prism Crown?', lines: ['It\'s a crown, darling, and I adore a crown. I was going to place it on the winner\'s head myself.', 'Then someone stole my big moment. Rude.', 'N: Where were you on Tuesday night, around midnight? And "beauty sleep" is not an alibi.', 'Asleep in the Spa Suite, with cucumber on my eyes and a humidifier going like a jet engine.', 'N: So your only witnesses are vegetables.', 'The cucumbers were VERY discreet.'] },
    { id: 'ghost', q: 'Have you heard the singing at night?', lines: ['The "ghost"? Honey, if a ghost is singing in this building it had better be singing MY songs.', 'It\'s thin. Wobbly. No breath support.', '*She says it lightly, but her hand drifts to her throat.'] },
    { id: 'song', q: 'What are you performing on Saturday?', lines: ['"Starfall." Brand new. Written for this very dome.', 'The sheet is on the side table, if you must. Don\'t smudge it.', 'N: I never smudge. I annotate.'] },
    { id: 'track', q: 'Nobody needs a "backup track" for a nap, Vesper.', hot: 1, when: () => has('vesper_mail'), lines: ['You read my EMAIL?', 'N: It was on a hotel computer with the password on a sticky note. Anyone could have read it.', '...Touché, darling. A backup track is a precaution. Every professional has one. Next question.'] },
    { id: 'lipsync', q: '"First letters in gold." L-I-P-S-Y-N-C.', hot: 1, when: () => has('acrostic'), lines: ['*Vesper slowly takes off her sunglasses. Her eyes are red.', '...Two weeks ago my voice cracked in rehearsal. The doctor said no singing for a month.', 'Saturday is my comeback, darling. I couldn\'t cancel. So I\'ll mouth my own song over my own recording.', 'Stealing the crown is the LAST thing I\'d do. This gala is the only thing keeping my career afloat.', 'N: Then prove it. Where were you at 11:52 on Tuesday?', 'On a video call with my vocal coach, half eleven to half twelve, doing silent breathing exercises. Glamorous. She\'ll swear to it.', 'N: For what it\'s worth, hiding it in the song was smart. I only caught it because I\'m smarter.', '*Despite herself, Vesper laughs.', 'Please. Not a word to Cherry.'], after: () => { set('vesper_clear'); toast('Vesper has an alibi'); } },
    { id: 'pin', ...pinQ, lines: ['Brass? On a gown? Never, darling.', 'Although... the people who built this place all wore little pins like that. There\'s an old photograph upstairs.'] },
  ],
  cherry: [
    { id: 'crown', q: 'Tell me about the Prism Crown.', when: () => S.phase !== 'n1', lines: ['Silver band, seven points, a star cut from a real meteorite. It\'s the most gorgeous object in this building, and I include myself.', 'The winner of the Revue wears it. I\'m hosting, so I can\'t win, before you ask.', 'N: I wasn\'t going to ask. You\'d have worn it already.', '...I can\'t even argue with that.', 'N: Where were you on Tuesday night?', 'In my suite, doing my face for a photo shoot that got cancelled. Alone, fully painted, for nobody. A tragedy.'] },
    { id: 'people', q: 'What do you think of the others?', when: () => S.phase !== 'n1', lines: ['Vesper\'s a legend, but she hasn\'t sung one note in rehearsal. Weird, right?', 'Dex is sweet, nervous, and basically lives in that tech office.', 'Juniper feeds us all like a fairy godmother. And Opal designed this whole place. She walks around touching the walls like they\'re her babies.'] },
    { id: 'ghost', q: 'Have you heard the ghost?', when: () => S.phase !== 'n1', lines: ['Heard it? Babe, I\'ve HARMONISED with it.', 'It comes on late at night. Last week it sang for an hour. My wig stood up by itself.', 'N: It\'s flat on the high notes. Ghosts should have better pitch. They have nothing but time.'] },
    { id: 'seen', q: 'Have you seen anything strange up here?', hot: 1, when: () => S.phase === 'n1', lines: ['Tuesday night, around midnight, I snuck in here to practise. Someone was already here with a flashlight.', 'They went behind the stage, towards that old Service door. I thought it was the ghost, so I RAN.', 'N: You ran from a flashlight.', 'I ran from the CONCEPT of a flashlight. In heels. Respect the effort.', 'N: Did you see who was holding it?', 'Just the light. And a coat, I think. Long. Not a look I\'d serve.'], after: () => set('cherry_light') },
    { id: 'singing', q: 'Did you hear the singing tonight?', when: () => S.phase === 'n1', lines: ['It was coming out of the ceiling speakers in here. Loudest in here, for sure.', 'Then it just stopped. Was that you? You\'re my hero.', 'N: I know.'] },
    { id: 'number', q: 'About your surprise number...', when: () => S.phase === 'd2' && has('cherry_night'), lines: ['Shh! Not a word to Vesper. It\'s a tribute to her. She\'s been so stressed lately.', 'N: Your secret\'s safe. I only expose people who deserve it.', 'But that flashlight still gives me chills.'] },
    { id: 'pin', ...pinQ, lines: ['That\'s an original Aquadome staff pin! The build crew got them on opening night in 2003.', 'They\'re super rare. I\'ve only seen one person wear one around here...', 'Opal. On her coat.'], after: () => set('pin_known') },
  ],
  dex: [
    { id: 'g_magnet', q: 'I need a strong magnet. Right now.', hot: 1, when: () => S.phase === 'g' && !hasItem('magnet'), lines: ['A... magnet? Like a fridge magnet, or like a magnet?', 'N: Like a magnet, Dex.', '*He digs through a box of dead speakers and comes up with a heavy black disc.*', 'From the old planetarium subwoofer. Don\'t put it near your phone. Or a credit card. Or me, honestly.'], after: () => { giveItem('magnet'); sfx('take'); E.refresh(); } },    { id: 'crown', q: 'What happened with the display case?', lines: ['It has a keypad. Codes only, no keys. I set all the staff codes myself.', 'It wasn\'t forced, so whoever opened it had a code. Which looks bad for me. I know. I KNOW.', 'N: Can I see the access log?', 'It\'s in SecureLog on my computer. I\'d open it for you, but I\'m really, really busy with the gala lights.', 'N: That was a yes. I\'ll let myself in.', 'That was NOT a... okay. Just don\'t touch anything else.'], after: () => set('asked_dex_crown') },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', when: () => !has('dex_confess') && !has('dex_partial'), lines: ['Asleep! In my room! By like... eleven? Ish?', '*He doesn\'t quite meet your eyes.*', 'N: "Ish." Noted.'] },
    { id: 'callout', q: '"Asleep by eleven"? Your own email says ghost test, Tuesday, 11pm.', hot: 1, when: () => has('holo_mail') && !has('dex_confess') && !has('dex_partial'), lines: ['You read my... okay, that\'s a privacy thing, we should talk about—', 'N: We can talk about privacy right after we talk about lying to me.', 'Fine! FINE. I was in the planetarium until about 11:40. Testing a thing. A secret thing. I can\'t say what.', 'N: You\'ll tell me. They always do.'], after: () => set('dex_partial') },
    { id: 'ghost', q: 'What do you make of the ghost?', when: () => !has('dex_confess'), lines: ['Ghosts aren\'t real. It\'s probably a feedback loop in the old speakers. Technically.', '*He laughs a little too loudly.*', 'N: Technically, you\'re sweating.'] },
    { id: 'maint', q: 'Who is MAINT-0?', when: () => has('log_read'), lines: ['MAINT-0 is an old master code from when the dome was built. I thought I deleted it when I rebuilt the system!', 'N: You thought. That\'s the problem with thinking. You have to actually check.', 'Somebody who knew it opened the case at 11:52. That wasn\'t me. I promise.'] },
    { id: 'holo', q: 'I found your hologram card in the planetarium.', hot: 1, when: () => hasItem('holocard') && S.phase === 'd2', lines: ['...Oh no.', 'Okay. OKAY. Yes. The ghost is me. It\'s a hologram show for the gala: the singing ghost of the dome. Spooky, fun, very 2003.', 'I was testing it Tuesday and it glitched. Now it switches itself on every night. I didn\'t want Celeste to know until it worked.', 'N: So you were in the planetarium until 11:40. Told you you\'d tell me.', 'The projector log stops at 11:41, you can check. Then I went to bed. For real this time.', 'N: And MAINT-0?', 'Only the 2003 build team ever knew that code. Four of them. Three moved away years ago.', 'The fourth is Opal.'], after: () => { set('dex_confess'); toast('Dex has an alibi'); } },
    { id: 'pin', ...pinQ, lines: ['Staff pin, 2003 vintage! Collector\'s item.', 'Opal wears one on her coat. Or... she did? I don\'t think I\'ve seen it this week.'], after: () => set('pin_known') },
  ],
  juniper: [
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['Here, nearly all night. The gala cake failed and I had to start again.', 'N: "Nearly all night" is doing a lot of work in that sentence.', 'The oven can vouch for me, if you know how to read it.', '*She seems to be testing you.*'] },
    { id: 'oven', q: 'Your oven says the cake went in at 11:40. Not "all night".', hot: 1, when: () => has('oven_seen') && !has('juniper_clear'), lines: ['*Juniper laughs, properly.*', 'Sharp. I like sharp.', 'The first cake failed. The second went in at 11:40. If you want the rest of the story, earn it. Help me with the cake.'] },
    { id: 'cake', q: 'Can I help with the cake?', hot: 1, when: () => !has('juniper_clear'), lines: ['Ha! All right. Here\'s my Nana\'s recipe. It isn\'t vegan. Tell me what you\'d swap, and we\'ll see if you\'re as clever as you think you are.', 'N: I\'m exactly as clever as I think I am. That\'s the whole point of me.'], puzzle: 'recipe' },
    { id: 'window', q: 'You were baking all night. Did you see anything?', when: () => has('juniper_clear'), lines: ['Just before midnight, a white flashlight crossed the lobby towards the planetarium. Someone in a long coat.', 'Long coat, indoors, in June. That narrows it down, doesn\'t it?'] },
    { id: 'people', q: 'What do you think of the others?', lines: ['Vesper doesn\'t eat. Worrying. Cherry eats everything, bless her. Dex eats crisps in the dark.', 'And Opal brings her own tea and talks to the walls. She loves this place more than any of us.'] },
    { id: 'pin', ...pinQ, lines: ['Opal wears one exactly like that. Or she did.', 'It was missing on Wednesday morning. She looked like she\'d lost a tooth.'], after: () => set('pin_known') },
  ],
  opal: [
    { id: 'crown', q: 'What do you know about the Prism Crown?', lines: ['Celeste had it made for the relaunch. Silver and a meteorite. Very... marketable.', 'Crowns come and go, Miss Vale. Buildings stay. Or they should.'] },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['Here, with my plans. Then to bed. I\'m sixty-three; I don\'t do midnights.', 'N: Funny. Midnight seems to do you.'] },
    { id: 'history', q: 'Tell me about the Aquadome.', lines: ['It opened on the summer solstice in 2003. The planetarium was its heart. People floated in the spa, then lay back under my stars.', 'It closed nine years ago. I used to let myself into the empty dome and switch the projector on for no one.'] },
    { id: 'pin', ...pinQ, lines: ['*Her hand flies to her lapel.*', '...Where did you find that?', 'N: Under the display case. And pins don\'t fall off lapels, Ms. Finch. You have to take them off, or catch them on something in a hurry.', 'I must have dropped it some time. I cross that lobby every day.', '*She takes a moment too long to say it.*'], after: () => set('opal_pin') },
    { id: 'coat', q: 'Two people saw a long coat with a flashlight at midnight.', hot: 1, when: () => has('cherry_light') && has('juniper_clear'), lines: () => [has('regent_clear') ? 'N: There are two long coats in this building. The other one has an alibi on tape. Yours doesn\'t.' : 'N: Two long coats in this building. Velvet Regent\'s, and yours. I\'m asking you first.', 'Then I suppose I\'m the only one here who feels the cold.', '*She holds your gaze without blinking.*', 'N: That\'s not a no.'] },
    { id: 'note', q: '"The stars remember where I left them"?', when: () => has('note_read'), lines: ['It means what it says. Some things are written in the sky, if you know how to look.', 'N: Then it\'s a good thing I always know how to look.'] },
    { id: 'maint', q: 'Did you know the MAINT-0 code?', when: () => has('dex_confess'), lines: ['Everyone on the build team knew it. That was twenty-three years ago.', 'N: You didn\'t say no.', '*She doesn\'t.*'] },
    { id: 'relaunch', q: 'I read Celeste\'s memo about the planetarium.', hot: 1, when: () => has('memo_read'), lines: () => S.phase === 'd2'
      ? ['*Opal goes very still.*', 'A VIP lounge. They are going to put a bar where my stars are.', 'N: I thought you\'d want to know I know.', 'You\'ll excuse me, Miss Vale. I need some air.', '*She walks out of the archive without closing the door.*']
      : ['*Opal turns back to her blueprints.*', 'Please. Not today.'],
    after: () => { if (S.phase === 'd2') set('opal_left'); } },
  ],
  silas: [
    { id: 'ghost', q: 'So you think the Aquadome is haunted?', lines: ['Think? My EMF meter maxes out in the planetarium every night at eleven. The Grey Lady sings, the lights move, the...', 'N: It\'s a speaker, Silas.', '...A speaker HAUNTED by the Grey Lady.', 'N: I\'m going to let you have that one.'] },
    { id: 'tape', q: 'Were you filming on Tuesday night?', hot: 1, when: () => !has('tape_seen'), lines: ['Obviously. I film every night. Lobby, eleven till one. And at 11:52 the Grey Lady walked RIGHT past my lens.', 'N: You have footage of the crown thief and you\'ve been calling it a ghost.', 'I have footage of a GHOST who may or may not ALSO be a thief. Want to see?'], after: () => { set('tape_seen'); setTimeout(() => showDoc('tape'), 50); } },
    { id: 'coat', q: 'Your ghost has a long coat and an ordinary white flashlight.', when: () => has('tape_seen'), lines: ['Ghosts can wear coats.', 'N: Ghosts don\'t need flashlights.', '...Okay. That\'s a really good point. That\'s going in the episode.'] },
    { id: 'singing', q: 'Did you hear the singing tonight?', when: () => S.phase === 'n1', lines: ['Heard it, recorded it, backed it up twice. It\'s loudest in the planetarium.', 'I\'m too scared to go in there. That stays between us.', 'N: Your secret\'s safe. Your subscribers already know.'] },
    { id: 'hologram', q: 'The ghost is Dex\'s hologram, Silas.', hot: 1, when: () => has('dex_confess'), lines: ['...No.', 'N: Yes. Test version three.', '*Silas stares at his camcorder like it betrayed him.*', 'This is the worst day of my life. I\'m still getting an episode out of it.'] },
    { id: 'pin', ...pinQ, lines: ['Is it haunted?', 'N: No.', 'Then no.'] },
  ],
  jojo: [
    { id: 'why', q: 'What are you doing at the Aquadome?', lines: ['Pitching! Celeste wants a "VIP lounge" in the planetarium. I want a roller disco under the dome. Stars on the ceiling, mirror ball in the middle, Tía\'s cake at the snack bar.', 'N: So you\'d be happy if the relaunch fell apart and Celeste needed new ideas.', '...When you put it like that it sounds bad.', 'N: Everything sounds bad when I put it like that. It\'s a gift.'] },
    { id: 'tuesday', q: 'Where were you on Tuesday at midnight?', lines: ['Skating the terrace. The flagstones out there are like glass. The ranger was on the dock and watched me eat it twice.', 'N: So Ranger Begay is your alibi.', 'Ranger Begay and my bruises.'], after: () => set('jojo_asked') },
    { id: 'door', q: 'Did you hear anything when you came in?', when: () => has('jojo_asked'), lines: ['Yeah, actually. About quarter past twelve, a heavy door went BOOM somewhere under the floor. Like the whole building sighed.', 'N: Under the floor.', 'Under the floor. Is that bad? That feels bad.'], after: () => set('jojo_door') },
    { id: 'pin', ...pinQ, lines: ['Nah. Pretty, though. Can I have it?', 'N: No.'] },
  ],
  priya: [
    { id: 'projector', q: 'You don\'t sound happy about taking it out.', lines: ['I came here when I was nine. Sat in row three. The lights went down and there were more stars than I knew existed.', 'I became an astronomer because of this room. And now I\'m the one who has to switch it off.'] },
    { id: 'tuesday', q: 'Where were you on Tuesday at midnight?', lines: ['On the dock with Ranger Begay, photographing a meteor shower. With a red torch, so I don\'t ruin my night vision.', 'N: Red.', 'Red. No astronomer uses a white light at night. Ask any of us.'], after: () => set('priya_red') },
    { id: 'swan', q: 'Do you recognise this pattern?', hot: 1, when: () => hasItem('sketch') && !has('const_done'), lines: ['That\'s Cygnus, the Swan. People call it the Northern Cross. On opening night in 2003 it was right over the stage.', 'N: So if I put it into the projector...', 'Then you\'d see whatever the projector was told to remember. Opal hid a lot of little secrets in that machine.'] },
    { id: 'postcard', q: 'I found a postcard from a "Priya, July 2003".', hot: 1, when: () => has('pc_1'), lines: ['...Oh my God. That\'s my handwriting. I was nine. My mum kept everything except that.', '*She laughs, but her eyes are wet.*', 'N: Keep it. Evidence of how you got here.'] },
    { id: 'pin', ...pinQ, lines: ['A build crew pin. My mum pointed at one on opening night: "Those are the people who made the sky."'] },
  ],
  kenji: [
    { id: 'g_star', q: 'The star in the crown is fake.', hot: 1, when: () => S.phase === 'g' && has('star_fake') && !has('repair_seen'), lines: ['*Kenji goes very still.*', 'That\'s... not possible. I appraised it myself.', 'N: On Monday. I read your certificate. You log everything, don\'t you? Show me Monday.', '*He hesitates a fraction too long, then hands over his notebook.*'], after: () => { set('repair_seen'); setTimeout(() => showDoc('repairlog'), 50); } },
    { id: 'g_catch', q: 'Your Monday doesn\'t add up.', hot: 1, when: () => S.phase === 'g' && has('repair_seen') && has('appraisal_read') && !has('kenji_caught'), lines: ['N: Let me show you something, Kenji. Two somethings.'], after: null, catch: 1 },
    { id: 'g_truth', q: 'I found the Star\'s Tear.', hot: 1, when: () => S.phase === 'g' && has('stella_open') && !has('g_done'), lines: ['*Kenji sees the dark star in your hand and closes his eyes.*'], fin: 1 },
    { id: 'stella', q: 'A singing doll. The same week as a singing ghost.', lines: ['I know how it looks. But Stella sings in three-four time. A waltz. And she has been in pieces on my table all week.', 'Your ghost sings in four-four.', 'N: You checked the ghost\'s time signature.', 'Of course. Didn\'t you?', 'N: ...I respect that enormously.'] },
    { id: 'crown', q: 'You appraised the crown?', lines: ['For the insurance. The band is silver plate, pretty and ordinary. The star is a real pallasite: olivine crystals set in meteoric iron. It\'s worth more than the roof.', 'N: So a thief could sell it for a fortune.', 'A thief could. But nobody has tried. I have friends who would hear about it, and I\'ve heard nothing.', 'N: So whoever took it didn\'t take it for the money.', '*Kenji nods, pleased, like a teacher with a good student.*'], after: () => set('kenji_money') },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['In my room, gluing a porcelain finger back on under a magnifier. I log every repair.', '*He shows you a notebook: every repair recorded to the minute. 23:40 to 00:30, "Stella, left hand, third finger".*', 'N: That is the most boring alibi I\'ve ever heard. It\'s perfect.'] },
    { id: 'pin', ...pinQ, lines: ['Brass, die-stamped, 2003. Sentimental, not valuable. Someone will miss it for the feeling, not the price.'] },
  ],
  rashad: [
    { id: 'books', q: 'What are you reading?', lines: ['Classic mysteries. Rule one: the least suspicious person usually did it.', 'N: Rule two: the person quoting the rules is never as smart as they think.', '...Okay. I walked into that one.'] },
    { id: 'tuesday', q: 'See anything on Tuesday night?', lines: ['I was on the late shift. About 12:20, Ms. Finch came up from the lobby. Coat buttoned to the chin, in June. One pocket hanging heavy, like there was a brick in it.', 'N: And you didn\'t think that was strange?', 'Everyone in this hotel is strange. You have to pick your mysteries.'], after: () => set('rashad_saw') },
    { id: 'grandpa', q: 'Your last name is on the build crew photo.', hot: 1, when: () => has('pin_known') || S.docs.includes('crewphoto'), lines: ['M. Okafor. Marcus. My granddad. He did the wiring. He used to say they built one room "just for the four of them" and never told me where.', 'He left me his notebook. There\'s a page about it. Mostly doodles of planets. Want to see?'], after: () => { set('okafor_seen'); setTimeout(() => showDoc('okafor'), 50); } },
    { id: 'pin', ...pinQ, lines: ['That\'s a crew pin! Granddad had one. He wore it on his fishing hat.'] },
  ],
  gus: [
    { id: 'keys', q: 'Do you have a key to everything?', lines: ['Every door, every cabinet, every drawer.', '*He jingles the ring.*', 'Except the Service door behind the planetarium stage. Ms. Finch has the only key to that one. Always has. Said it was a "crew thing".'], after: () => set('gus_key') },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['Rounds at ten, rounds at two. Asleep in between, like a sensible man.', 'N: With a flashlight.', 'It\'s a big dark building, miss. Everybody here\'s got a flashlight.'] },
    { id: 'boathouse', q: 'Why is there a new padlock on the boathouse?', when: () => has('v_terrace'), lines: ['*Gus\'s face shuts like a door.*', 'Because I put one on it.', 'N: That isn\'t an answer.', 'It\'s the only one you\'re getting. It\'s got nothing to do with your crown. Leave it.', 'N: For now.'], after: () => set('boathouse_ask') },
    { id: 'rounds', q: 'What are you doing up here at this hour?', when: () => S.phase === 'n1', lines: ['Rounds. Somebody\'s been singing through the speakers all week and Celeste thinks it\'s me. It isn\'t me. The ghost has better range.'] },
    { id: 'pin', ...pinQ, lines: ['Crew pin. I wasn\'t crew. I came in \'05, after. They were a tight bunch.'] },
  ],
  harper: [
    { id: 'press', q: 'Celeste said no press until after the gala.', lines: ['Celeste said no press WRITING until after the gala. I\'m only recording. My lawyer and I read that contract very carefully.', 'N: You have an answer for everything.', 'Takes one to know one, kid.'] },
    { id: 'tuesday', q: 'Where were you on Tuesday at midnight?', lines: ['Now why would an intern want to know that?', 'N: Ms. Arden wants a list of who was where, for the insurance forms.', 'The insurance forms. Sure.', '*She studies you, then shrugs and pulls out her recorder.*', 'Interviewing Velvet Regent in the spa lounge, 11:40 to 12:10. All recorded. All timestamped. Here, have a listen, and tell Celeste I was very helpful.', '*She plays a clip: Regent\'s voice, a big laugh, and underneath, very faint, a long metal groan.*', 'N: What\'s that noise at 11:57?', 'The plumbing? The ghost? It\'s great audio either way.', 'N: It\'s a heavy door. Somewhere under this building.'], after: () => { set('harper_alibi'); set('regent_clear'); } },
    { id: 'theory', q: 'Who do you think took it?', lines: ['My money\'s on the diva. She\'s hiding something. You can always tell by the sunglasses.', 'N: Sunglasses are a lifestyle, not a confession.'] },
    { id: 'pin', ...pinQ, lines: ['Ooh. Evidence. Can I photograph it?', 'N: No.', 'Worth a try.'] },
  ],
  regent: [
    { id: 'crown', q: 'Why do you want the crown so badly?', lines: ['Because it\'s a crown, and I\'m a queen, and those two things belong together.', 'Also the prize money pays my rent until winter. Don\'t tell anyone that part.', 'N: Your secret\'s safe. Mostly.'] },
    { id: 'tuesday', q: 'Where were you on Tuesday night?', lines: ['Being interviewed by that delightful podcast woman in the spa lounge. Being brilliant. Ask her.'] },
    { id: 'coat', q: 'Someone in a long coat was seen near the planetarium at midnight.', hot: 1, when: () => has('cherry_light') || has('juniper_clear') || has('tape_seen'), lines: ['*Regent looks down at their own coat tails.* ...Oh. That\'s unfortunate for me.', 'But darling, if anyone had seen ME at midnight, they\'d have written a poem about it.', 'N: They\'d have mentioned the coat. Harper Vance says you were with her in the spa at 11:57.', 'Then Harper Vance is my new favourite person and I\'m sending her flowers.'], when2: () => has('harper_alibi') },
    { id: 'cherry', q: 'What do you think of Cherry?', lines: ['Cherry is the best host in this state and I will never say that to her face.', 'N: I\'ll tell her you said it.', 'You wouldn\'t DARE.'] },
    { id: 'pin', ...pinQ, lines: ['Tacky. I\'d wear it.'] },
  ],
  nate: [
    { id: 'tuesday', q: 'Were you out here on Tuesday night?', lines: ['Midnight to one, counting meteors with Dr. Anand. The Reyes kid was skating laps on the terrace the whole time. Fell twice. Got up both times.', 'N: That clears two people at once. Efficient.'], after: () => set('nate_alibis') },
    { id: 'light', q: 'Did you see any lights in the dome that night?', lines: ['Just before midnight, a white flashlight moving across the lobby toward the planetarium end.', 'Dr. Anand\'s torch was red. Mine was off. So it wasn\'t either of us.'] },
    { id: 'boathouse', q: 'Lights in the boathouse?', lines: ['Two nights this week, around two in the morning. Gus says it\'s nothing. Gus says a lot of things are nothing.', 'N: Want me to look into it?', 'After the crown. One mystery at a time.'] },
    { id: 'pin', ...pinQ, lines: ['I\'ve seen that on Ms. Finch\'s coat. She walks the shore early, sometimes. Talks to the dome like it\'s an old friend.'] },
  ],
};

async function doTopic(who, t) {
  const lines = typeof t.lines === 'function' ? t.lines() : t.lines;
  await say(who, lines);
  S.asked[who + ':' + t.id] = true;
  if (t.puzzle === 'recipe') {
    await new Promise(res => recipe(async () => {
      await say(who, ['*She tastes the batter and closes her eyes.*', 'Oh, that\'s lovely. You\'d be welcome in my kitchen.', 'That\'s exactly what I did on Tuesday. The first cake went in with the wrong milk; I only noticed at eleven, so I remade it.', 'It went in at 11:40 and came out at 12:30. I stood at the window the whole time.', 'N: And what did you see from the window? Because you saw something. You\'ve been dying to tell somebody.', 'Ha! Yes. Just before midnight, a white flashlight went across the lobby towards the planetarium. Someone in a long coat.', 'Long coat, indoors, in June. That narrows it down, doesn\'t it?']);
      set('juniper_clear'); toast('Juniper has an alibi');
      res();
    }));
  }
  if (t.after) t.after();
  if (t.catch) await kenjiCatch();
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
    await say(who, ['*Cherry is on the stage in a sparkly robe, mid-twirl. She shrieks.*', 'You! The intern! You scared the lashes off me!', 'N: It\'s one in the morning, Cherry. What are you doing on a stage in the dark?', '...Rehearsing. A surprise number for Vesper at the gala. Nobody knows. Keep it quiet, okay?', 'N: Fine. But you owe me.']);
    set('cherry_night');
  }
  E.refresh();
  while (true) {
    const list = TOPICS[who].filter(t => (!t.when || t.when()) && (!t.when2 || t.when2()));
    const opts = list.map(t => ({ text: t.q, dim: S.asked[who + ':' + t.id], hot: t.hot && !S.asked[who + ':' + t.id] }));
    opts.push({ text: 'Goodbye', bye: true });
    const i = await choose(opts);
    if (i === list.length) break;
    await doTopic(who, list[i]);
    E.refresh();
    if (who === 'opal' && has('opal_left')) { sync(); break; }
    if (list[i].fin) return kenjiFinale();
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
  await say('opal', ['...Yes.', 'I opened the case with the old code at 11:52 and carried the crown down here in my coat pocket. I lost my pin on the way. Sloppy.', 'I never touched the star, before you ask. I wouldn\'t know how to set a stone, and I\'d never dare try with that one.', 'N: Very sloppy. I found it in about four seconds.', 'If there\'s no crown, there\'s no gala. If there\'s no gala, maybe Celeste reconsiders. Maybe my stars stay.', 'It was a foolish plan. But it was the only one I had.']);
  i = await choose([{ text: 'You\'ll never work on another building again.' }, { text: 'It was a terrible plan. Let me give you a better one.' }]);
  if (i === 0) { closeTalk(); E.unfocus(); return badEnding('locked'); }
  await say('opal', ['N: The planetarium matters. Hiding a crown in a basement won\'t save it. Showing Celeste what it can do might, with me in the room so she actually listens.', '*Opal is quiet for a long moment. Then she laughs, softly.*', 'You\'re insufferable, Miss Vale. You sound exactly like me, twenty-three years ago.', 'All right. Take it back up. Tell Celeste everything. I won\'t make you drag me.']);
  set('finale_done'); set('crown_back'); sync(); sfx('solve');
  closeTalk(); E.unfocus();
  await think(['*You lift the Prism Crown off its cushion. The meteorite star glints violet in the candlelight.*', 'Case closed. As predicted. By me.']);
  await call('celeste', ['Nova? It\'s nearly one in the morning, is everything...', 'N: I found the crown. You\'re welcome. And you\'re going to hear Opal out about the planetarium, because you\'re about to make a very expensive mistake.', '*Celeste listens for a long time.*', '...A VIP lounge can go anywhere. The old laundry is bigger anyway.', 'Tell Opal her stars stay. And tell her she\'s running the planetarium show at the gala.']);
  await fade(async () => { S.phase = 'g'; save(); sync(); E.refresh(); }, 900);
  E.go('L1', { fade: true, look: [-4.2, 3.2] });
  await new Promise(r => setTimeout(r, 1400));
  await think(['*Morning. Gala day. You set the Prism Crown back on its velvet, and Celeste nearly cries with relief.*',
    'Except something has been bothering me since the Star Room.',
    'When I lifted that crown, the star weighed nothing. An iron meteorite should feel like a fishing sinker. That felt like a boiled sweet.',
    'Kenji told me nobody had tried to sell the stone. Opal swears she never touched it.', 'One of those is a clue, and I\'m about to find out which.']);
  E.refresh();
}

// ---------- Gala Day: the Star's Tear ----------
const EVIDENCE = [
  { k: 'appraisal', t: 'Insurance appraisal', s: 'Mon 13:40: the star is a real pallasite. Magnet: strong.' },
  { k: 'magnet', t: 'Your magnet test', s: 'Today: the star doesn\'t even twitch. It\'s fake.' },
  { k: 'log', t: 'Keypad log', s: 'Mon 13:36 to 14:51: case opened by KMORIMOTO.' },
  { k: 'repairlog', t: 'Kenji\'s repair log', s: 'Mon 13:30 to 15:00: at his bench, regluing Stella\'s finger.' },
  { k: 'opal', t: 'Opal', s: 'Took the crown Tuesday night. Never touched the star.' },
  { k: 'kenji', t: 'Kenji', s: 'Nobody has tried to sell the stone. The thief didn\'t want money.' },
];
async function kenjiCatch() {
  await new Promise(res => contradiction(EVIDENCE, ['log', 'repairlog'], async () => {
    set('kenji_caught'); E.refresh();
    await say('kenji', ['N: Your log says you were at your bench regluing a finger from half past one till three on Monday.', 'N: The keypad says you had the crown\'s case open from 13:36 to 14:51. For an appraisal that took you, according to your own certificate, about four minutes.',
      '*Kenji puts his brush down very carefully.*', 'I... was cleaning the band. Silver tarnishes.', 'N: For an hour and fifteen minutes. With a log that says you were somewhere else. You log everything, Kenji. You didn\'t log that.',
      '*He looks at Stella, then away from her, very fast.*', 'Please don\'t touch Stella. She\'s fragile.', 'N: Noted. That was the worst thing you could have said.']);
    res();
  }, picked => {
    const lines = { opal: 'Opal\'s story fits everything else. Rude of it, but true.', kenji: 'He did say that. It doesn\'t contradict anything.', magnet: 'Those don\'t clash, they agree: real Monday, fake now. Something happened in between.', appraisal: 'Those don\'t clash, they agree: real Monday, fake now. Something happened in between.' };
    const k = picked.find(x => lines[x]); if (k) toast(lines[k].split('.')[0] + '.');
  }));
}
async function kenjiFinale() {
  checkpoint();
  await say('kenji', ['*Kenji reads his own letter in your hand and lets out a long breath.*', 'My grandmother used to draw it for me. Three green crystals, in a triangle. "Like a little face," she said.', 'On Monday I put my loupe on that crown, and the little face looked back at me.']);
  let i = await choose([{ text: 'You stole a $38,000 stone. I\'m calling the police.' }, { text: 'It was hers. That doesn\'t make swapping it right.' }, { text: 'Why not just tell Celeste?' }]);
  if (i === 0) { closeTalk(); E.unfocus(); return badEnding('kenji'); }
  if (i === 2) await say('kenji', ['Tell a woman who has just sold her own planetarium to keep the lights on that the prize of her gala belongs to someone else?', 'I thought I would make the replica, take the stone home quietly, and write to her afterwards. I am not proud of the plan. It was a frightened plan.']);
  else await say('kenji', ['No. It doesn\'t. I know.', 'I told myself I was only taking back what was taken. But I lied in my own log. That part, the lie, my grandmother would never have forgiven.']);
  i = await choose([{ text: 'Then we tell Celeste together. Now. Before the gala.' }, { text: 'Put it back and we\'ll pretend this never happened.' }]);
  if (i === 1) {
    await say('kenji', ['*He shakes his head.*', 'No. You don\'t mean that, and I wouldn\'t let you. A secret like this is what put us both here.']);
  }
  await say('kenji', ['N: Here\'s what happens. You tell Celeste everything. I tell her you\'re the reason the crown looks perfect, because your fake is better than most people\'s real. And then she finds out where that stone actually belongs.', '*Kenji laughs, startled, and wipes his glasses.*', 'You are a very strange detective, Miss Vale.', 'N: I\'m an extremely good detective. The strange is a bonus.']);
  set('g_done'); closeTalk(); E.unfocus(); sfx('solve');
  await call('celeste', ['Nova? Twice in one day, this is either wonderful or terrible.', 'N: Both. Sit down. Kenji has something to tell you, and then I have something to tell you about what you\'re going to do next.', '*A long, long phone call later.*', '...The crown wears Kenji\'s replica tonight. And on Monday, I\'m writing to the Morimoto family myself.', 'Nova, how do you do this?', 'N: I read everything, and I ask a lot of follow-up questions.']);
  ending();
}

// ---------- Endings ----------
const BAD = {
  blackout: ['Lights Out', 'You flip the big red MAIN switch. Every light in the Aquadome dies at once, and the pumps shudder to a stop.', 'In the dark, footsteps hurry past the tech office. Somewhere below, a heavy door closes.', 'By the time the power is back, whoever it was is long gone, and Celeste has called off the gala. For once, you have nothing clever to say.'],
  kenji: ['Wrong Call', 'The police arrive at noon. Kenji goes quietly, holding Stella\'s song card, and doesn\'t say a word in his own defence.', 'The Star\'s Tear is locked in an evidence room for two years while lawyers argue over whose it is. The gala goes ahead with an empty mount in the crown.', 'You solved the case. Nobody will ever thank you for it.'],
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
    <p>Velvet Regent won the Revue and wore the Prism Crown like they were born in it. Nobody in the room knew the star was Kenji's replica; Regent calls it &ldquo;the most honest fake I have ever worn&rdquo;. On Monday I wrote to the Morimoto family in Nagano. The Star's Tear is going home. Dr. Anand is keeping the projector where it is and running Tuesday star shows with Opal. Kenji's Stella sang a waltz at midnight, and he cried, and so did I. Jojo is getting one roller night a month under the dome, and Juniper is doing the snack bar.</p>
    <p>Harper Vance's podcast called you "an absolute menace, in the best way". Silas Boone's ghost episode has four thousand views and is, I'm told, "deeply wrong". Rashad says he's writing a novel about you. You have been warned.</p>
    <p>The planetarium stays. The Prism Crown is back where it belongs, and so, I think, is the Aquadome.</p>
    <p>With endless thanks,</p><p class="sig">Celeste Arden</p>
    <p class="ps">P.S. Opal asked me to send you something: a little brass star pin. She says you've earned it, and that you are "insufferable, in the best way".</p>
    ${pc ? `<p class="ps">P.P.S. The front desk says you "borrowed" ${pc} of our old postcards. Keep them.</p>` : ''}
    <p class="ps">P.P.P.S. Gus still won't tell anyone what's in the boathouse. Ranger Begay has asked me to ask you to ask him. I suspect we'll be in touch.</p></div>
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
    { id: 'opal', q: 'Anything on Opal Finch?', when: () => has('met_opal'), lines: ['She fought hard against the Aquadome closing. I found an old magazine interview.', 'Quote: "I built a secret into that dome that only the stars know about."', 'Spooky, right?', 'N: Spooky, and useful. She\'s telling people where to look.'] },
    { id: 'boathouse', q: 'Why would a boathouse have a brand new padlock?', when: () => has('v_terrace'), lines: ['Uh, because somebody doesn\'t want anyone in the boathouse?', 'N: Brilliant, Remy. Truly. Look up who owned the Aquadome\'s boats before it closed.', 'On it. That might take a while.', 'N: That\'s fine. It\'s not this case.'] },
  ],
  celeste: () => [{ id: 'why', q: 'Why me, honestly?', when: () => S.phase === 'd1', lines: ['Because of Mae. My sister. She still talks about the girl who worked out who was cutting maps out of the library\'s atlases, three weeks before the police would have.', 'And because the police mean a report, a report means the papers, and the papers mean no gala. A private investigator would be spotted in an hour, with a podcaster staying under my roof.', 'Nobody looks twice at a sixteen-year-old intern. That\'s the whole idea.', 'N: People should look twice at me. But I see the strategy.'] },
    { id: 'update', q: 'Just checking in.', lines: () => S.phase === 'd1' ? ['Nova. Any progress? The gala is on Saturday and I haven\'t slept.', 'N: Progress is my whole personality. Give me a day.'] : S.phase === 'n1' ? ['You\'re up too? That singing again. I\'m starting to believe in ghosts.', 'N: Don\'t. It\'s a speaker. I\'ll prove it.'] : S.phase === 'g' ? ['It\'s gala day and the crown is back. I could kiss you. I won\'t, I\'m your client.', 'N: Hold that thought. Something about the crown isn\'t finished.'] : S.phase === 'd2' ? ['Day two. The press arrives tomorrow. Please tell me you\'re close.', 'N: I\'m close. I\'m always close. Today I\'m closer.'] : ['Be careful down there, Nova.'] }],
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
  opal: () => [has('met_opal') && 'Designed the Aquadome in 2002. Wears a long lavender coat.', has('gus_key') && 'Has the only key to the planetarium Service door.', has('rashad_saw') && 'Came up at 12:20 with something heavy in her pocket.', has('opal_pin') && 'Got flustered when I showed her the brass pin.', has('pin_known') && 'The brass pins went to the 2003 build crew. Opal\'s is missing.', has('memo_read') && 'Celeste plans to turn Opal\'s planetarium into a VIP lounge after the gala.', has('dex_confess') && 'Knew the MAINT-0 code.', has('drawer_open') && 'Kept a key and a secret blueprint: the Star Room at the end of the service tunnel.'],
  regent: () => [has('met_regent') && 'Favourite to win the Starfall Revue. Wants the crown more than anyone, and wears a long white coat.', has('regent_clear') && 'CLEARED: Harper Vance recorded an interview with Regent in the spa lounge from 11:40 to 12:10.'],
  silas: () => [has('met_silas') && 'Paranormal web show host, filming uninvited.', has('tape_seen') && 'His Tuesday tape: a long coat and a white flashlight crossing the lobby at 11:52.'],
  jojo: () => [has('met_jojo') && 'Juniper\'s nephew. Wants a roller disco in the planetarium.', has('nate_alibis') && 'CLEARED: skating on the terrace all night (Ranger Begay).', has('jojo_door') && 'Heard a heavy door "under the floor" around 12:15.'],
  priya: () => [has('met_priya') && 'Astronomer, here to remove the star projector. Came here as a child.', has('priya_red') && 'Uses a red torch at night. The midnight light was white.', has('nate_alibis') && 'CLEARED: on the dock with Ranger Begay at midnight.'],
  kenji: () => [has('met_kenji') && 'Conservator restoring Stella, a 1925 singing automaton.', has('repair_seen') && 'Monday log: at his bench 13:30 to 15:00. The keypad log says the case was open 13:36 to 14:51, by him.', has('stella_open') && 'Swapped the star for a replica: the Star\'s Tear, sold from his family in 1946. It was hidden in Stella.', has('kenji_money') && 'The meteorite is worth a fortune, and nobody has tried to sell it. The thief didn\'t want money.'],
  rashad: () => [has('met_rashad') && 'Bellhop, 17, reads too many mysteries. Grandson of Marcus Okafor from the 2003 build crew.', has('rashad_saw') && 'Saw Opal come up at 12:20, coat buttoned, one pocket heavy.', has('okafor_seen') && 'His grandfather\'s notebook describes the Star Room door.'],
  gus: () => [has('met_gus') && 'Caretaker for nine years. Has every key.', has('gus_key') && 'Except the planetarium Service door: Opal has the only key.', has('boathouse_ask') && 'Won\'t say why the boathouse has a new padlock. Not this case.'],
  harper: () => [has('met_harper') && 'True-crime podcaster ("Lakeshore Unsolved").', has('harper_alibi') && 'Her recording has a heavy metal groan at 11:57. Something under the building.'],
  nate: () => [has('met_nate') && 'Lake warden from the state park.', has('nate_alibis') && 'Alibis Priya and Jojo. Saw a white light heading for the planetarium.', 'Has seen lights in the boathouse at 2am. Future business.'],
};

export function openNotebook(tab = 'tasks') {
  const TABS = [['tasks', 'Tasks'], ['sus', 'People'], ['docs', 'Documents'], ['items', 'Items'], ['pc', `Postcards ${pcCount()}/${POSTCARDS.length}`]];
  const body = panel(`<div class="nb"><div class="nb-tabs">${TABS.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div class="nb-page"></div></div>`, { cls: 'nb-p', title: 'Nova\'s Case Notebook' });
  const page = body.querySelector('.nb-page');
  const show = k => {
    body.querySelectorAll('.nb-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === k));
    if (k === 'tasks') {
      page.innerHTML = `<h3>${PHASE_NAME[S.phase]}</h3><ul class="tasks">${taskList().map(t => `<li class="${t.d ? 'done' : ''}">${t.t}</li>`).join('')}</ul>${junior() ? '<p class="hint">Stuck? Call Dot on your phone.</p>' : ''}`;
    } else if (k === 'sus') {
      const card = w => `<div class="sus" data-w="${w}">${portrait(w)}<div><b>${PEOPLE[w].n}</b><ul>${NOTES[w]().filter(Boolean).map(n => `<li>${n}</li>`).join('')}</ul></div></div>`;
      const main = SUSPECTS.filter(w => has('met_' + w)), rest = OTHERS.filter(w => has('met_' + w));
      page.innerHTML = (main.length ? '<h3>Suspects</h3>' + main.map(card).join('') : '') + (rest.length ? '<h3>Also at the Aquadome</h3>' + rest.map(card).join('') : '') || '<p class="empty">You haven\'t met anyone yet.</p>';
      page.querySelectorAll('.sus .pt').forEach(p => p.onclick = () => { const w = p.closest('.sus').dataset.w; panel(`<div class="fullart"><img src="assets/art/${w}.webp" alt="" onerror="this.parentNode.innerHTML='<p class=empty>No picture yet.</p>'"></div><button class="btn" id="nbback">Back to notebook</button>`, { cls: 'doc', title: PEOPLE[w].n }).querySelector('#nbback').onclick = () => openNotebook('sus'); });
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
      await think(['So this is the Aquadome. Nine years closed, and it still smells like chlorine and old money.', 'As far as anyone here knows, I\'m Celeste\'s summer intern. People say all sorts of things in front of the intern.', 'Marble floors, brass everywhere, and dust on the chandelier. Whoever cleaned for the relaunch skipped everything you have to look up to see. People always do.', 'The display case should be here in the lobby. Crime scenes don\'t investigate themselves.']);
    };
}
