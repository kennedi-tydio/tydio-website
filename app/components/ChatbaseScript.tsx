"use client";

import { useEffect } from "react";

const SCRIPT_ID = "QomQSlDJ4Kefzg0EAu8o8";

// Only the public home page renders this. Chatbase's embed can't be cleanly
// unloaded, so after a client-side navigation away its elements stay in the
// page; globals.css hides them unless <html data-chatbot="on"> is set here.
export default function ChatbaseScript() {
  useEffect(() => {
    document.documentElement.dataset.chatbot = "on";
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.src = "https://www.chatbase.co/embed.min.js";
      script.id = SCRIPT_ID;
      Object.assign(script, { domain: "www.chatbase.co" });
      document.body.appendChild(script);
    }
    return () => {
      delete document.documentElement.dataset.chatbot;
    };
  }, []);

  return null;
}
