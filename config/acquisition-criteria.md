# Bedrock Acquisition Criteria — Monitor Configuration

**Version:** 0.2
**Date:** 2026-09-17
**Author:** Flint 🪨
**Basis:** Distilled from Bedrock #opportunities channel discussions — sector assessment sessions (2026-09-15 to 2026-09-17), investment thesis, fire safety deep-dive, NDIS review with Ronan Lehane, and a16z / YC validation review
**Status:** Draft for partner confirmation before automatic filtering is enabled

---

## How this file is used

The business monitor reads this file to classify each listing as *Promising*, *Needs information*, or *Excluded*. Hard exclusions are evaluated first and cannot be overridden by other signals. All other fields are preferences that inform classification — not hard filters unless explicitly marked.

This file is versioned. Every assessment record stores the criteria version applied. Update this file via a pull request; increment the version number on every material change.

---

## 1. The investment hypothesis (in plain terms)

Bedrock targets regulated, fragmented, non-discretionary service businesses where:
- Government or law creates a mandatory, recurring demand that cannot be deferred
- A licensing or accreditation requirement limits new entrants and creates a natural moat
- The market is dominated by owner-operators approaching retirement with no natural succession buyer
- Entry multiples are suppressed by key-person risk that a capable acquirer can resolve
- Technology and operational improvement can compound the underlying cash flow over a long hold period

This is not a venture thesis. It is a patient owner-operator thesis. The monitor should surface businesses that fit this profile, not businesses that are merely inexpensive or growing.

---

## 2. Geography

*Included:* Australia (all states and territories)

*State preference for digest ordering:* VIC, NSW, QLD — these have the highest regulatory reform activity (FPAS, DBP Act, QBCC reforms) and the deepest fragmented operator pools. Not a hard filter — a strong WA or SA listing still surfaces.

*Excluded (hard):* Overseas-only businesses (NZ, UK, US etc.). May be added in a future version.

*Unknown geography:* Needs information — do not exclude on geography alone.

---

## 3. Hard exclusions — deal type

These apply regardless of sector, revenue, or any other signal.

| Exclusion | Basis in our discussions |
|---|---|
| Franchise businesses (franchisee-operated under a franchisor agreement) | Franchisor controls the operating model; no ability to reinvent. Explicitly excluded in sector assessment notes. |
| Businesses in structural decline with no credible stabilisation thesis | Investment thesis: disqualifying characteristic |
| Businesses requiring continuous capital injection to operate | Investment thesis: disqualifying characteristic |
| Revenue entirely dependent on a single government incentive subject to near-term policy change | Discussed explicitly re: solar (government incentive risk), VET FEE-HELP RTOs (funding reform risk). These have no durable private demand base beneath the incentive. |
| Pure commodity businesses with no differentiation | Investment thesis: disqualifying characteristic |
| Real property / real estate asset plays (self-storage, commercial property ownership) | Different capital structure; not a services rollup thesis |
| Businesses with a disclosed single-customer concentration >50% of revenue | Investment thesis: disqualifying characteristic. Note: the preferred threshold for flagging (not hard exclusion) is >30%. |

---

## 4. Hard exclusions — sector

These sectors are explicitly excluded based on our sector assessment and discussions. Low-tier sectors with no moat, no recurring revenue, and no regulatory barrier.

| Sector | Basis |
|---|---|
| Restaurants / cafes / bars / hospitality | Discretionary, high failure rate, no recurring revenue |
| General consumer retail | Structural pressure, no moat |
| Gyms / fitness studios | Oversupplied, structurally challenged post-COVID |
| Garage door repair | No regulation, no recurring revenue, no moat |
| Locksmith services | Low recurring revenue, high operator dependency |
| Blinds / curtains / shutters | Discretionary, project-based |
| Gutter cleaning | Low barriers, low ticket |
| Handyman / maintenance franchises | Franchise exclusion plus no moat |
| Massage / day spas | Discretionary, low barriers |
| Tutoring franchises | Franchise exclusion; discretionary |
| Driving schools | Low recurring, low ticket |
| Photography / videography studios | Creative services, key-person dependent |
| Event hire / party planning / amusement venues | Discretionary, seasonal |
| DTC consumables / subscription boxes | High churn, brand-dependent |
| Recruitment agencies | Cyclical, key-person risk, easily disrupted by technology |
| Promotional merchandise / corporate uniforms | Commoditised |
| Solar installation | Government incentive-dependent; discussed explicitly as a disqualifier — policy risk without durable private demand. Same applies to other government-subsidy-only plays. |
| Dog walking / pet sitting / pet grooming | No barriers, discretionary |
| General lawn mowing / residential gardening | No moat (discussed in sector assessment) |
| Office supplies distribution | Structural decline from digitisation. Explicitly noted as "hard pass" in sector assessment. |

---

## 5. Watchlist — sectors with active caution flags

These are *not* hard exclusions but require elevated scrutiny before reaching Promising status.

| Sector | Caution | Discussed |
|---|---|---|
| NDIS service providers | Funding reform risk, thin margins, workforce challenges, compliance intensity. Ronan's instinct confirmed in session with Lehane. Currently rated Medium not Tier 1. Monitor trajectory — review when funding reform direction is clearer. A high-scoring NDIS listing should flag this caution explicitly. | 2026-09-15 / 2026-09-16 |
| Childcare centres | Highly regulated (NQF, ACECQA) but government subsidy-dependent (CCS). Regulatory risk is real. | Sector assessment |
| Vocational training (RTOs) | ASQA regulated and defensible once licensed, but VET FEE-HELP history creates reputational and funding risk. Watch — not pursue. | Sector assessment |
| Aged care / residential | Complex compliance, CDC model disruption. Home care is preferred over residential. | Sector assessment / thesis discussions |
| Dentistry / optometry | Active rollup already mature; entry multiples elevated. Window may have closed. | Sector assessment |
| Solar | Already hard-excluded above, but worth noting that hybrid businesses (e.g. electrical + solar + A/C combo discussed in broker sweep) should have the solar component discounted, not used to inflate the headline revenue figure. | 2026-09-17 broker sweep |

---

## 6. Priority sectors — Promising signal

A listing in one of these sectors, with no known exclusion and at least one required positive signal (§7), is classified *Promising*.

These are grounded in our actual research, not just the sector assessment grid.

### Tier 1 — highest conviction (from investment thesis + deep research)

| Sector | Why we believe this | Evidence from our discussions |
|---|---|---|
| Fire safety & compliance inspection | Non-discretionary B2B; mandated inspection cycles; fragmented owner-operators; FPAS accreditation creates genuine entry barrier; February 2027 NSW catalyst creates urgency; exit multiples of 7–16x vs entry at 3–5x. | Deep analysis in thread 1789513704; 120+ listings identified in broker sweep (thread 1789639851); Marlowe plc and Pye-Barker as proof of concept |
| HVAC servicing & maintenance (commercial focus) | ARC licence required; non-discretionary commercial servicing contracts; recurring maintenance tail is the attractive component (not installation); fragmented. | Sector assessment ⭐⭐⭐; broker sweep found Canberra $770k ($200k p.a. recurring maintenance), Perth $400k, Brisbane 7-figure revenue |
| Electrical services (maintenance/inspection focus) | Licensed trade; non-discretionary; underrated rollup target; target the ones with maintenance agreements, not pure install. | Sector assessment ⭐⭐⭐; broker sweep: Melbourne $500k+ owner earnings (15 years, full team), Regional WA $1.3m |
| Vehicle inspection / roadworthy | State-licensed authorised inspectors; non-negotiable compliance; fragmented; minimal consolidation activity to date. Likely trades quietly — direct outreach to station operators more effective than broker trawl. | Sector assessment ⭐⭐⭐; broker sweep noted thin direct listings, implying acquisition-by-approach rather than passive monitoring |
| Building & pest inspections | Licensed inspectors; mandatory pre-purchase/pre-settlement; volume throughput = recurring at portfolio level; minimal consolidation; low capital intensity. | Sector assessment ⭐⭐⭐; broker sweep: 28 listings in QLD alone |
| Pest control (commercial contracts focus) | Licensed; recurring commercial contracts; ARA Group / Rentokil already consolidating but regional plays available; 54+ active listings on Bsale. | Sector assessment ⭐⭐⭐; broker sweep identified solid pipeline |
| Insurance brokerages | AFSL moat; renewal-recurring revenue; retiring principal pipeline; Steadfast/AUB Group proof of concept at scale; entry multiples still reasonable sub-scale. | Sector assessment ⭐⭐⭐ Flint priority |
| Mortgage broking | AFSL regulated; trail book = durable recurring revenue; proven aggregator platforms; retiring broker pipeline. | Sector assessment ⭐⭐⭐ Flint priority |
| Financial planning practices | AFSL/ASIC moat; retiring planner cohort; FoFA reforms cleared out weaker operators; recurring FUM-based revenue; Divergent Advice/Centrepoint showing rollup logic. | Sector assessment ⭐⭐⭐ Flint priority |
| Allied health — speech pathology / OT | AHPRA registered; NDIS-funded recurring revenue; demand/supply imbalance; active rollup but sub-scale entry still available; coastal growth corridor opportunity. | Sector assessment ⭐⭐⭐; broker sweep: SE QLD multi-disciplinary listing on LINK Business |
| Home care services (aged care — home, not residential) | ACQSC regulated; HCP/CHSP government funding; fragmented exhausted operators; asset-light; strong vertical agent thesis. Elevated to Tier 1 in Ronan session — home care over residential. | Memory 2026-09-16; discussed as strongest aged care sub-sector |

### Tier 2 — medium conviction (surface in Needs information by default, upgrade to Promising with positive signals)

| Sector | Rationale | Notes |
|---|---|---|
| Building maintenance / strata services | Strata legislation creates legally mandated maintenance obligations; recurring B2B contracts; underexplored. Explicitly upgraded from Medium in Ronan session. | Sector assessment #99; flagged for upgrade 2026-09-16 |
| Bookkeeping / accounting practices | Recurring compliance work (BAS, PAYG, year-end); fragmented; retiring principals; cash-generative. Boring but strong. | Sector assessment #62; flagged for upgrade 2026-09-16 |
| Physiotherapy clinics | AHPRA; Medicare/private health billing; active rollup (Healthia, Back in Motion) but sub-scale entry still available; margins pressured. | Sector assessment ⭐⭐ |
| Podiatry | AHPRA; NDIS-billable; less consolidated than physio; interesting niche. | Sector assessment ⭐⭐ |
| Swim schools | AUSTSWIM; recurring term enrolments; regional fragmentation; Aquatic Achievers showing logic. | Sector assessment ⭐⭐ |
| Fire & safety-adjacent facilities management | Compliance-led FM with fire/essential services as anchor service line. Cross-sell potential off fire safety platform. | Not in sector assessment as standalone — derived from fire safety analysis |
| Medical billing / practice management | B2B recurring services; compliance-adjacent; no clinical risk. | Sector assessment #49; flagged for upgrade 2026-09-16 |
| Commercial cleaning (contract-based) | Highly fragmented; strong recurring contracts; thin margins and labour-intensive — only surface with confirmed multi-year commercial contracts. | Sector assessment ⭐⭐ |
| Preventive health / corporate wellness | a16z and YC validation; recurring, government co-funded in some cases, fragmented. Added to watch list 2026-09-16 after a16z review. | Memory 2026-09-16 |

---

## 7. Required positive signals

For *Promising* classification, a listing must have: no known exclusion + priority sector + at least one of the following:

| Signal | How detected | Note |
|---|---|---|
| Recurring or contract revenue indicated | Listing text mentions contracts, service agreements, retainers, subscriptions — stored as `claimed_recurring`, not `evidenced_recurring` | "Contracts" is a claim, not proof — surface it in the digest but do not treat as verified |
| Licensed / regulated / accredited operation | Licence, registration, or certification mentioned (e.g. ARC, AHPRA, AFSL, ASIC, FPAS, QBCC, state licence) | This is a positive signal, not a guarantee of compliance |
| B2B customer base | Commercial, business, government or institutional customers described | |
| Established tenure | Business described as operating for 5+ years | |
| Owner-operator transition indicated | Retirement, succession, lifestyle sale mentioned | Increases likelihood of motivated seller and reasonable entry multiple |

A Tier 1 sector listing with none of these signals → *Needs information*, not Excluded.

---

## 8. Size guidance

Preferences, not hard exclusions (except the revenue floor).

| Parameter | Preferred range | Treatment if outside |
|---|---|---|
| Revenue | AUD 1M – 20M | Below $500K → *Excluded* (too small for current mandate); $500K–$1M → *Needs information*; above $20M → flag for partner review |
| EBITDA | Positive, or recoverable | Undisclosed → *Needs information*; disclosed negative → *Needs information* (assess recoverability) |
| Asking price | Up to approximately AUD 10M | Above $10M → flag for partner review, not auto-excluded |
| Customer concentration | No disclosed single customer >30% revenue | Concentration indicated → flag in assessment |
| Capital intensity | Low to moderate | High capex (vehicles, facilities, heavy plant) without a service/recurring tail → *Excluded* |

*Revenue hard floor:* Listings with disclosed revenue below AUD 500K are Excluded as too small. If revenue is undisclosed, classify as *Needs information*.

*Note on asking multiples:* The broker sweep confirmed that pure compliance / service businesses are trading at 3–5x EBITDA at entry. Financial planning trail books may trade at a revenue multiple. Extraction should calculate the asking multiple where possible and label it as an advertised multiple — not a verified valuation.

---

## 9. Financial field standards

Applied by the extraction service, not this rules file — but recorded here for consistency.

- Revenue, EBITDA, EBIT, net profit, and seller's discretionary earnings are distinct fields. Never relabel.
- "Profit" without further specification → extract as `profit_unspecified`; do not map to EBITDA.
- Asking price / EBITDA *multiple* (not ratio) calculated only when asking price basis and positive annual EBITDA are both clear. Label as *advertised multiple*, not verified valuation. (Terminology aligned with Quartz.)
- `claimed_recurring` and `evidenced_recurring` are separate fields. Advertising language is a claim to investigate — surface it, do not validate it.
- Missing financials remain unknown. Do not infer or annualise without adequate support.

---

## 10. Classification summary

| Condition | Classification |
|---|---|
| Matches any hard exclusion (deal type or sector) | Excluded |
| Revenue disclosed below AUD 500K | Excluded |
| Watchlist sector (§5) — no positive signals | Needs information (include watchlist caution note) |
| Tier 1 sector + no known exclusion + ≥1 positive signal + revenue in range | Promising |
| Tier 1 sector + no known exclusion + no positive signals | Needs information |
| Tier 2 sector + no known exclusion + ≥2 positive signals + revenue in range | Promising |
| Tier 2 sector + no known exclusion | Needs information |
| Revenue undisclosed | Needs information |
| Location unknown | Needs information |
| Processing failure | Processing problem — not classified; surfaced in source health line |

---

## 11. Human override

Any partner can mark a listing `watch`, `pursue`, or `pass`. Overrides persist, are labelled with the author, and are not overwritten by subsequent model runs. Pass reasons are reviewed periodically to calibrate these rules.

---

## 12. Parameters awaiting partner confirmation

The following require explicit partner sign-off before automatic filtering is enabled:

- [ ] Revenue hard floor AUD 500K — confirm or adjust
- [ ] Revenue ceiling flag AUD 20M — confirm or adjust
- [ ] Asking price ceiling flag AUD 10M — confirm or adjust
- [ ] NDIS: confirm current status as Medium (watchlist, not Tier 1) given funding reform discussions
- [ ] Home care (aged care — home): confirm elevation to Tier 1 (agreed in Ronan session 2026-09-16, not yet formally confirmed by Andrew)
- [ ] Preventive health / corporate wellness: confirm as Tier 2 watch (added after a16z review 2026-09-16)
- [ ] Any additional hard exclusion sectors not captured above
- [ ] VIC/NSW/QLD preference weighting for digest ordering — confirm or adjust

---

*Sources used to compile this file:*
- `shared/knowledge/investment-thesis.md`
- `shared/knowledge/sector-assessment.md`
- `memory/2026-09-16.md` (Ronan Lehane session: NDIS downgrade, home care elevation, sector upgrades)
- `docs.docgent.io/bedrock/fire-safety-services-market-analysis` (fire safety deep-dive)
- Bedrock #opportunities thread 1789639851 (sector broker sweep, 2026-09-17)
- Bedrock #opportunities thread 1789514617 (a16z / YC review, sector stress-test, 2026-09-16)

---

*This file is a draft. Automatic filtering must not be enabled until partners confirm the parameters in §12. Version this file on every material change.*
