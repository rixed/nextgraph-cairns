# This is the entry point for every build task: package.json deliberately
# carries no scripts, so the tools are invoked directly here.

.PHONY: all help install build run dev test check orm e2e clean

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
	@echo '  - e2e: Drive milestone 1 through headless Chrome. Needs the'
	@echo '         devstack up (see docs/Dev.md) and the app served'
	@echo '         alongside, by `make run` or `make dev`'
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

e2e: node_modules
	node tools/browse.mjs m1

clean:
	rm -rf dist
