import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { broadTaskMessage, combinedTaskMessage } from '@/lib/taskSpecificity'
import { isEntireHomeRoom } from '@/lib/entireHome'
import { unsupportedTaskMessage } from '@/lib/unsupportedTasks'

// Specific single jobs a customer might type, by the room they'd pick.
// Every one of these should be accepted.
const SHOULD_PASS: Record<string, string[]> = {
  Kitchen: [
    'Wipe down counters', 'Wipe counters', 'Clean counters', 'Clean the countertops', 'Scrub the sink', 'Clean sink',
    'Clean the microwave', 'Clean microwave inside', 'Wipe the microwave', 'Clean the stovetop', 'Clean stove',
    'Wipe down stove', 'Clean the oven', 'Clean inside the fridge', 'Clean fridge', 'Wipe fridge shelves',
    'Wipe the fridge door', 'Clean the dishwasher', 'Load the dishwasher', 'Unload the dishwasher', 'Wash dishes',
    'Wash the dishes', 'Do the dishes', 'Hand wash pots and pans', 'Wipe cabinet fronts', 'Wipe cabinets',
    'Wipe the backsplash', 'Clean the toaster', 'Wipe small appliances', 'Clean coffee maker',
    'Wipe the kitchen table', 'Wipe kitchen chairs', 'Empty the trash', 'Take out the trash', 'Take out recycling',
    'Sweep floor', 'Mop floor', 'Sweep kitchen floor', 'Mop the kitchen floor', 'Vacuum floor',
    'Clean the range hood', 'Polish stainless steel appliances', 'Wipe light switches', 'Clean the trash can',
    'Wash and dry the dishes', 'Wipe and sanitize the counters', 'Clean the sink', 'Clean the oven door',
  ],
  'Full bathroom': [
    'Scrub the toilet', 'Clean toilet', 'Clean the toilet', 'Clean bathtub', 'Scrub the tub', 'Clean the shower',
    'Scrub shower', 'Clean shower door', 'Clean shower glass', 'Scrub shower tiles', 'Scrub grout',
    'Clean the bathroom mirror', 'Clean mirror', 'Wipe the mirror', 'Clean sink', 'Wipe the vanity',
    'Clean bathroom counter', 'Wipe faucets', 'Polish fixtures', 'Replace towels', 'Hang clean towels',
    'Empty bathroom trash', 'Mop bathroom floor', 'Mop floor', 'Sweep floor', 'Wipe down toilet',
    'Clean behind the toilet', 'Wipe baseboards', 'Remove soap scum', 'Clean the bath mat', 'Wipe medicine cabinet',
  ],
  'Half bathroom': ['Clean toilet', 'Clean sink', 'Clean mirror', 'Mop floor', 'Empty trash'],
  Bedroom: [
    'Make the bed', 'Make bed', 'Change bed sheets', 'Change sheets', 'Strip the bed', 'Put on clean sheets',
    'Dust the dresser', 'Dust nightstands', 'Dust furniture', 'Vacuum the bedroom floor', 'Vacuum floor',
    'Vacuum carpet', 'Vacuum under the bed', 'Fold laundry', 'Fold clothes', 'Fold and put away clothes',
    'Put away clothes', 'Hang up clothes', 'Wash and dry the sheets', 'Wipe windowsills', 'Dust blinds',
    'Dust ceiling fan', 'Clean windows', 'Wipe the mirror', 'Pick up clothes off the floor', 'Empty trash', 'Do laundry',
  ],
  'Living room': [
    'Vacuum the couch', 'Vacuum the rug', 'Vacuum rug', 'Vacuum floor', 'Vacuum carpet', 'Dust the TV stand',
    'Dust shelves', 'Dust the bookshelf', 'Dust surfaces', 'Wipe the coffee table', 'Wipe coffee table',
    'Fluff pillows', 'Fold blankets', 'Dust baseboards', 'Wipe baseboards', 'Clean glass table', 'Dust lamps',
    'Dust picture frames', 'Wipe the TV screen', 'Wipe remote controls', 'Clean windows', 'Wipe windowsills',
    'Sweep floor', 'Mop floor', 'Mop hardwood floor', 'Pick up toys', 'Put away toys',
    'Clean interior windows', 'Organize the bookshelf', 'Tidy the coffee table', 'Dust the shelves',
  ],
  'Dining room': ['Wipe the dining table', 'Wipe dining chairs', 'Dust the chandelier', 'Dust the buffet', 'Sweep floor', 'Mop floor', 'Vacuum floor'],
  'Home office': ['Dust the desk', 'Wipe desk', 'Wipe keyboard', 'Dust bookshelves', 'Empty the trash', 'Vacuum floor', 'Wipe office chair'],
  'Hallway / entryway': ['Sweep entryway floor', 'Mop floor', 'Vacuum floor', 'Wipe door handles', 'Wipe front door', 'Dust console table', 'Clean the welcome mat', 'Organize shoes', 'Wipe light switches'],
  'Laundry room': ['Wash a load of laundry', 'Wash laundry', 'Dry laundry', 'Fold laundry', 'Wipe washer and dryer', 'Clean lint trap'],
}

// Held out: not named anywhere in the validator prompt, to check the rules
// generalize instead of matching the prompt's own examples.
SHOULD_PASS['Kitchen'].push('Clean the blender', 'Wipe the high chair', 'Scrub the stove burners', 'Clean the trash can lid', 'Wipe the fridge handles')
SHOULD_PASS['Full bathroom'].push('Scrub the bathtub drain', 'Clean the toothbrush holder', 'Wipe the towel rack', 'Clean the exhaust fan cover')
SHOULD_PASS['Living room'].push('Dust the piano', 'Clean the glass doors', 'Wipe the doorframes', 'Wash the throw blanket', 'Straighten the bookshelves')
SHOULD_PASS['Bedroom'].push('Clean the crib rails', 'Dust the headboard', 'Organize the nightstand drawer')

// Controls: these are meant to be rejected, to show the checks still fire.
const SHOULD_FAIL: Record<string, string[]> = {
  Kitchen: [
    'Clean kitchen', 'Clean the floor', 'Floor cleaning', 'Floors', 'Tidy the kitchen', 'Sweep and mop the floor',
    'Wipe counters and scrub the sink', 'Fix the leaky sink', 'Cook dinner', 'Grocery shopping',
    'Clean entire kitchen top to bottom',
  ],
  'Full bathroom': ['Clean bathroom', 'Deep clean bathroom', 'Clean the toilet and the tub'],
  Bedroom: ['Tidy bedroom', 'Clean up', 'Deep clean bedroom', 'Dust'],
  'Living room': [
    'Clean', 'Cleaning', 'Tidy up', 'Help me', 'Make it nice', 'Stuff', 'General cleaning', 'Clean the house',
    'Do the living room', 'Dust shelves and vacuum the rug', 'Paint the walls', 'Shampoo the carpet', 'Walk the dog',
    'Rake leaves', 'Clean the gutters', 'Clean the garage', 'Wash the car', 'Clean everything', 'Do whatever needs doing',
    'Make the place look good', 'Living room stuff', 'Dust and vacuum the couch',
  ],
}

const VAGUE_RE = /vague|more specific|be specific|unclear|specify|how the floor|not specific|too general|too broad/i

type Row = {
  room: string
  task: string
  expected: 'pass' | 'fail'
  valid: boolean
  stage: 'unsupported' | 'broad' | 'combined' | 'ai' | 'error'
  vague: boolean
  minutes: number | null
  reason: string
}

// Same order of checks as app/api/validate-task/route.ts.
async function check(room: string, task: string, expected: 'pass' | 'fail'): Promise<Row> {
  const base = { room, task, expected }
  const unsupported = unsupportedTaskMessage(task)
  if (unsupported) return { ...base, valid: false, stage: 'unsupported', vague: VAGUE_RE.test(unsupported), minutes: null, reason: unsupported }
  const broad = broadTaskMessage(task, room)
  if (broad) return { ...base, valid: false, stage: 'broad', vague: VAGUE_RE.test(broad), minutes: null, reason: broad }
  const combined = isEntireHomeRoom(room) ? null : combinedTaskMessage(task)
  if (combined) return { ...base, valid: false, stage: 'combined', vague: VAGUE_RE.test(combined), minutes: null, reason: combined }
  try {
    const r = await estimateTaskDuration({ name: task, room, dirtLevel: 'standard' })
    return { ...base, valid: r.valid, stage: 'ai', vague: !r.valid && VAGUE_RE.test(r.reason), minutes: r.estimated_minutes, reason: r.reason }
  } catch (e) {
    return { ...base, valid: false, stage: 'error', vague: false, minutes: null, reason: String(e) }
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k])
      }
    })
  )
  return out
}

test('task vagueness matrix', async () => {
  // More than one run, since the model can answer the same task differently.
  const runs = Number(process.env.MATRIX_RUNS ?? 2)
  const cases = [
    ...Object.entries(SHOULD_PASS).flatMap(([room, ts]) => ts.map((task) => ({ room, task, expected: 'pass' as const }))),
    ...Object.entries(SHOULD_FAIL).flatMap(([room, ts]) => ts.map((task) => ({ room, task, expected: 'fail' as const }))),
  ]
  const rows: Row[][] = []
  for (let run = 0; run < runs; run++) rows.push(await pool(cases, 8, (c) => check(c.room, c.task, c.expected)))

  const out = process.env.MATRIX_OUT ?? path.resolve(__dirname, '.results.json')
  fs.writeFileSync(out, JSON.stringify({ runs, rows }, null, 2))
  console.log(`wrote ${out}: ${cases.length} cases x ${runs} runs`)

  // Every case that came out the wrong way on at least one run.
  const wrong = cases
    .map((c, k) => ({ c, rs: rows.map((r) => r[k]) }))
    .filter(({ c, rs }) => rs.some((r) => r.valid !== (c.expected === 'pass')))
  const lines = wrong.map(({ c, rs }) => {
    const ok = rs.filter((r) => r.valid === (c.expected === 'pass')).length
    const reasons = [...new Set(rs.map((r) => `[${r.stage}] ${r.reason}`).filter((x) => !x.endsWith('] ')))]
    return [`  ${ok}/${runs} should ${c.expected}: "${c.task}" (${c.room})`, ...reasons.map((x) => `      ${x}`)].join('\n')
  })
  console.log(`\n${wrong.length} of ${cases.length} misclassified at least once:\n${lines.join('\n')}`)
})
