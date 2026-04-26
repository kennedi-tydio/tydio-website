"use client";

import { useEffect } from "react";

export default function ChatbaseScript() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://www.chatbase.co/embed.min.js";
    script.id = "QomQSlDJ4Kefzg0EAu8o8";
    (script as any).domain = "www.chatbase.co";
    document.body.appendChild(script);
  }, []);

  return null;
}
