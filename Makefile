.PHONY: dev test lint lint-fix type-check build format format-check ci hooks

dev:
	bash scripts/dev.sh

test:
	npm run test --workspaces

lint:
	npm run lint --workspaces

lint-fix:
	npm run lint:fix --workspaces

type-check:
	npm run type-check --workspaces

build:
	npm run build --workspaces

format:
	npm run format

format-check:
	npm run format:check

ci:
	npm ci && npm run type-check && npm run lint && npm run build && npm test

hooks:
	git config core.hooksPath .githooks
