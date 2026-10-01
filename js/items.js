// Inventory items (with little SVG icons) and documents.
export const ITEMS = {
  magnet: {
    n: 'Speaker magnet', d: 'A heavy round magnet from one of Dex\'s old speakers. It nearly took a filing cabinet with it.',
    svg: '<circle cx="32" cy="32" r="20" fill="#3a3a44" stroke="#15151a" stroke-width="3"/><circle cx="32" cy="32" r="9" fill="#9aa0aa"/><path d="M22 14l4 6M42 14l-4 6" stroke="#ff4a4a" stroke-width="4" stroke-linecap="round"/>',
  },
  realstar: {
    n: 'The Star\'s Tear', d: 'The real meteorite: dark iron full of green olivine crystals, heavy as a fishing sinker. It snaps to the magnet.',
    svg: '<path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8 16.8 52.8l2.9-16.9L7.4 23.9l17-2.5z" fill="#3c3a34" stroke="#1c1a16" stroke-width="3" stroke-linejoin="round"/><g fill="#9adb6a"><circle cx="28" cy="26" r="3"/><circle cx="37" cy="31" r="2.5"/><circle cx="30" cy="37" r="2.2"/><circle cx="24" cy="33" r="1.6"/></g>',
  },
  pin: {
    n: 'Brass star pin', d: 'A small brass five-point star with "AQ 03" stamped on the back. Found under the display case.',
    svg: '<path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8 16.8 52.8l2.9-16.9L7.4 23.9l17-2.5z" fill="#ffc95c" stroke="#b07a1e" stroke-width="3" stroke-linejoin="round"/>',
  },
  holocard: {
    n: 'Hologram card', d: 'A glowing memory card: "GHOST OF THE DOME — test v3 — D.H."',
    svg: '<rect x="10" y="16" width="44" height="32" rx="5" fill="#7fe8ff" stroke="#1aa6d9" stroke-width="3"/><path d="M20 26h24M20 34h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  },
  sketch: {
    n: 'Opal\'s star sketch', d: 'Five stars joined in a cross. A tall line of three, crossed by a wider line through the second star. "Opening night, 2003."',
    svg: '<rect x="8" y="10" width="48" height="44" rx="4" fill="#fbf7ea" stroke="#9aa" stroke-width="2"/><path d="M32 16v32M16 28h32" stroke="#3050a0" stroke-width="3"/><g fill="#3050a0"><circle cx="32" cy="16" r="3.5"/><circle cx="32" cy="28" r="3.5"/><circle cx="32" cy="48" r="3.5"/><circle cx="16" cy="28" r="3.5"/><circle cx="48" cy="28" r="3.5"/></g>',
  },
  key: {
    n: 'Service key', d: 'An old brass key on a star-shaped tag: "SERVICE — PLANETARIUM".',
    svg: '<circle cx="20" cy="32" r="11" fill="none" stroke="#ffc95c" stroke-width="6"/><path d="M31 32h26M49 32v9M41 32v6" stroke="#ffc95c" stroke-width="6" stroke-linecap="round"/>',
  },
  blueprint: {
    n: 'Star Room blueprint', d: 'Opal\'s original plans. A hidden round room at the end of the service tunnel, behind a door marked with three rings.',
    svg: '<rect x="6" y="12" width="52" height="40" rx="4" fill="#1f4f9e"/><circle cx="32" cy="32" r="12" fill="none" stroke="#e8f4ff" stroke-width="2.5"/><path d="M10 32h10M44 32h10" stroke="#e8f4ff" stroke-width="2.5"/>',
  },
};

export function icon(id) {
  return `<svg viewBox="0 0 64 64">${ITEMS[id].svg}</svg>`;
}

// Documents open in a panel; `read` sets a flag when opened.
export const DOCS = {
  letter: {
    t: 'Letter from Celeste Arden',
    html: `<div class="paper letter">
      <p class="lh">THE AQUADOME · Lakeshore Spa &amp; Planetarium</p>
      <p>Dear Miss Vale,</p>
      <p>My sister Mae runs the Lakeshore Public Library. Last spring she told me about a sixteen-year-old who worked out who had been cutting maps from the rare atlases, weeks before the police would have, without a word of it reaching the paper. I have thought about that a great deal this week.</p>
      <p>On Saturday the Aquadome reopens after nine years with a gala headlined by <b>Vesper Vox</b>. The centrepiece was to be the <b>Prism Crown</b>, a silver crown set with a real meteorite star, worn by whoever wins the Starfall Revue.</p>
      <p>On Tuesday night it vanished from its locked case in the lobby. The case wasn't forced.</p>
      <p>There have been other things too: lights in the empty planetarium, and a voice singing over speakers that nobody switched on. My staff say the dome is haunted. I say someone wants this reopening to fail.</p>
      <p>I can't call the police: a report is public record, and my sponsors and insurer would hear about it within the hour. I can't hire an investigator either. There is a true-crime podcaster staying in the building, and she would spot one from the car park.</p>
      <p>Nobody looks twice at a teenager helping out for the summer. I have told the staff and guests that you are my new intern for the relaunch. Your room is ready in the Guest Wing. Please find the crown before Saturday, quietly.</p>
      <p class="sig">Celeste Arden<br><small>Owner</small></p></div>`,
  },
  plaque: {
    t: 'Brass plaque',
    html: `<div class="paper brass"><p class="big">THE AQUADOME</p><p>Opened to the public<br><b>June 21, 2003</b></p><p>"A sky you can swim under."</p><p class="small">Designed by O. Finch</p></div>`,
  },
  guestbook: {
    t: 'Guest book',
    html: `<div class="paper lined"><p class="hand">Tue — Vesper Vox + entourage (Spa Suite). NO photos!!</p><p class="hand">Tue — Miss Cherry Pop (Suite 4) "ready to SERVE" ♥</p><p class="hand">Tue — Juniper Reyes, kitchen, 6am start</p><p class="hand">Tue — O. Finch, restoration consultant (archive key)</p><p class="hand">Wed — Nova Vale (Suite 2)</p></div>`,
  },
  sticky: {
    t: 'Sticky note',
    html: `<div class="paper sticky"><p class="hand big">pw = my little buddy + the year we opened ;)</p><p class="hand">DO NOT write the actual password here Dex</p></div>`,
  },
  catphoto: {
    t: 'Photo frame',
    html: `<div class="paper photo"><div class="cat"><svg viewBox="0 0 120 100"><rect width="120" height="100" fill="#bfe8ff"/><ellipse cx="60" cy="66" rx="34" ry="28" fill="#f0a040"/><path d="M32 52l6-26 16 20M88 52l-6-26-16 20" fill="#f0a040"/><rect x="47" y="60" width="5" height="6" fill="#222"/><rect x="68" y="60" width="5" height="6" fill="#222"/></svg></div><p class="hand big">my best buddy PIXEL ♥</p></div>`,
  },
  lyrics: {
    t: 'Lyric sheet: "Starfall"',
    html: `<div class="paper lined lyrics">
      <p class="hand"><b>STARFALL</b> — final gala version (V.V.)</p>
      <p>Lights fall down like silver rain,</p>
      <p>In the glass I call your name,</p>
      <p>Past the stars and past the blue,</p>
      <p>Spinning, spinning back to you.</p>
      <p>Your heart's a comet, bright and fast,</p>
      <p>Nothing shining ever lasts,</p>
      <p>Catch me, catch me, one last spark.</p>
      <p class="hand small">(first letters in gold — don't forget!!)</p></div>`,
  },
  recipeboard: {
    t: 'Recipe board',
    html: `<div class="paper card"><p class="hand big">Starfall Cake (Nana Reyes)</p><ul><li>2 eggs</li><li>1 cup butter</li><li>1 cup milk</li><li>½ cup honey</li><li>2 cups flour · 1 cup sugar</li><li>zest of 1 lemon</li></ul><p class="hand">Bake 50 min. For the gala: MAKE IT VEGAN (Vesper's rider!)</p></div>`,
  },
  opalnote: {
    t: 'Handwritten note',
    html: `<div class="paper sticky"><p class="hand big">The stars remember where I left them.</p></div>`,
  },
  log: {
    t: 'Display case access log',
    html: `<div class="paper mono"><p>DISPLAY CASE 01 · ACCESS LOG</p><p>TUE 09:14  DHALLOWAY  open  (polish)</p><p>TUE 09:20  DHALLOWAY  close</p><p>MON 13:36  KMORIMOTO  open  (insurance appraisal)</p><p>MON 14:51  KMORIMOTO  close</p><p><b>TUE 23:52  MAINT-0    open</b></p><p><b>TUE 23:58  MAINT-0    close</b></p><p>—</p><p>MAINT-0 = legacy master code (2003 build team). Note from Dex: "I thought we deleted this??"</p></div>`,
  },
  mail_holo: {
    t: 'Email: Dex to Dex',
    html: `<div class="paper mono"><p>From: dex@aquadome.net<br>To: dex@aquadome.net<br>Subject: GHOST TEST TUES 11PM</p><p>projector + speakers, planetarium only. v3 of the voice. DO NOT tell Celeste until it looks good.</p></div>`,
  },
  mail_vesper: {
    t: 'Email: to Vesper Vox',
    html: `<div class="paper mono"><p>From: mgmt@voxworld.com<br>To: vesper@voxworld.com<br>Subject: saturday</p><p>V — the backup track is loaded for Saturday. Don't worry. No one will know. Rest that voice.</p></div>`,
  },
  memo: {
    t: 'Memo: relaunch plans',
    html: `<div class="paper mono"><p>From: celeste@aquadome.net<br>Subject: FINAL relaunch plans</p><p>After the gala the planetarium will be converted into a VIP lounge. The projector goes to storage. Opal has been told.</p></div>`,
  },
  blueprint: {
    t: 'Star Room blueprint',
    html: `<div class="paper blue"><p>AQUADOME · SERVICE LEVEL · O.F. 2002 · PRIVATE</p>
      <svg viewBox="0 0 300 150"><g fill="none" stroke="#e8f4ff" stroke-width="2"><circle cx="50" cy="75" r="40"/><path d="M90 70h140M90 80h140"/><circle cx="262" cy="75" r="30"/></g>
      <text x="50" y="80" fill="#e8f4ff" font-size="11" text-anchor="middle">PLANETARIUM</text><text x="160" y="64" fill="#e8f4ff" font-size="10" text-anchor="middle">SERVICE TUNNEL</text><text x="262" y="120" fill="#ffd98a" font-size="11" text-anchor="middle">STAR ROOM</text></svg>
      <p>DOOR: three rings. Read from the outside in:</p>
      <p class="big">outer: ringed planet · middle: moon · inner: comet</p></div>`,
  },
};

// ---------- Lore: the crew photo, a newspaper clipping, and the postcards ----------
DOCS.crewphoto = {
  t: 'Photograph: the build crew',
  html: `<div class="paper photo"><div class="cat"><svg viewBox="0 0 320 200"><rect width="320" height="200" fill="#b8a888"/><rect x="8" y="8" width="304" height="184" fill="#a8987a"/>
    <path d="M40 170 A120 120 0 0 1 280 170" fill="none" stroke="#4a3e2e" stroke-width="3"/>${[0, 1, 2, 3, 4, 5].map(i => `<line x1="160" y1="50" x2="${60 + i * 40}" y2="170" stroke="#4a3e2e" stroke-width="2"/>`).join('')}
    ${[0, 1, 2, 3].map(i => `<g><circle cx="${70 + i * 60}" cy="112" r="12" fill="#3a2e22"/><rect x="${56 + i * 60}" y="124" width="28" height="56" fill="#3a2e22"/><circle cx="${63 + i * 60}" cy="134" r="3.5" fill="#e0c070"/></g>`).join('')}</svg></div>
    <p class="hand">Aquadome build crew, 21 June 2003.</p><p>Left to right: M. Okafor, R. Dunn, T. Beale and O. Finch (lead designer). Every one of them wears the same small brass star pin on the lapel.</p></div>`,
};
DOCS.clipping = {
  t: 'Newspaper clipping, June 2003',
  html: `<div class="paper news"><p class="mast">THE LAKESHORE LEDGER</p><p class="dateline">Sunday, June 22, 2003 · 50 cents</p>
    <p class="head">"A SKY YOU CAN SWIM UNDER": AQUADOME OPENS</p>
    <p>Hundreds of guests crowded the lakeshore last night for the opening of the Aquadome, a glass-domed spa and planetarium designed by architect Opal Finch.</p>
    <p>The evening ended in the planetarium, where the lights dimmed and five stars appeared over the stage in the shape of a cross. "That one's for the crew," Finch said.</p>
    <p>Each member of Finch's four-person build team was presented with a brass star pin. Asked about rumours of a hidden room, Finch only smiled: "Every building has one room its builders keep for themselves."</p></div>`,
};
const PC = [
  ['The Rotunda Lobby', 'Mum, the fountain actually glows at night. Had tea under the dome. The architect gave us a tour herself, a tiny lady who knew every single bolt by name. Priya, July 2003'],
  ['The Spa & Pools', 'Floated for an hour. The girl on the next lounger swore she heard singing in the pipes. Probably the steam. Probably. J., 2005'],
  ['The Kitchen Café', 'Best lemon cake of my life. The chef wouldn\'t give up the recipe. Said it was her Nana\'s and her Nana would haunt her. Aunt Ro, 2006'],
  ['Staff Only!', 'To whoever runs the tech office after me: the old PA board is wired in the wrong order. I labelled it anyway. The labels will wear off. Sorry. M., maintenance, 2004'],
  ['Opening Night, June 21, 2003', 'O. You did it. Five stars in a cross, right over the stage, exactly like you drew it. Meet us downstairs after, in the room nobody else knows about. The crew'],
  ['The Guest Wing', 'Suite 4 has the best view of the lake. Suite 2 has the worst bed in the building. Tell nobody. A regular, 2010'],
  ['The Lakeside Terrace', 'Rowed the Solstice out to the middle of the lake at midnight. The dome glows like a lantern from out there. The boathouse keeper chased us off. Worth it. K & L, 2008'],
  ['The Planetarium', 'Last show before they closed. Six of us in the seats. The old lady in the lavender coat stayed after the lights came up and just... looked. 2017'],
];
PC.forEach(([title, msg], i) => {
  DOCS['pc' + (i + 1)] = {
    t: `Postcard ${i + 1}: ${title}`,
    html: `<div class="postcard"><div class="pc-front"><svg viewBox="0 0 300 180"><defs><linearGradient id="pcg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8c8a0"/><stop offset="1" stop-color="#8a7a58"/></linearGradient></defs>
      <rect width="300" height="180" fill="url(#pcg${i})"/><path d="M40 170 A110 110 0 0 1 260 170" fill="none" stroke="#4a3a24" stroke-width="3"/>
      ${[0, 1, 2, 3, 4].map(k => `<line x1="150" y1="62" x2="${70 + k * 40}" y2="170" stroke="#4a3a24" stroke-width="1.5"/>`).join('')}
      <text x="150" y="36" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="18" fill="#3a2a18">Greetings from the Aquadome</text>
      <text x="150" y="58" text-anchor="middle" font-family="Georgia" font-size="12" fill="#3a2a18">${title}</text></svg></div>
      <div class="pc-back"><p class="hand">${msg}</p><span class="stamp">AQ</span></div></div>`,
  };
});

DOCS.tape = {
  t: 'Static Hour: Tuesday\'s tape',
  html: `<div class="paper photo"><div class="vhs"><svg viewBox="0 0 320 220"><rect width="320" height="220" fill="#101418"/>
    <ellipse cx="160" cy="140" rx="120" ry="30" fill="#1a2228"/><circle cx="160" cy="120" r="34" fill="#20282e"/>
    <g fill="#3a4448"><rect x="232" y="60" width="16" height="110"/><rect x="72" y="60" width="16" height="110"/></g>
    <g><ellipse cx="206" cy="88" rx="9" ry="10" fill="#0a0c0e"/><path d="M194 98 L218 98 L224 172 L188 172 Z" fill="#0a0c0e"/><circle cx="222" cy="120" r="4" fill="#f0f0e0"/><path d="M226 120 L262 110 L262 130 Z" fill="rgba(240,240,220,.35)"/></g>
    <text x="16" y="28" font-family="monospace" font-size="16" fill="#f0f0f0">REC ●</text><text x="200" y="28" font-family="monospace" font-size="14" fill="#f0f0f0">TUE 11:52PM</text>
    <text x="16" y="206" font-family="monospace" font-size="12" fill="#f0f0f0">LOBBY CAM 2 · SP</text>
    ${Array.from({ length: 22 }, (_, i) => `<rect x="0" y="${i * 10}" width="320" height="1" fill="rgba(255,255,255,.05)"/>`).join('')}</svg></div>
    <p class="hand">Silas: "THE GREY LADY. Crossing the lobby toward the planetarium at 11:52. Note the ghostly light."</p>
    <p>Nova's note: long coat. Ordinary white flashlight. Walking, not floating.</p></div>`,
};
DOCS.okafor = {
  t: 'Marcus Okafor\'s notebook',
  html: `<div class="paper lined"><p class="hand">June 21 '03 - opening night!!</p>
    <p class="hand">After the show, the four of us went down to O's secret room. The Star Room. Nobody else knows it's there.</p>
    <p class="hand">The door has three rings. O says you set them "from the outside in, like the solar system": the planet with the ring, then the moon, then the comet.</p>
    <p class="hand">Toasted with ginger beer. Best night of my life. - M.O.</p>
    <svg viewBox="0 0 200 60" style="width:60%"><g fill="none" stroke="#3a3a6a" stroke-width="2"><circle cx="30" cy="30" r="12"/><ellipse cx="30" cy="30" rx="22" ry="6"/><path d="M95 18 a13 13 0 1 0 0 26 a10 10 0 1 1 0 -26z"/><circle cx="162" cy="24" r="7"/><path d="M156 28 L140 44 M160 31 L146 48"/></g></svg></div>`,
};

DOCS.appraisal = {
  t: 'Insurance appraisal: the Prism Crown',
  html: `<div class="paper mono"><p>LAKESHORE MUTUAL · FINE ARTS SCHEDULE</p><p>Item: "Prism Crown" (gala prize). Silver-plated band, 5-point star mount.</p>
    <p>Stone: pallasite meteorite (stony-iron). Olivine crystals in iron-nickel matrix. Mass 41.2 g.</p>
    <p>Tests, MON 13:40: <b>magnetic response: STRONG.</b> Olivine fluoresces faint green under loupe light.</p>
    <p>Appraised value: $38,000 (stone) · $400 (band).</p><p>Appraiser: K. Morimoto, conservator. Signed and dated.</p>
    <p class="hand">Nova: so the star was real at 13:40 on Monday. Good to know exactly when it stopped being.</p></div>`,
};
DOCS.repairlog = {
  t: 'Kenji\'s repair log (Monday)',
  html: `<div class="paper lined"><p class="hand">MON</p><p class="hand">09:10–12:30  Stella: cylinder pins, cleaned and re-seated (all 30)</p>
    <p class="hand">12:30–13:30  lunch (Juniper's lemon bread, outstanding)</p><p class="hand"><b>13:30–15:00  Stella: left hand, first finger, reglued</b></p>
    <p class="hand">15:00–17:15  Stella: bellows leather, patched</p><p class="hand">Notes: Stella's song card returned to the bench drawer.</p></div>`,
};
DOCS.waltzcard = {
  t: 'Stella\'s song card',
  html: `<div class="paper"><p class="lh">STELLA · 1925 · Melody for the cylinder</p><p style="font-size:1.3em;text-align:center;letter-spacing:.08em"><b>Mi · Sol · Sol &nbsp;|&nbsp; Fa · Re · Re</b></p>
    <p class="small" style="text-align:center">"Three to a bar, like a heartbeat that's learned to dance."</p><p class="hand">(Pencilled in the corner: "C = do. Stella sings in C.")</p></div>`,
};
DOCS.kenjiletter = {
  t: 'A letter folded behind the star',
  html: `<div class="paper lined"><p class="hand">For whoever finds this, if it isn't me.</p>
    <p class="hand">In 1938 a stone fell through the roof of my great-grandmother's barn in Nagano. The family called it Hoshi no Namida: the Star's Tear. They kept it on the household shrine for eight years.</p>
    <p class="hand">In 1946, with nothing to eat, my grandmother sold it to a dealer for a sack of rice. She never forgot the date, or the man's name. It went from collection to collection. In 2003 it went into a crown.</p>
    <p class="hand">On Monday I held it under my loupe and saw the three crystals she described, in a triangle, like a little face. I made a replica that night. On Tuesday morning I swapped them.</p>
    <p class="hand">I meant to tell Celeste after the gala. I know how that sounds. — K. M.</p></div>`,
};
