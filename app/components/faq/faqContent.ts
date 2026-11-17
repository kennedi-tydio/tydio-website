// Everything the FAQ says, in one place: the full /faq page and the home page
// section both render from this, and search reads the same text.
//
// Several answers restate rules that live in code. Update them together:
// - refunds and cancellations: app/terms/page.tsx (Refund policy), lib/bookingRequestGroups.ts
// - pricing and travel fees: lib/pricingRules.ts (DISTANCE_SURCHARGE_BANDS, TOP_TIDY_PRO_SURCHARGE), app/components/Pricing.tsx
// - unsupported tasks: lib/unsupportedTasks.ts
// - recurring visits: lib/recurrence.ts
// - home screen steps: installGuide.ts (getInstallGuide)
// - "notifications needed to book": lib/pushRequirement.ts (NOTIFICATION_REQUIREMENT; 'none' now, so the FAQ doesn't say they're required)
// - calling window: lib/maskedCalls.ts; task photo retention: lib/taskPhotoRetention.ts
// - Tidy Pro onboarding steps: lib/cleanerOnboarding.ts; acceptance rate: lib/acceptanceRate.ts
// - Tidy Pro pay share: lib/pricingRules.ts (PLATFORM_FEE_RATE)
//
// Pure data, safe to import from client components.

export const FAQ_CONTACT_EMAIL = 'kennedicoats@tydioapp.com'

export type FaqBlock =
  | { type: 'p'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'note'; text: string }
  | { type: 'link'; before?: string; target: string; label: string }
  | { type: 'install-demo' }

export type FaqItem = {
  id: string
  question: string
  answer: FaqBlock[]
  // Extra words people might search for that the answer doesn't use.
  keywords?: string
}

export type FaqCategory = {
  id: string
  title: string
  items: FaqItem[]
}

export const IPHONE_INSTALL_STEPS = [
  'Open Tydio in Safari.',
  'Tap the ••• button next to the address bar at the bottom of the screen, then tap Share. (On iOS 18 or earlier, tap the Share button, a square with an arrow pointing up, in the toolbar.)',
  'Scroll down (tap View More if you see it) and tap Add to Home Screen.',
  'Leave Open as Web App turned on, then tap Add.',
]

export const ANDROID_INSTALL_STEPS = [
  'Open Tydio in Chrome.',
  'Tap the ⋮ menu at the top right of your browser.',
  'Tap Add to Home screen (it may say Install app).',
  'Tap Install, then Add if asked.',
]

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      {
        id: 'what-is-tydio',
        question: 'What is Tydio?',
        keywords: 'about cleaner cleaning service maid housekeeper',
        answer: [
          {
            type: 'p',
            text: 'Tydio connects you with local, background-checked cleaners we call Tidy Pros. You list exactly the tasks you want done, like wiping the kitchen counters or scrubbing the tub, and only pay for those.',
          },
          {
            type: 'p',
            text: 'Book as much or as little as you like: one quick task, a few rooms, or a full cleaning of your whole home.',
          },
          { type: 'link', before: 'See', target: 'full-cleaning', label: 'Can I book a full home cleaning?' },
        ],
      },
      {
        id: 'where-available',
        question: 'Where is Tydio available?',
        keywords: 'location area city state zip waitlist georgia atlanta outside',
        answer: [
          {
            type: 'p',
            text: 'Tydio is available in Georgia right now. When you sign up, we check your ZIP code. If you live outside our service area, you’ll join the waitlist, and we’ll let you know when Tydio comes to your area.',
          },
          {
            type: 'p',
            text: 'If you see “Booking paused in your area”, we’re adding more Tidy Pros near you. You’ll be notified when booking reopens.',
          },
        ],
      },
      {
        id: 'add-to-home-screen',
        question: 'How do I add Tydio to my home screen?',
        keywords: 'install homescreen iphone android download icon pwa',
        answer: [
          {
            type: 'p',
            text: 'Adding Tydio to your home screen lets you open it in one tap like any other app, and get push notifications about your bookings.',
          },
          { type: 'install-demo' },
          {
            type: 'note',
            text: 'Then open Tydio from your home screen. You may need to log in once more the first time.',
          },
        ],
      },
      {
        id: 'app-store',
        question: 'Where is the app in the App Store?',
        keywords: 'google play download ios android store',
        answer: [
          {
            type: 'p',
            text: 'Tydio isn’t in the App Store or Google Play Store right now. It’s a progressive web app (PWA): a website that installs straight from your browser and works like an app. Once it’s on your home screen, it gets its own icon, opens full screen without the browser bars, and can send you push notifications. There’s nothing to download from a store, and it’s always up to date.',
          },
          {
            type: 'link',
            before: 'For Tydio to work like an app, follow the steps in',
            target: 'add-to-home-screen',
            label: 'How do I add Tydio to my home screen?',
          },
        ],
      },
      {
        id: 'notifications',
        question: 'How do I turn on notifications?',
        keywords: 'push alerts text sms reminders',
        answer: [
          {
            type: 'p',
            text: 'Go to Profile → Notifications and turn on push notifications for the device you’re using. We use them to tell you when a Tidy Pro accepts, is on the way, sends a message, or finishes your booking.',
          },
          {
            type: 'p',
            text: 'On an iPhone, add Tydio to your home screen first, since iPhones only allow notifications from home screen apps.',
          },
          { type: 'link', before: 'See', target: 'add-to-home-screen', label: 'How do I add Tydio to my home screen?' },
        ],
      },
      {
        id: 'google-sign-in',
        question: 'Can I sign in with Google?',
        keywords: 'login account gmail password',
        answer: [
          {
            type: 'p',
            text: 'Yes. Tap Continue with Google on the sign-up or login page. If you signed up with an email and password, keep logging in that way.',
          },
        ],
      },
    ],
  },
  {
    id: 'booking',
    title: 'Booking a cleaning',
    items: [
      {
        id: 'how-to-book',
        question: 'How do I book a cleaning?',
        keywords: 'schedule request order appointment start deep clean standard light heavy type level',
        answer: [
          {
            type: 'steps',
            items: [
              'On the Home tab, add each thing you’d like cleaned with Add Task. Add notes for anything your Tidy Pro should know.',
              'For each task, choose the type of cleaning you want: Light touch-up, Standard cleaning, or Heavy cleaning for a deep clean.',
              'Tap Continue booking, then pick a date and browse the Tidy Pros available near you. Tap one to see their reviews and photos of their work.',
              'Choose a time that works for you.',
              'Review your request. Add directions so your Tidy Pro knows how to get there and get in, choose a payment method, and tap Confirm Request.',
            ],
          },
          {
            type: 'p',
            text: 'Your booking is pending until the Tidy Pro accepts. We’ll notify you as soon as they do. You can ask up to 3 Tidy Pros at once, and the first to accept gets the booking.',
          },
        ],
      },
      {
        id: 'full-cleaning',
        question: 'Can I book a full home cleaning?',
        keywords: 'full service deep clean whole house entire home everything standard clean move out',
        answer: [
          {
            type: 'p',
            text: 'Yes. Add a task for everything you’d like cleaned, and your Tidy Pro will take care of all of it. There’s no limit on how many tasks you add, so a full cleaning is just a longer list.',
          },
          {
            type: 'p',
            text: 'List specific tasks rather than a whole room. For example, instead of “Clean bathroom”, add “Scrub the bathtub”, “Clean the toilet”, “Wipe the sink and mirror”, and “Mop the floor”. That way your Tidy Pro knows exactly what you want done, and your price matches it.',
          },
          {
            type: 'p',
            text: 'For tasks that cover your whole home, choose Entire home in Add Task. It covers baseboard cleaning, window cleaning, and sweeping and mopping the floors, priced by the size of your home.',
          },
        ],
      },
      {
        id: 'pricing',
        question: 'How is my price calculated?',
        keywords: 'cost price fee how much expensive charge quote travel distance miles far surcharge',
        answer: [
          {
            type: 'p',
            text: 'Your price is based on how long your tasks take and how messy they are (light touch-up, standard, or heavy cleaning). Whole-home and floor tasks also account for the size of your home.',
          },
          {
            type: 'p',
            text: 'A card processing fee is added at checkout, and top-rated Tidy Pros add $5.',
          },
          {
            type: 'p',
            text: 'Tidy Pros who live farther away also add a travel fee. Tidy Pros within 5 miles of you charge no travel fee, and those up to 20 miles away add $5 to $15:',
          },
          {
            type: 'list',
            items: ['5 miles or less: free', '5 to 10 miles: $5', '10 to 15 miles: $10', '15 to 20 miles: $15'],
          },
          {
            type: 'p',
            text: 'You’ll see any fees for a Tidy Pro, and the exact total, before you confirm. That’s what you pay.',
          },
        ],
      },
      {
        id: 'when-charged',
        question: 'When am I charged?',
        keywords: 'payment pay card charge hold',
        answer: [
          {
            type: 'p',
            text: 'Your card is charged once, when you confirm your request. If the Tidy Pro declines and you choose a replacement, your payment carries over with no new charge. If your booking is canceled, you’re refunded under our refund policy.',
          },
          {
            type: 'p',
            text: 'For a recurring booking, each visit after the first is charged 3 days before it starts.',
          },
          { type: 'link', before: 'See', target: 'recurring', label: 'Can I book a recurring cleaning?' },
          { type: 'link', before: 'See', target: 'cancel-booking', label: 'How do I cancel a booking?' },
        ],
      },
      {
        id: 'unsupported-tasks',
        question: 'Which tasks can’t I book?',
        keywords: 'not allowed services offer outdoor yard carpet mold windows ladder',
        answer: [
          {
            type: 'p',
            text: 'Tidy Pros handle everyday indoor cleaning, laundry, and pet areas. Taking out the trash is the only outdoor task we offer. We don’t currently offer:',
          },
          {
            type: 'list',
            items: [
              'Dry cleaning',
              'Specialty cleaning, like carpet or upholstery shampooing, mattress cleaning, floor waxing, or post-construction cleanups',
              'Anything that needs a ladder, climbing, or roof access',
              'Biohazard or hazardous cleanup, like mold remediation or chemical spills',
              'Pest control or infestation cleanup',
              'Hauling, junk removal, moving heavy furniture, or packing',
            ],
          },
          {
            type: 'p',
            text: 'If you add a task we don’t offer, Add Task will let you know before you book.',
          },
        ],
      },
      {
        id: 'supplies',
        question: 'Do I need to provide cleaning supplies?',
        keywords: 'products bring equipment vacuum organic',
        answer: [
          {
            type: 'p',
            text: 'It’s up to you. On the review screen, check “You will provide the necessary cleaning supplies” if you’d like your Tidy Pro to use yours. Some Tidy Pros use organic cleaning products, which you’ll see on their profile.',
          },
        ],
      },
      {
        id: 'laundry',
        question: 'How does laundry work?',
        keywords: 'wash dry fold iron clothes washer dryer basket load laundromat laundrymat no washer',
        answer: [
          {
            type: 'p',
            text: 'Each laundry service is its own task: Wash, Dry, Wash & dry, Fold, and Iron. Add each one you want.',
          },
          {
            type: 'list',
            items: [
              'Wash or Dry on its own: your Tidy Pro starts the load but doesn’t stay for the cycle.',
              'Wash & dry: your Tidy Pro stays through the full wash and dry cycle.',
              'You’ll tell us how many baskets there are, or for ironing, how many items.',
            ],
          },
          {
            type: 'p',
            text: 'No washer and dryer? No problem. When you add a laundry task, uncheck “I have a working washer and dryer”, and your Tidy Pro will take your laundry to a laundromat for you. Laundromat trips are booked as Wash & dry, and you’ll only see Tidy Pros who offer them.',
          },
        ],
      },
      {
        id: 'pets',
        question: 'I have pets. What should I do?',
        keywords: 'dog cat litter box cage enclosure animal allergies',
        answer: [
          {
            type: 'p',
            text: 'Add your pets in Profile → Pets so your Tidy Pro knows who they’ll meet before they arrive.',
          },
          {
            type: 'p',
            text: 'You can book litter box and pet enclosure cleaning too. When you add one of those tasks, you’ll be asked a few questions and for photos showing what needs cleaning, so we can price it accurately. Please keep pets away from the area while it’s cleaned.',
          },
        ],
      },
      {
        id: 'entry-instructions',
        question: 'How do I tell my Tidy Pro how to get in?',
        keywords: 'door code key lockbox gate access parking',
        answer: [
          {
            type: 'p',
            text: 'Add directions, like where to park, which building or door, a gate code, or where the key is. You can do this two ways:',
          },
          {
            type: 'list',
            items: [
              'While booking: fill in Directions & Entry on the Review Your Request screen. Check “Save these directions for future bookings” to use them again next time at that address.',
              'Anytime: go to Profile → Manage Addresses and tap “Add directions & entry” on your address. They’ll fill in automatically when you book there.',
            ],
          },
          {
            type: 'p',
            text: 'Your Tidy Pro sees your directions once they’re on the way.',
          },
          {
            type: 'p',
            text: 'Your address isn’t shown to a Tidy Pro until they accept your booking.',
          },
        ],
      },
      {
        id: 'recurring',
        question: 'Can I book a recurring cleaning?',
        keywords: 'repeat weekly biweekly monthly every week regular subscription charged payment failed declined card on hold reschedule',
        answer: [
          {
            type: 'p',
            text: 'Yes. When you schedule, choose how often you’d like it to repeat: every week, every 2 weeks, or every 4 weeks.',
          },
          {
            type: 'list',
            items: [
              'When your Tidy Pro accepts your first visit, they’re booked for every visit after it too. Each one shows up in your Bookings a week ahead.',
              'Your first visit is charged when you book. Each visit after that is charged 3 days before it starts.',
              'If a charge doesn’t go through, we’ll let you know and try again each day. You can also pay in the app with any card.',
              'Still unpaid 24 hours before it starts? That visit goes on hold. To keep it, choose a new date and pay. Otherwise it’s canceled at its original time, and you’re not charged. Your other visits stay on.',
            ],
          },
          {
            type: 'p',
            text: 'If your Tidy Pro can’t make a visit, or has time off that day, we’ll tell you that visit is canceled. You won’t be charged for it. If they stop doing your recurring booking altogether, we’ll ask you to choose a new Tidy Pro.',
          },
          {
            type: 'p',
            text: 'To stop a recurring booking, go to the Bookings tab and cancel it under Recurring bookings. Visits already on your schedule stay booked, so cancel those from their own page if you don’t need them. Canceling a visit before it’s charged costs nothing.',
          },
        ],
      },
      {
        id: 'promo-code',
        question: 'How do I use a promo code?',
        keywords: 'discount coupon code deal',
        answer: [
          { type: 'p', text: 'Enter your code in the Promo code field on the Review Your Request screen, before you confirm.' },
        ],
      },
    ],
  },
  {
    id: 'managing-bookings',
    title: 'Managing your bookings',
    items: [
      {
        id: 'cancel-booking',
        question: 'How do I cancel a booking?',
        keywords: 'cancel refund cancellation policy late fee where button home bookings tab today upcoming messages pending',
        answer: [
          {
            type: 'p',
            text: 'Once a Tidy Pro has accepted your booking, cancel it from the Bookings tab or the Home tab:',
          },
          {
            type: 'steps',
            items: [
              'Open the Bookings tab and choose Today or Upcoming. Or, on the Home tab, find the booking under your upcoming bookings.',
              'Tap the booking to open it.',
              'Tap Cancel booking.',
              'Choose a reason, then confirm.',
            ],
          },
          {
            type: 'note',
            text: 'An accepted booking can’t be canceled from Messages.',
          },
          {
            type: 'p',
            text: 'If your request is still waiting for a Tidy Pro to accept, it isn’t in your bookings yet. Cancel it from Messages instead:',
          },
          {
            type: 'steps',
            items: [
              'Open the Messages tab and tap the thread with that Tidy Pro.',
              'Under your Booking Request, tap Cancel.',
              'Choose a reason, then confirm.',
            ],
          },
          { type: 'link', before: 'More on', target: 'cancel-booking-request', label: 'canceling a booking request' },
          {
            type: 'list',
            items: [
              'Still waiting for a Tidy Pro to accept, or more than 2 hours before the start: you’re refunded in full, except for the card processing fee.',
              'Within 2 hours of the start: you’re refunded 50%. Of the rest, 80% goes to your Tidy Pro, who reserved that time for you, and 20% to Tydio.',
              'Once your Tidy Pro has arrived, the booking can’t be canceled.',
            ],
          },
          {
            type: 'p',
            text: 'If no Tidy Pro accepts your booking in time (at least an hour before it starts), we cancel it for you and refund everything except the processing fee.',
          },
          {
            type: 'p',
            text: 'Refunds go back to your original payment method and can take 5 to 10 business days to appear.',
          },
          { type: 'link', before: 'See the full', target: 'refund-policy', label: 'refund policy' },
        ],
      },
      {
        id: 'cancel-booking-request',
        question: 'How do I cancel a booking request?',
        keywords: 'cancel request pending waiting not accepted yet messages declined replacement refund',
        answer: [
          {
            type: 'p',
            text: 'A booking request is one no Tidy Pro has accepted yet. It stays in Messages until it’s accepted, so cancel it from there:',
          },
          {
            type: 'steps',
            items: [
              'Open the Messages tab and tap the thread with the Tidy Pro you requested.',
              'Under your Booking Request, tap Cancel.',
              'Choose a reason, then confirm.',
            ],
          },
          {
            type: 'p',
            text: 'If your Tidy Pro declined and you haven’t chosen a replacement, open the same thread and tap Cancel booking and get a refund.',
          },
          {
            type: 'p',
            text: 'Canceling a request refunds everything except the card processing fee. Refunds go back to your original payment method and can take 5 to 10 business days to appear.',
          },
          {
            type: 'note',
            text: 'Once a Tidy Pro accepts, the request becomes a booking and the Cancel button leaves Messages. Cancel it from the Bookings or Home tab instead.',
          },
          { type: 'link', before: 'See', target: 'cancel-booking', label: 'How do I cancel a booking?' },
        ],
      },
      {
        id: 'change-time',
        question: 'Can I change the time of my booking?',
        keywords: 'reschedule move date time new time',
        answer: [
          {
            type: 'p',
            text: 'Your Tidy Pro can suggest a new start time in your message thread, and you can approve or decline it there. If you decline, the booking keeps its original time.',
          },
          {
            type: 'p',
            text: 'If you need a different time yourself, message your Tidy Pro and ask them to suggest one. Or cancel and rebook, keeping the cancellation policy in mind.',
          },
        ],
      },
      {
        id: 'declined',
        question: 'What happens if my Tidy Pro declines or cancels?',
        keywords: 'declined canceled replacement another cleaner nobody accepted',
        answer: [
          {
            type: 'p',
            text: 'We’ll notify you, and you can choose up to 3 other Tidy Pros at no extra charge. Your payment carries over to whoever accepts first. Rather not? Cancel instead, and you’re refunded everything except the processing fee.',
          },
          {
            type: 'p',
            text: 'If nobody accepts by one hour before the start time, the booking is canceled and you’re refunded everything except the processing fee. If a Tidy Pro cancels less than an hour before the start, you get a full refund, including the fee.',
          },
        ],
      },
      {
        id: 'contact-tidy-pro',
        question: 'How do I contact my Tidy Pro?',
        keywords: 'message chat call phone text talk',
        answer: [
          {
            type: 'p',
            text: 'Open the Messages tab to chat with your Tidy Pro about a booking. You can also call them from the booking, once it’s confirmed and until 2 hours after it ends. Calls go through a private number, so neither of you sees the other’s real phone number.',
          },
        ],
      },
      {
        id: 'track-progress',
        question: 'How do I see how my cleaning is going?',
        keywords: 'live progress status on the way arrived photos done',
        answer: [
          {
            type: 'p',
            text: 'Open the booking from the Home or Bookings tab and tap to see live progress. You’ll see when your Tidy Pro is on the way, when they arrive, and each task as they finish it, with photos.',
          },
          {
            type: 'p',
            text: 'Task photos are deleted 7 days after the booking ends.',
          },
        ],
      },
      {
        id: 'no-show',
        question: 'What if my Tidy Pro doesn’t show up?',
        keywords: 'late no show missing never came',
        answer: [
          {
            type: 'p',
            text: 'If your Tidy Pro hasn’t arrived 10 minutes after the start time, you can report a no-show from the booking. The booking is canceled, and our team contacts you and your Tidy Pro to review what happened. We’ll email you about any refund. Refunds can take 5 to 10 business days to appear.',
          },
          {
            type: 'p',
            text: 'If your Tidy Pro has tapped “I’ve arrived” but isn’t actually there, tap Report Tidy Pro and choose “Cleaner didn’t show up”. It’s handled the same way.',
          },
        ],
      },
      {
        id: 'no-access',
        question: 'What if my Tidy Pro can’t get into my home?',
        keywords: 'no access locked out not home door code key customer unavailable refund',
        answer: [
          {
            type: 'p',
            text: 'Your Tidy Pro waits 10 minutes after the start time, or after they arrive if that’s later, and tries to reach you. If they still can’t get in, they can report “Customer unavailable—no access”, and the booking is canceled.',
          },
          {
            type: 'p',
            text: 'Our team reviews each report and may refund all, half, or none of what you paid. We’ll email you the outcome. Adding directions helps avoid this.',
          },
          { type: 'link', before: 'See', target: 'entry-instructions', label: 'How do I tell my Tidy Pro how to get in?' },
        ],
      },
      {
        id: 'report-problem',
        question: 'How do I report a problem with a booking?',
        keywords: 'complaint damage missing unsafe quality report issue refund help',
        answer: [
          {
            type: 'p',
            text: 'Open the booking and tap Report Tidy Pro. You can report lateness, unfinished tasks, quality issues, damaged or missing items, safety concerns, or a payment problem. Our team reviews every report and may issue a full or partial refund.',
          },
          {
            type: 'p',
            text: 'If you ever feel unsafe, contact local emergency services first.',
          },
        ],
      },
      {
        id: 'extra-charge',
        question: 'Why does my booking say “Needs attention”?',
        keywords: 'extra charge upcharge pay more suspended',
        answer: [
          {
            type: 'p',
            text: 'Sometimes a job turns out to need more than was booked. When that happens, the Tydio team may ask you to pay an extra charge, with the reason shown in the app. Your Tidy Pro can’t continue until it’s paid. Tap the booking to review and pay it.',
          },
          {
            type: 'p',
            text: 'If you have questions about an extra charge, contact us before paying.',
          },
        ],
      },
    ],
  },
  {
    id: 'payments-reviews',
    title: 'Payments, tips, and reviews',
    items: [
      {
        id: 'refund-policy',
        question: 'What is your refund policy?',
        keywords: 'refund money back policy cancel cancellation late fee processing fee charged twice wrong charge no show',
        answer: [
          {
            type: 'p',
            text: 'The card processing fee shown at checkout isn’t refundable, except where noted below. Here’s what you get back:',
          },
          {
            type: 'list',
            items: [
              'You cancel before a Tidy Pro accepts, or more than 2 hours before the start: everything except the processing fee.',
              'You cancel within 2 hours of the start: 50% of what you paid. Of the rest, 80% goes to your Tidy Pro, who reserved that time for you, and 20% to Tydio.',
              'No Tidy Pro accepts in time (at least an hour before the start): we cancel it and refund everything except the processing fee.',
              'Your Tidy Pro declines or cancels and you don’t choose a replacement: everything except the processing fee.',
              'Your Tidy Pro cancels less than an hour before the start: everything, including the processing fee.',
              'Your Tidy Pro doesn’t show up and you report it 10 minutes after the start: everything except the processing fee, right away.',
              'Your Tidy Pro can’t get into your home: our team reviews it and refunds all, half, or none of it.',
              'You’re charged in error, or charged but your booking wasn’t created: everything, including the processing fee.',
            ],
          },
          {
            type: 'p',
            text: 'Once your Tidy Pro has arrived, the booking can’t be canceled. If something goes wrong after that, use Report Tidy Pro and our team may issue a full or partial refund.',
          },
          {
            type: 'p',
            text: 'Refunds go back to your original payment method and can take 5 to 10 business days to appear.',
          },
          { type: 'link', before: 'For recurring visits, see', target: 'recurring', label: 'Can I book a recurring cleaning?' },
        ],
      },
      {
        id: 'payment-methods',
        question: 'How do I add or change my payment method?',
        keywords: 'card credit debit apple pay update remove',
        answer: [
          {
            type: 'p',
            text: 'Go to Profile → Payment methods to add or remove a card. You can also pick a different card on the review screen before you confirm a booking. Payments are processed securely by Stripe, and Tydio never stores your full card number.',
          },
        ],
      },
      {
        id: 'tips',
        question: 'Can I tip my Tidy Pro?',
        keywords: 'tip gratuity thank send tip later again failed',
        answer: [
          {
            type: 'p',
            text: 'Yes. After your booking is complete, you can add a tip of 10%, 15%, or a custom amount when you leave a review. Your Tidy Pro receives 100% of the tip.',
          },
          {
            type: 'p',
            text: 'Didn’t tip then, or your tip didn’t go through? Open the booking from your past bookings and tap Send a tip. You can tip once per booking.',
          },
        ],
      },
      {
        id: 'reviews',
        question: 'How do reviews work?',
        keywords: 'rating stars feedback review',
        answer: [
          {
            type: 'p',
            text: 'After your booking is complete, you’ll be asked to rate your Tidy Pro and leave a review. Reviews help other customers choose, and appear on the Tidy Pro’s profile.',
          },
          {
            type: 'p',
            text: 'Tidy Pros review customers too. They can’t see your review until they’ve left theirs, so neither review can sway the other.',
          },
        ],
      },
    ],
  },
  {
    id: 'account-safety',
    title: 'Account and safety',
    items: [
      {
        id: 'background-checks',
        question: 'Are Tidy Pros background checked?',
        keywords: 'safe safety trust vetted screened identity checkr insured insurance verified badge check mark professional experience',
        answer: [
          {
            type: 'p',
            text: 'Yes. Every Tidy Pro passes identity verification and a background check through Checkr before they can accept bookings.',
          },
          {
            type: 'p',
            text: 'Look for these badges on a Tidy Pro’s profile:',
          },
          {
            type: 'list',
            items: [
              'Verified Tidy Pro (green check mark): they have a professional cleaning background, confirmed by our team.',
              'Insured Cleaner: they’ve uploaded proof of insurance.',
            ],
          },
        ],
      },
      {
        id: 'accessibility',
        question: 'What accessibility settings are there?',
        keywords: 'contrast text size vision accessible',
        answer: [
          {
            type: 'p',
            text: 'Go to Profile → Accessibility to adjust how Tydio looks, like turning on high contrast.',
          },
        ],
      },
      {
        id: 'delete-account',
        question: 'How do I delete my account?',
        keywords: 'remove close account data privacy',
        answer: [
          {
            type: 'p',
            text: 'Go to Profile → Delete Account and confirm. This permanently deletes your account and personal information, and can’t be undone.',
          },
        ],
      },
      {
        id: 'contact-us',
        question: 'How do I contact Tydio?',
        keywords: 'support help email customer service',
        answer: [
          {
            type: 'p',
            text: `Email us at ${FAQ_CONTACT_EMAIL}. For a problem with a specific booking, reporting it from the booking gets it to our team fastest.`,
          },
        ],
      },
    ],
  },
  {
    id: 'tidy-pros',
    title: 'For Tidy Pros',
    items: [
      {
        id: 'become-tidy-pro',
        question: 'How do I become a Tidy Pro?',
        keywords: 'join apply work job cleaner sign up onboarding',
        answer: [
          {
            type: 'p',
            text: 'Sign up as a Tidy Pro, pay the background screening fee, and complete identity verification and a background check through Checkr. You’ll also sign the independent contractor agreement.',
          },
          { type: 'p', text: 'Once you’re approved, finish your profile so customers can book you:' },
          {
            type: 'list',
            items: [
              'Set up your payout method',
              'Choose your availability',
              'Add a profile picture and write your bio',
              'Add your address and set your travel distance',
              'Choose the services you provide',
            ],
          },
          {
            type: 'note',
            text: 'The screening fee is nonrefundable, except for duplicate charges, our ordering errors, or if we cancel onboarding for our own business reasons.',
          },
        ],
      },
      {
        id: 'tidy-pro-earnings',
        question: 'How much do I earn, and when do I get paid?',
        keywords: 'pay payout money earnings stripe bank deposit percent',
        answer: [
          {
            type: 'p',
            text: 'You earn 80% of each booking’s price, plus 100% of tips. Your share is sent to your Stripe account when you complete the job, and Stripe then pays it out to your bank.',
          },
          {
            type: 'p',
            text: 'Manage where your money goes in Profile → Payout methods. If a customer cancels an accepted booking within 2 hours of the start, you’re paid 50% of what you would have earned for it.',
          },
        ],
      },
      {
        id: 'tidy-pro-track-payouts',
        question: 'How do I track my payouts?',
        keywords: 'payout status deposit bank transfer stripe dashboard express when paid pending earnings history missing money',
        answer: [
          {
            type: 'steps',
            items: [
              'Go to Profile.',
              'Under Overall earnings, tap View Stripe dashboard.',
              'Stripe opens and shows your balance, each payout, and when it’s expected to reach your bank.',
            ],
          },
          {
            type: 'p',
            text: 'Pending earnings on your profile is money from completed jobs that hasn’t reached your bank yet. Overall earnings is everything you’ve earned on Tydio.',
          },
          {
            type: 'note',
            text: 'Don’t see the button? Set up your payouts first in Profile → Payout methods. Your Stripe dashboard is ready once that’s done.',
          },
        ],
      },
      {
        id: 'tidy-pro-availability',
        question: 'How do I set my hours or take time off?',
        keywords: 'availability schedule calendar vacation days off hours',
        answer: [
          {
            type: 'p',
            text: 'Go to Profile → Availability calendar to set your weekly hours and add time off. You can block whole days or just certain hours. Customers can only book you during your available hours.',
          },
        ],
      },
      {
        id: 'tidy-pro-requests',
        question: 'How do booking requests work?',
        keywords: 'accept decline request acceptance rate new time propose recurring weekly series cancel visit',
        answer: [
          {
            type: 'p',
            text: 'You’ll get a notification when a customer requests you. Review the tasks and accept or decline. If the time doesn’t work, you can suggest a new start time in the message thread, and the customer can approve it.',
          },
          {
            type: 'p',
            text: 'A request marked Recurring repeats every week, 2 weeks, or 4 weeks. Accepting it means you’ll take every visit, and each one is added to your schedule a week ahead. Can’t make one? Open it and tap Cancel this visit. To stop the whole thing, tap Cancel all recurring visits. Adding time off on a visit’s date cancels that visit too, and the customer is told.',
          },
          {
            type: 'p',
            text: 'Each visit is paid 3 days before it starts. If the customer’s payment fails, the visit goes on hold and you’ll be told not to go until it’s paid.',
          },
          {
            type: 'p',
            text: 'Try to keep your acceptance rate at 80% or higher. Once you’ve answered 5 requests, we’ll email you if it drops below that. Requests that expire or that the customer cancels don’t count.',
          },
        ],
      },
      {
        id: 'tidy-pro-day-of',
        question: 'What do I do on the day of a booking?',
        keywords: 'start booking on the way arrive arrived photos before after picture check off tasks complete portfolio profile customer not home no access',
        answer: [
          {
            type: 'steps',
            items: [
              'Start booking appears one hour before the start time. Tap I’m on the way when you head out, and check the customer’s directions.',
              'When you get there, tap I’ve arrived. Only tap it once you’re actually at the home. If a customer reports that you weren’t there, our team will contact you both to review it.',
              'Check off each task as you finish it by taking its after photo. An after photo is required for every task. A photo of the whole area you cleaned is fine.',
            ],
          },
          {
            type: 'p',
            text: 'Want to show off your work? Before you start a task, you can also take a before photo. Before and after pairs can be added to your profile for future customers to see. Before photos are optional. You can also add your own before and after photos, or remove any pair, under Profile → Edit profile → Cleaning Photos. Your profile keeps your 12 newest pairs, so the oldest drop off as you add more.',
          },
          {
            type: 'p',
            text: 'If you can’t get in, wait 10 minutes after the start time or your arrival, whichever is later. You can then report the booking as “Customer unavailable—no access”.',
          },
        ],
      },
      {
        id: 'tidy-pro-insurance',
        question: 'Do I need insurance?',
        keywords: 'insurance liability badge insured policy',
        answer: [
          {
            type: 'p',
            text: 'It’s optional, but recommended. Upload proof of insurance in Profile → Insurance to earn the Insured Cleaner badge. We’ll remind you 3 days before your policy expires so you can upload a new one.',
          },
        ],
      },
      {
        id: 'tidy-pro-reviews',
        question: 'Can I review customers?',
        keywords: 'review rate customer rating',
        answer: [
          {
            type: 'p',
            text: 'Yes. You have 24 hours after completing a job to review the customer. You’ll see their review of you once you’ve left yours, or once the 24 hours are up.',
          },
        ],
      },
      {
        id: 'tidy-pro-see-reviews',
        question: 'How do I see my reviews?',
        keywords: 'my reviews rating stars average feedback customer comments dashboard',
        answer: [
          {
            type: 'p',
            text: 'On your Home dashboard, tap the Average Rating card. You’ll see your average rating and every review customers have left you.',
          },
          {
            type: 'note',
            text: 'A new review shows up once you’ve reviewed that customer, or 24 hours after the job, whichever comes first. Until then it isn’t counted in the rating you see.',
          },
        ],
      },
    ],
  },
]

// What the home page section shows; the rest are on /faq.
export const FEATURED_FAQ_IDS = [
  'how-to-book',
  'full-cleaning',
  'pricing',
  'background-checks',
  'refund-policy',
  'add-to-home-screen',
  'app-store',
]

function blockText(block: FaqBlock): string {
  switch (block.type) {
    case 'p':
    case 'note':
      return block.text
    case 'steps':
    case 'list':
      return block.items.join(' ')
    case 'link':
      return `${block.before ?? ''} ${block.label}`
    case 'install-demo':
      return [...IPHONE_INSTALL_STEPS, ...ANDROID_INSTALL_STEPS].join(' ')
  }
}

// Lowercased, with curly quotes straightened so "doesn't" matches "doesn’t".
export function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}

export function faqSearchText(item: FaqItem, category: FaqCategory): string {
  return normalizeForSearch(
    [item.question, category.title, item.keywords ?? '', ...item.answer.map(blockText)].join(' '),
  )
}

// Every word of the query has to appear somewhere in the question, its
// category, its keywords or its answer.
export function matchesFaqQuery(searchText: string, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  return words.every(word => searchText.includes(word))
}
