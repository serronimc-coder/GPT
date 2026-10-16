---
name: ui-design-library
description: Reusable UI designs built in this repo, ready to drop into any project. Use when the user asks for one of these looks or components, or says "use my design", "same style as before", "my login page", "my navbar", "my sidebar", "my carousel": neumorphic login, dark "Flow" login (orb, Google/Apple), liquid navbar (mint blob), glass navbar with light/dark toggle, responsive sidebar "Hello Diet", 3D card carousel (HTML or React + Tailwind).
---

# UI design library

Six finished designs live in `references/`. Each file is complete and was tested in a browser. Start from the file, then adapt it to the host project instead of rewriting from scratch.

## Pick the design

| User wants | File | Notes |
|---|---|---|
| Soft, embossed login in a circle | `references/neumorphic-login.html` | Light only. `handleLogin()` is a front-end demo check. |
| Dark login "Flow": glowing orb, glass card, eye toggle, Google/Apple buttons, loading spinner, success state | `references/flow-login-dark.html` | Dark only by design. Social buttons and links are placeholders. |
| Dark pill navbar, 5 icons, mint liquid blob that stretches to the tapped icon | `references/liquid-navbar-dark.html` | Goo effect = SVG filter + two blobs with different timings. Arrow keys work. |
| Frosted-glass navbar, sliding white lozenge, sun/moon theme button | `references/glass-nav-light-dark.html` | Light and dark tokens. Labels collapse to icons under 480px. |
| Responsive sidebar: icon rail that grows to a 240px panel, blue search box, menu filter, light/dark | `references/responsive-sidebar.html` | Poppins from Google Fonts with a system fallback. Sample cards are example figures. A split, drop-in version (CSS + JS + README) is in `packages/responsive-sidebar/` at the repo root. Panel slides over the content; backdrop and Escape close it. |
| 3D carousel of flippable cards, drag, keyboard, dots | `references/carousel-3d-vanilla.html` (plain HTML/JS) or `references/animated-3d-carousel.tsx` + `references/utils.ts` (React 19, TypeScript, Tailwind, lucide-react) | Pick the TSX when the host project uses React and Tailwind. |

## How to apply

1. Read the host project first: framework, CSS approach, existing tokens, fonts. The host's design system wins over these defaults.
2. Copy the chosen file in. For a framework project, split it: CSS into the project's styles, markup into a component, script into handlers or hooks. Keep the CSS custom properties (`--bg`, `--glass-bg`, …) and map them onto the host's tokens.
3. Replace the sample content (titles, items, copy, icons) with the project's real content. Keep the structure.
4. For the React carousel: `npm install lucide-react clsx tailwind-merge`, put `utils.ts` at `src/lib/utils.ts`, the component at `src/components/ui/animated-3d-carousel.tsx`, and make sure the `@/` alias resolves. It takes `items`, `title`, `hint`, `cardWidth`, `cardAspect`, `dragSensitivity`, `initialIndex`, `className`, and has working defaults.
5. Wire the demo behaviour to the real thing: login handlers must call the project's real auth; nothing here authenticates anyone.
6. Open it in a browser, check light and dark, check a 390px-wide viewport, and tab through it with the keyboard.

## Behaviour to keep

- Accessibility: visible `:focus-visible` rings, labelled icon buttons, `aria-current` on the active nav item, `aria-live` announcements in the carousel, `prefers-reduced-motion` respected.
- Theme: define every colour as a token on `:root`, redefine under `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. The two dark login/nav designs that commit to one look set `color-scheme` explicitly.
- Responsive: 16px side gutters, no horizontal scroll, carousel sizes cards from the container width.

## Pitfalls already hit

- Do not toggle SVG visibility with `el.hidden = true`. `hidden` is not a property of SVG elements, so nothing changes. Use `el.toggleAttribute('hidden', cond)` plus `[hidden]{display:none!important}`.
- In the carousel, capture the pointer only after the pointer has moved a few pixels. Capturing on pointer-down swallows the click that should flip the card.
- `backdrop-filter` needs the `-webkit-` prefix for Safari and only shows over a non-flat background.
- The liquid navbar blob positions come from `offsetLeft`/`getBoundingClientRect`, so re-snap on resize and after fonts load.
- The reference HTML files load a Google Font only in the Flow login. Offline or CSP-restricted hosts need a fallback stack (already set).

## Using this skill in other projects

Copy the whole `ui-design-library` folder into the other project's `.claude/skills/`, or into `~/.claude/skills/` to have it in every project. Then ask for it by name, for example: "use ui-design-library to add the glass navbar to this app".
