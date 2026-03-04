.PHONY: install build watch test lint package vsix clean help

## —————————————————————————————————————————————
## z/OS Assistant for Copilot — Build commands
## —————————————————————————————————————————————

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci

build: ## Bundle for development
	npm run bundle

watch: ## Bundle and watch for changes
	npm run bundle:watch

test: ## Run unit tests
	npm test

test-cov: ## Run tests with coverage report
	npm test -- --coverage

lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	npm run lint:fix

package: ## Bundle for production (minified)
	npm run package

vsix: package ## Build VSIX package
	npm run vsix

install-ext: vsix ## Build VSIX and install locally
	code --install-extension $$(ls -t *.vsix | head -1)

clean: ## Remove build artifacts
	npm run clean

version-patch: ## Bump patch version (0.1.0 → 0.1.1)
	npm version patch --no-git-tag-version

version-minor: ## Bump minor version (0.1.0 → 0.2.0)
	npm version minor --no-git-tag-version
