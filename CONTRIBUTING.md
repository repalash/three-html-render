# Contributing

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/repalash/three-html-render.git
cd three-html-render
npm install
npm run dev
```

Open http://localhost:5173 to see the demo.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build library (ESM + CJS + .d.ts) |
| `npm run typecheck` | TypeScript type checking |

## Pull Requests

1. Fork and branch from `master`
2. Make your changes
3. Run `npm run typecheck && npm run build` to verify
4. Open a PR with a clear description of the change

## Reporting Bugs

Open an issue with:
- What you expected vs what happened
- Steps to reproduce
- Browser and Three.js version

## Code Style

- TypeScript, no semicolons (except where ASI is ambiguous)
- No unnecessary comments — code should be self-explanatory
- Keep math comments for reference formulas
