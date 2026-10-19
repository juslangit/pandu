#!/usr/bin/env node
// Builds the Pandu showcase site into public/.
//
//   node tools/build.mjs
//
// 1. Minifies src/pandu.{css,js} into dist/ with esbuild and records gzipped sizes.
// 2. Renders every page: site/pages/**.html (hand-written) plus the data pages below,
//    each wrapped in one layout with the nav partial. The current page's link gets
//    aria-current="page" here, the way a server template would do it.
// 3. Copies site/static/ and dist/ into public/.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const SITE = join(ROOT, 'site');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------- 1. dist ----------
mkdirSync(join(ROOT, 'dist'), { recursive: true });
cpSync(join(ROOT, 'src/pandu.css'), join(ROOT, 'dist/pandu.css'));
cpSync(join(ROOT, 'src/pandu.js'), join(ROOT, 'dist/pandu.js'));
const esbuild = existsSync(join(ROOT, 'node_modules/.bin/esbuild')) ? join(ROOT, 'node_modules/.bin/esbuild') : null;
if (!esbuild) { console.error('esbuild missing: run `npm install` first'); process.exit(1); }
execFileSync(esbuild, ['src/pandu.js', '--minify', '--target=es2017', '--legal-comments=inline', '--outfile=dist/pandu.min.js', '--log-level=warning'], { cwd: ROOT });
execFileSync(esbuild, ['src/pandu.css', '--minify', '--legal-comments=inline', '--outfile=dist/pandu.min.css', '--log-level=warning'], { cwd: ROOT });
const sizes = {};
for (const f of ['pandu.css', 'pandu.js', 'pandu.min.css', 'pandu.min.js']) {
  const buf = readFileSync(join(ROOT, 'dist', f));
  sizes[f] = { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
}
writeFileSync(join(ROOT, 'dist/sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const SIZE = {
  css: kb(sizes['pandu.min.css'].gzip),
  js: kb(sizes['pandu.min.js'].gzip),
  total: kb(sizes['pandu.min.css'].gzip + sizes['pandu.min.js'].gzip),
  cssRaw: kb(sizes['pandu.min.css'].raw),
  jsRaw: kb(sizes['pandu.min.js'].raw),
};

// Test results recorded by hand after each test run (site/data/tests.json).
const TESTS = existsSync(join(SITE, 'data/tests.json')) ? JSON.parse(read('site/data/tests.json')) : { summary: 'Test results are recorded here after each run.', rows: [] };

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// A picture at the sizes made by tools/images (480, 960, 1600 wide).
const IMG = {
  'mossy-tree': [960, 1177], cave: [960, 720], limestone: [960, 639], tambun: [960, 343], 'mirror-lake': [960, 641],
  kinabalu: [960, 640], canopy: [960, 640], belum: [960, 641], 'misty-forest': [960, 662],
};
function img(name, alt, { sizes = '100vw', eager = false, cls = '' } = {}) {
  const [w, h] = IMG[name];
  const srcset = [480, 960, 1600].map((x) => `/img/${name}-${x}.webp ${x}w`).join(', ');
  return `<img${cls ? ` class="${cls}"` : ''} src="/img/${name}-960.webp" srcset="${srcset}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

// ---------- data ----------
const trips = [
  { slug: 'gua-tempurung', name: 'Gua Tempurung cave run', short: 'Gua Tempurung', where: 'Gopeng, Perak', length: 'Half day', kind: 'day', grade: 'Moderate', price: 95, start: '8:00 am', group: 8, photo: 'cave', alt: 'Lit stalactites and a walkway inside a large limestone cave',
    lead: 'One of the largest limestone caves in Peninsular Malaysia, twenty minutes south of Ipoh. We go past the end of the boardwalk and follow the river passage by headlamp.',
    plan: [['8:00 am', 'Meet at the cave car park in Gopeng, kit check, helmets and headlamps on.'], ['8:30 am', 'Dry section: the big chambers, flowstone and the upper walkway.'], ['9:45 am', 'Wet section: wading the underground river, waist deep in places.'], ['11:30 am', 'Out into daylight, rinse off, kopi and roti canai in Gopeng.']],
    incl: ['Helmet, headlamp and spare batteries', 'Cave entry fee', 'Guide ratio of one to four'], bring: ['Clothes you are happy to soak', 'Shoes with grip that can get wet', 'A full change of clothes for after'] },
  { slug: 'kinta-valley', name: 'Kinta Valley limestone loop', short: 'Kinta Valley', where: 'Ipoh, Perak', length: 'Day trip', kind: 'day', grade: 'Easy', price: 180, start: '6:30 am', group: 8, photo: 'mirror-lake', alt: 'Green limestone hills reflected in a still lake near Ipoh',
    lead: "A day on foot around Ipoh's karst hills: a quarry lake at first light, a short scramble to a viewpoint, a cave temple and lunch in the old town.",
    plan: [['6:30 am', 'Pick-up in Ipoh old town.'], ['7:00 am', 'Tasik Cermin at dawn, while the water is still.'], ['9:00 am', 'Short scramble to a limestone viewpoint over the valley.'], ['11:30 am', 'Cave temple visit, then lunch in the old town before the afternoon rain.']],
    incl: ['Transport around the valley', 'Lunch and one kopi', 'All entry fees'], bring: ['Walking shoes', 'A hat and two litres of water', 'Something to cover shoulders and knees for the temple'] },
  { slug: 'gunung-korbu', name: 'Gunung Korbu summit', short: 'Gunung Korbu', where: 'Ulu Kinta, Perak', length: '3 days', kind: 'overnight', grade: 'Hard', price: 850, start: '6:00 am', group: 6, photo: 'misty-forest', alt: 'Mist drifting between thin trees in a high cloud forest',
    lead: 'At 2,183 metres, Korbu is the second highest peak in Peninsular Malaysia. Three long days on the Banjaran Titiwangsa, two nights in a jungle camp, one summit at dawn.',
    plan: [['Day 1', 'Trailhead at Ulu Kinta, river crossings and a steady climb to camp.'], ['Day 2', 'Summit push before sunrise, back to camp by early afternoon.'], ['Day 3', 'Descend to the trailhead and drive back to Ipoh by evening.']],
    incl: ['Forest entry permit and camping fees', 'Two guides and porters for group kit', 'All meals on the mountain'], bring: ['A pack of 40 litres or more', 'Sleeping bag rated to 10 °C', 'Leech socks and a rain shell'] },
  { slug: 'royal-belum', name: 'Royal Belum by boat', short: 'Royal Belum', where: 'Gerik, Perak', length: '2 days', kind: 'overnight', grade: 'Easy', price: 690, start: '7:00 am', group: 8, photo: 'belum', alt: 'Mist rising over rainforest above a still lake',
    lead: 'A boat across Temenggor Lake into the Royal Belum State Park, a night at a lakeside camp, and short walks to look for rafflesia when it is in bloom.',
    plan: [['Day 1', 'Drive to Pulau Banding, boat to camp, afternoon walk to a salt lick.'], ['Day 2', 'Dawn on the lake, rafflesia walk if in bloom, boat back by noon.']],
    incl: ['Park permit and boat', 'Tent, mat and all meals', 'Transport from Ipoh'], bring: ['Quick-dry clothes', 'A torch', 'Insect repellent'] },
  { slug: 'mossy-forest', name: 'Mossy Forest, Cameron Highlands', short: 'Mossy Forest', where: 'Brinchang, Pahang', length: 'Day trip', kind: 'day', grade: 'Moderate', price: 210, start: '6:30 am', group: 8, photo: 'mossy-tree', alt: 'A large moss-covered tree beside wooden steps in a cloud forest',
    lead: 'Cloud forest near Gunung Brinchang, where every branch wears moss and the air stays cool all day. A muddy trail, not just the boardwalk.',
    plan: [['6:30 am', 'Leave Ipoh for the highlands.'], ['8:30 am', 'Trail through the mossy forest towards Brinchang.'], ['12:00 pm', 'Lunch in Brinchang, tea estate stop on the way down.']],
    incl: ['Transport from Ipoh', 'Lunch', 'Rain ponchos'], bring: ['A warm layer', 'Boots that can take mud', 'A dry bag for your phone'] },
  { slug: 'taman-negara', name: 'Taman Negara canopy', short: 'Taman Negara', where: 'Kuala Tahan, Pahang', length: '3 days', kind: 'overnight', grade: 'Moderate', price: 980, start: '7:00 am', group: 8, photo: 'canopy', alt: 'A rope canopy walkway strung between tall rainforest trees',
    lead: 'Old-growth rainforest at Kuala Tahan: the canopy walkway, a night walk, a climb up Bukit Teresek and a river trip on the Sungai Tembeling.',
    plan: [['Day 1', 'Travel to Kuala Tahan, evening night walk.'], ['Day 2', 'Canopy walkway, Bukit Teresek, afternoon on the river.'], ['Day 3', 'Early birding walk, then home.']],
    incl: ['Park permits and camera fee', 'Two nights in a chalet', 'Breakfasts and dinners'], bring: ['Long sleeves for the night walk', 'Binoculars if you have them', 'Leech socks'] },
  { slug: 'kinabalu', name: 'Mount Kinabalu', short: 'Kinabalu', where: 'Kundasang, Sabah', length: '3 days', kind: 'overnight', grade: 'Hard', price: 2450, start: '7:30 am', group: 6, photo: 'kinabalu', alt: 'Mount Kinabalu above green foothills and morning cloud',
    lead: 'Low\'s Peak at 4,095 metres. We handle the Sabah Parks permit, the licensed mountain guide and the night at Laban Rata; you bring the legs.',
    plan: [['Day 1', 'Fly to Kota Kinabalu, drive to Kundasang, gear check.'], ['Day 2', 'Timpohon Gate to Laban Rata, early night.'], ['Day 3', 'Summit at dawn, descend, drive back to Kota Kinabalu.']],
    incl: ['Climbing permit, insurance and licensed guide', 'Laban Rata bed and meals', 'Transfers in Sabah'], bring: ['Gloves and a warm hat', 'A headlamp', 'Flights to Kota Kinabalu (not included)'] },
];
const rent = [
  { slug: 'shelter', name: 'Tents and shelter', lead: 'Light shelters we use on our own trips, pitched and checked after every rental.', photo: 'belum', alt: 'Rainforest above a lake where we camp',
    items: [['Two-person tent', 'Freestanding, 1.9 kg', 25], ['Hammock with tarp and bug net', 'Our jungle-camp setup', 18], ['Sleeping mat', 'Foam, closed cell', 6], ['Groundsheet', 'Cut to the two-person tent', 5]] },
  { slug: 'packs', name: 'Packs and dry bags', lead: 'Packs fitted to you at pick-up, and dry bags for anything that must stay dry in a cave or a boat.', photo: 'canopy', alt: 'A canopy walkway in the rainforest',
    items: [['45 litre pack', 'For day trips and one night', 15], ['65 litre pack', 'For Korbu and Taman Negara', 20], ['20 litre dry bag', 'Roll-top', 5], ['Waterproof phone pouch', 'With lanyard', 3]] },
  { slug: 'rain-and-cold', name: 'Rain and cold', lead: 'Perak rains most afternoons and the highlands are cold at night. These are the layers people forget.', photo: 'misty-forest', alt: 'Mist in a highland forest',
    items: [['Rain shell', 'Sizes S to XL', 10], ['Fleece jacket', 'For Brinchang and Kinabalu', 8], ['Gloves and beanie', 'Kinabalu summit set', 6], ['Leech socks', 'To keep, not to rent', 15]] },
];
const calendar = [
  ['Sat 7 Nov 2026', 'Kinta Valley limestone loop', '5 places left'], ['Sun 8 Nov 2026', 'Gua Tempurung cave run', '3 places left'],
  ['Fri 13 – Sun 15 Nov 2026', 'Gunung Korbu summit', '2 places left'], ['Sat 21 Nov 2026', 'Mossy Forest, Cameron Highlands', '6 places left'],
  ['Sat 28 – Sun 29 Nov 2026', 'Royal Belum by boat', '4 places left'], ['Fri 4 – Sun 6 Dec 2026', 'Taman Negara canopy', '8 places left'],
  ['Sat 12 Dec 2026', 'Kinta Valley limestone loop', '8 places left'], ['Thu 7 – Sat 9 Jan 2027', 'Mount Kinabalu', '6 places left'],
];

// ---------- page bodies ----------
const pages = [];
const add = (path, meta, body) => pages.push({ path, ...meta, body });

function head(title, lead, photo, alt, extra = '') {
  return `<section class="page-head">
  <div class="page-head__text">
    <h1 class="page-head__title">${title}</h1>
    <p class="page-head__lead">${lead}</p>
    ${extra}
  </div>
  <figure class="page-head__photo shutter">${img(photo, alt, { sizes: '(min-width: 60em) 58vw, 100vw', eager: true })}</figure>
</section>`;
}
const fmt = (n) => 'RM ' + n.toLocaleString('en-MY');

// Trips overview
add('/trips/', { title: 'Trips', description: 'Seven guided trips from Ipoh: caves, limestone hills, cloud forest and two big summits.' },
  head('Every trip we run', 'Seven trips, four of them in Perak. Each is led by two guides, capped at eight people and timed to finish before the afternoon rain.', 'limestone', 'A limestone hill above the trees near Ipoh') + `
<section class="page-body">
  <h2 class="section-title">This season</h2>
  <ul class="trip-index">
    ${trips.map((t) => `<li><a href="/trips/${t.slug}/">${img(t.photo, '', { sizes: '(min-width: 60em) 22vw, 40vw' })}<span class="trip-index__name">${t.name}</span><span class="trip-index__meta">${t.length} · ${t.grade} · from ${fmt(t.price)}</span></a></li>`).join('\n    ')}
  </ul>
</section>`);

for (const t of trips) {
  add(`/trips/${t.slug}/`, { title: t.name, description: t.lead },
    head(t.name, t.lead, t.photo, t.alt, `<a class="btn" href="/book/?trip=${t.slug}">Book this trip</a>`) + `
<section class="page-body two-col">
  <div>
    <h2 class="section-title">How the day runs</h2>
    <ol class="plan">${t.plan.map(([w, d]) => `<li><span class="plan__when">${w}</span><span>${d}</span></li>`).join('')}</ol>
  </div>
  <div>
    <dl class="facts">
      <div><dt>Where</dt><dd>${t.where}</dd></div>
      <div><dt>Length</dt><dd>${t.length}</dd></div>
      <div><dt>Grade</dt><dd><a href="/trips/grades/">${t.grade}</a></dd></div>
      <div><dt>Group</dt><dd>${t.group} at most</dd></div>
      <div><dt>Start</dt><dd>${t.start}</dd></div>
      <div><dt>Price</dt><dd>${fmt(t.price)} a person</dd></div>
    </dl>
    <h2 class="section-title section-title--sm">Included</h2>
    <ul class="ticks">${t.incl.map((x) => `<li>${x}</li>`).join('')}</ul>
    <h2 class="section-title section-title--sm">Bring</h2>
    <ul class="ticks">${t.bring.map((x) => `<li>${x}</li>`).join('')}</ul>
  </div>
</section>`);
}

add('/trips/calendar/', { title: 'Trip calendar', description: 'Upcoming Lereng trip dates and places left.' },
  head('Dates for the next three months', 'Group trips run on these dates. Places are held for 48 hours once you ask, so you have time to sort leave and lifts.', 'tambun', 'A row of limestone hills at Tambun near Ipoh') + `
<section class="page-body">
  <table class="table">
    <caption>Upcoming group trips (sample dates)</caption>
    <thead><tr><th scope="col">Date</th><th scope="col">Trip</th><th scope="col">Places</th></tr></thead>
    <tbody>${calendar.map(([d, n, p]) => `<tr><td>${d}</td><td>${n}</td><td>${p}</td></tr>`).join('')}</tbody>
  </table>
</section>`);

add('/trips/grades/', { title: 'How we grade a trip', description: 'What Easy, Moderate and Hard mean on a Lereng trip.' },
  head('What the grades mean', 'Three grades, judged on the hardest hour of the trip rather than the average. If you are unsure, ask and we will tell you honestly.', 'misty-forest', 'Mist between trees in a highland forest') + `
<section class="page-body grades">
  <div><h2 class="section-title">Easy</h2><p>Up to four hours of walking on good paths, short climbs, no scrambling. Fine for anyone who walks regularly.</p></div>
  <div><h2 class="section-title">Moderate</h2><p>Five to seven hours, muddy or wet ground, some use of hands. You should be comfortable on steep steps for an hour at a time.</p></div>
  <div><h2 class="section-title">Hard</h2><p>Long days with a loaded pack, more than 1,000 metres of climbing, early summit starts. Train for it for a month first.</p></div>
</section>`);

add('/trips/private-groups/', { title: 'Private groups', description: 'Book any Lereng trip for your own group, school or team.' },
  head('Your own group, your own dates', 'Any trip can run privately for two to sixteen people. Larger groups get a third guide, and we can start later if you have children with you.', 'canopy', 'A canopy walkway in the rainforest',
    '<a class="btn" href="/contact/">Ask about a private trip</a>') + `
<section class="page-body two-col">
  <div><h2 class="section-title">Who books them</h2><p>Families who want to go at their own pace, friends marking a birthday on a summit, and teams who would rather walk than sit in a meeting room.</p></div>
  <div><h2 class="section-title">How pricing works</h2><p>The group price is the per-person price for eight, split between however many of you come. A third guide is added at no charge above eight people.</p></div>
</section>`);

add('/rent/', { title: 'Rent gear', description: 'Rent tents, packs and rain gear in Ipoh for your own trips.' },
  head('Rent the kit we trust', 'Everything we carry on our own trips, for rent by the day from our store in Ipoh. Collect it the evening before, bring it back when you are home.', 'cave', 'Inside a limestone cave') + `
<section class="page-body">
  <ul class="rent-index">
    ${rent.map((r) => `<li><a href="/rent/${r.slug}/"><span class="rent-index__name">${r.name}</span><span class="rent-index__meta">${r.items.length} items · from ${fmt(Math.min(...r.items.map((i) => i[2])))} a day</span></a></li>`).join('\n    ')}
    <li><a href="/rent/how-it-works/"><span class="rent-index__name">How renting works</span><span class="rent-index__meta">Deposits, pick-up and returns</span></a></li>
  </ul>
</section>`);

for (const r of rent) {
  add(`/rent/${r.slug}/`, { title: r.name, description: r.lead },
    head(r.name, r.lead, r.photo, r.alt) + `
<section class="page-body">
  <table class="table">
    <caption>${r.name}: daily rates</caption>
    <thead><tr><th scope="col">Item</th><th scope="col">Notes</th><th scope="col" class="num">Per day</th></tr></thead>
    <tbody>${r.items.map(([n, d, p]) => `<tr><td>${n}</td><td>${d}</td><td class="num">${fmt(p)}</td></tr>`).join('')}</tbody>
  </table>
  <p class="note">Rates are sample prices for this demo site. <a href="/rent/how-it-works/">How renting works</a>.</p>
</section>`);
}

add('/rent/how-it-works/', { title: 'How renting works', description: 'Deposits, pick-up and returns for Lereng rental gear.' },
  head('Pick up the night before', 'Reserve by message, collect from the store in Ipoh after 5 pm, bring it back within a day of getting home. No cleaning needed; we do it.', 'tambun', 'Limestone hills at Tambun') + `
<section class="page-body">
  <ol class="steps">
    <li><h2 class="section-title section-title--sm">Reserve</h2><p>Message us the items and dates. We hold them for 48 hours.</p></li>
    <li><h2 class="section-title section-title--sm">Collect</h2><p>Pick up from 5 pm the day before you leave, with a refundable RM 100 deposit.</p></li>
    <li><h2 class="section-title section-title--sm">Return</h2><p>Bring it back within a day of finishing. Wet and muddy is fine; damage is charged at cost.</p></li>
  </ol>
</section>`);

add('/about/', { title: 'Our story', description: 'Lereng is a two-guide outfitter based in Ipoh, Perak.' },
  head('Named for the slope', 'Lereng is Malay for slope. We are a small outfit in Ipoh that takes people up the limestone and into the caves of the Kinta Valley, and a little further when they ask.', 'limestone', 'A limestone hill near Ipoh') + `
<section class="page-body two-col">
  <div><h2 class="section-title">Why we started</h2><p>The hills around Ipoh are some of the best walking in the country and most visitors only see them from the car. We wanted a way in that was small, unhurried and run by people who live under them.</p></div>
  <div><h2 class="section-title">How we work</h2><p>Two guides on every trip, eight people at most, an early start and a written turnaround time. We would rather come back with a story about the summit we skipped than one about the storm we walked into.</p></div>
</section>`);

add('/about/guides/', { title: 'Guides', description: 'Who leads Lereng trips and what training they hold.' },
  head('Who walks with you', 'Every guide holds a current wilderness first-aid certificate and the Perak forestry guide licence, and has walked each route at least ten times before leading it.', 'kinabalu', 'Mount Kinabalu above morning cloud') + `
<section class="page-body two-col">
  <div><h2 class="section-title">Lead guides</h2><p>Set the pace, carry the communicator, make the turnaround call. On cave trips the lead goes first through every wet section.</p></div>
  <div><h2 class="section-title">Second guides</h2><p>Walk at the back so nobody is ever last alone. They carry the group first-aid kit and the spare headlamps.</p></div>
</section>`);

add('/about/safety/', { title: 'Safety and permits', description: 'How Lereng handles permits, weather and emergencies.' },
  head('Permits and the turnaround', 'We apply for every permit ourselves: forest reserve entry through the Perak State Forestry Department, Taman Negara through PERHILITAN, and Kinabalu through Sabah Parks.', 'cave', 'A lit cave chamber') + `
<section class="page-body grades">
  <div><h2 class="section-title">Weather</h2><p>Thunderstorms build most afternoons. Trips start early, and cave trips are cancelled outright if heavy rain is forecast upstream.</p></div>
  <div><h2 class="section-title">Communication</h2><p>Each group carries a satellite messenger. Someone in Ipoh knows the route and the time we expect to be out.</p></div>
  <div><h2 class="section-title">First aid</h2><p>Both guides are trained and the kit is checked before every trip, including a splint and an emergency shelter.</p></div>
</section>`);

add('/journal/', { title: 'Journal', description: 'Notes from the trail: weather, caves and leeches.' },
  head('Notes from the trail', 'Short pieces about the things people ask us before their first trip.', 'mirror-lake', 'A lake among limestone hills') + `
<section class="page-body journal">
  <article id="three-oclock-sky"><p class="journal__date"><time datetime="2026-10-02">2 October 2026</time></p><h2 class="section-title">Reading the three o'clock sky</h2><p>The towers of cloud that build over the Titiwangsa range by early afternoon are why we start at half past six. When the tops go hard and white, the rain is about an hour away.</p></article>
  <article id="wet-cave-kit"><p class="journal__date"><time datetime="2026-09-14">14 September 2026</time></p><h2 class="section-title">What we pack for a wet cave</h2><p>Two lights each, a dry bag that rolls three times, and shoes you can drain. Cotton stays in the car: it is cold for hours once wet.</p></article>
  <article id="leeches"><p class="journal__date"><time datetime="2026-08-21">21 August 2026</time></p><h2 class="section-title">Leeches, honestly</h2><p>You will meet some. Leech socks over your trousers stop most of them, and the rest fall off on their own. They are a sign of a healthy forest.</p></article>
</section>`);

add('/contact/', { title: 'Contact', description: 'How to reach Lereng Outfitters in Ipoh.' },
  head('Ask us anything first', 'We answer every message within a day, usually in the evening once the guides are off the hill.', 'tambun', 'Limestone hills at Tambun',
    '<a class="btn" href="mailto:hello@lereng.example?subject=A%20question%20about%20a%20trip">Email hello@lereng.example</a>') + `
<section class="page-body two-col">
  <div><h2 class="section-title">Store hours</h2><p>Monday to Saturday, 5 pm to 9 pm, for gear pick-up and questions. Closed on Sundays and public holidays.</p></div>
  <div><h2 class="section-title">Where we are</h2><p>Ipoh old town, Perak. The full address is sent with your booking (this is a demo site, so there is no real store).</p></div>
</section>`);

add('/book/', { title: 'Book a trip', description: 'Ask for a place on a Lereng trip.' }, `
<section class="page-head page-head--form">
  <div class="page-head__text">
    <h1 class="page-head__title">Book a trip</h1>
    <p class="page-head__lead">Tell us the trip, the date and how many of you are coming. We reply within a day with the place held and how to pay.</p>
  </div>
  <form class="form" id="book-form" action="mailto:hello@lereng.example" method="post" enctype="text/plain">
    <div class="field"><label for="f-trip">Trip</label>
      <select id="f-trip" name="trip" autocomplete="off" required>${trips.map((t) => `<option value="${t.slug}">${t.name} (${fmt(t.price)})</option>`).join('')}</select></div>
    <div class="field"><label for="f-date">Date you would like</label><input id="f-date" name="date" type="date" autocomplete="off" required></div>
    <div class="field"><label for="f-people">How many people</label><input id="f-people" name="people" type="number" min="1" max="16" value="2" inputmode="numeric" autocomplete="off" required></div>
    <div class="field"><label for="f-name">Your name</label><input id="f-name" name="name" type="text" autocomplete="name" required></div>
    <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" spellcheck="false" required></div>
    <div class="field field--wide"><label for="f-notes">Anything we should know <span class="optional">(optional)</span></label><textarea id="f-notes" name="notes" rows="4" autocomplete="off"></textarea></div>
    <div class="field field--wide"><button class="btn" type="submit">Send the request</button><p class="note" id="book-status" role="status">This opens your email app with the details filled in. Nothing is sent from this demo site.</p></div>
  </form>
</section>`);

// Credits from assets/credits.json
const credits = JSON.parse(read('assets/credits.json'));
const creatorFix = { 'Gua Tempurung': 'Calvin Teo', 'Morning view of Mount Kinabalu in Malaysia, with its peak clearly visible': 'Anton Zelenov' };
add('/credits/', { title: 'Picture credits', description: 'Sources and licences for every photograph on this site.' }, `
<section class="page-head page-head--plain"><div class="page-head__text"><h1 class="page-head__title">Picture credits</h1>
<p class="page-head__lead">Every photograph on this site is a real picture of the places it names, found on Wikimedia Commons and used under its licence. They show the places, not Lereng's trips or guides. Pictures were cropped and resized; altered versions are shared under the same licence.</p></div></section>
<section class="page-body"><ul class="credits-list">${credits.map((c) => `<li><a href="${esc(c.page)}">${esc(c.title)}</a> by ${esc(creatorFix[c.title] || c.creator)}, <a href="${esc(c.licenseUrl)}">${esc(c.license)}</a>, via ${esc(c.via)}</li>`).join('')}</ul>
<p class="note">Type: Fraunces and Hanken Grotesk, both under the SIL Open Font License, served by Google Fonts.</p></section>`);

// Hand-written pages
function walk(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []; });
}
for (const file of walk(join(SITE, 'pages'))) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^<!--meta\s+([\s\S]*?)-->\s*/);
  const meta = m ? JSON.parse(m[1]) : {};
  let rel = '/' + relative(join(SITE, 'pages'), file).replace(/index\.html$/, '').replace(/\\/g, '/');
  if (rel.endsWith('.html')) rel = rel.replace(/\.html$/, '');
  pages.push({ path: meta.path || rel, ...meta, body: m ? src.slice(m[0].length) : src });
}

// ---------- layout ----------
const NAV = read('site/partials/nav.html');
const FOOTER = read('site/partials/footer.html');
function navFor(path) {
  // What a server template does: mark the link for this route as the current page.
  // The trigger becomes a button and the feature card repeats a link, so neither is marked.
  return NAV.replace(/<a((?: class="[^"]*")?) href="([^"]*)"/g, (s, cls, href) =>
    href === path && !/pandu__(trigger|feature)/.test(cls) ? s + ' aria-current="page"' : s);
}
function layout(p) {
  const title = p.path === '/' ? 'Lereng Outfitters · guided treks from Ipoh — a Pandu demo' : `${p.title} · Lereng Outfitters`;
  const body = p.body
    // {{CODE "label"}} raw code {{/CODE}} -> an escaped, copyable code block
    .replace(/\{\{CODE "([^"]*)"\}\}\n?([\s\S]*?)\{\{\/CODE\}\}/g, (_, label, code) =>
      `<div class="code"><pre data-copy="${esc(label)}" tabindex="0" aria-label="${esc(label)}"><code>${esc(code.replace(/\s+$/, ''))}</code></pre></div>`)
    .replaceAll('{{TEST_SUMMARY}}', TESTS.summary).replaceAll('{{TEST_ROWS}}', TESTS.rows.map((r) => `          <tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n'))
    .replaceAll('{{SIZE_CSS}}', SIZE.css).replaceAll('{{SIZE_JS}}', SIZE.js).replaceAll('{{SIZE_TOTAL}}', SIZE.total)
    .replaceAll('{{SIZE_CSS_RAW}}', SIZE.cssRaw).replaceAll('{{SIZE_JS_RAW}}', SIZE.jsRaw)
    .replace(/\{\{IMG ([\w-]+) "([^"]*)"(?: sizes="([^"]*)")?( eager)?\}\}/g, (_, n, alt, sizes, eager) => img(n, alt, { sizes: sizes || '100vw', eager: !!eager }));
  return `<!doctype html>
<html lang="en-MY">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.description || '')}">
<meta name="theme-color" content="#f7f1e8">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.description || '')}">
<meta property="og:image" content="https://pandu-nav.pages.dev/img/og.png">
<meta property="og:type" content="website">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Hanken+Grotesk:wght@400;600&display=swap">
<link rel="stylesheet" href="/dist/pandu.min.css">
<link rel="stylesheet" href="/css/site.css">
<script src="/dist/pandu.min.js" defer></script>
<script src="/js/site.js" defer></script>
</head>
<body class="${p.bodyClass || ''}">
<a class="skip-link" href="#main">Skip to content</a>
<aside class="demo-strip" aria-label="About this site"><p><span class="demo-strip__lead">Lereng is a made-up outfitter. </span>The menu below is <a href="/pandu/" translate="no">Pandu</a>, the product on show: try it with your keyboard. <a href="/pandu/before-after/">See before and after</a></p></aside>
${navFor(p.path)}
<main id="main" tabindex="-1">
${body}
</main>
${FOOTER}
</body>
</html>
`;
}

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(SITE, 'static'), OUT, { recursive: true });
cpSync(join(ROOT, 'dist'), join(OUT, 'dist'), { recursive: true });
for (const p of pages) {
  const html = layout(p);
  const file = p.path === '/404' ? join(OUT, '404.html') : join(OUT, p.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}
console.log(`Built ${pages.length} pages into public/ · pandu.min.css ${SIZE.css} gz · pandu.min.js ${SIZE.js} gz`);
