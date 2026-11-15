# Water for Lives and Livelihoods

A responsive, map-led companion to the supplied UNDP Sudan publication. Built with Vite and D3. No external map service, API key, backend or remotely hosted font is required.

## Run

Requires Node.js 22.12+.

```powershell
npm ci
npm run dev
```

Open the localhost address printed by Vite. For production:

```powershell
npm test
npm run test:e2e -- --workers=2
npm run build
npm run test:pages -- --workers=2
npm run preview
```

Deploy the contents of `dist` to an HTTPS static host, either at the domain root or in a subdirectory. Vite's relative base and document-relative public asset URLs support both. Story routes use hashes, so no server-side routing is required. Keep public asset paths relative when adding images, icons, data or publication links.

Browser tests use Playwright Chromium and a temporary server on port 5174. If the browser is missing, run `npx playwright install chromium` once. The separate `test:pages` checks the existing production build on port 5175 at `/Water-for-lives-and-livelihoods/`, including mobile, hash-story reloads, lazy data/charts, locality boundaries, publication downloads and PNG export. Run `npm run build` first.

## Publish to GitHub Pages

Repository: https://github.com/alimoelmahi/Water-for-lives-and-livelihoods

Expected site: https://alimoelmahi.github.io/Water-for-lives-and-livelihoods/

1. Complete the content approvals in **Before public launch** below. Everything in `public`, including the downloadable publication and photographs, will be publicly accessible.
2. Upload or push the source to the repository's `main` branch. Include `.github`, `public`, `scripts`, `src`, `test`, the package/lock files, both Playwright configurations, `vite.config.js`, `index.html`, `.gitignore` and this README. Do not upload `node_modules`, `dist`, test results or the raw supplied inputs. The raw `Assessts` directory and root-level Word documents are ignored; prepared assets and the downloadable report in `public` remain included.
3. In the repository, open **Settings > Pages > Build and deployment** and select **GitHub Actions** as the source.
4. Open **Actions > Test and deploy to GitHub Pages**. If the initial push happened before enabling Pages, use **Run workflow** on `main` to retry.
5. Wait for the build and deploy jobs to succeed, then open the site URL above. Later pushes to `main` run the same checks and publish automatically.

The workflow installs dependencies, validates the data, builds, runs the interaction tests and tests the production repository path before deploying. It uses GitHub's built-in token; no personal access token or repository secret is required.

For an **empty** remote repository, these PowerShell commands prepare and push the source from this project directory. They publish source code and trigger the workflow; do not run them before obtaining content approval:

```powershell
git init
git branch -M main
git remote add origin https://github.com/alimoelmahi/Water-for-lives-and-livelihoods.git
git add .github public scripts src test .gitignore index.html package.json package-lock.json playwright.config.js playwright.pages.config.js vite.config.js README.md
git status
git commit -m "Prepare interactive report for GitHub Pages"
git push -u origin main
```

If GitHub already contains a README or other commits, clone that repository into a separate folder first, copy the source items listed above into the clone, and commit/push there instead. Do not force-push over existing work.

To preview the repository URL locally after building:

```powershell
npm run preview -- --base /Water-for-lives-and-livelihoods/
```

Open the printed address including `/Water-for-lives-and-livelihoods/`. The same build also works with ordinary `npm run preview` at the root.

## Experience

- Section, chapter and case-study headings follow the supplied report's language. Map and chart controls use plain descriptive labels; retain the publication's wording rather than adding promotional headlines.
- Buttons use a shared 6 px corner radius, compact spacing and flat, restrained borders. Primary actions retain UNDP blue, while secondary actions remain light or transparent. Joined map controls round their outer corners; result tabs round their upper corners without changing the underline animation. Keyboard focus and disabled states remain visible.
- A one-shot loading screen follows [Motion Prompt #089, Preloader](https://showheyohtaki.github.io/motion-prompt/#089), using the UNDP logo on navy, a 28 px percentage and an orange 180 x 4 px bar. Cubic ease-out counts from 0 to 100 between 250 and 2100 ms. The full-viewport curtain lifts at 2300–2850 ms with cubic ease-in-out; the hero copy and photograph fade in and rise 14 px at 2350–2950 ms with cubic ease-out. The reference's 168 px sample viewport becomes the actual viewport height. Progress is an opening sequence, not a byte-download measurement: it stops at 99 until core map data and the opening photo are ready. Slow loads delay the reveal without changing its motion durations. A failed photo is explicitly disclosed without blocking the map; core-data failures immediately reveal the existing retry screen. Reduced motion skips the intro. It runs once per page load, never returning over a page in use.
- The opening photograph and closing section share an animated divider following Shohei Ohtaki's MIT-licensed [Motion Prompt #165](https://showheyohtaki.github.io/motion-prompt/#165), using two sine-wave layers with the original wavelengths, amplitudes, phases and 4.7-second cycle. The opening version is a transparent 40 px overlay at the bottom of the hero, keeping the original photograph, parallax, compact height and clickable actions; its credit remains visible above the waves. The closing version retains its 98 px blue gradient band. Both blend into the fixed paper background and share one animation loop, but update only while individually visible. They start after loading, pause off-screen or in hidden tabs, become static for reduced motion, and are hidden in print. There is no scroll-down cue or scroll-driven background color change.
- The original sorghum photograph fills a shorter, full-width hero behind the report text, with a dark overlay for readability and its UNDP credit. The desktop minimum height is capped at 560 px, while mobile height follows the content; the four-statistic strip beneath the hero is removed. Parallax is adapted from Shohei Ohtaki's MIT-licensed [Motion Prompt #073](https://showheyohtaki.github.io/motion-prompt/#073): the single photograph moves at the reference's 0.7 foreground speed, while the heading, buttons and following content scroll normally. A 120 px scroll moves the photograph 84 px. Responsive WebP sources and `object-fit: cover` fill the hero on desktop and mobile; narrow screens use the full-resolution source and a farmer-centered crop to keep the background sharp. Measured overscan prevents uncovered edges throughout scrolling. The reference's timed demonstration does not move the page automatically. Parallax begins after loading, updates only while visible, and is static for reduced motion. Print uses dark text without the photographic background. Map interaction and PNG exports are unchanged.
- D3 national/state atlas on a light-gray basemap, with zoom, pan, state selection, search, nine composable layers, thematic shading and optional, lazy-loaded locality boundaries. Neutral Sudan states use light grey (`#E8E8E8`) in the interactive map and PNG exports; neighboring countries remain lighter. States, localities, geographic labels and markers share one pan/zoom camera. Labels retain their screen size and crowded labels are repositioned or hidden until space is available.
- Map markers use compact OCHA icons with translucent backplates and muted count badges. Invisible hit areas keep the smaller symbols easy to select. Each story shows its first enabled intervention in the record's order; national markers collect those icons by state, with badges counting stories rather than interventions. Icons retain their screen size when zooming.
- The atlas sits directly on the page rather than inside a bordered white box. Spaced filters, a softly rounded map and an unboxed story panel share the report's background; download buttons stay above the map. On tablet and mobile the story panel moves below the map. Its incoming content follows the opening motion of [Motion Prompt #053](https://showheyohtaki.github.io/motion-prompt/#053): a 250 ms cubic ease-out fade and 6 px downward reveal. Rapid selections cancel the previous reveal, new content starts at the top, and unchanged story content does not flash when the thematic layer changes. Initial loading, reduced motion and print remain static.
- One **Field impact stories** section brings together all ten mapped stories, with fuller summaries grounded in the report and explicit distinctions between reported results, individual accounts and projections. At the user's request, a compact Previous/Next slider replaces scroll pinning, removing both the viewport-height panel and its reserved scroll space. It retains the visual motion from Shohei Ohtaki's MIT-licensed [Motion Prompt #076](https://showheyohtaki.github.io/motion-prompt/#076): a 46 px story number rolls in 52 px steps, photos slide vertically within an 8 px rounded window at a 226:124 ratio, and a 124 px progress line fills in UNDP light blue. Each selection uses 400 ms cubic ease-in-out; summaries fade between steps without overlapping. Rapid selections replace the current animation from its displayed position. Only the active story is interactive, and opening and returning from details preserves the selected story. The navy panel fits its content with compact padding, and results follow directly below. Reduced motion, print, viewports at most 640 px tall, and layouts too short for the full text use an ordinary list with every summary visible. There is no automatic cycling or scroll interception.
- Story cards open shareable detail views such as `#/stories/berber`, retaining static-host compatibility. The full-viewport UNDP-blue wipe (`#006EB5`, shared with the site's primary palette) follows [Motion Prompt #092](https://showheyohtaki.github.io/motion-prompt/#092): 100 ms delay, 400 ms cubic ease-in-out entrance, view and URL change at 500 ms, 100 ms hold, then a 450 ms cubic ease-in-out exit. Return links use the same motion and restore list position and card focus. Reduced motion switches immediately. Opening and returning from stories preserves map filters and camera; only the explicit map-exploration button selects the story's state. Details and existing map dialogs share the original outputs, outcomes, location precision, partners and source notes, without adding or combining beneficiary claims.
- A compact, borderless results section with five single-line topic tabs: finance, jobs, markets, partners and the five pathways. Tabs scroll horizontally on mobile rather than forming multiple rows. Finance places its headline totals and repayment definition alongside the state/bar table on desktop, stacking them on smaller screens while keeping the three totals in one row. A single breakdown selector offers activity or gender, never an unsupported combination. Reported and expected employment use two directly labeled bars on a shared scale. Market steps and pathways use compact two-column lists on desktop; partner roles use three columns. These return to readable single-column layouts on mobile. Panels follow their content height without a fixed minimum. Projections, proposed deals, ambitions and conditional scenarios are explicitly identified; all source notes are retained.
- Results tabs use the motion of [Motion Prompt #057, Tabs](https://showheyohtaki.github.io/motion-prompt/#057), adapted to the five responsive topics rather than the fixed three-tab demo. The 4 px blue underline moves over a 2 px divider in 250 ms with exact cubic ease-in-out, passing through intermediate tabs on a return. Selection labels change after 100 ms. The old panel fades out linearly over 200 ms; the new panel starts its 200 ms linear fade and 8 px rise 100 ms after the click. Mouse and keyboard control switching; there is no automatic cycle. Reduced motion switches immediately. Temporary outgoing panels are inert and hidden from assistive technology.
- All four dropdowns, including the lazily rendered finance filters, follow Shohei Ohtaki's MIT-licensed [Motion Prompt #053, Dropdown (select)](https://showheyohtaki.github.io/motion-prompt/#053). Native customizable selects retain their labels, keyboard navigation, disabled options and existing change events. Fields are 260 x 38 px with 8 px corners, shrinking to their available column width. White menus have 26 px option rows, an 18 px shadow and UNDP-blue focus/highlight colors. Opening fades and drops the menu 6 px over 250 ms with cubic ease-out while rotating the chevron 180 degrees; closing uses 150 ms cubic ease-in-out. The closing curve is sampled at 101 points for CSS interpolation. A real choice triggers a 100 ms old-label fade, a 20 ms gap, then a 100 ms new-label fade, rather than anticipating a scripted demo click or automatically resetting a user's filter. Reduced motion switches immediately. Browsers without `appearance: base-select` retain working native selects; supported browsers render menus in the top layer so map clipping cannot cut them off.
- JSON exports preserve filters, units, source notes and limitations.
- Prominent PNG and JSON download buttons sit in the atlas's top toolbar. Download map PNG creates an 1800-pixel-wide, two-panel report on white backgrounds: the left detail map fits the selected state, or states with matching stories; the right whole-Sudan locator is a neutral reference map, without highlighted states, story markers or thematic results. A black-and-white kilometer scale beneath the locator is calculated from its Mercator projection at the map's center latitude, which is stated beside the scale. If an All Sudan selection has no matches, the detail map frames the five story states without implying results. Export reframing does not change the live map's pan/zoom or filters. The image includes search, matching story count, enabled OCHA icon legend, thematic shading key, locality-boundary key when enabled, source credits and location/coverage caveats. Export runs entirely in the browser.
- Keyboard controls, native modal dialogs, reduced-motion support, responsive layouts and responsive WebP hero imagery.

## Evidence and limits

The original publication is the source of narrative and numerical evidence; the app does not independently verify its claims. Field accounts cover 2025–2026 and finance uses the report's November 2026 snapshot.

`public\data` contains the eleven requested datasets plus derived state and locality GeoJSON. Update these together when adding evidence. Keep project IDs stable, retain source/precision fields, and use `null` for unreported counts. `states.json` identifies the five featured states; the map supports every geography in the supplied boundary file. The state dropdown lists only states represented in story records, plus the All Sudan overview.

**Do not interpret the map as a verified project inventory.** No surveyed agricultural project coordinates or borrower-level dataset were supplied. All project points are explicitly approximate locality/state references. State badges count curated story records, not the 395+ interventions or total beneficiaries. No schematic river overlay is drawn on the state layer. The supplied water-project CSV is a different inventory and was not merged without a verified crosswalk.

The March 2020 locality shapefile is dissolved into 18 states plus separately coded Abyei PCA, preserved as supplied. Boundaries do not imply endorsement and should be replaced with an approved current reference before operational use.

Neighboring-country outlines form a separate, non-interactive layer beneath Sudan in the live map and both PNG panels. They use the public-domain [Natural Earth 1:50m country boundaries](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/), version 5.1.1. Regional context is illustrative and does not replace or adjust the supplied Sudan boundaries. Country paths share Sudan's projection and camera; different source vintages may depict disputed borders differently.

The loan explorer uses published aggregates from Figure 3. A single breakdown selector allows activity or gender, not both, because the report does not publish that intersection. Filters change the loan table, not the full-loan-book headline figures. Bar lengths keep the same scale when filtering. Repayment means **255 due instalments paid on time**, not all loans repaid in full. 351 jobs, 835 MT sorghum and SDG 6.68 billion production value are projections. Two million farmers is an ambition; 4.7 million people lifted out of poverty by 2043 is a conditional scenario.

Programme totals, projects, borrowers and field-case groups overlap. Do not sum them as unique people. Household, farmer, member, worker and stall counts are not interchangeable. No causal attribution, capital-cost payback or beneficiary-rate choropleth is inferred.

## Rebuild supplied assets

Prepared assets are already included. Rebuilding the site does not require the raw inputs. To recreate the assets, first restore the ignored original publication and `Assessts` directory locally, then run:

```powershell
npm run prepare:assets
```

This extracts publication media, creates optimized WebP images, copies the source Word publication and supplied OCHA icons for the hero and all nine intervention layers, and simplifies/dissolves the supplied locality shapefile. Layer-to-icon mappings are maintained in [src/model.js](src/model.js); original OCHA SVGs retain their supplied blue styling. It never modifies the originals. States are a geometric union of the original locality polygons before simplification: this resolves overlapping locality footprints instead of turning them into false holes in Al Jazirah and Darfur. States and localities then share one quantized/simplified topology. The geometry pipeline closes state rings, removes duplicate vertices, retraced spikes, zero-area rings and collapsed polygons, preserves valid union holes and islands, and normalizes spherical ring winding for D3.

The same command builds `public\data\sudan-region.geojson` from the retained `Assessts\Geo Assets\NaturalEarth\ne_50m_admin_0_countries.zip` archive ([download source](https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip)). The regional GeoJSON records its source, version, license and archive SHA-256. Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). All basemap assets are served locally; neither map viewing nor PNG export contacts an external map service.

## Before public launch

- Confirm approval to republish the source document, photographs, names, quotations and partner identity assets.
- Validate the publication's draft figures and dates with the data owner.
- Approve boundary vintage and approximate location references; replace with verified project coordinates if available.
- Enable HTTPS in the hosting settings. GitHub Pages does not offer custom response-header configuration; if custom security headers are required, use a host that supports them and a content security policy appropriate for D3's inline SVG styles.
- Conduct editorial, accessibility and device acceptance checks with the intended audience.

No analytics, trackers, external image requests or remote data submission are included.
