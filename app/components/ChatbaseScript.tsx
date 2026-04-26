"use client";

import Script from "next/script";

export default function ChatbaseScript() {
  return (
    <Script
      id="chatbase"
      src="https://www.chatbase.co/embed.min.js"
      data-chatbot-id="QomQSlDJ4Kefzg0EAu8o8"
      data-domain="www.chatbase.co"
      strategy="lazyOnload"
    />
  );
}
