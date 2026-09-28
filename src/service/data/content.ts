// Copied verbatim from the classic 2026 site (site-v2/src/data/serviceContent.ts): the
// long-form article and FAQs under each service page.

// Long-form service content for SEO (search engines) and GEO (AI answer
// engines). Written to be quotable: definitional sentences, concrete
// specifics, and questions phrased the way people actually search.

export interface ArticleBlock {
  heading: string
  paragraphs: string[]
}

export interface Faq {
  q: string
  a: string
}

export interface ServiceContent {
  metaDescription: string
  article: ArticleBlock[]
  faqs: Faq[]
}

export const SERVICE_CONTENT: Record<string, ServiceContent> = {
  'software-development': {
    metaDescription:
      'Custom CRM development in Philadelphia, plus client portals, dashboards, and integrations, built around how your business actually works. Hark Digital, est. 2016.',
    article: [
      {
        heading: 'What a custom CRM actually gets you',
        paragraphs: [
          'A CRM is where your business keeps its relationships: every lead, customer, job, quote, and follow-up. The big subscription CRMs assume your business works like everyone else’s, then charge per seat, per month, forever, for a system where most of the buttons are for somebody else. A custom CRM flips that: your pipeline stages, your fields, your reports, your language, with nothing you don’t use. Around it we build the rest of the toolkit, portals where customers log in and get things done, dashboards that pull scattered data into one honest picture, and integrations that make your existing tools talk to each other.',
          'Hark Digital has been building CRMs and business software for Philadelphia companies since 2016, for trucking firms, medical practices, manufacturers, real estate companies, and nonprofits. The pattern is almost always the same: the customer list lives in a spreadsheet being emailed around, follow-ups live in someone’s head, and answering “where does this job stand?” takes three phone calls. That is exactly where a custom CRM pays for itself.',
        ],
      },
      {
        heading: 'When a custom CRM beats the big subscriptions (and when it doesn’t)',
        paragraphs: [
          'The name-brand CRMs win when your sales process is generic and your team is big enough to absorb the per-seat pricing. A custom CRM wins when the workflow is the business: the way you quote jobs, schedule crews, intake patients, or track freight. If you have ever bent your process to fit a subscription tool, or you are paying every month for features nobody opens, that gap is where custom software starts earning. And unlike a subscription, you own it: no per-seat math, no rate hikes, no losing your data when you cancel.',
          'We tell clients honestly when they do not need us. Sometimes the right answer is a $30-a-month tool configured well, and we will say so. When custom is the right answer, we keep scope small and shippable: a working prototype in weeks, then short build cycles you can see. No year-long black boxes, no invoices for vaporware.',
        ],
      },
    ],
    faqs: [
      {
        q: 'How much does a custom CRM cost?',
        a: 'Less than most people expect once you do the subscription math. A focused CRM for a small team typically costs about what two or three years of per-seat licenses would, except it fits your workflow exactly and you own it outright, no monthly bill that scales with headcount. We scope in phases, so you get a working first version early and decide how far to go.',
      },
      {
        q: 'How long does it take to build a custom CRM?',
        a: 'A focused CRM usually ships a usable first version in weeks, not months: a clickable prototype first, then short build cycles you can see. Bigger systems with portals and integrations ship in phases, and your team starts using the early version while we build the rest.',
      },
      {
        q: 'Can you migrate our data from spreadsheets, HubSpot, or Salesforce?',
        a: 'Yes. Most custom CRM projects start with a migration, out of a tangle of spreadsheets or out of a subscription CRM that never quite fit. We map your existing data into the new structure, clean it up on the way, and run both systems side by side until you trust the new one.',
      },
      {
        q: 'Can you connect the software we already use?',
        a: 'Yes, integrations are most of our software work. We connect accounting systems, payment processors, email, shipping tools, and websites so data entered once shows up everywhere it should. If a tool has an API (most modern tools do), we can usually integrate it.',
      },
      {
        q: 'Do we own the software you build?',
        a: 'Yes. You own the code, the data, and the accounts. We document what we build and hand over access. If we ever part ways, you are not held hostage, any competent developer can pick up where we left off.',
      },
      {
        q: 'Do you support the software after launch?',
        a: 'Yes. We stay after launch for updates, fixes, and the next idea. Most clients keep a small ongoing arrangement; others call us when something changes. Either way, launch is the start of the relationship, not the end.',
      },
    ],
  },

  'web-design': {
    metaDescription:
      'Web design in Philadelphia and beyond, beautiful, functional websites that load fast, rank well, and turn visitors into customers. 15 live projects, from dentists to global manufacturers.',
    article: [
      {
        heading: 'What makes a business website actually work',
        paragraphs: [
          'A working business website does three jobs: it looks credible in the first three seconds, it answers the visitor’s question in the first thirty, and it makes the next step (call, book, buy, ask) impossible to miss. Design that ignores any of those jobs is decoration, not design.',
          'Hark Digital has designed and built websites for medical practices, manufacturers, real estate brokerages, restaurants, contractors, wineries, and nonprofits across Philadelphia and beyond, fifteen of them live in our portfolio right now. Every one is responsive, editable by its owner, and built with search visibility in the foundation rather than sprinkled on top.',
        ],
      },
      {
        heading: 'Redesigns: when to burn it down and when to renovate',
        paragraphs: [
          'Most businesses come to us with an existing site that is slow, dated, impossible to edit, or invisible on Google. The instinct is always a full rebuild, but the honest answer depends on the foundation. A structurally sound site with dated clothes can sometimes be renovated for a fraction of the cost. A site built on a fragile page-builder stack, hacked plugins, or an abandoned platform is usually cheaper to rebuild than to rescue.',
          'Either way, a redesign with us never means losing what already works. We map your existing pages and rankings before touching anything, preserve the URLs search engines already know (or redirect them properly), and launch without dropping the traffic you spent years earning. Then we train your team so the new site stays fresh without calling a developer for every typo.',
        ],
      },
    ],
    faqs: [
      {
        q: 'How much does a website cost in Philadelphia?',
        a: 'A professional small-business site typically runs from the low-to-mid four figures, depending on size and features. Ecommerce, portals, and custom functionality add to that. We quote a flat project price after a short conversation, no surprise hourly billing.',
      },
      {
        q: 'How long does a website redesign take?',
        a: 'Most sites launch in four to eight weeks from kickoff. The biggest variable is content, when photos and copy come together quickly, launches come faster. Complex sites with ecommerce or custom features run longer, and we set that expectation upfront.',
      },
      {
        q: 'Will I be able to update the website myself?',
        a: 'Yes. We build on content management systems you can actually use, and we train you before handover. Change text, swap photos, add pages, without calling us. We stay available for the bigger stuff.',
      },
      {
        q: 'Will my website work on phones?',
        a: 'Yes, more than half of most local businesses’ traffic is mobile, so we design phone-first. Every site we ship is responsive: one site that adapts to phones, tablets, laptops, and ultrawide monitors.',
      },
      {
        q: 'Do you write the content or do we?',
        a: 'Either. Some clients hand us finished copy; most want help. We can write, edit, or restructure your content, and because we also do SEO and GEO, the words are chosen to rank and to be quoted by AI assistants, not just to fill space.',
      },
      {
        q: 'Will I lose my Google rankings if I redesign?',
        a: 'Not if the migration is done right. We inventory your existing URLs and rankings first, preserve or properly redirect every page that earns traffic, and verify search health after launch. Rankings drop when redesigns ignore this, it is preventable.',
      },
    ],
  },

  ecommerce: {
    metaDescription:
      'Ecommerce development for Philadelphia businesses, online stores, payment portals, and the analytics to grow. Our clients process over $1M annually through stores we built.',
    article: [
      {
        heading: 'Ecommerce is more than a shopping cart',
        paragraphs: [
          'An ecommerce site is a store, a cash register, a bookkeeper, and a salesperson that works around the clock. Done right, it does not just take orders, it shows you which products earn, which pages leak customers, and where your next dollar of marketing should go. Our clients process more than one million dollars a year through stores we built and maintain.',
          'We build stores at both ends of the spectrum: full catalogs with hundreds of products, variations, shipping rules, and tax handling, and tiny, single-purpose payment portals that let a service business take deposits or invoice payments online without phone tag. The right size is the one that fits how you actually sell.',
        ],
      },
      {
        heading: 'Security and trust are the whole game',
        paragraphs: [
          'Nobody types a card number into a site they do not trust. Every store we build runs on SSL, uses established payment processors (so card numbers never touch your server), and keeps software patched, the unglamorous work that prevents the horror stories. Because we also do security and hack remediation, we build stores the way a locksmith builds a door.',
          'Trust is also design: clear prices, honest shipping costs shown early, readable return policies, and a checkout that does not ask for more than it needs. Most abandoned carts are not lost sales, they are unanswered questions. We design checkouts that answer them before they are asked.',
        ],
      },
    ],
    faqs: [
      {
        q: 'What ecommerce platform should a small business use?',
        a: 'It depends on what you sell. Established platforms like WooCommerce and Shopify cover most catalogs; service businesses often need only a payment portal, not a full store. We recommend the lightest platform that fits, and we will tell you honestly which one that is.',
      },
      {
        q: 'Can customers pay invoices through my website?',
        a: 'Yes. We build payment portals for service businesses, deposits, invoices, and recurring billing, connected to processors like Stripe or Square. One client calls it “the end of check-chasing.” It is usually a small, fast project.',
      },
      {
        q: 'How do you handle shipping and sales tax?',
        a: 'We configure real-time carrier rates or flat-rate rules to match how you actually ship, and automated sales tax calculation for the states where you owe it. Both are set up and tested before launch, not left as homework.',
      },
      {
        q: 'Is it safe to sell online?',
        a: 'Yes, when the store is built properly. Card payments go through certified processors, so card numbers never live on your site. We add SSL, hardening, updates, and backups, and because we also do hack remediation, we know exactly what attackers look for.',
      },
      {
        q: 'Can you fix or redesign my existing online store?',
        a: 'Usually, yes. We take over existing WooCommerce and Shopify stores for redesigns, speed fixes, and cleanups all the time. We audit first, then tell you honestly whether your store needs a tune-up or a rebuild.',
      },
      {
        q: 'What reports will I get from my store?',
        a: 'Sales by product, traffic sources, conversion rates, and trends over time, the numbers that answer “what is working?” We set up the dashboards and teach you to read them in plain English, so decisions come from data instead of gut feel.',
      },
    ],
  },

  'seo-geo': {
    metaDescription:
      'SEO and GEO (generative engine optimization) for Philadelphia businesses, rank in Google, get cited by ChatGPT and AI search. Technical SEO, local SEO, and AI-ready content.',
    article: [
      {
        heading: 'What is GEO, generative engine optimization?',
        paragraphs: [
          'Generative engine optimization (GEO) is the practice of making your business visible and accurately represented in AI-generated answers, the responses people get from ChatGPT, Google’s AI Overviews, Perplexity, and voice assistants. Where traditional SEO earns you a ranking on a results page, GEO earns you a citation in the answer itself.',
          'The two disciplines overlap but are not identical. AI systems favor content that is clearly structured, factually specific, quotable in plain language, and consistent across the web. A business whose name, services, location, and expertise are stated unambiguously, on its site, in structured data, and in the directories AI systems learn from, gets recommended. A business described vaguely gets skipped, no matter how good it is.',
        ],
      },
      {
        heading: 'Local SEO: winning “near me” in Philadelphia',
        paragraphs: [
          'For a local business, search is a map game before it is a ranking game. When someone in Fishtown, Manayunk, or Chestnut Hill searches “dentist near me” or “generator installer Philadelphia,” the map pack, those top three pinned results, takes most of the clicks. Getting there is a specific discipline: a complete and active Google Business Profile, consistent name-address-phone data everywhere it appears, real reviews answered like a human, and location pages that actually say where you work.',
          'We have done this for medical practices, kitchen showrooms, transport companies, and dental offices across Philadelphia and the surrounding counties. The playbook is not secret, it is just tedious, and it compounds. Six months of steady, correct work beats any “#1 on Google, guaranteed” shortcut, and it keeps paying after the work stops.',
        ],
      },
      {
        heading: 'What we actually do, month to month',
        paragraphs: [
          'SEO retainers have a deserved reputation for invoices attached to mystery. Ours are attached to a list: the technical issues fixed, the pages published or improved, the rankings and citations moved, and what is queued next. We audit your site’s speed, structure, and markup; fix the foundation before writing a word; then publish content mapped to questions your customers actually type, each piece structured so both Google and AI assistants can lift the answer.',
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the difference between SEO and GEO?',
        a: 'SEO (search engine optimization) earns your website rankings in results pages like Google. GEO (generative engine optimization) earns your business citations inside AI-generated answers from tools like ChatGPT and Google AI Overviews. They share foundations, good structure, real expertise, consistent facts, but GEO puts extra weight on quotable, unambiguous content.',
      },
      {
        q: 'How do I get my business mentioned by ChatGPT?',
        a: 'Make your business machine-readable and consistent: state exactly what you do and where, use structured data (schema.org), keep your name, address, and services identical across your site and major directories, and publish specific, factual content in your area of expertise. AI systems recommend businesses they can describe with confidence.',
      },
      {
        q: 'How long does SEO take to work?',
        a: 'Technical fixes can move things within weeks; content and authority building typically show measurable movement in three to six months. Anyone promising page one in a week is selling something. SEO is compound interest, slow at first, then hard to stop.',
      },
      {
        q: 'Do I need SEO if I run ads?',
        a: 'Ads stop the moment you stop paying; search visibility keeps working. The healthiest mix for most local businesses is ads for immediate demand and SEO/GEO for durable, free-per-click visibility. We help clients shift budget from rented traffic to owned traffic over time.',
      },
      {
        q: 'What is local SEO and do I need it?',
        a: 'Local SEO is optimizing for searches with local intent, “near me” searches and the Google map pack. If your customers are within driving distance, it is the highest-leverage marketing you can do. It centers on your Google Business Profile, consistent listings, reviews, and locally relevant pages.',
      },
      {
        q: 'Will AI search make SEO obsolete?',
        a: 'No, it changes what wins. AI answers are built from the same web that search engines crawl, so structured, specific, trustworthy content now earns two kinds of visibility: rankings and citations. Businesses that adapt early get quoted; the rest get summarized away.',
      },
    ],
  },

  'page-speed': {
    metaDescription:
      'Website speed optimization in Philadelphia. We fix slow PageSpeed Insights and GTmetrix scores, pass Core Web Vitals, and make pages load fast. Hark Digital, est. 2016.',
    article: [
      {
        heading: 'Why page speed is a business problem, not a tech one',
        paragraphs: [
          'Page speed is how long your site takes to become useful to a visitor, and it quietly decides whether they stay or bounce. Google’s own research is blunt about it: as mobile load time goes from one second to three, the chance a visitor leaves jumps by around 32 percent; by five seconds it roughly doubles. A slow site is not a technical footnote, it is lost customers, lower rankings, and wasted ad spend, every single day.',
          'Since 2021 speed is also a direct Google ranking factor through Core Web Vitals, so a slow site competes with one hand tied behind its back. The good news is that page speed is one of the most fixable problems on the web, and the fixes usually pay for themselves in recovered traffic and conversions within weeks.',
        ],
      },
      {
        heading: 'What actually makes a website slow',
        paragraphs: [
          'The usual suspects are boringly consistent: enormous unoptimized images, a pile of plugins each loading their own scripts, render-blocking CSS and JavaScript, no caching, no compression, and cheap shared hosting that buckles under load. Heavy page builders like Elementor, Divi, and WPBakery are common culprits, they trade speed for drag-and-drop convenience, and the bill comes due in load time.',
          'Fixing it is detective work, not guesswork. We read the actual waterfall in GTmetrix and the flagged opportunities in PageSpeed Insights, then attack them in order of impact: compress and lazy-load images, defer and trim scripts, inline the critical CSS, add a CDN and proper caching, and upgrade hosting when the server itself is the bottleneck. Most sites get their biggest jump from the first two or three fixes alone.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Why is my website so slow?',
        a: 'Almost always some mix of oversized images, too many plugins and scripts, render-blocking code, missing caching and compression, and slow hosting. A quick audit in PageSpeed Insights and GTmetrix pinpoints exactly which of these is costing you the most, and most sites have two or three big offenders doing the bulk of the damage.',
      },
      {
        q: 'What is a good PageSpeed Insights score?',
        a: 'PageSpeed scores run 0 to 100: 90+ is green (good), 50 to 89 is amber (needs work), and under 50 is red (poor). Aim for 90+ on both mobile and desktop, but the real target is passing Core Web Vitals on real-world field data, since that is what Google actually ranks on.',
      },
      {
        q: 'What are Core Web Vitals?',
        a: 'Three metrics Google uses to measure real experience: LCP (Largest Contentful Paint, how fast the main content loads, target under 2.5 seconds), INP (Interaction to Next Paint, how responsive the page feels, target under 200 milliseconds), and CLS (Cumulative Layout Shift, how much the page jumps around, target under 0.1). Passing all three is a ranking advantage.',
      },
      {
        q: 'How much does page speed optimization cost?',
        a: 'Most speed projects are a fixed price quoted after a short audit, depending on your platform and how deep the problems run. It is almost always cheaper than the traffic and sales a slow site quietly loses, and the gains tend to show up within days of the work going live.',
      },
      {
        q: 'Can you fix my WordPress site speed?',
        a: 'Yes. WordPress speed work is a big part of what we do, especially sites built on heavy page builders like Elementor, Divi, or WPBakery. We optimize images, tame plugins, add proper caching and a CDN, and clean up the theme, usually without rebuilding the whole site.',
      },
      {
        q: 'Will faster pages actually help my Google ranking?',
        a: 'Speed alone will not vault a weak page to the top, but slowness is a real handicap it removes. Core Web Vitals are a confirmed ranking factor, and faster pages also cut bounce rates and lift conversions, which send their own positive signals. Fast is table stakes now, not a bonus.',
      },
    ],
  },

  'ai-consulting': {
    metaDescription:
      'AI consulting for small and mid-sized businesses, honest opportunity audits, custom AI tools, and workflow automation that saves real hours. No hype, no snake oil.',
    article: [
      {
        heading: 'What an AI consultant actually does',
        paragraphs: [
          'AI consulting, done honestly, is the work of finding where artificial intelligence saves your specific business time or money, and saying so plainly when it does not. In practice that means mapping your workflows, identifying the repetitive language-and-paperwork tasks AI handles well (drafting, summarizing, categorizing, answering routine questions), and wiring proven tools into the systems you already use.',
          'What it should not mean: a slide deck about “digital transformation,” a subscription to a chatbot nobody uses, or a demo that never becomes a tool. We are builders first, the same team that ships software, websites, and integrations, so our AI recommendations end in working things, not strategy documents.',
        ],
      },
      {
        heading: 'Where AI actually pays off for small businesses',
        paragraphs: [
          'The wins are rarely glamorous. An assistant trained on your documents that answers staff questions instantly. Intake forms that summarize themselves before the first phone call. Quotes drafted from job notes. Invoices categorized, emails triaged, reviews responded to in your voice for your approval. Each one shaves minutes off a task you do dozens of times a week, and the minutes are the point. Hours back per week is the only AI metric that matters for a small business.',
          'We start every engagement with a pilot: one small, measurable win, chosen because it is likely to succeed and easy to verify. If the pilot does not save time or money, we stop there and you have lost very little. If it does, and it usually does when the target is picked honestly, we integrate it properly, document it, and train your team to run it without us.',
        ],
      },
    ],
    faqs: [
      {
        q: 'How can a small business actually use AI?',
        a: 'The reliable wins are language and paperwork: drafting quotes and emails, summarizing intake forms and meetings, answering routine customer questions from your own documents, and categorizing invoices or tickets. If a task is repetitive and involves words, AI probably helps. If it involves judgment and relationships, it probably does not.',
      },
      {
        q: 'How much does AI consulting cost?',
        a: 'We start with a fixed-price opportunity audit, a short engagement that maps your workflows and returns a prioritized list of what is worth automating, what it would cost, and what is not worth it. Pilots are scoped small on purpose. You never buy the big build before the small proof.',
      },
      {
        q: 'Is my business data safe with AI tools?',
        a: 'It can be, with the right setup. We configure tools so your data is not used to train public models, keep sensitive records out of third-party systems where required, and put it all in writing. Data handling is part of every AI recommendation we make, not an afterthought.',
      },
      {
        q: 'Will AI replace my staff?',
        a: 'In small businesses, almost never, it removes the busywork around the job, not the job. The receptionist stops retyping intake forms; the estimator stops formatting quotes. The honest framing is hours returned to the work only your people can do.',
      },
      {
        q: 'What AI tools do you recommend?',
        a: 'It depends on the task, and the honest answer changes as the field moves. We are vendor-neutral: sometimes the right tool is a major model API, sometimes an off-the-shelf product, sometimes a small custom build on your own data. The audit names names for your specific case.',
      },
      {
        q: 'What is an AI opportunity audit?',
        a: 'A short, fixed-price review of how work flows through your business, returned as a plain-English map: tasks worth automating now, tasks to revisit later, and tasks AI should not touch, each with expected time savings and rough cost. It is designed to be useful even if you never hire us again.',
      },
    ],
  },

  'aerial-media': {
    metaDescription:
      'FAA Part 107 licensed drone photography and video in Philadelphia, real estate aerials, construction progress, inspections, and 4K cinematic production. Legal, insured, professional.',
    article: [
      {
        heading: 'Why the FAA Part 107 license matters',
        paragraphs: [
          'Flying a drone commercially in the United States legally requires an FAA Part 107 Remote Pilot Certificate, the federal license covering airspace rules, weather, flight restrictions, and safety. Hiring an unlicensed operator is not a paperwork technicality: fines fall on the business that hired them, insurance will not cover an illegal flight, and near airports (Philadelphia has several) unauthorized flights are a genuine hazard.',
          'Mike Harkins is a Part 107 licensed and insured remote pilot. Every shoot starts before takeoff: airspace checked and cleared, authorizations filed where needed, weather windows planned, and a shot list agreed so flight time is spent shooting, not deciding. Legal, insured, planned, then we fly.',
        ],
      },
      {
        heading: 'What aerial imagery does for a business',
        paragraphs: [
          'Real estate listings with aerial photography consistently attract more views and sell faster, a drone shows the property, the lot lines, and the neighborhood in a single frame no ground camera can capture. Builders and contractors use weekly flyovers as visual progress reports that keep clients and lenders confident. Roofers and inspectors get high-resolution imagery of roofs, gutters, and towers without ladders, lifts, or risk.',
          'And for any brand, aerial video is simply the most cinematic asset per dollar you can put on a website or a social feed. We shoot in 4K, color-grade properly, and deliver files cut and sized for where they will live, web, social, or the big screen. Because we also build websites, the footage lands on pages designed to use it, not in a folder nobody opens.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Do I need a licensed drone pilot for commercial photos?',
        a: 'Yes. Any drone flight done for business purposes in the U.S. requires an FAA Part 107 certified pilot. Hiring unlicensed operators exposes your business to FAA fines and voids most insurance. Always ask to see the certificate, legitimate pilots are glad to show it.',
      },
      {
        q: 'How much does drone photography cost?',
        a: 'Single-property real estate shoots are typically a few hundred dollars. Construction progress packages, inspections, and cinematic video productions are quoted by scope. Planning, flying, editing, and delivery are included, the price you are quoted is the price.',
      },
      {
        q: 'Can you fly anywhere in Philadelphia?',
        a: 'Most places, with planning. Parts of Philadelphia sit in controlled airspace around airports, which requires FAA authorization, something a licensed pilot can usually obtain, often quickly. We check airspace before quoting so there are no surprises on shoot day.',
      },
      {
        q: 'What do you deliver after a shoot?',
        a: 'Edited, color-graded photos and video sized for their destination, high-resolution masters plus web- and social-ready versions. Real estate shoots typically deliver next day. You own the media and can use it anywhere, forever.',
      },
      {
        q: 'Can drones inspect my roof or building?',
        a: 'Yes. High-resolution aerial imagery shows damaged shingles, flashing, gutters, and hard-to-reach structures without ladders or lifts. It is faster and safer than climbing, and you keep a dated visual record, useful for insurance claims and maintenance planning.',
      },
      {
        q: 'Do you shoot video as well as photos?',
        a: 'Yes, 4K cinematic video is half the work we do. Brand films, property tours, construction timelines, events, and action sports. We plan shots around how the footage will be used, then edit and grade it to broadcast standards.',
      },
    ],
  },

  'hack-remediation': {
    metaDescription:
      'Hacked website? Emergency malware removal, cleanup, and recovery, we find the breach, remove the infection, clear Google warnings, and harden your site so it stays clean.',
    article: [
      {
        heading: 'How to tell if your website has been hacked',
        paragraphs: [
          'The signs are rarely a dramatic defaced homepage. More often it is quieter: Google search results for your business showing pharmacy spam, visitors redirected to sketchy sites, a red “this site may be hacked” or “deceptive site ahead” warning, hosting suspension emails, a sudden flood of strange traffic, or customers reporting antivirus alerts. Some infections show nothing at all to you, they cloak, showing clean pages to the owner and spam to everyone else.',
          'If any of this is happening, the clock matters. Every hour a compromised site stays up, it damages search rankings, email deliverability, and customer trust, and gives the attacker more time to dig in. The right first move is not deleting things in a panic (evidence matters for finding the entry point); it is a fast, methodical response.',
        ],
      },
      {
        heading: 'How we clean a hacked website',
        paragraphs: [
          'Our remediation follows the same four steps every time. Triage: assess the damage, contain the spread, preserve evidence. Clean: remove every injected script, backdoor, rogue admin account, and modified file, not just the visible symptoms, because a cleanup that misses one backdoor is a countdown to reinfection. Restore: bring the site back online, resubmit to Google Safe Browsing, and clear the blocklist warnings that scare customers away. Harden: patch the software, close the entry point, tighten permissions, and put monitoring in place.',
          'We have rebuilt sites after "disaster experiences" with other developers, and the pattern repeats: the visible spam was removed but the door was left open. The cleanup is only finished when the hole it came through is closed, and when you know, in plain English, what happened and what changed.',
        ],
      },
    ],
    faqs: [
      {
        q: 'My website was hacked, what should I do first?',
        a: 'Do not delete anything yet, the evidence helps find the entry point. Change your hosting and admin passwords from a clean device, take a backup of the current (infected) state, and get professional help fast. Email mike@hark.digital with "EMERGENCY" in the subject and we will triage quickly.',
      },
      {
        q: 'How much does hacked website cleanup cost?',
        a: 'Most cleanups are a fixed price quoted after a quick triage, depending on the size of the site and depth of the infection. It is almost always far cheaper than the traffic, reputation, and revenue a compromised site burns while it stays infected.',
      },
      {
        q: 'How long does it take to fix a hacked website?',
        a: 'Containment usually happens the same day. Full cleanup, restoration, and Google blocklist removal typically take one to several days depending on the infection. Google generally lifts warnings within a day or two after we submit the cleaned site for review.',
      },
      {
        q: 'How do I remove the "this site may be hacked" warning from Google?',
        a: 'The infection must be fully removed first. Google re-scans before lifting the flag. Then the site is submitted for review through Search Console. We handle the whole sequence: cleanup, verification, submission, and confirmation that the warning is gone.',
      },
      {
        q: 'Why do websites get hacked?',
        a: 'Almost always through known holes: outdated plugins and themes, weak or reused passwords, and abandoned software. Attacks are automated, bots probe thousands of sites for the same known vulnerabilities. Small sites are not too small to be targets; they are the easiest targets.',
      },
      {
        q: 'Will my site get hacked again after cleanup?',
        a: 'Not if the door gets closed. Reinfection happens when cleanups remove symptoms but miss backdoors or leave the original vulnerability open. Our cleanup ends with patching, hardening, and monitoring, and we stand behind the work.',
      },
    ],
  },

  security: {
    metaDescription:
      'Website and data security for small businesses, hardening, 24/7 monitoring, tested backups, and plain-English reporting. Prevention that costs less than one cleanup.',
    article: [
      {
        heading: 'Why small business websites get attacked',
        paragraphs: [
          'Attackers do not choose targets, software does. Automated bots scan the internet around the clock for sites running outdated plugins, weak passwords, and known vulnerabilities, and they do not care whether the site belongs to a bank or a bakery. Small business sites are compromised constantly precisely because their owners assume they are too small to matter.',
          'The consequences are not abstract: hosting suspensions, Google warnings that scare customers, blacklisted email domains, stolen customer data, and cleanup bills that dwarf what prevention would have cost. Website security is not a product you buy once; it is a short list of habits kept faithfully, updates, strong access control, monitoring, and backups that actually restore.',
        ],
      },
      {
        heading: 'What ongoing website security looks like',
        paragraphs: [
          'Our security care follows four habits. Assess: a plain-English review of your site, hosting, and data handling, where the weak points are and which ones matter. Harden: locked-down logins with two-factor authentication, least-privilege accounts, patched software, SSL everywhere, and a smaller attack surface. Monitor: continuous watching for file changes, suspicious logins, malware, and downtime, with a human who responds, not just a dashboard that blinks. Back up: automatic, off-site, and rehearsed, because a backup you have never restored is a hope, not a plan.',
          'Every month you get a report a business owner can actually read: what was updated, what was blocked, what changed, and what we recommend next. No jargon, no scare tactics, just the state of your locks.',
        ],
      },
    ],
    faqs: [
      {
        q: 'How do I protect my business website from hackers?',
        a: 'Keep software and plugins updated, use strong unique passwords with two-factor authentication, limit admin accounts, run SSL, take automatic off-site backups, and monitor for changes. Most breaches exploit known holes that updates had already fixed, consistency beats cleverness.',
      },
      {
        q: 'What does website security cost per month?',
        a: 'Ongoing care, updates, monitoring, backups, and reporting, is a modest monthly retainer that costs a fraction of a single hack cleanup. We quote based on your site’s size and stack after a quick assessment.',
      },
      {
        q: 'What is website hardening?',
        a: 'Hardening is reducing the ways an attacker can get in: patching software, removing unused plugins and accounts, enforcing strong authentication, restricting file permissions, and configuring the server defensively. It turns your site from an easy automated target into an expensive manual one, and bots move on.',
      },
      {
        q: 'How often should my website be backed up?',
        a: 'Daily for most business sites; more often for busy stores where losing a day of orders hurts. Backups must be automatic, stored off the server, retained across multiple dates, and test-restored periodically. We rehearse restores so recovery is routine, not a gamble.',
      },
      {
        q: 'Do I need an SSL certificate?',
        a: 'Yes, without SSL, browsers label your site “Not Secure,” search engines demote it, and data between visitors and your site travels unencrypted. There is no good reason to run a business site without SSL; we configure it correctly and keep it renewed.',
      },
      {
        q: 'What is 24/7 website monitoring?',
        a: 'Software that continuously watches your site for malware, unauthorized file changes, suspicious logins, blocklist status, and downtime, with alerts a human actually responds to. Attackers do not keep business hours; monitoring shrinks the gap between “something happened” and “someone is fixing it.”',
      },
    ],
  },

  'ada-accessibility': {
    metaDescription:
      'ADA website accessibility and WCAG compliance for Philadelphia businesses, real audits, code-level fixes, and documentation. No overlay widgets, no checkbox theater.',
    article: [
      {
        heading: 'Is your website required to be ADA compliant?',
        paragraphs: [
          'The Americans with Disabilities Act requires places of public accommodation to be accessible, and U.S. courts have repeatedly applied that requirement to business websites. The Department of Justice has said plainly that the ADA covers web content, and the measuring stick everyone uses is WCAG, the Web Content Accessibility Guidelines, with level AA as the benchmark courts and settlements reference. In practice: if your website sells, books, or informs, accessibility is not optional.',
          'The enforcement mechanism is not a government inspector, it is a lawsuit. Thousands of ADA website suits are filed in federal and state courts every year, with many more resolved as demand letters that never reach a docket. The targets are overwhelmingly small and mid-sized businesses, restaurants, shops, medical practices, because they settle fast. A site that passes a plaintiff’s thirty-second automated scan, with documented conformance behind it, is a far less attractive target than one that fails it.',
        ],
      },
      {
        heading: 'Why we fix code instead of installing overlay widgets',
        paragraphs: [
          'Accessibility overlays, the badges and toolbars that promise compliance from one line of JavaScript, do not make websites accessible. They sit on top of broken markup and guess at fixes while the real problems stay put. Sites running overlays get sued anyway, recent lawsuits increasingly name the overlay itself, and disability advocates have documented how overlays interfere with the screen readers and keyboard workflows real users already have configured. Renting a widget is checkbox theater; courts and users can both tell.',
          'Real remediation is less magical and more durable: correct heading structure, labeled forms, sufficient contrast, alt text that actually describes, visible focus states, and pages that work without a mouse. That work overlaps almost perfectly with the clean, semantic markup search engines reward, which is why accessible sites tend to rank better and convert better. And the market case is simple: one in four American adults lives with a disability. That is not an edge case, that is your audience.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does the ADA apply to my business website?',
        a: 'If your business serves the public, courts have consistently said yes, your website is a place of public accommodation and must be usable by people with disabilities. There is no small-business exemption in practice; most defendants in ADA web lawsuits are small companies, precisely because they tend to settle quickly.',
      },
      {
        q: 'What is WCAG compliance?',
        a: 'WCAG (Web Content Accessibility Guidelines) is the international standard for accessible websites, organized in levels A, AA, and AAA. Level AA is the benchmark referenced by the Department of Justice and in virtually every settlement. It covers things like color contrast, keyboard navigation, screen reader compatibility, form labels, and captions.',
      },
      {
        q: 'Do accessibility overlay widgets make my site ADA compliant?',
        a: 'No. Overlays layer scripts on top of broken code and fix only a fraction of real barriers, and businesses using them get sued anyway, many recent filings name the overlay specifically. Screen reader users routinely report overlays making sites harder to use. Actual compliance requires fixing the underlying code.',
      },
      {
        q: 'I got an ADA demand letter about my website. What should I do?',
        a: 'Talk to your attorney first, and do not ignore it, silence usually escalates into a filed lawsuit. In parallel, get an honest technical audit so you know your real exposure and can show concrete remediation is underway. Documented, in-progress fixes materially change how these cases resolve. We produce that audit and do the fixing.',
      },
      {
        q: 'How much does website accessibility remediation cost?',
        a: 'It depends on the size of the site and how it was built. An audit is a fixed price; remediation is quoted from the audit findings, ranked so the highest-risk barriers get fixed first. It is reliably cheaper than a settlement, and unlike a settlement, it also gets you a better website.',
      },
      {
        q: 'Does web accessibility help SEO?',
        a: 'Yes, substantially. Accessible sites and search-friendly sites are built from the same materials: semantic headings, descriptive link text, alt text, fast load times, and clean structure. Screen readers and search crawlers read pages the same way, fix the site for one and you have largely fixed it for the other.',
      },
    ],
  },

  wordpress: {
    metaDescription:
      'WordPress experts in Philadelphia, custom builds, rescues, speed, and security. We fix white screens, hacked sites, plugin conflicts, and slow admin dashboards. Est. 2016.',
    article: [
      {
        heading: 'Why WordPress sites break (it’s usually not WordPress)',
        paragraphs: [
          'WordPress powers around 43 percent of all websites, and its core software is solid, maintained by thousands of developers and patched constantly. The trouble almost never starts there. It starts in the ecosystem around it: a theme from 2019 nobody updated, thirty plugins from thirty different authors, cheap shared hosting straining under load, and a page builder stacking scripts on every page. WordPress doesn’t break; the pile of decisions bolted onto it does.',
          'That is actually good news. Because the platform is everywhere, its failure modes are famous, and the fixes are well understood. The white screen of death, the update that took the site down, the admin dashboard that takes twelve seconds to load, the pharmacy spam in your Google results, we have seen each of these dozens of times, and none of them is a mystery. A decade of building, rescuing, and maintaining WordPress sites means the diagnosis is usually fast, and the cure is usually permanent.',
        ],
      },
      {
        heading: 'The problems that walk through our door most',
        paragraphs: [
          'Slowness leads the list: oversized images, no caching, bloated page builders like Elementor and Divi, and databases dragging years of revisions and orphaned tables. Close behind are plugin problems, conflicts after an update, abandoned plugins with known vulnerabilities, and five plugins doing the job of one. Then come the hacks: almost every compromised site we clean is WordPress running outdated software, because bots scan for known holes around the clock. And underneath it all, neglect, sites with no backups, no updates, and no one watching, one bad Tuesday away from disaster.',
          'The pattern behind all of it is deferred maintenance. WordPress is not a build-it-and-forget-it platform; it is closer to a car, reliable for years if someone changes the oil. That is why every rescue we do ends the same way: current software, real off-site backups, monitoring, and a care plan, so the site that just got fixed stays fixed. Whether you need a new build, a rescue, or just someone to finally take the updates off your plate, that is the job.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Why is my WordPress site so slow?',
        a: 'The usual culprits, in order: unoptimized images, no caching, a heavy page builder theme, too many plugins loading scripts on every page, a bloated database, and budget shared hosting. A short audit pinpoints which ones apply to your site; fixing the top two or three usually transforms it.',
      },
      {
        q: 'Why does my WordPress site keep getting hacked?',
        a: 'Almost always outdated software, an old plugin or theme with a publicly known vulnerability, sometimes paired with weak passwords. Bots probe thousands of sites a day for exactly these holes. A proper cleanup closes the entry point, and a care plan with prompt updates keeps it closed.',
      },
      {
        q: 'My site broke after a WordPress update. What do I do?',
        a: 'Don’t keep clicking update on the rest. Note what changed, restore from a backup if you have one, and get help identifying the conflict, it is usually one plugin or theme incompatible with the new version. This is also the argument for staged updates with backups, which is exactly what our care plans do.',
      },
      {
        q: 'Do you work with sites built in Elementor or Divi?',
        a: 'Yes, constantly. We speed them up, fix them, and maintain them, and when a page builder is the main thing making a site slow, we say so with numbers. Sometimes the answer is tuning what you have; sometimes it is rebuilding on a lean theme. We tell you honestly which.',
      },
      {
        q: 'Should I fix my WordPress site or rebuild it?',
        a: 'Depends on the foundation. A solid site with fixable problems gets fixed, that is cheaper. A site on an abandoned theme, a fragile plugin stack, or years of accumulated patches is often cheaper to rebuild than to keep rescuing. We audit first and give you the honest math for both paths.',
      },
      {
        q: 'Do you offer WordPress maintenance plans?',
        a: 'Yes. Monthly care plans cover updates (applied with backups, not blindly), security monitoring, off-site backups, uptime checks, and small fixes, with a plain-English monthly report. It costs a fraction of a single emergency rescue, which is rather the point.',
      },
    ],
  },
}
