# This is the entry point for every build task: package.json deliberately
# carries no scripts, so the tools are invoked directly here.

.PHONY: all help install build run dev test check orm e2e e2e-m1 e2e-m2 seed-media clean

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
	@echo '         e2e-m1 / e2e-m2 for one of them. Needs the devstack up'
	@echo '         (see docs/Dev.md) and the app served alongside, by'
	@echo '         `make run` or `make dev`'
	@echo '  - seed-media: Write COUNT fixture media documents into the'
	@echo '         store, standing in for the applications that would'
	@echo '         normally have taken the pictures (default 40)'
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

e2e: e2e-m1 e2e-m2

e2e-m1: node_modules
	node tools/browse.mjs m1

e2e-m2: node_modules
	node tools/browse.mjs m2

# Cairns never writes a media document; this fixture plays the app that would.
COUNT = 40
seed-media: node_modules
	node tools/browse.mjs spike6 $(COUNT) 8

clean:
	rm -rf dist
