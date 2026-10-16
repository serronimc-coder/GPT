---
name: hello-diet-menu
description: Adds the "Hello Diet" responsive sidebar menu to the current project. Use when the user says "add the hello-diet menu", "ajoute le menu hello-diet", "ajoute ma sidebar", "mon menu latéral", "the Hello Diet sidebar", or asks for a collapsible icon sidebar with a search box in the style of Hello Diet. Works in plain HTML, React, Next.js, Vue, Svelte and similar projects.
---

# Hello Diet menu

A white sidebar that is an icon rail (60px) when closed and a 240px panel when open. It has a logo with a heart, a deep-blue search box that filters the menu, tooltips on the icons when closed, a light and dark theme, and keyboard support (Tab, Enter, Escape). It slides over the page content. Choosing a link on a phone closes it.

Bundled files in this skill's `assets/` folder:

| File | Purpose |
|---|---|
| `sidebar.css` | All styles and colour variables. |
| `sidebar.js` | `initSidebar(element, options)`. No dependencies. Works as a global, CommonJS or bundler import. |
| `example.html` | Complete markup and a working demo. Copy the `<aside class="sidebar">` block from it. |

## Steps

1. **Look at the project first.** Find the framework, where global CSS and layout live, the router, the existing colours and fonts, and where the navigation items should come from. If there is already a sidebar or nav, ask whether to replace it or add this one next to it.
2. **Copy the assets.**
   - Plain HTML: put `sidebar.css` and `sidebar.js` next to the pages and link them.
   - React, Next.js, Vue, Svelte: put them in the source tree (for example `src/components/hello-diet-menu/`), import `sidebar.css` once at the app root, and import `sidebar.js` where the component is.
3. **Build the markup.** Copy the `<aside class="sidebar" id="sidebar">` block from `assets/example.html`. Keep the class names, the `.label` span inside each link, the `data-tip` attribute on each link (tooltip and search text), `aria-current="page"` on the active link, and the empty-state `<p class="empty" hidden>`.
4. **Use the project's real content.** Replace the logo name (default "My App", or "Hello Diet" if the user wants it), and replace the menu entries with the project's real pages. Each entry is one `<li><a href data-tip><svg class="i">…</svg><span class="label">…</span></a></li>`. Icons are 24×24 stroke SVGs. Reuse the project's icon library if it has one, keeping the `i` class for sizing.
5. **Start the behaviour.** Call `initSidebar(sidebarElement, options)` once the markup is on the page.
   - `onNavigate(href, event)`: connect it to the router. Call `event.preventDefault()` when the router handles navigation.
   - `onToggle(isOpen)`: optional.
   - It returns `open()`, `close()`, `toggle()`, `setCurrent(href)` and `destroy()`.
   - In a component framework, call `initSidebar` in the mount hook (`useEffect`, `onMounted`, `onMount`) and call `destroy()` when it unmounts. Set the current link from the router state with `setCurrent`.
6. **Make room for it.** Add the class `has-sidebar` to the page wrapper so content is not covered by the closed rail (it adds `padding-left: calc(var(--rail) + 20px)`).
7. **Match the project.** Map the colour variables onto the project's tokens when it has a design system: `--brand` (search box, active link, logo), `--panel` (background), `--fg`, `--muted`, `--hover`, `--panel-shadow`. Widths are `--rail` and `--open`. The font is `--font` (Poppins by default, with a system fallback). Dark mode follows the operating system, or set `data-theme="dark"` or `"light"` on `<html>`. If the project already toggles a theme with another attribute or class, redefine the dark variables under that selector.
8. **Check it.** Run the project, then confirm: the rail shows icons only, the toggle opens the panel, the search filters the entries, Escape closes it, a link click changes the page, and a 390px-wide window still works. Fix anything that conflicts with existing global CSS (a global `*` reset or `box-sizing` rule, `body` padding, z-index above 20).

## Rules

- Do not change the look (sizes, radius, shadows, transition timings) unless the user asks.
- Keep accessibility: the toggle has `aria-expanded` and `aria-controls`, links keep visible focus, icon-only buttons have labels.
- Do not invent menu items. Ask for the pages if they are not obvious from the project.
- Do not add a dependency for this. It is plain CSS and JavaScript.
- Report what was added and where, and what the user still has to decide (menu entries, router wiring, colours).

## Installing this skill in another project

Copy the `hello-diet-menu` folder into that project's `.claude/skills/` folder, or into `~/.claude/skills/` to have it in every project. Then ask Claude: "Ajoute le menu hello-diet".

From a terminal, inside the target project:

```bash
git clone --depth 1 -b claude/marketing-skills-install-83gh6s https://github.com/serronimc-coder/GPT.git /tmp/gpt-skills
mkdir -p .claude/skills && cp -r /tmp/gpt-skills/.claude/skills/hello-diet-menu .claude/skills/
```
