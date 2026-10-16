# Responsive sidebar

An icon rail (60px) that grows into a 240px panel, with a search box that filters the menu, tooltips when closed, light and dark themes, and keyboard support (Tab, Enter, Escape). No framework, no build step.

## Files

| File | What it is |
|---|---|
| `sidebar.css` | All styles and the colour variables. |
| `sidebar.js` | `initSidebar(element, options)`: open, close, filter, current page. |
| `index.html` | Working example. Open it in a browser. |

## Use it in another project

1. Copy `sidebar.css` and `sidebar.js` into the project (for example `public/` or `src/assets/`).
2. Link them in the page: `<link rel="stylesheet" href="sidebar.css">` and `<script src="sidebar.js"></script>`.
3. Copy the `<aside class="sidebar">` block from `index.html` into your layout. Edit the logo name and the `<li>` items. Keep the `.label` span and the `data-tip` attribute on each link.
4. Add the class `has-sidebar` to your page wrapper so the content stays clear of the closed rail.
5. Call `initSidebar(document.getElementById('sidebar'))` once the page has loaded.

## Options

```js
const sidebar = initSidebar(el, {
  onNavigate(href, event) {},   // called when a menu link is clicked
  onToggle(isOpen) {},          // called whenever the panel opens or closes
  backdrop: '.backdrop',        // selector of an existing backdrop; one is created if missing
});
sidebar.open(); sidebar.close(); sidebar.toggle();
sidebar.setCurrent('#reports'); // mark a link as the current page
sidebar.destroy();              // remove listeners (call this when a component unmounts)
```

## Colours, width and font

Override the variables after `sidebar.css`:

```css
:root {
  --brand: #0b2997;   /* search box, active link, logo */
  --panel: #ffffff;   /* sidebar background */
  --rail: 60px;       /* closed width */
  --open: 240px;      /* open width */
  --font: "Poppins", system-ui, sans-serif;
}
```

Dark mode follows the operating system. To force it, set `data-theme="dark"` or `"light"` on `<html>`.

## React, Vue or other frameworks

Render the same markup in a component, then start the script once it is on the page and clean up when it leaves:

```tsx
import { useEffect, useRef } from "react";
import initSidebar from "./sidebar"; // sidebar.js works as a CommonJS/ES default import in most bundlers

export function Sidebar() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const api = initSidebar(ref.current!, { onNavigate: (href, e) => { e.preventDefault(); /* router.push(href) */ } });
    return () => api.destroy();
  }, []);
  return <aside ref={ref} className="sidebar" id="sidebar" aria-label="Sidebar">{/* same markup as index.html */}</aside>;
}
```

In React, change `class` to `className`, `aria-expanded` stays as is, and import `sidebar.css` once at the top of your app.

## Notes

- The panel slides over the page content; it does not push it. The backdrop and Escape close it.
- On screens up to 640px wide, choosing a link closes the panel.
- The Poppins font loads from Google Fonts. Without it the sidebar falls back to the system font.
