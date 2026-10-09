"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CarouselItem {
  id: string | number;
  category: string;
  title: string;
  icon: React.ReactNode;
  preview: string;
  full: string;
  location: string;
  time: string;
}

export interface Animated3DCarouselProps {
  items?: CarouselItem[];
  title?: string;
  hint?: string;
  /** Maximum card width in px. Cards shrink on narrow screens. */
  cardWidth?: number;
  /** Card height as a multiple of its width. */
  cardAspect?: number;
  /** Degrees of rotation per pixel dragged. */
  dragSensitivity?: number;
  /** Index of the card that faces the viewer first. */
  initialIndex?: number;
  className?: string;
}

const DEFAULT_ITEMS: CarouselItem[] = [
  {
    id: 1,
    category: "LANGUAGE: Python",
    title: "First Line of Code",
    icon: "💻",
    preview: "The terminal glowed, displaying my first 'Hello, World!'...",
    full: "I remember the thrill of typing my first 'Hello, World!' in Python. It was simple, yet it opened a portal to endless possibilities. The interpreter executed the command flawlessly, and I knew this was just the beginning.",
    location: "console: ~",
    time: "09:00:00",
  },
  {
    id: 2,
    category: "FRAMEWORK: ReactJS",
    title: "Debugging the Matrix",
    icon: "🐛",
    preview: "The error messages multiplied, haunting my console...",
    full: "They appeared from the depths of the console, cryptic error messages glowing red. Debugging a complex ReactJS component felt like navigating a vast, interconnected matrix. Each fix unveiled new issues.",
    location: "localhost:3000",
    time: "14:30:15",
  },
  {
    id: 3,
    category: "CONCEPT: Algorithms",
    title: "The Algorithm Library",
    icon: "📖",
    preview: "Endless tomes of sorting, searching, and optimization...",
    full: "Endless shelves containing every possible solution. I found my own data structures there, pages still being written as I coded. The Librarian told me I was never supposed to reinvent the wheel.",
    location: "Stack Overflow",
    time: "11:05:40",
  },
  {
    id: 4,
    category: "PARADIGM: Abstraction",
    title: "The Abstract Void",
    icon: "⚛️",
    preview: "Nothing concrete exists here, yet I feel the underlying logic...",
    full: "Nothing concrete exists here, yet I feel the underlying logic. The Abstract Void is the space between concrete implementations, a quantum foam of design patterns. I stayed too long designing and began to dissolve into pure theory.",
    location: "design-patterns.md",
    time: "--:--:--",
  },
  {
    id: 5,
    category: "TOOL: Git",
    title: "The Version Mirror",
    icon: "🌿",
    preview: "I saw my code, but not as it is now; multiple branches reflecting...",
    full: "I saw my code, but not as it is now. The mirror of Git showed all my possible branches across different commits. Some were stable, some were experimental. All were my work. The reflection spoke: 'You need to rebase.'",
    location: "github.com/my-repo",
    time: "18:55:20",
  },
  {
    id: 6,
    category: "PROCESS: Deployment",
    title: "The Deployment Dream",
    icon: "🚀",
    preview: "I'm trying to send it live, but which environment is real?",
    full: "I'm trying to send my application live, but which environment is real? Every server feels familiar yet subtly different. The boundaries between staging and production are thinning. Sometimes I see through the logs of other instances.",
    location: "cloud-server:port",
    time: "NOW",
  },
];

const DRAG_THRESHOLD_PX = 6;

export default function Animated3DCarousel({
  items = DEFAULT_ITEMS,
  title = "Memory Vault",
  hint = "Drag to spin · Click or press Enter on the centred card to flip",
  cardWidth = 280,
  cardAspect = 1.43,
  dragSensitivity = 0.3,
  initialIndex = 0,
  className,
}: Animated3DCarouselProps) {
  const total = items.length;
  const step = total > 0 ? 360 / total : 360;

  const [rotation, setRotation] = React.useState(-initialIndex * step);
  const [flipped, setFlipped] = React.useState<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [stageWidth, setStageWidth] = React.useState(0);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef({ active: false, captured: false, startX: 0, startRotation: 0, moved: false });

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = stageWidth ? Math.min(cardWidth, Math.max(stageWidth * 0.62, 180)) : cardWidth;
  const height = Math.round(width * cardAspect);
  // Radius that keeps neighbouring cards from overlapping, plus breathing room.
  const radius = total > 1 ? Math.round(width / 2 / Math.tan(Math.PI / total)) + 40 : 0;

  const activeIndex = total ? (((Math.round(-rotation / step) % total) + total) % total) : 0;

  const rotateBy = React.useCallback(
    (direction: 1 | -1) => {
      setFlipped(null);
      setRotation((r) => Math.round(r / step) * step + direction * step);
    },
    [step],
  );

  const goTo = (index: number) => {
    setFlipped(null);
    setRotation((r) => {
      const current = Math.round(-r / step);
      let delta = index - (((current % total) + total) % total);
      if (delta > total / 2) delta -= total;
      if (delta < -total / 2) delta += total;
      return (current + delta) * -step;
    });
  };

  const toggleFlip = (index: number) => {
    if (index !== activeIndex) return;
    setFlipped((f) => (f === index ? null : index));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { active: true, captured: false, startX: e.clientX, startRotation: rotation, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d.captured) {
      // Capture only once it is a real drag so plain taps still reach the card.
      stageRef.current?.setPointerCapture(e.pointerId);
      d.captured = true;
      d.moved = true;
      setDragging(true);
      setFlipped(null);
    }
    setRotation(d.startRotation + dx * dragSensitivity);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.captured) {
      stageRef.current?.releasePointerCapture(e.pointerId);
      setDragging(false);
      setRotation((r) => Math.round(r / step) * step);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        rotateBy(1);
        break;
      case "ArrowRight":
        e.preventDefault();
        rotateBy(-1);
        break;
      case "Escape":
        setFlipped(null);
        break;
    }
  };

  if (total === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      className={cn(
        "relative flex w-full flex-col items-center justify-center overflow-hidden px-4 py-10",
        "bg-gradient-to-b from-slate-50 to-indigo-100 text-neutral-900",
        "dark:from-neutral-950 dark:to-slate-900 dark:text-neutral-100",
        className,
      )}
    >
      <h2 className="mb-6 bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-center font-mono text-2xl font-bold uppercase tracking-[0.2em] text-transparent dark:from-violet-400 dark:to-cyan-300 sm:text-3xl">
        {title}
      </h2>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative flex w-full max-w-5xl touch-pan-y select-none items-center justify-center [perspective:1200px]"
        style={{ height: height + 80, cursor: dragging ? "grabbing" : "grab" }}
      >
        <div
          className={cn(
            "relative h-px w-px [transform-style:preserve-3d]",
            !dragging && "transition-transform duration-500 ease-out motion-reduce:transition-none",
          )}
          style={{ transform: `translateZ(-${radius}px) rotateY(${rotation}deg)` }}
        >
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            const isFlipped = flipped === index;
            return (
              <div
                key={item.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${total}: ${item.title}`}
                aria-hidden={isActive ? undefined : true}
                className={cn(
                  "absolute left-1/2 top-1/2 [transform-style:preserve-3d]",
                  "transition-[opacity,filter] duration-300",
                  !isActive && "pointer-events-none opacity-40 blur-[1.5px]",
                )}
                style={{
                  width,
                  height,
                  marginLeft: -width / 2,
                  marginTop: -height / 2,
                  transform: `rotateY(${step * index}deg) translateZ(${radius}px)`,
                }}
              >
                <div
                  role="button"
                  tabIndex={isActive ? 0 : -1}
                  aria-expanded={isFlipped}
                  aria-label={`${item.title}. ${isFlipped ? "Press Enter to show the summary" : "Press Enter to read the full text"}`}
                  onClick={() => toggleFlip(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleFlip(index);
                    }
                  }}
                  className={cn(
                    "relative h-full w-full rounded-2xl outline-none [transform-style:preserve-3d]",
                    "transition-transform duration-700 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] motion-reduce:transition-none",
                    "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-neutral-950",
                    isFlipped && "[transform:rotateY(180deg)]",
                  )}
                >
                  {/* Front */}
                  <div
                    aria-hidden={isFlipped}
                    className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl [backface-visibility:hidden] dark:border-violet-500/30 dark:bg-neutral-900"
                  >
                    <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-fuchsia-600 dark:text-fuchsia-400">
                      {item.category}
                    </p>
                    <h3 className="mb-4 text-lg font-bold leading-tight">{item.title}</h3>
                    <div className="relative mb-4 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-5xl dark:bg-black/40">
                      <span aria-hidden="true">{item.icon}</span>
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-[linear-gradient(45deg,transparent_65%,rgba(157,0,255,0.2)_70%,transparent_75%)] [background-size:200%_200%] motion-safe:animate-[carousel-sheen_4s_linear_infinite]"
                      />
                    </div>
                    <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{item.preview}</p>
                  </div>

                  {/* Back */}
                  <div
                    aria-hidden={!isFlipped}
                    className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)] dark:border-cyan-400/30 dark:bg-neutral-900"
                  >
                    <h3 className="mb-3 text-lg font-bold leading-tight">{item.title}</h3>
                    <p className="mb-4 flex-1 overflow-y-auto text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {item.full}
                    </p>
                    <dl className="mt-auto flex flex-col gap-1 font-mono text-[11px]">
                      <div className="flex gap-2 text-cyan-700 dark:text-cyan-300">
                        <dt className="sr-only">Location</dt>
                        <dd>📍 {item.location}</dd>
                      </div>
                      <div className="flex gap-2 text-fuchsia-600 dark:text-fuchsia-400">
                        <dt className="sr-only">Time</dt>
                        <dd>🕒 {item.time}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <button
          type="button"
          onClick={() => rotateBy(1)}
          aria-label="Previous card"
          className="flex size-11 items-center justify-center rounded-full border border-violet-500/60 bg-white text-neutral-900 shadow transition hover:scale-110 hover:bg-violet-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-neutral-900 dark:text-white"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2" role="group" aria-label="Choose a card">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show ${item.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              className={cn(
                "size-2.5 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950",
                index === activeIndex
                  ? "scale-125 bg-violet-600 dark:bg-violet-400"
                  : "bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-500",
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => rotateBy(-1)}
          aria-label="Next card"
          className="flex size-11 items-center justify-center rounded-full border border-violet-500/60 bg-white text-neutral-900 shadow transition hover:scale-110 hover:bg-violet-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-neutral-900 dark:text-white"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      <p className="sr-only" aria-live="polite">
        {`Card ${activeIndex + 1} of ${total}: ${items[activeIndex].title}`}
      </p>

      <style>{`@keyframes carousel-sheen{from{background-position:0 0}to{background-position:200% 200%}}`}</style>
    </section>
  );
}
