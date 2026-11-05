"use client";

import { useEffect } from "react";

export default function ChatbaseScript() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://www.chatbase.co/embed.min.js";
    script.id = "QomQSlDJ4Kefzg0EAu8o8";
    Object.assign(script, { domain: "www.chatbase.co" });
    document.body.appendChild(script);
  }, []);

  // Measures the bar pinned to the bottom of the screen (nav, action bar,
  // message composer) so globals.css can keep the chat bubble above it.
  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      let height = 0;
      for (const el of document.querySelectorAll<HTMLElement>(".safe-area-inset-bottom")) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom >= window.innerHeight - 1) {
          height = Math.max(height, window.innerHeight - rect.top);
        }
      }
      document.documentElement.style.setProperty("--bottom-bar-height", `${height}px`);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
