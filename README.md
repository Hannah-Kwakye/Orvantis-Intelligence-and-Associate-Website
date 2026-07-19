# Orvantis Intelligence & Associates

Four independent branded websites, one repository. Each brand keeps its own
domain, identity, and deployment; they share this home for versioning.

| Brand | Folder | Domain |
|---|---|---|
| Orvantis Intelligence | [`orvantis-intelligence/`](orvantis-intelligence/) | orvantisintelligence.com |
| Makers Intelligence | [`makers-intelligence/`](makers-intelligence/) | makersintelligence.com |
| Operational Hub | [`operational-hub/`](operational-hub/) | (domain to be confirmed) |
| Next Builders Lab | [`next-builders-lab/`](next-builders-lab/) | nextbuilderslab.com |

## About the brands

- **Orvantis Intelligence** — an advisory and engineering house for
  organizations adopting AI the way lasting things are built: quietly,
  deliberately, in the service of people.
- **Makers Intelligence** — the AI operating system for makers. Born in
  Ghana, built for the world: customers, orders, bookings, follow-up,
  content, and growth, woven into one warm system for fashion, beauty,
  artisan, and craft businesses.
- **Operational Hub** — operations that run themselves. Finds the
  bottlenecks costing growing businesses hours every week and automates
  the workflows worth automating first.
- **Next Builders Lab** — don't just learn AI, build with it. A hands-on
  lab where kids, professionals, and founders ship real projects.

## Structure

Every site is fully static and self-contained: its own `index.html`,
`assets/` (CSS, JS, fonts, images), and `netlify.toml`.

## Deploying

Each brand deploys as its own Netlify site from this one repository:
create a Netlify site per brand and set its **base directory** to the
brand's folder (for example `makers-intelligence`). The `netlify.toml`
inside each folder handles headers and redirects for that site.

## Owner

Hannah Kwakye — kwakyehannah@gmail.com
