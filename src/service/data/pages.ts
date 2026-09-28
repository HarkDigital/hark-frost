// Copied verbatim from the classic 2026 site (site-v2/src/data/servicePages.ts): the
// service pages. Frost renders its own page per service (src/service/*); `scene` and
// `relatedTags` are unused here.

export interface ServicePageData {
  slug: string
  num: string
  title: string
  scene: 'dataflow' | 'blueprint' | 'commerce' | 'radar' | 'velocity' | 'neural' | 'aerial' | 'glitch' | 'shield' | 'focus' | 'blocks' | 'sift' | 'network'
  headline: string
  /** part of the headline rendered in the signal color */
  headlineAccent?: string
  lede: string
  features: { title: string; text: string }[]
  process: { title: string; text: string }[]
  stat: { value: string; label: string }
  /** matches tags in work.ts to surface related projects */
  relatedTags: string[]
  quote?: { text: string; name: string; company: string }
  cta: string
}

export const SERVICE_PAGES: ServicePageData[] = [
  {
    slug: 'software-development',
    num: '01',
    title: 'Software Development',
    scene: 'dataflow',
    headline: 'Off-the-shelf never quite',
    headlineAccent: 'fits.',
    lede: 'We build custom CRMs and business software shaped around how your company actually works. Your leads, jobs, and customers tracked your way, portals your clients log into, dashboards that tell the truth, none of it rented from a vendor who thinks you should work their way.',
    features: [
      {
        title: 'Custom CRMs',
        text: 'Leads, customers, jobs, and follow-ups in a system shaped around your exact pipeline, not a bloated per-seat subscription you use ten percent of. Your stages, your fields, your reports, in your language. No license fees that grow with headcount, and no bending your process to fit someone else’s software.',
      },
      {
        title: 'Client & customer portals',
        text: 'Give your customers a place to log in, pay invoices, upload files, and track progress, branded, secure, and yours. Fewer “just checking in” phone calls, fewer emailed attachments, and a business that looks as organized as it actually is. Your customers get answers at midnight without anyone picking up a phone.',
      },
      {
        title: 'Dashboards & data management',
        text: 'Collect it once, see it clearly. We wire your data sources into dashboards that answer the questions you actually ask: what sold, what’s stuck, who owes what, and what needs attention today. One honest picture instead of six exports and a pivot table, current the moment you open it.',
      },
      {
        title: 'Integrations & automation',
        text: 'Your CRM, your accounting, your website, all talking to each other, with the repetitive busywork automated away. Data entered once shows up everywhere it belongs. Invoices generate themselves, follow-ups fire on schedule, and the double-entry chores your team quietly hates simply stop existing.',
      },
    ],
    process: [
      { title: 'Listen', text: 'We map how work actually flows through your business, not how the org chart says it does.' },
      { title: 'Prototype', text: 'A clickable model in weeks, not months. You react to something real before we build the real thing.' },
      { title: 'Build', text: 'Short cycles, working software at every step. No year-long black box.' },
      { title: 'Support', text: 'We stay after launch, updates, tweaks, and the next idea when you’re ready.' },
    ],
    stat: { value: '10 years', label: 'Of custom software for real businesses. Portals, dashboards, and integrations since 2016.' },
    relatedTags: ['Software'],
    quote: {
      text: 'We needed a stand-alone payment portal for our fast-growing business. Mike built it on time, on budget, trained us, and followed up to make sure everything ran smooth.',
      name: 'Pete Rose',
      company: 'The Home Hero',
    },
    cta: 'Still running your customer list out of spreadsheets? That’s a custom CRM waiting to happen.',
  },
  {
    slug: 'web-design',
    num: '02',
    title: 'Web Design',
    scene: 'blueprint',
    headline: 'Beautiful. Functional.',
    headlineAccent: 'Yours.',
    lede: 'Your website is your hardest-working employee, it never sleeps and never calls out. We design sites that look incredible, load fast, and turn visitors into customers on every device.',
    features: [
      {
        title: 'Design that converts',
        text: 'Pretty is table stakes. Every layout decision points visitors toward the thing you want them to do next, call, book, buy, or ask. We design the path as carefully as the pixels, so the site doesn’t just get admired, it produces. A beautiful site that doesn’t convert is an expensive brochure.',
      },
      {
        title: 'Easy to update',
        text: 'You own your content. We build on a CMS you can actually use, and we train you before we hand over the keys. Change your hours, post a photo, swap a price, without calling a developer or filing a ticket. And if you’d rather never touch it, we handle the updates for you.',
      },
      {
        title: 'Responsive by default',
        text: 'Phone, tablet, ultrawide monitor, one site that feels made for every screen, because it is. More than half your visitors arrive on a phone, so we design for thumbs first, test on real devices, and make sure menus, forms, and checkout feel effortless at every size.',
      },
      {
        title: 'Built to be found',
        text: 'Clean structure, fast load times, and SEO fundamentals baked in from day one, not bolted on after. Search engines read a site much the way screen readers do, so semantic markup does double duty. You launch with the technical foundation already earning rankings instead of retrofitting it later.',
      },
    ],
    process: [
      { title: 'Listen', text: 'Your goals, your customers, your voice. The site has to sound like you, hark means listen, and we do.' },
      { title: 'Design', text: 'Concepts you can react to, refined together until it feels right.' },
      { title: 'Build', text: 'Modern frameworks, accessible markup, and speed as a feature.' },
      { title: 'Launch & teach', text: 'We go live, then teach your team to run it. Support doesn’t end at launch.' },
    ],
    stat: { value: '15', label: 'Live sites in the portfolio right now, from dentists to global manufacturers' },
    relatedTags: ['Web Design'],
    quote: {
      text: 'Mike has exceptional technical ability but at his core he is an artist. He brilliantly created a clean, concise and modern website that has significantly bolstered our business.',
      name: 'Andrew Fabbri',
      company: 'Fabbri Builders',
    },
    cta: 'Embarrassed by your current site? Let’s fix that.',
  },
  {
    slug: 'ecommerce',
    num: '03',
    title: 'Ecommerce',
    scene: 'commerce',
    headline: 'Open 24/7. Even when',
    headlineAccent: 'you’re not.',
    lede: 'From a thousand-product catalog to a single "pay invoice" button, we build stores that are secure, fast, and easy to run, with the analytics to see what’s selling and why.',
    features: [
      {
        title: 'Stores of any size',
        text: 'Selling three products or three thousand, the store fits the catalog, not the other way around. Variations, bundles, digital goods, subscriptions, whatever your inventory actually looks like, structured right the first time, so adding product number 3,001 is a five-minute job instead of a project.',
      },
      {
        title: 'Payment portals',
        text: 'Service businesses deserve online payments too. Deposits, invoices, and recurring billing without the phone tag. Send a link, get paid, and let the books reconcile themselves. Your customers pay at midnight from the couch, and you stop trading voicemails about a credit card number.',
      },
      {
        title: 'Secure by default',
        text: 'SSL, hardened checkout, and payment processors that never let card numbers touch your server, PCI compliance handled by architecture instead of paperwork. Your customers’ trust is the whole business, so we build checkout like it matters, because one breach costs more than everything it ever processed.',
      },
      {
        title: 'Analytics & insight',
        text: 'Track sales and trends, spot your best sellers, and make decisions from data instead of gut feel. Which products earn, which pages leak customers, where the next marketing dollar belongs. The store is constantly telling you what works, you just need to be set up to hear it.',
      },
    ],
    process: [
      { title: 'Listen', text: 'What you sell, who buys it, and where the friction is today.' },
      { title: 'Plan the catalog', text: 'Products, variations, shipping, tax, structured right the first time.' },
      { title: 'Build & connect', text: 'Store, payments, shipping, and your back office, all talking to each other.' },
      { title: 'Grow', text: 'Conversion tuning, seasonal campaigns, and the numbers to prove what worked.' },
    ],
    stat: { value: '$1M+', label: 'Flows through client stores we built, every single year' },
    relatedTags: ['Ecommerce'],
    quote: {
      text: 'Mike helped launch a successful holiday season campaign that brought us record number sales.',
      name: 'Holly Kisby',
      company: "Shriver's Salt Water Taffy",
    },
    cta: 'Your products are good. Let’s make buying them easy.',
  },
  {
    slug: 'seo-geo',
    num: '04',
    title: 'SEO / GEO',
    scene: 'radar',
    headline: 'Be the',
    headlineAccent: 'answer.',
    lede: 'Search engine optimization gets you found by people. Generative engine optimization gets you cited by AI. Your next customer is asking a question right now, we make sure you’re the answer, in Google and in ChatGPT.',
    features: [
      {
        title: 'Technical SEO',
        text: 'Speed, structure, and clean markup, the foundation search engines reward and visitors feel. Crawlability, schema, canonical tags, Core Web Vitals, the unglamorous plumbing that decides whether your content gets ranked or ignored. No amount of blogging outruns a technically broken site.',
      },
      {
        title: 'Local SEO',
        text: 'Own your map pin. For Philadelphia businesses, showing up in "near me" searches is the whole game. We tune your Google Business Profile, keep your citations consistent, and structure pages around the neighborhoods you serve, so the customer three blocks away finds you instead of your competitor.',
      },
      {
        title: 'Content strategy',
        text: 'Pages that answer real questions your customers actually type, written for humans, structured for machines. No keyword-stuffed filler, no five-hundred-word posts about nothing. A publishing rhythm you can sustain, mapped to real queries, because one genuinely useful page outranks ten pieces of content-shaped noise.',
      },
      {
        title: 'GEO & AI discoverability',
        text: 'AI assistants are the new front page. We structure your expertise so they quote you, not your competitor. Clear claims, structured data, and citable answers that ChatGPT, Gemini, and AI Overviews can lift verbatim. When your customers ask a machine, the machine should answer with you.',
      },
    ],
    process: [
      { title: 'Audit', text: 'Where you rank, why you don’t, and what AI currently says about you. Eye-opening, usually.' },
      { title: 'Fix the foundation', text: 'Technical issues first, no amount of content outruns a slow, broken site.' },
      { title: 'Publish with purpose', text: 'Content mapped to real queries, shipped on a schedule you can sustain.' },
      { title: 'Measure & compound', text: 'Rankings, traffic, citations. SEO is compound interest, we keep it compounding.' },
    ],
    stat: { value: 'Page 1', label: 'Is where customers stop looking. Everything else is a participation trophy.' },
    relatedTags: ['SEO'],
    cta: 'Google yourself. If you didn’t like what you saw, talk to us.',
  },
  {
    slug: 'page-speed',
    num: '05',
    title: 'Page Speed',
    scene: 'velocity',
    headline: 'Slow is the new',
    headlineAccent: 'broken.',
    lede: 'A slow site loses customers before it can say hello. We find what is dragging you down, fix it, and turn those red PageSpeed and GTmetrix scores green, with load times measured in milliseconds instead of seconds.',
    features: [
      {
        title: 'Core Web Vitals',
        text: 'LCP, INP, and CLS are Google ranking factors. We get all three into the green so search rewards your site instead of burying it. That means measuring real field data, not just lab runs, and fixing the layout shifts and slow renders your actual visitors feel on actual connections.',
      },
      {
        title: 'PageSpeed & GTmetrix',
        text: 'We chase the exact issues those tools flag, oversized images, heavy scripts, render-blocking code, missing caching, until the numbers turn green and stay there. And you get the before-and-after scores in writing, so the improvement isn’t a feeling, it’s a receipt.',
      },
      {
        title: 'Fast on real phones',
        text: 'Lab scores are easy; a cheap Android on cell data is the real test. We optimize for the visitor you are actually losing, not just your fast laptop. Images sized for the screen that loads them, scripts deferred until they matter, and a first paint that lands before patience runs out.',
      },
      {
        title: 'Speed that lasts',
        text: 'Sites rot as plugins and content pile up. We set up caching, compression, a CDN, and monitoring so it stays fast long after we leave. And we leave notes, so the next plugin someone installs doesn’t quietly undo three seconds of hard-won speed.',
      },
    ],
    process: [
      { title: 'Measure', text: 'A real audit across PageSpeed, GTmetrix, and field data, so we fix what actually costs you, not what merely looks scary.' },
      { title: 'Fix the heavy hitters', text: 'Bloated images, oversized scripts, render-blocking CSS, and slow hosting, tackled in order of impact.' },
      { title: 'Tune & cache', text: 'Compression, lazy-loading, a CDN, and smart caching so repeat visits feel instant.' },
      { title: 'Verify', text: 'We re-test on real devices and hand you the before-and-after scores in writing.' },
    ],
    stat: { value: '32%', label: 'More likely a visitor bounces when mobile load time goes from one second to three' },
    relatedTags: ['SEO'],
    cta: 'Run your homepage through PageSpeed Insights. Not happy with the number? Let us fix it.',
  },
  {
    slug: 'ai-consulting',
    num: '06',
    title: 'AI Consulting',
    scene: 'sift',
    headline: 'AI without the',
    headlineAccent: 'snake oil.',
    lede: 'Every vendor is suddenly an AI company. We help you cut through it, finding the places where AI genuinely saves your business time and money, wiring it into your workflow, and skipping the hype entirely.',
    features: [
      {
        title: 'Opportunity audit',
        text: 'We map your workflows and show you exactly where AI helps, and where it honestly doesn’t. Plain English, no buzzwords. You get a short list ranked by payoff: what to automate now, what to watch, and what to ignore no matter how loud the vendor pitch gets.',
      },
      {
        title: 'Custom AI tools',
        text: 'Assistants trained on your documents, quote generators, intake bots, built for your business, not rented from a demo. Your data stays yours, the tool speaks your language, and it plugs into the systems you already run instead of becoming another tab nobody opens.',
      },
      {
        title: 'Workflow automation',
        text: 'Connect AI to the tools you already use so the paperwork writes itself while you sleep. Follow-up emails drafted, documents summarized, data moved between systems without retyping. The measure isn’t cleverness, it’s hours: if it doesn’t give your week time back, we don’t build it.',
      },
      {
        title: 'AI-ready presence',
        text: 'Paired with our GEO work: make sure AI assistants describe your business accurately, and recommend you. When a customer asks ChatGPT who to call, the answer comes from how clearly your site states what you do, where, and for whom. We make that answer yours.',
      },
    ],
    process: [
      { title: 'Audit', text: 'A short, honest look at your operations. You get a map of what’s worth automating and what isn’t.' },
      { title: 'Pilot', text: 'One small, measurable win first. If it doesn’t save time or money, we stop there.' },
      { title: 'Integrate', text: 'The pilot graduates into your real workflow, connected, secured, and documented.' },
      { title: 'Train your team', text: 'Your people learn to drive it. AI that only the consultant understands is a liability.' },
    ],
    stat: { value: 'Hours', label: 'Returned to your week. The only AI metric that matters.' },
    relatedTags: ['Software'],
    cta: 'Curious what AI could actually do for your business? Ask us for the honest version.',
  },
  {
    slug: 'aerial-media',
    num: '07',
    title: 'Aerial Photography & Video',
    scene: 'aerial',
    headline: 'Your business, from',
    headlineAccent: '400 feet.',
    lede: 'Mike is an FAA Part 107 licensed remote pilot, legal, insured, professional drone work. Cinematic aerials that sell listings faster, keep job sites honest, and stop the scroll on any feed.',
    features: [
      {
        title: 'Real estate',
        text: 'Listings with aerial photos sell faster. Show the property, the lot, and the neighborhood in one frame. Buyers scroll past flat photos they’ve seen a hundred times; a clean aerial tells the whole story in one image, acreage, privacy, position, before they ever read the description.',
      },
      {
        title: 'Construction progress',
        text: 'Weekly flyovers turn "how’s the site coming?" into a photo timeline your clients and lenders love. Same angle, same altitude, every week, an honest visual record for draw requests, marketing, and the inevitable conversation about what was done when. The site documents itself.',
      },
      {
        title: 'Inspections',
        text: 'Roofs, towers, and gutters without ladders or lifts. High-resolution imagery, zero risk. Find the cracked flashing or the clogged gutter in minutes instead of renting a lift or putting a person on a wet roof. Same-day images, zoomable down to the shingle.',
      },
      {
        title: 'Cinematic production',
        text: '4K aerial video for brand films, events, and action sports, footage that makes people stop scrolling. Planned shot lists, smooth camera moves, and color-graded delivery cut for where it will live. The difference between a drone clip and a cinematic one is the pilot, not the drone.',
      },
    ],
    process: [
      { title: 'Scout & clear', text: 'Airspace checks, permissions, and weather windows, handled before flight day.' },
      { title: 'Fly', text: 'Licensed, insured, and planned shot lists. Professional in the air and on the ground.' },
      { title: 'Edit', text: 'Color-graded photo and video, cut for where it will live, web, social, or the big screen.' },
      { title: 'Deliver', text: 'Web-ready files sized for your site and socials, with full-resolution masters included.' },
    ],
    stat: { value: 'Part 107', label: 'FAA licensed and insured. Every flight legal, planned, and professional.' },
    relatedTags: ['Photography'],
    cta: 'See your business the way birds do.',
  },
  {
    slug: 'hack-remediation',
    num: '08',
    title: 'Hack Remediation',
    scene: 'glitch',
    headline: 'Breathe. Then',
    headlineAccent: 'call us.',
    lede: 'Defaced homepage, spam redirects, Google’s red warning screen, a hacked site feels like a break-in. We find the breach, remove the infection, restore your site, and lock the door on the way out.',
    features: [
      {
        title: 'Emergency response',
        text: 'Fast triage to contain the damage. Every hour a hacked site stays up costs you trust and traffic. We isolate the infection, get a holding page up if needed, and start the cleanup the same day you call, because attackers don’t keep business hours and neither does your reputation.',
      },
      {
        title: 'Malware removal',
        text: 'We find every backdoor, injected script, and rogue admin account, and the hole they came through. Surface cleanups get reinfected within days; we clean the file system and the database, then close the entry point, so the same door doesn’t swing open again next month.',
      },
      {
        title: 'Blocklist removal',
        text: 'We clear the "this site may be hacked" warnings from Google Safe Browsing and get your reputation back. Search warnings and email blacklists linger long after the malware is gone unless someone files the reviews and proves the cleanup. We handle that paperwork until every warning drops.',
      },
      {
        title: 'Post-breach hardening',
        text: 'The cleanup ends with a locked door: patched software, tightened permissions, and monitoring in place. Most sites get hacked through known holes in outdated software, so we close them, rotate every credential, and leave a watchman behind. Getting hacked twice is a choice.',
      },
    ],
    process: [
      { title: 'Triage', text: 'Assess the damage, contain the spread, and preserve the evidence.' },
      { title: 'Clean', text: 'Remove the infection completely, not just the visible symptoms.' },
      { title: 'Restore', text: 'Back online, blocklists cleared, customers none the wiser.' },
      { title: 'Harden', text: 'Close the hole it came through and watch the door so it never happens twice.' },
    ],
    stat: { value: 'Now', label: 'Is when a hacked site needs attention. Every hour online costs trust and traffic.' },
    relatedTags: ['Security'],
    quote: {
      text: 'Very excited to have worked with Mike to get our website totally fixed after a disaster experience with TWO other developers. In one month, he turned around a website that fits our needs.',
      name: 'Barbara Barber',
      company: 'CrossFit Off The Grid',
    },
    cta: 'Hacked right now? Skip the form. Email mike@hark.digital with "EMERGENCY" in the subject.',
  },
  {
    slug: 'security',
    num: '09',
    title: 'Website & Data Security',
    scene: 'shield',
    headline: 'The best hack is the one that',
    headlineAccent: 'never happens.',
    lede: 'Security isn’t a product, it’s a habit. We harden your website and the data behind it, updates, monitoring, backups, and SSL, handled before problems become headlines.',
    features: [
      {
        title: 'Hardening',
        text: 'Locked-down logins, least-privilege accounts, and a smaller attack surface from day one. Two-factor authentication, strong password policy, and admin access limited to the people who actually need it. Most attacks are bots trying door handles; we simply give them fewer handles to try.',
      },
      {
        title: 'Monitoring & alerts',
        text: 'Round-the-clock watch for file changes, suspicious logins, and downtime, with a human who responds. Not a dashboard nobody checks, an actual notification chain that ends with someone fixing the problem, usually before you or your customers notice anything happened at all.',
      },
      {
        title: 'Backups that restore',
        text: 'A backup you’ve never tested is a hope, not a plan. Ours restore, we rehearse it. Off-site copies on a schedule matched to how often your site changes, with restore drills, so the worst Tuesday of your year costs you an hour of content, not the whole site.',
      },
      {
        title: 'Updates & patching',
        text: 'Most breaches walk through known holes. We keep your software patched before attackers try the handle. Updates applied on a schedule, with backups first and testing after, so a patch never becomes its own outage. Boring, monthly, and the highest-value security habit there is.',
      },
    ],
    process: [
      { title: 'Assess', text: 'A plain-English security review of your site, hosting, and data handling.' },
      { title: 'Harden', text: 'Fix the weak points, access, software, configuration, and encryption.' },
      { title: 'Monitor', text: 'Continuous watch, because attackers don’t keep business hours.' },
      { title: 'Report', text: 'A monthly summary a business owner can actually read. No jargon, no scare tactics.' },
    ],
    stat: { value: '24/7', label: 'Monitoring with a human who responds. Attackers don’t keep business hours.' },
    relatedTags: ['Security'],
    cta: 'Sleep better. Put someone on watch.',
  },
  {
    slug: 'ada-accessibility',
    num: '10',
    title: 'ADA Accessibility',
    scene: 'focus',
    headline: 'Every visitor.',
    headlineAccent: 'No exceptions.',
    lede: 'One in four American adults lives with a disability, and courts treat your website like a storefront, ramps required. We audit, fix, and monitor your site to WCAG standards, so everyone can use it and demand letters find nothing.',
    features: [
      {
        title: 'Real WCAG audits',
        text: 'Automated scans catch maybe a third of the problems. We test the rest by hand, keyboard only, screen reader on, zoomed to 200%, mapped to WCAG 2.2. You get a plain-English report ranked by severity and legal exposure, not a wall of jargon from a browser plugin.',
      },
      {
        title: 'Fixes, not overlays',
        text: 'Accessibility widgets don’t make sites accessible, and plaintiffs’ lawyers know it. We fix the actual code: contrast, labels, structure, and focus. Real fixes hold up under real assistive technology, and they usually make the site faster and better-ranked as a side effect.',
      },
      {
        title: 'Demand-letter defense',
        text: 'Thousands of ADA website lawsuits are filed every year, and small businesses are the easy targets. Documented conformance makes yours a hard one. An audit trail, an accessibility statement, and a site that passes the scan a plaintiff’s firm runs first, the cheapest legal protection you can buy.',
      },
      {
        title: 'Accessible from day one',
        text: 'On new builds, accessibility is baked into the design and markup from the first wireframe, cheaper than retrofitting and better for SEO too. Palettes chosen for contrast, components that work by keyboard, forms that announce themselves properly. Done right, it’s invisible, just a site everyone can use.',
      },
    ],
    process: [
      { title: 'Audit', text: 'Automated scans plus real assistive-technology testing, returned as a plain-English list ranked by severity and legal risk.' },
      { title: 'Fix', text: 'We remediate the code itself, markup, contrast, labels, and focus order. No overlay widgets, no band-aids.' },
      { title: 'Verify', text: 'Re-tested the way real users actually browse: keyboard only, screen reader on, text enlarged, motion reduced.' },
      { title: 'Document & monitor', text: 'An accessibility statement, a conformance record, and monitoring so new content doesn’t quietly undo the work.' },
    ],
    stat: { value: '1 in 4', label: 'American adults live with a disability. Not an edge case, your audience.' },
    relatedTags: ['Web Design'],
    cta: 'Unplug your mouse and try to use your website. Stuck? Talk to us.',
  },
  {
    slug: 'wordpress',
    num: '11',
    title: 'WordPress',
    scene: 'blocks',
    headline: 'WordPress, without the',
    headlineAccent: 'headaches.',
    lede: 'WordPress runs over forty percent of the web, which means most of the slow, broken, hacked sites that land on our desk are WordPress too. After a decade inside it, we know exactly where it goes wrong, and how to make it boring, fast, and dependable.',
    features: [
      {
        title: 'Builds done right',
        text: 'Lean custom themes instead of a 40-plugin pileup. Fast, editable, and free of the page-builder bloat that slows everything down. You get the block editor for day-to-day changes and a codebase a future developer will thank us for, not a maze only we can maintain.',
      },
      {
        title: 'Plugin rescue',
        text: 'Conflicts, abandonware, and five plugins doing one job. We audit the pile, keep what earns its place, and replace the rest. Every plugin is code you didn’t write running on your server, so fewer, better ones mean fewer updates, fewer conflicts, and fewer 2 a.m. surprises.',
      },
      {
        title: 'Speed & Core Web Vitals',
        text: 'WordPress can be genuinely fast. Caching, image optimization, database cleanup, and theme surgery until the scores go green. Most slow WordPress sites are carrying years of accumulated weight, and shedding it is usually the cheapest dramatic improvement a site can buy.',
      },
      {
        title: 'Hardening & care plans',
        text: 'Most hacked sites we clean are WordPress running old plugins. Updates, backups, and monitoring, handled monthly so it never gets there. A care plan costs a fraction of a single emergency rescue, which is exactly the point: boring maintenance is how disasters stay hypothetical.',
      },
    ],
    process: [
      { title: 'Audit', text: 'Theme, plugins, hosting, and database, reviewed and returned as a plain-English report of what’s hurting you.' },
      { title: 'Stabilize', text: 'Updates applied, backups running, security holes closed, the bleeding stops before the tuning starts.' },
      { title: 'Fix & speed up', text: 'Plugin cleanup, theme fixes, and performance work, or an honest recommendation to rebuild when rescue costs more.' },
      { title: 'Care plan', text: 'Monthly updates, monitoring, and small fixes so the site stays fast and patched without you thinking about it.' },
    ],
    stat: { value: '43%', label: 'Of the web runs on WordPress. Its problems are common, so are the fixes.' },
    relatedTags: ['Web Design'],
    cta: 'White screen? Weird redirects? Admin slower than dial-up? Tell us what WordPress is doing to you.',
  },
]
