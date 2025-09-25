// This file is intentionally small because the heavy work (PDF to text) is done at build time.
// The page fetches 'search_index.json' (built by GitHub Actions) and then does a simple substring
// search to produce snippets. See scripts/build_index.py and .github/workflows/build-index.yml.
