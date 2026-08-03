# This is the entry point for every build task: package.json deliberately
# carries no scripts, so the tools are invoked directly here.

.PHONY: all help install build run dev test check orm e2e e2e-m1 e2e-m2 e2e-m3 e2e-m4 e2e-m5 e2e-m6 spike9 spike10 tagpicker siblings grouping search search-probe seed-media seed-clips seed-foreign seed-foreign-clean clean

PNPM = pnpm
# Vite serves on this port for both dev and preview (see vite.config.ts).
# The wallet login URL in docs/Dev.md points at it.
PORT = 4567

all: help

help:
	@echo 'Targets:'
	@echo '  - help: This'
	@echo
	@echo '  - build: Build the app into dist/'
	@echo '  - run: Build, then serve it on http://localhost:$(PORT)'
	@echo '  - dev: Serve with hot reload instead, on the same port'
	@echo
	@echo '  - test: Run the unit tests'
	@echo '  - check: Typecheck the app'
	@echo '  - e2e: Drive every milestone through headless Chrome, or'
	@echo '         e2e-m1 … e2e-m6 for one of them. Needs the devstack up'
	@echo '         (see docs/Dev.md) and the app served alongside, by'
	@echo '         `make run` or `make dev`'
	@echo '  - spike9: Drive the MapLibre spike (needs the devstack too)'
	@echo '  - spike10: Drive the list-document spike (idem)'
	@echo '  - tagpicker: Drive the tag combobox end to end (idem)'
	@echo '  - siblings: Drive S-20'"'"'s sibling sections end to end (idem)'
	@echo '  - grouping: Drive S-22a'"'"'s grouping suggestions (idem)'
	@echo '  - search: Drive S-02 end to end, no index (B-08) (idem)'
	@echo '  - search-probe: Measure what SPARQL can do for search (B-08)'
	@echo '  - seed-media: Write COUNT fixture media documents into the'
	@echo '         store, standing in for the applications that would'
	@echo '         normally have taken the pictures (default 40)'
	@echo '  - seed-clips: The same, for one video and one audio document'
	@echo '  - seed-foreign: Write the other half of the store — contacts,'
	@echo '         tags, places, events, reservations and tracks — standing'
	@echo '         in for every application Cairns reads and never writes.'
	@echo '         CONTACTS=$(CONTACTS) TRACKS=$(TRACKS) to vary it'
	@echo '  - seed-foreign-clean: Remove exactly what seed-foreign wrote'
	@echo
	@echo '  - orm: Regenerate src/shapes/orm/ from the SHEX schemas'
	@echo '  - install: Install dependencies'
	@echo '  - clean: Remove dist/'

node_modules: package.json pnpm-lock.yaml
	$(PNPM) install --frozen-lockfile
	@touch node_modules

install: node_modules

build: node_modules
	$(PNPM) exec vite build

run: build
	$(PNPM) exec vite preview

dev: node_modules
	$(PNPM) exec vite

test: node_modules
	$(PNPM) exec vitest run

check: node_modules
	$(PNPM) exec svelte-check --tsconfig ./tsconfig.json

# The generated files are committed, so this is only needed after editing a
# schema in src/shapes/shex/.
orm: node_modules
	$(PNPM) exec rdf-orm build --input ./src/shapes/shex --output ./src/shapes/orm

e2e: e2e-m1 e2e-m2 e2e-m3 e2e-m4 e2e-m5 e2e-m6

e2e-m1: node_modules
	node tools/browse.mjs m1

e2e-m2: node_modules
	node tools/browse.mjs m2

e2e-m3: node_modules
	node tools/browse.mjs m3

e2e-m4: node_modules
	node tools/browse.mjs m4

e2e-m5: node_modules
	node tools/browse.mjs m5

e2e-m6: node_modules
	node tools/browse.mjs m6

spike9: node_modules
	node tools/browse.mjs spike9

spike10: node_modules
	node tools/browse.mjs spike10

# The tag combobox, end to end: completion scoped to a parent, and creation of
# a path that does not exist yet. Self-cleaning.
tagpicker: node_modules
	node tools/browse.mjs tagpicker

# S-20's sibling sections: two memories that share a person and a tag find each
# other, and one opens the other. Self-cleaning.
siblings: node_modules
	node tools/browse.mjs siblings

# S-22a's grouping suggestions: three memories on consecutive days are
# offered as one episode, and either action hands the run to the bulk bar.
grouping: node_modules
	node tools/browse.mjs grouping

# S-02 end to end: a needle in a title, a narrative and a tag; the results
# grouped by type and handed to S-22 as a filter. Self-cleaning.
search: node_modules
	node tools/browse.mjs search

# B-08: what free-text search can do with SPARQL alone. NEEDLE=... to vary it.
NEEDLE = lisboa
search-probe: node_modules
	node tools/browse.mjs search-probe $(NEEDLE)

# Cairns never writes a media document; this fixture plays the app that would.
COUNT = 40
seed-media: node_modules
	node tools/browse.mjs spike6 $(COUNT) 8

seed-clips: node_modules
	node tools/browse.mjs seed-clips

# The rest of the store: everything Cairns reads and never writes (Specs §5),
# plus contacts, which go into the shared people document any app may append to.
# Every subject is marked, so seed-foreign-clean removes exactly these and
# leaves the real archive — and other people's testing — alone.
CONTACTS = 60
TRACKS = 4
seed-foreign: node_modules
	node tools/browse.mjs seed-foreign $(CONTACTS) $(TRACKS)

seed-foreign-clean: node_modules
	node tools/browse.mjs seed-foreign-clean

clean:
	rm -rf dist
