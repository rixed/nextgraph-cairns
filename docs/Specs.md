# Cairns — functional specification

A local-first app for keeping and revisiting travel memories, whose data lives in
RDF documents. Built for people whose life is not divided into trips: no trip object, no
itinerary, no planning. Later, the same model lets a group hold a memory together.

- **Phase P0 — personal.** Offline, single-user, no sharing primitives.
- **Phase P1 — social.** Requires data sharing. Specified so P0 reserves the seams.

The app is a **view over the user's documents**, not the owner of a silo, and it runs on
top of a framework it treats as an operating system (§1.2).

---

## 1. Principles

### 1.1 Product

1. **Memory-first.** Every feature answers "what happened, where, when, with whom".
2. **No canonical hierarchy.** Time, space, and media are peer ways into the same set,
   and tags cut across all three. A user who never groups anything sees a complete app.
3. **Imprecision is data.** An approximate month, an approximate location, and a
   half-remembered guest list make a complete record. The only required field is a date,
   at any precision.
4. **Claims and evidence are distinct.** What the user asserted and what the media prove
   are separate; neither overwrites the other.
5. **Classification is cheap, narrative is deliberate.** Tagging a hundred memories is one
   gesture. Writing about them is a considered act that produces a memory of its own.

### 1.2 Platform

6. **The framework is an operating system.** Anything it provides, the app does not
   build: replication, conflict resolution, undo and recovery, document storage
   accounting, data ingestion. The app has no opinion about bytes on disk.
7. **Data is discovered, not imported.** The app does not ingest. It finds RDF documents
   already accessible to it and makes use of them. There is therefore no import feature,
   and no export feature either — the documents already belong to the user.
8. **The app holds no binaries.** Photographs, clips, and audio are documents managed by
   other applications and referenced by URI. The app never uploads, never stores, never
   copies, and never generates a binary — including at capture, which delegates to the
   camera. It has no opinion on where media live.
9. **The app has no authority; the user has all of it.** Every document in the user's store
   is hers, whichever application wrote it. The app never grants access on its own account,
   and never treats a document as beyond reach merely because another application manages
   it. It asks, itemises, and acts on instruction.
10. **Read foreign data, write only what we own** (§5). Absence of a source is normal and
    never blocks a screen.
11. **Missing capabilities are undecided boundaries, not faults.** Cairn is built alongside
    the framework and the rest of the ecosystem, so when the app needs something nobody
    provides, there is no third party to blame — the question is where that responsibility
    should live. Such cases go in the register (Appendix A). Convenient fallbacks are
    permitted; the cost of building one is the signal about how significant the boundary is.

### 1.3 Modelling

12. **Identity before sharing.** Anything later shared, referenced, or discussed gets a
    stable URI in P0.
13. **Only mint identity when it is shared.** An unnamed location or a half-remembered
    person is nested inside its memory, not given a URI.
14. **People are references, never copies.**
15. **Absence is a first-class state.** Deleted, not-yet-synced, unreadable, or (P1) not
    permitted: one rendering path, several causes.
16. **Derived data is never stored** — but a rejection of it is (§3.9). Statistics, indexes,
    grouping suggestions, media associated by overlap, and locations inferred from media are
    all recomputed; the user's "no" to any of them is remembered.

---

## 2. Vocabularies

| Prefix | Namespace | Used for |
|---|---|---|
| `schema:` | `https://schema.org/` | Memories, places, events, media, reservations |
| `foaf:` | `http://xmlns.com/foaf/0.1/` | People |
| `vcard:` | `http://www.w3.org/2006/vcard/ns#` | Contact details |
| `dcterms:` | `http://purl.org/dc/terms/` | Dates, titles, sources |
| `skos:` | `http://www.w3.org/2004/02/skos/core#` | Tags — the primary grouping vocabulary |
| `geo:` | `http://www.w3.org/2003/01/geo/wgs84_pos#` | Coordinates |
| `gsp:` | `http://www.opengis.net/ont/geosparql#` | Tracks, areas |
| `exif:` | `http://www.w3.org/2003/12/exif/ns#` | Photo capture metadata |
| `prov:` | `http://www.w3.org/ns/prov#` | Where a record came from |
| `owl:` | `http://www.w3.org/2002/07/owl#` | `owl:sameAs` for place and event reconciliation |
| `wd:` | `http://www.wikidata.org/entity/` | External place and event identity |
| `as:` | `https://www.w3.org/ns/activitystreams#` | **P1** |
| `acl:` | `http://www.w3.org/ns/auth/acl#` | **P1** |
| `app:` | *(local)* | `app:Memory`, `app:Recommendation`, `app:Preferences` only |

---

## 3. The memory

`app:Memory` ⊑ `schema:Event`. One document per memory. The only substantive object the
app owns.

| Property | Term | Notes |
|---|---|---|
| Title | `schema:name` | Optional |
| Date | `schema:startDate`, optional `schema:endDate` | Variable precision, §3.1 |
| Narrative | `schema:text` | Long-form |
| Short note | `schema:description` | For list rendering |
| Locations | `schema:location` × 0..N | Place URI or nested unnamed location, §3.2 |
| People | `schema:attendee` × 0..N | Person URI or nested bare name, §3.3 |
| Tags | `dcterms:subject` → `skos:Concept` | **The primary grouping**, §3.5 |
| Media | `schema:subjectOf` → foreign `schema:ImageObject` etc. | References only; §3.4 |
| Rating | `schema:review` → `schema:Review` | Optional, nested |
| Public event | `schema:about` → `schema:Event` | Optional, §4.3 |
| Cover | `schema:image` | Optional; a reference to one of its media |
| Provenance | `prov:wasGeneratedBy` | Only when discovered from another source |

No durations and no clock times. A memory needing clock precision has an `xsd:dateTime`
date literal.

### 3.1 Temporal precision

Precision is intrinsic to the literal's datatype, not a separate property:

| Datatype | Means | Example |
|---|---|---|
| `xsd:dateTime` | To the minute | `2019-08-14T19:30:00+01:00` |
| `xsd:date` | That day | `2019-08-14` |
| `xsd:gYearMonth` | Some time that month | `2019-08` |
| `xsd:gYear` | Some time that year | `2019` |

Rendering shows exactly the precision stored and never invents more.

**Collation rule.** Each value expands to an interval `[earliest, latest]`. Sort by
`earliest` ascending, ties broken by `latest` ascending, so coarser values sort before
finer ones within the same span. Group headers use the coarsest unit shared by the group.

**Derived spans for tags.** A tag's span is derived from the memories carrying it, rounded
out to the coarsest precision that covers them. This is how a tag appears in the time
projection without being an object in time.

**Umbrella memories.** A memory dated at coarse precision sorts to the head of its span by
the rule above. "The Van Year", a memory dated `2019` carrying the tag `van-year`, therefore
appears at the top of 2019 with everything it refers to beneath — no containment, no
hierarchy, and no special type. The app does not detect or promote such memories; the
collation rule and a cover image give them their weight.

### 3.2 Locations — the claim

| Shape | When | Representation |
|---|---|---|
| **Identified place** | The place has shared identity | URI → own place document, or external (`wd:`, OSM) |
| **Unnamed location** | Coordinates without shared identity — a wasteland, a beach, a friend's garden | Nested `schema:Place` inside the memory, with `schema:geo` and optionally free-text `schema:name`. **No URI.** Not referenceable, not shareable, not indexed. |
| **Absent** | Unknown or irrelevant | Property omitted |

Unnamed locations are found on the map, or by the tags and attendees of the memory that
holds them — not by place search, which is the correct trade for not minting identity.
Promotion to an identified place is available (S-33) and mints a URI.

### 3.3 People

| Shape | When | Representation |
|---|---|---|
| **Reference** | A contact exists | URI → local contact (P0) or remote identity (P1) |
| **Bare name** | A name with no record behind it | Nested `foaf:Person` with only `foaf:name`. No URI. |

Promoting a bare name mints a contact URI and rewrites **every** memory using the same
string, silently and without confirmation. The set is bounded — travel companions, not a
whole address book — so this is a small write, not a migration. Two people who share a
name are handled afterwards by reassigning individual memories.

### 3.4 Media — foreign evidence

**The app holds no media.** A photograph is a document someone else manages — a camera app,
a phone's gallery, a media library, or something shared into the user's store. What the app
holds is a URI.

The foreign descriptor is a `schema:ImageObject`, `schema:VideoObject`, or
`schema:AudioObject` carrying `schema:contentUrl`, `exif:dateTimeOriginal`,
`exif:gpsLatitude`/`gpsLongitude`, dimensions, and possibly a caption. All of it is
**read-only** (§5). The app writes only its own annotations, which live in the memory
document, not in the media document: a per-media note where the user wants one, and the
`schema:image` cover designation. A foreign caption is displayed when present; a local note
overrides it for display and never modifies it.

**Association is explicit or derived.**

| Kind | How | Stored |
|---|---|---|
| **Explicit** | The user attached this media to this memory | `schema:subjectOf` in the memory |
| **Derived** | The media's capture time falls inside the memory's span, and its coordinates, if any, are consistent | Never stored — computed like a booking or an expense overlap (§5) |

Derived association is what makes capture cheap: a memory recorded after the fact picks up
the afternoon's photographs without the user attaching anything. Explicit attachment exists
to include media the overlap would miss. Excluding one is a suppression recorded on the
memory (§3.9), rather than attaching everything else.

**A thumbnail is required to be pictured.** Media are featured as images — map pins at high
zoom, grid tiles, the strip on a memory — only when the descriptor carries
`schema:thumbnail` or `schema:thumbnailUrl`. Media without one still contribute a plain point
to the map and a placeholder tile to the grid, since the app states absence rather than hiding
it (§8), but it will not fetch a full-size resource to shrink it.

The requirement is deliberate rather than a limitation to be engineered around: somebody in
this ecosystem should publish derived representations, and it is not yet settled who
(**B-01**). The placeholder stays unobtrusive for the user — an ordinary empty tile, not an
accusation — while a development build marks it and its source, so the gap stays visible to
whoever is deciding the boundary. Registering it is what makes the fallback legitimate;
letting it quietly become permanent is what would not be.

Media have **no tags, people, place, or grouping of their own**; they inherit everything
from the memory that references them. This is what lets the space and media projections
colour photographs by companion, tag, or year while the memory stays the only thing the
user edits — and it is only possible because the app never has to write to the media.

**Capture delegates.** Taking a photograph from S-21 invokes the camera, which writes a
document into the user's store. The app then references it, exactly as it would reference a
photograph taken last year. There is no upload path, and no in-app camera roll.

A memory's `schema:location` is a *claim* the user made; media coordinates are *evidence*
another application recorded. Never merged:

- Both present, consistent → claim shown, evidence refines it at high zoom.
- Both present, inconsistent → claim wins in lists; the discrepancy is visible on the map
  and never silently reconciled.
- Claim absent, evidence present → a **derived location**, for the space projection only.
  Never stored. S-21 may offer to accept it as a claim.
- Neither → no spatial presence. Normal, and stated rather than hidden (§8).

EXIF coordinates are often absent, stripped in transit, or wrong, so evidence is always
overridable and never authoritative. Since the app cannot correct a foreign descriptor, a
correction is an annotation on the memory, and the discrepancy remains visible.

### 3.5 Tags — the primary grouping

Tags are `skos:Concept` in a scheme the app does not own (§5). They are the default answer
to "which memories belong together", and the only one:

- **Transverse and overlapping.** A memory can carry any number. "The van year" and "every
  time I saw Ana" overlap freely.
- **Already hierarchical**, via `skos:broader`: `Portugal 2019` → `Portugal` → `Europe`.
  This covers the structural work that memory nesting would have done, including part-whole
  relations such as an evening within a day.
- **Interoperable.** Because the scheme is shared with other apps, a grouping made here is
  legible to the hiking app and the expense tracker.
- **Cheap to apply in bulk.** Filter, select, tag — one gesture over any number of
  memories (§4.4).
- **Datable.** A tag's span is derived from its members (§3.1), so tags appear in the time
  projection without being objects in time.

A tag cannot carry a narrative, a cover image, attendees, or a rating, because it is a label
in a shared vocabulary with nowhere to put them. It does not need to: **a narrative about a
group is itself a memory.** "The Van Year" is a memory dated `2019`, titled, with a
narrative and a cover, carrying the tag `van-year` alongside everything else that carries
it. It sits among the memories it describes rather than containing them.

This is why there is no nesting in the model. Containment offered two things — a recursive
sharing grant, and a way to render members as a list. The first is unnecessary because
sharing is granular communication rather than publication (§3.8); the second is done better
by a tag, which is transverse and permits multi-membership. Removing nesting therefore
deletes cycle detection, a single-parent constraint, reparent-on-delete, depth-limited
rendering, and derived parent spans, and costs nothing.

### 3.6 Trip interoperability

**Interoperability.** A memory the user thinks of as a trip additionally asserts
`schema:Trip`, alongside `app:Memory` and `schema:Event`. Multi-typing is free in RDF, so a
travel-aware consumer recognises it while this app never branches on type. Set by a toggle
in S-21; no effect inside the app. A memory typed `schema:Trip` has no members and no
itinerary — it is a record of a trip, not a container for one.

### 3.7 Other owned objects

| Object | Type | Key properties | Doc | Phase |
|---|---|---|---|---|
| Traveller | `foaf:Person` | `foaf:name`, `schema:image` | own | P0 |
| Preferences | `app:Preferences` ⊑ `schema:CreativeWork` | capture defaults, default projection, map style, proximity, appearance, dismissed suggestions (§3.9) | own | P0 |
| Place | `schema:Place` + subtype | `schema:name`, `geo:lat`/`long`, `schema:address`, `owl:sameAs`, `schema:containedInPlace` | own, or external URI | P0 |
| Public event | `schema:Event` + subtype | `schema:name`, `schema:startDate`/`endDate` (precision-aware), `schema:location`, `schema:eventSchedule`, `owl:sameAs` | own, or external URI | P0 |
| Recommendation | `app:Recommendation` ⊑ `schema:ListItem` | §4 | in the list | P0 |
| Recommendations list | `schema:ItemList` | `schema:itemListElement` | own (one) | P0 |
| Contact | `foaf:Person`, `vcard:Individual` | `foaf:name`, `schema:image`, optional `foaf:account` | in contacts document | P0 |

Place subtypes: `schema:TouristAttraction`, `schema:FoodEstablishment`,
`schema:LodgingBusiness`, `schema:Museum`, `schema:Park`, `schema:City`,
`schema:Country`. Event subtypes: `schema:Festival`, `schema:ExhibitionEvent`,
`schema:MusicEvent`, `schema:FoodEvent`, `schema:SaleEvent`.

### 3.8 Social — P1 only

| Object | Type | Seam already in P0 |
|---|---|---|
| Remote person | `foaf:Person` + `foaf:account` | `schema:attendee` takes a URI; contacts exist |
| Access grant | `acl:Authorization` / ACP | Document grain matches grant grain |
| Share announcement | `as:Announce` | — |
| Recommendation request | `as:Question` | — |
| Incoming recommendation | `as:Note` → place or event | `app:Recommendation` already has `prov:wasAttributedTo` and an event referent |
| Comment | `as:Note` / `schema:Comment` | Memories have own URIs |
| Notification | `as:Activity` | — |
| Co-held memory | existing `app:Memory` | `schema:attendee` is the multi-party seam |

A memory with three attendees is already a shared memory conceptually. P1 makes it one
technically.

**Sharing is communication, not publication.** The social phase is for showing a person a
memory, asking where to go, and remembering something together. It is not for publishing
curated albums, so the unit of sharing is one memory or an ad-hoc selection — never a
curated hierarchy. Nobody else needs "The Van Year"; that organisation is the user's own
business.

**Sharing a memory carries its media.** The app has no authority over a media document, but
the user does — it is hers, whichever application wrote it — and the app acts on her
instruction. Sharing a memory therefore extends read access to the media it references, as
one gesture.

Not silently, though. The share sheet **itemises** what would travel and lets the user drop
any of it: a cover may be fine to share when the seventh photograph is not, and photographs
contain other people. Dropping an item at share time is the same gesture as suppressing a
derived association (§3.9).

The one case that cannot travel is **media the user does not own** — a photograph Ana shared
in, referenced in a memory now being shared onward. That is not the app's to re-grant, and the
recipient sees an unreadable reference (§8). Note that P1 creates this case rather than
inheriting it: it only arises once media start arriving from other people.

---

### 3.9 Rejected inferences

The app infers things — which memories cluster into a group, which media belong to a memory,
where a memory happened when only its photographs know. Inferences are never stored (§1.3).
**Rejections of them are.**

| Rejection | Meaning | Stored |
|---|---|---|
| Dismissed grouping suggestion | These memories are not a group | Preferences, globally |
| Suppressed media association | This photograph does not belong to this memory | On the memory |
| Declined derived location | Do not place this memory where its media were taken | On the memory |
| Dropped share item | This media does not travel with this memory (P1) | On the grant |

One rule governs all of them: **the app never re-proposes what the user rejected.** A
rejection is small, durable, and specific — it records a "no" about one pairing, not a
preference to be generalised.

This is the single deliberate exception to "derived data is never stored", and it is stated
once here rather than apologised for in four places. The alternative — recomputing an
inference the user has already refused — is the behaviour that makes software feel like it is
not listening.

## 4. Recommendations

### 4.1 Shape

`app:Recommendation` ⊑ `schema:ListItem`, in a single list document.

| Property | Term | Notes |
|---|---|---|
| Referent | `schema:item` → `schema:Place` **or** `schema:Event` | §4.2 |
| Who told you | `prov:wasAttributedTo` → contact, or `dcterms:source` → URL, or free text | |
| When told | `dcterms:date` | Precision-aware; the weaker of the two dates |
| Note | `schema:description` | What they said about it |
| Tags | `dcterms:subject` | Shared scheme |
| Fulfilled | `schema:about` → the memory that fulfilled it | Set when a memory is captured there |

The record is *"Ana told me about this in March"*, not *"I plan to go here"*. Provenance
first, which is what keeps it in a memory app, and what makes it the landing zone for P1
recommendations with no model change.

### 4.2 Place or event referents

A recommendation may be about a place that is always there, or about something that
happens at a time — a festival, an exhibition with a closing date, a Sunday market. The
referent type differs; nothing else does.

An event referent carries precision-aware `schema:startDate`/`endDate` (§3.1), a
`schema:location`, and optionally a `schema:eventSchedule` (`schema:Schedule`) for
recurrence. Events have shared identity exactly as places do, so they get URIs on the same
terms: own document, or external when one exists.

**Consequences.** Recommendations acquire **urgency and expiry**: a festival is live in
June and historical in September. Heard-about therefore sorts by what is happening soon,
and Here-and-Now gains its best card — *the thing Ana told you about is happening this
week, and you are two kilometres away*. That intersection of proximity and event date is
the whole recommendation model paying off, and it needs no new machinery.

Expired recommendations are never deleted. A festival that passed is still a record that
Ana suggested it, and recurring events come round again.

### 4.3 Memories about public events

A memory may reference a public event with `schema:about`. This groups every time the user
attended the same recurring thing, across years, without needing a tag — a second
grouping mechanism that costs nothing because the event document already exists.

### 4.4 Selection and bulk actions

Not a screen: a capability of every browse projection (§5.2). On any filtered set the user
may select memories and then:

| Action | Result |
|---|---|
| **Tag these** | Adds one or more concepts to every selected memory. The common case. |
| **Write a memory about these** | Ensures the selection shares a tag, then creates a new memory carrying that tag and opens S-21 with a derived date span. The deliberate case. |
| Untag, retag | Bulk edit of existing tags |
| Reattach media | Point selected media at a different memory — changes references, moves nothing (media projection only) |
| Delete | With the framework's recovery behind it (§1.2) |

One gesture, two depths: classification for the hundred, narrative for the few. Both produce
tags; only the second produces a memory.

---

## 5. Foreign data

Read when present. None required. None gets a management UI.

| Domain | Read | Write | Absent |
|---|---|---|---|
| **Bookings** | `schema:*Reservation` — flights, lodging, trains, restaurants, tickets, with exact `xsd:dateTime` and confirmation numbers. Shown on Here-and-Now when imminent, and on a memory by date overlap. | Nothing | No logistics anywhere, no prompt |
| **Expenses** | Amounts, currencies as recorded, dates, categories, locations. Joined to a memory by date and location overlap. Displayed as recorded; never converted. | Nothing | No spend figures |
| **Tracks** | `gsp:Geometry` / GPX. A map layer, and shown on a memory when times overlap. | Nothing | No track layer |
| **Media** | `schema:ImageObject` / `VideoObject` / `AudioObject` — `contentUrl`, `thumbnail`/`thumbnailUrl`, EXIF time and coordinates, dimensions, caption. Associated with a memory explicitly or by time overlap (§3.4). | Nothing. Annotations, cover designation, and suppressions live in the memory. | The media projection is empty and the map loses its high-zoom detail; everything else works. A source without thumbnails yields points and placeholders, not pictures. |
| **Tags** | `skos:ConceptScheme` + concepts | **Appends concepts only** — never renames, merges, deletes | Falls back to a locally-owned scheme, offers hand-over if a manager appears |
| **Contacts** | `foaf:Person` / `vcard:Individual` | **Appends contacts only**, on promotion | Falls back to a locally-owned contacts document |
| **Places, events** | External gazetteers and event sources for identity and metadata | Mints one only when no external match exists | Custom and unnamed only; app still complete |
| **Calendar** | `schema:Event` as capture hints for the date picker | Nothing | No suggestions |

**Two rules.** Every foreign section is *conditional* — present when data exists, silently
absent otherwise, never an empty state advertising an app the user does not have. And
foreign objects are shown but never edited: the only outbound action is to open the owning
app.

Tags and contacts are the exceptions where this app writes, because both are **user-owned
documents that no app owns**. Appending is legitimate for any app; restructuring is not.

---

## 6. Screens

**Tabs:** Here and Now (S-01) · Browse (S-22) · People (S-60) · Heard about (S-40) · Me (S-70)

### 6.1 Inventory

| ID | Screen | Phase |
|---|---|---|
| S-00 | Onboarding | P0 |
| S-01 | Here and Now | P0 |
| S-02 | Search | P0 |
| S-20 | Memory detail | P0 |
| S-21 | Memory capture / editor | P0 |
| S-22 | Browse — shell, filter, selection | P0 |
| S-22a | · Time projection | P0 |
| S-22b | · Space projection | P0 |
| S-22c | · Media projection | P0 |
| S-31 | Place detail | P0 |
| S-32 | Place picker | P0 |
| S-33 | Unnamed / custom place editor | P0 |
| S-34 | Event detail | P0 |
| S-40 | Heard about | P0 |
| S-41 | Recommendation editor | P0 |
| S-51 | Media detail | P0 |
| S-60 | People | P0 |
| S-61 | Person detail | P0 |
| S-70 | Me | P0 |
| S-71 | Stats | P0 |
| S-72 | Tags | P0 |
| S-75 | Settings | P0 |
| S-76 | Data sources | P0 |
| S-80 | Unavailable reference | P0 |
| X-01 | Share sheet | P1 |
| X-02 | Access review | P1 |
| X-03 | Notification inbox | P1 |
| X-04 | Shared with me | P1 |
| X-05 | Ask for recommendations | P1 |
| X-06 | Requests received | P1 |
| X-08 | Comment thread | P1 |
| X-09 | Friends layer | P1 |
| X-10 | Activity feed | P1 |

### 6.2 Screen detail

**S-00 Onboarding** — P0
Name and locale confirmation. Creates profile, preferences, empty recommendations list.
Runs the data-source census and reports what it found, which doubles as the first
explanation of what the app is. No account, no login.

**S-01 Here and Now** — P0
Organised by proximity and imminence rather than by date alone. Cards, in priority order:

1. A recommendation whose event is happening now or soon **and** is nearby — the app's
   best moment (§4.2).
2. A booking within the next day or two, from a foreign source.
3. A recommended place nearby, whether or not it has a date.
4. A memory captured recently and still thin, offering to fill it in.
5. This day in previous years.

Passive proximity only: the screen shows what is nearby when opened. Push notifications for
proximity are deliberately later, having different permission and battery consequences.
Persistent quick-capture button.

Functionally this is Browse with the filter pinned to *here* and *now*, which is why it
needs no machinery of its own.

**S-02 Search** — P0
Free-text over memories, narrative bodies, places, events, people, tags, recommendations.
Results grouped by type. Distinct from the browse filter: search is a query, browse is
faceted. Any result set can be handed to S-22 as a filter, which is how a text search
becomes a bulk tagging operation.

**S-20 Memory detail** — P0
Title or date as heading; date at stored precision; narrative; locations; attendees; tags;
media; rating. Locations link to S-31 when identified, or show an inline map when unnamed.
Attendees link to S-61 when contacts, or offer promotion when bare names. A public-event
reference links to S-34. Conditional foreign sections: overlapping bookings,
expenses, tracks. Sibling memories at the same place, with the same people, sharing tags,
or about the same public event.
*P1:* comments, share, who else remembers this.

**S-21 Memory capture / editor** — P0
The most-used surface, one tap from S-01. Only a date is required, defaulting to now at day
precision. Optional: title, narrative, date with precision selector, locations (0..N —
identified via S-32 or a dropped pin), attendees (0..N — contacts or typed names), tags,
media, rating, public event, and an "also a trip" toggle adding the `schema:Trip`
type.

Media are **selected, not uploaded**: a picker over the user's discoverable media documents,
pre-filtered to the memory's span and location and showing what would be associated by
overlap anyway, so the user attaches only the exceptions. A camera button delegates to the
camera application and references whatever document it writes. Offers a derived location when
media carry coordinates and none is claimed. Capturing
at a recommended place or event marks that recommendation fulfilled.

**S-22 Browse** — P0
The shell: filter bar, projection switcher, selection mode. Filter and scroll position
survive projection switches. Empty filter means the whole archive.

Filter facets: date range (precision-aware), tags (any/all), people, places (transitively
via `schema:containedInPlace`), public event, has media, depth (top-level / flattened).

- **S-22a Time** — chronological list, grouped per the collation rule. Tags shown inline.
  Default projection. Offers dismissible **grouping suggestions**: clusters detected in
  time and space, with one tap to tag them or write a memory about them. A dismissal is
  remembered and never re-proposed (§3.9).
- **S-22b Space** — map. Memory claims at low zoom dissolving into individual media points
  at high zoom; derived locations rendered distinctly; conditional track layer; time
  scrubber bound to the filter's date range. Long-press captures at a dropped pin.
  Clustering with a representative thumbnail where one exists, a plain marker where none
  does (§3.4). States how many filtered memories have no
  spatial presence (§8) rather than dropping them silently.
  *P1:* friends layer (X-09).
- **S-22c Media** — grid of discovered media, grouped by day or memory, showing explicitly
  attached and overlap-associated items alike with the distinction visible on demand. Media
  without a thumbnail occupy a placeholder tile rather than vanishing. Photo
  density, not shaded borders, is
  this app's life-map: where someone pointed a camera is a better lens on a nomadic life
  than a nation-state's outlines. Opened scoped from S-20, S-31, S-34, or S-61, which
  simply pre-set the filter.

All three support selection and the bulk actions of §4.4.

**S-31 Place detail** — P0
Name, type, address, coordinates, external identifier, containing chain. Your memories
here, recommendation status, media taken here, events here, conditional spend. Actions:
capture a memory, add a recommendation, edit if locally owned, open externally.
*P1:* who recommended it, who else has been.

**S-32 Place picker** — P0
Returns a place *reference*. Four groups: places you know, external gazetteer matches,
events at a place, and "drop a pin instead" — which returns an unnamed location rather than
a place, and is right more often than it looks.

**S-33 Unnamed / custom place editor** — P0
Edits an unnamed location's coordinates and free-text name. Handles **promotion** to an
identified place, optionally reconciling via `owl:sameAs`, minting a URI and rewriting the
referring memory.

**S-34 Event detail** — P0
A public event: name, dates at stored precision, recurrence, location. Whether a
recommendation points at it and who made it. Every memory of yours about it, across years.
Actions: capture a memory about it, add a recommendation, open externally.

**S-40 Heard about** — P0
Places and events you have been told about. Default sort: **happening soonest**, then
nearest, then most recently told. Shows who told you and when, and marks expired and
fulfilled items without hiding them. Filter by source, tag, country, type, fulfilled,
still-upcoming. Hands off to S-22b for the map.
*P1:* incoming recommendations land here; X-05 asks for more.

**S-41 Recommendation editor** — P0
Referent via S-32 (place) or event search, source (contact, URL, or free text), date told,
event dates if the referent is a new event, tags, note.

**S-51 Media detail** — P0
Full-bleed viewer, swipe between siblings in the current filter. Caption, capture time,
coordinates, dimensions, referencing memory, and which application owns the document. All
foreign metadata is read-only; the user may add a local note, designate the media as a
memory's cover, attach or detach it, or suppress a derived association (§3.9). Shows when its
coordinates disagree with the memory's claim, resolvable on the memory's side only.

There is no delete: the app cannot remove a document it does not own, and offers to open the
owning application instead.

**S-60 People** — P0
Contacts ordered by memory count or recency, each showing how many memories they appear in.
Bare names found across memories listed separately with a promote action. Local-only in P0:
no invitation, no network.

**S-61 Person detail** — P0
A person and every memory they appear in, with buttons into each projection filtered to
them. Shared places, first and last memory together, tags in common. Fully useful with zero
sharing, and the app's clearest on-ramp to the community phase.
*P1:* their identity, their shared groups, their recommendations.

**S-70 Me** — P0
Profile and menu into S-71, S-72, S-75, S-76. Counters: memories, places, countries,
people, tags.
*P1:* rows for X-02, X-03, X-04, X-10.

**S-71 Stats** — P0
Countries and cities with first and last memory, memories per year, most-revisited places,
most-frequent companions, tag distribution, longest unbroken stretch away from any repeated
place. Precision-aware: a `gYear` memory counts toward its year and nothing finer. All
derived.

**S-72 Tags** — P0
The primary navigation of groupings, now that tags carry that role. The scheme as a
browsable tree with usage counts and derived spans, tapping through to a filtered S-22a.
Append a concept. Rename, merge, and delete only when the scheme is locally owned;
otherwise replaced by a link to the owning tag manager.

**S-75 Settings** — P0
Capture defaults including default date precision, default browse projection and depth, map
style, passive proximity radius, appearance. Deliberately sparse: locale, date format, and
units come from the device, and currency is unnecessary because foreign amounts are
displayed as recorded and never converted. The screen exists because it is where later
features land — proximity notifications, sharing defaults, publication settings.

**S-76 Data sources** — P0
A census of the RDF data this app can discover and what it would do with each source: what
it provides, when it was last read, a toggle. For media sources it also reports **whether
thumbnails are available**, since that alone decides whether the map and the media grid show
pictures or placeholders (§3.4).

Signals at the **source** level, not the item level: a source that publishes no thumbnails is
worth knowing about, whereas one photograph missing one is just data. In a development build
this screen also lists which responsibilities the app is currently borrowing — a locally-owned
tag scheme, a locally-owned contacts document — cross-referenced to Appendix A. Nothing about storage, bytes, caches, or
replication — the framework owns those (§1.2). This is the screen that makes the framework
legible, so it is a demo surface as much as a settings surface, and it is where sharing
lands in P1.

**S-80 Unavailable reference** — P0
A required rendering state, inline and full-screen. Distinguishes deleted, not-yet-synced,
and (P1) not permitted, offering the one sensible action for each.

### 6.3 Deferred screens — P1

**X-01 Share sheet** — grant or revoke access to one memory or an ad-hoc selection,
**itemising the media that would travel with it** and letting the user drop any of it (§3.8).
Marks media the user does not own as unable to travel. From S-20, S-22 (on a selection), S-40,
S-61.
**X-02 Access review** — everything shared, with whom, since when. From S-70, S-76.
**X-03 Notification inbox** — incoming activities. From S-01, S-70.
**X-04 Shared with me** — memories, groups, recommendations others granted. From S-70.
**X-05 Ask for recommendations** — a request scoped to a place, an area, or a date range.
From S-31, S-34, S-40.
**X-06 Requests received** — requests aimed at you, answered with place or event references
via S-32. From X-03.
**X-08 Comment thread** — on a memory. From S-20.
**X-09 Friends layer** — others' memory locations and recommendations, a layer in S-22b.
**X-10 Activity feed** — from people you follow. From S-70.

---

## 7. Navigation

### 7.1 P0 edges

| From | To | Trigger |
|---|---|---|
| S-00 | S-01 | finish onboarding |
| S-00 | S-76 | review discovered sources |
| S-01 | S-21 | quick capture |
| S-01 | S-20 | tap a thin or on-this-day memory |
| S-01 | S-31 | tap a nearby recommended place |
| S-01 | S-34 | tap a nearby or imminent recommended event |
| S-01 | S-40 | see all recommendations |
| S-01 | S-02 | search |
| S-01 | *foreign app* | tap an imminent booking |
| S-02 | S-20, S-31, S-34, S-61, S-41 | tap a result of the matching type |
| S-02 | S-22 | apply results as a filter, to select and bulk-act |
| S-20 | S-21 | edit |
| S-20 | S-31 | tap an identified location |
| S-20 | S-33 | tap an unnamed location |
| S-20 | S-34 | tap the public event |
| S-20 | S-61 | tap an attendee who is a contact |
| S-20 | S-60 | promote a bare-name attendee |
| S-20 | S-20 | tap a sibling by place, people, tag, or public event |
| S-20 | S-22c | tap the media strip (filter scoped to this memory) |
| S-20 | S-22a | tap a tag |
| S-20 | *foreign app* | tap an overlapping booking, expense, or track |
| S-21 | S-32 | add a location |
| S-21 | S-33 | drop and adjust a pin |
| S-21 | S-60 | pick an attendee |
| S-21 | S-72 | add a tag |
| S-21 | S-34 | link a public event |
| S-21 | S-20 | save |
| S-22 | S-22a / b / c | switch projection, filter and selection preserved |
| S-22 | S-72 | choose tags for a bulk tag action |
| S-22 | S-21 | "write a memory about these" on a selection |
| S-22a | S-20 | tap a memory |
| S-22a | S-21 | add memory |
| S-22b | S-20 | tap a memory pin |
| S-22b | S-31 | tap a place pin |
| S-22b | S-51 | tap a media point at high zoom |
| S-22b | S-32 | search in map |
| S-22b | S-21 | long-press to capture here |
| S-22c | S-51 | tap an item |
| S-22c | S-20 | tap a group header |
| S-22c | *caller* | return a selection when used as a picker |
| S-31 | S-20 | tap one of your memories here |
| S-31 | S-21 | capture a memory here |
| S-31 | S-34 | tap an event at this place |
| S-31 | S-41 | add a recommendation |
| S-31 | S-33 | edit a locally-owned place |
| S-31 | S-22c | media taken here |
| S-31 | S-22b | show on map |
| S-32 | S-33 | drop a pin instead |
| S-32 | *caller* | return a place reference or unnamed location |
| S-33 | S-31 | promote to an identified place |
| S-33 | *caller* | save an unnamed location |
| S-34 | S-20 | tap one of your memories about it |
| S-34 | S-21 | capture a memory about it |
| S-34 | S-31 | tap its location |
| S-34 | S-41 | add a recommendation |
| S-40 | S-41 | tap an item, or add |
| S-40 | S-31 | tap a place referent |
| S-40 | S-34 | tap an event referent |
| S-40 | S-61 | tap who recommended it |
| S-40 | S-20 | tap the memory that fulfilled it |
| S-40 | S-22b | show on map |
| S-41 | S-32 | pick a place referent |
| S-41 | S-34 | pick or create an event referent |
| S-41 | S-60 | pick a source contact |
| S-41 | S-40 | save or cancel |
| S-51 | S-20 | tap the owning memory |
| S-51 | S-31 | tap the location |
| S-51 | S-22c | delete or back |
| S-60 | S-61 | tap a person |
| S-60 | S-20 | tap a memory in a promotion preview |
| S-61 | S-22a, S-22b, S-22c | their memories, filtered to them |
| S-61 | S-20 | tap a memory |
| S-61 | S-31 | tap a shared place |
| S-70 | S-71, S-72, S-75, S-76 | menu rows |
| S-71 | S-31 | tap a country or city |
| S-71 | S-61 | tap a frequent companion |
| S-71 | S-22a | tap any count |
| S-72 | S-22a | tap a usage count |
| S-72 | *caller* | return concepts to a bulk tag action |
| S-72 | *foreign app* | manage the scheme, when foreign |
| S-75 | S-72, S-76 | rows |
| S-76 | *foreign app* | tap a source |
| S-80 | *caller* | dismiss |
| S-80 | S-76 | "not synced" → check sources |

### 7.2 P1 edges

Every one attaches to an existing P0 screen. No P0 screen is restructured.

| From | To | Trigger |
|---|---|---|
| S-01 | X-03 | notification badge |
| S-20 | X-01 | share this memory |
| S-20 | X-08 | comments |
| S-22 | X-01 | share a selection (enumerated grant) |
| S-22b | X-09 | friends layer toggle |
| S-31 | X-05 | ask about this place |
| S-31 | S-61 | tap someone who recommended it *(existing screen, remote person)* |
| S-34 | X-05 | ask about this event |
| S-40 | X-05 | ask for recommendations |
| S-61 | X-01 | share a memory you both appear in |
| S-70 | X-02, X-03, X-04, X-10 | menu rows |
| S-76 | X-02 | sharing and access |
| X-01 | X-02 | review who has access |
| X-03 | X-06 | tap a request |
| X-03 | S-20 | tap an activity about your own memory |
| X-04 | S-20 | open a shared memory |
| X-05 | S-60 | choose recipients *(existing screen)* |
| X-06 | S-32, S-34 | pick places or events to recommend *(existing screens)* |
| X-08 | S-61 | tap a commenter *(existing screen)* |
| X-09 | S-61 | tap a friend's pin *(existing screen)* |
| X-10 | S-61, S-31, S-34 | tap feed items |

### 7.3 What P0 must get right

1. **S-60 / S-61 exist and are useful with zero sharing.** Most P1 edges target an existing
   screen, so the social phase mostly means feeding remote data to screens already built.
2. **`schema:attendee` takes a URI from day one**, even when every value is local.
3. **S-32 and S-34 return references, not copies**, so X-06 reuses them unchanged.
4. **S-80 handles two of three causes already**, so permission failure is a third case in an
   existing switch, not a retrofit across 20 screens.
5. **Foreign sections are already conditional**, so shared-but-unavailable data reuses the
   rendering path built for foreign-app-absent.
6. **Media are already references**, so the unreadable state for a shared memory's media is
   the same rendering path as media-source-absent, and itemised granting reuses the
   suppression gesture (§3.9).
7. **Selection already exists in Browse**, so sharing an ad-hoc set is a new action on an
   existing gesture rather than a new screen.

---

## 8. States every screen must specify

| State | Applies to | Requirement |
|---|---|---|
| Empty | every list | An action, not an illustration |
| First-run empty | S-22a–c, S-40, S-60, S-71 | Distinct from ordinary empty; may point at S-76 |
| Filter yields nothing | S-22a–c | Names the facet most likely responsible and offers to drop it |
| Nothing here, nothing now | S-01 | Falls back to on-this-day, then to a capture prompt; never blank |
| Foreign source absent | S-01, S-20, S-22b, S-72 | Section silently absent — never an empty state advertising another app |
| Media unreachable | S-20, S-22b, S-22c, S-51 | Placeholder at the media's known dimensions if recorded, naming the cause; never a broken image |
| Media without thumbnail | S-22b, S-22c | A plain map marker and a placeholder tile; counted, never hidden, never fetched full-size to shrink |
| Broken reference | anything following a cross-document link | S-80 inline; never blanks the screen |
| Partially loaded | S-20, S-22a–c, S-61, S-71 | Render what is available immediately |
| Coarse date | S-22a, S-22b, S-40, S-71 | Show stored precision; never invent finer |
| Expired recommendation | S-40, S-01 | Marked, never hidden or deleted |
| No spatial presence | S-22b | State how many filtered memories cannot appear, one tap to S-22a |
| Derived location | S-22b, S-51 | Visually distinct from a claim; never silently promoted |
| Evidence conflict | S-51, S-22b | Discrepancy shown, resolvable either way |
| Selection active | S-22a–c | Count visible, bulk actions reachable, escape obvious |
| Location unavailable | S-01, S-22b | Proximity cards absent, not broken; the rest of the screen works |
| Offline | all | No degradation in P0 |

---

## 9. Out of scope

Trips as an object. Itineraries. Planning. Packing. Booking or purchasing. Expense entry.
Budgets. Currency conversion. Durations and clock times except where a date literal supplies
them. Accounts and authentication in P0. Background-location capture. Proximity push
notifications in P0. Algorithmic recommendations. Real-time collaborative editing. Import
and export. Storage management. Undo and version history. Shaded map regions. An outline
browser for nesting. Memory hierarchies of any kind. Publishing. Media storage, upload, deletion, thumbnail generation, and any in-app camera roll.

---

## 10. Open questions

Questions Cairn itself must answer. Questions about which *component* should answer something
live in Appendix A instead.

1. **Recurrence** via `schema:eventSchedule` is specified but not designed. A Sunday market
   needs a rule for "when is the next occurrence" that Here-and-Now can evaluate cheaply.
   Simplest first cut: support only single-interval events, treat recurrence as free text.
2. **Grouping suggestions** need a clustering rule — gap threshold, distance from a frequent
   place, minimum member count.
3. **Enumerated tag grants** (P1) do not retroactively include memories tagged after the
   grant. Acceptable, or does a shared tag set need a container of its own — which would make
   it an object again, and reopen the grouping decision?
4. **Does a memory need more than one public event reference?** A day at a festival that also
   happened to be a national holiday. Currently one; probably fine, tags cover the rest.
5. **What the share sheet shows on partial failure** — the memory grant succeeds, three of
   eleven media grants do not. Cairn's problem regardless of who provides granting (**B-07**).

---

## Appendix A — Boundary register

Cairn is built alongside the framework and the rest of the ecosystem. When the app needs a
capability nobody provides, that is not a fault to report but a **boundary not yet decided**:
which component should own this? Surfacing those questions concretely is one of the reasons
this app exists.

**How to use it.** An entry names a *capability*, never an app. Adding one costs nothing, so
add early. A fallback is allowed and expected — record it, and record roughly what it cost,
because **the cost is the signal**: a stopgap built in an afternoon says the boundary is
low-stakes and can wait; one that spreads through the codebase says a real seam has been
found. Resolved entries stay, marked, because how a boundary was settled is more useful later
than the fact that it was.

**Status.** *Open* — no owner agreed. *Assigned* — owner agreed, not yet available.
*Decided* — settled and implemented.

| ID | Capability needed | Candidate owners | Cairn's stopgap | Cost | Status |
|---|---|---|---|---|---|
| **B-01** | Derived media representations (thumbnails, and by extension previews and transcodes) | Camera app; a media-library app; the framework as a derived-representation service; a convention binding anyone publishing an `ImageObject` | Plain map markers and placeholder tiles (§3.4) | Low | **Open** |
| **B-02** | A shared tag vocabulary several apps read and extend | A dedicated tag manager; a user-owned document no app owns; a framework-level registry | Locally-owned SKOS scheme, append-only, with hand-over if a manager appears | Low so far; hand-over undesigned | **Decided in principle** — user-owned document, any app may append, none may restructure. The exemplar for B-03 and B-04. |
| **B-03** | Person identity and contacts | A contacts app; a user-owned document; a framework identity service (which P1 needs anyway for remote identity) | Locally-owned contacts document, appended on promotion | Low in P0 | **Open** — B-02's answer probably applies, but P1 identity raises the stakes |
| **B-04** | Place identity and gazetteer reconciliation | External gazetteers (Wikidata, OSM); a places app; per-app minting with `owl:sameAs` | Mint a place only when no external match exists | Low | **Open** — leaning to B-02's shape |
| **B-05** | Deletion, recovery, and version history | The framework | None. Deletion is plainly destructive until recovery exists | Zero, unverified | **Assigned** to the framework (§1.2), which is why S-77 was removed |
| **B-06** | Atomic or best-effort writes across many documents | The framework SDK | Best-effort, used by bare-name promotion (§3.3) | Unknown until exercised | **Assigned** |
| **B-07** | Access grants: granularity, itemisation, and partial-failure semantics | The framework | None — P1 depends on it entirely | Blocking for P1 | **Open** |
| **B-08** | Full-text search across a user's documents | The framework; a per-app index; an indexing service | Per-app index over discovered documents | Unknown; likely the largest stopgap in the app | **Open** — S-02 assumes this exists |
| **B-09** | Invoking another app and receiving the document it produced | The framework as an intent mechanism; the OS | None. Capture delegation (§3.4) assumes it | Blocking for camera capture | **Open** |
| **B-10** | A convention for temporal precision | Ecosystem-wide convention; each app independently | Cairn's own datatype convention (§3.1) | Low, but divergence is costly later | **Open** — if the expense and hiking apps cannot express `gYear`, joins across apps degrade quietly |
| **B-11** | Joining documents by time and location overlap | The framework as a query capability; each app | Cairn computes its own overlaps for media, bookings, expenses, tracks (§5) | Moderate and repeated per domain | **Open** — the repetition is itself the argument |
| **B-12** | Discovering which sources provide what | The framework's type registry; per-app probing | Registry plus probing, reported in S-76 | Low | **Decided** — registry, as specified |

Two limits on the whole exercise. Exposing a boundary must never cost the user data — a gap
can be revealed without being destructive. And it must never mean refusing to function: an app
that will not render a media grid because thumbnails are absent demonstrates nothing except
that it is broken. Reveal by annotation, not by failure.

