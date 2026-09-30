// Inventory items (with little SVG icons) and documents.
export const ITEMS = {
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
      <p>Your reputation reached me through a friend of a friend, and frankly I have run out of people to ask.</p>
      <p>On Saturday the Aquadome reopens after nine years with a gala headlined by <b>Vesper Vox</b>. The centrepiece was to be the <b>Prism Crown</b>, a chrome crown set with a real meteorite star, worn by whoever wins the Starfall Revue.</p>
      <p>On Tuesday night it vanished from its locked case in the lobby. The case wasn't forced.</p>
      <p>There have been other things too: lights in the empty planetarium, and a voice singing over speakers that nobody switched on. My staff say the dome is haunted. I say someone wants this reopening to fail.</p>
      <p>Please find the crown quietly. If this reaches the papers, the gala is finished.</p>
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
    html: `<div class="paper mono"><p>DISPLAY CASE 01 · ACCESS LOG</p><p>TUE 09:14  DHALLOWAY  open  (polish)</p><p>TUE 09:20  DHALLOWAY  close</p><p><b>TUE 23:52  MAINT-0    open</b></p><p><b>TUE 23:58  MAINT-0    close</b></p><p>—</p><p>MAINT-0 = legacy master code (2003 build team). Note from Dex: "I thought we deleted this??"</p></div>`,
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
