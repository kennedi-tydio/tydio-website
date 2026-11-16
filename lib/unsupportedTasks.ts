// Tasks customers sometimes type that Tydio doesn't offer. Add Task stops on
// these with a clear message instead of sending them to the AI check or the
// laundry questions, and /api/validate-task checks again server-side. The AI
// validator's prompt (lib/aiTaskEstimate.ts) lists the same categories for
// wordings these patterns don't cover.
//
// Only the task name is matched here, not the notes: notes are free text
// ("kids are home, no bleach") and would trip too many false positives. The
// AI check reads the notes.
//
// Pure and dependency-free so client components can import it.

import { petTaskKindFromName } from './petTasks'

export const OUTDOOR_TASK_MESSAGE =
  'Tydio doesn’t provide that service right now. Taking out the trash is the only outdoor task we offer.'

export const UNSUPPORTED_MESSAGES = {
  dryCleaning: 'Tydio doesn’t offer dry cleaning right now.',
  outdoor: OUTDOOR_TASK_MESSAGE,
  specialty:
    'Tydio doesn’t offer specialty cleaning (carpet or upholstery shampooing, mattress cleaning, floor waxing, grout restoration, duct or chimney cleaning, post-construction or hoarding cleanups) right now.',
  highAccess: 'Tydio doesn’t offer work that needs a ladder, climbing or roof access.',
  biohazard:
    'Tydio doesn’t offer biohazard or hazardous cleanup (blood, vomit, human waste, needles, sewage, chemical spills, mold remediation, asbestos or lead).',
  pest: 'Tydio doesn’t offer pest control or infestation cleanup.',
  hauling: 'Tydio doesn’t offer hauling, junk removal, moving heavy furniture or appliances, or packing.',
  repairs: 'Tydio doesn’t offer repairs, installation, painting, assembly or home maintenance.',
  organizing:
    'Tydio doesn’t offer major organizing or decluttering projects. You can add a specific tidying job, like “Fold and put away clothes”.',
  petCare:
    'Tydio doesn’t offer pet care (walking, sitting, feeding, grooming, medication or handling animals). Pet enclosure and litter box cleaning are available.',
  personal: 'Tydio doesn’t offer personal or household assistance like childcare, elder care, cooking, shopping or errands.',
  garment: 'Tydio doesn’t offer tailoring, alterations or shoe and leather restoration right now.',
} as const

const p = (...parts: string[]) => new RegExp(parts.join('|'), 'i')

// Taking out the trash is the one outdoor job Tydio does, so any task about
// trash, garbage, recycling or bins skips the outdoor check.
const TRASH = /\b(trash|garbage|rubbish|recycl\w*|compost|bins?|trash\s*cans?|garbage\s*cans?)\b/i

// Pet enclosure and litter box cleaning are offered, so tasks about them skip
// the animal waste, pest and animal-handling checks ("Clean the mouse cage").
const PET_ENCLOSURE = { test: (name: string) => petTaskKindFromName(name) != null }

// Fully outside jobs: yard work, gutters, snow, exterior washing, etc.
const OUTDOOR = p(
  String.raw`\bleaves\b`,
  String.raw`\bleaf\s*blow`,
  String.raw`\bgutters?\b`,
  String.raw`\bdownspouts?\b`,
  String.raw`\bmow(s|ed|ing)?\b`,
  String.raw`\blawns?\b`,
  String.raw`\b(back|front|side)?\s*yards?\b`,
  String.raw`\byard\s*work\b`,
  String.raw`\bgarden(s|ing)?\b`,
  String.raw`\blandscap\w*`,
  String.raw`\bweed(s|ing)?\b`,
  String.raw`\bmulch`,
  String.raw`\bhedges?\b`,
  String.raw`\b(trim|prune)\w*\s+(the\s+)?(bush|bushes|shrubs?|trees?|branches)\b`,
  String.raw`\bshovel\w*\b`,
  String.raw`\bsnow\b`,
  String.raw`\b(pressure|power)[\s-]*wash`,
  String.raw`\bdriveways?\b`,
  String.raw`\bsidewalks?\b`,
  String.raw`\bpatios?\b`,
  String.raw`\bdecks?\b`,
  String.raw`\bporch(es)?\b`,
  String.raw`\b(swimming\s+)?pools?\b`,
  String.raw`\bhot\s*tubs?\b`,
  String.raw`\bjacuzzi\b`,
  String.raw`\b(bbq|barbecue|outdoor\s+grill)`,
  String.raw`\broofs?\b`,
  String.raw`\bsiding\b`,
  String.raw`\boutdoors?\b`,
  // Not bare "outside"/"exterior": "Wipe the outside of the fridge" is fine.
  String.raw`\b(outside|exterior)\s+(windows?|walls?|of\s+the\s+(house|home|windows?))\b`,
  String.raw`\b(wash|clean|detail)\w*\s+(the\s+|my\s+)?(car|truck|vehicle)s?\b`
)

// Fabric items whose deep/stain cleaning is specialty work.
const UPHOLSTERY = String.raw`(couch|couches|sofas?|upholster\w*|armchairs?|loveseats?|sectionals?|cushions?|ottomans?|recliners?)`

const SPECIALTY = p(
  // Carpet and rug shampooing / extraction / steam cleaning
  String.raw`\b(shampoo|extract|steam([\s-]*clean)?|deep[\s-]*clean)\w*\s+(the\s+|my\s+|all\s+(the\s+)?)?(\w+\s+){0,2}(carpets?|rugs?|carpeting)\b`,
  String.raw`\b(carpets?|rugs?)\s+(shampoo|extraction|steam)`,
  String.raw`\bcarpet\s+clean(ing|er)\b`,
  // Upholstery steam cleaning / shampooing / stain removal
  String.raw`\b(shampoo|steam([\s-]*clean)?|deep[\s-]*clean)\w*\s+(the\s+|my\s+)?(\w+\s+){0,2}${UPHOLSTERY}\b`,
  String.raw`\bupholstery\s+clean`,
  String.raw`\bstains?\b.*\b${UPHOLSTERY}\b`,
  String.raw`\b${UPHOLSTERY}\b.*\bstains?\b`,
  // Mattress cleaning
  String.raw`\b(clean|steam|shampoo|deodori[sz]e|sanitiz|disinfect|vacuum|spot[\s-]*clean)\w*\s+(the\s+|my\s+)?(\w+\s+)?mattress(es)?\b`,
  String.raw`\bmattress(es)?\b.*\b(stains?|cleaning|steam|shampoo|deodori)`,
  // Floor stripping / waxing / refinishing
  String.raw`\bwax\w*\s+(the\s+)?(\w+\s+)?floors?\b`,
  String.raw`\bfloor\s+wax`,
  String.raw`\bstrip(ping)?\s+(the\s+)?(\w+\s+)?floors?\b`,
  String.raw`\b(floor\s+)?(refinish|buff)\w*\s+(the\s+)?(\w+\s+)?floors?\b`,
  // Grout restoration (scrubbing grout is ordinary cleaning)
  String.raw`\bre[\s-]?grout`,
  String.raw`\bgrout\s+(restor|seal|recolor|repair|replac)\w*`,
  String.raw`\b(seal|recolor|restore|replace)\w*\s+(the\s+)?grout\b`,
  // Air ducts, chimneys, dryer vents
  String.raw`\b(air\s+)?ducts?\b`,
  String.raw`\bductwork\b`,
  String.raw`\bchimneys?\b`,
  String.raw`\bdryer\s+vents?\b`,
  // Post-construction and hoarding cleanouts
  String.raw`\b(post|after)[\s-]*(construction|renovation|remodel)`,
  String.raw`\bconstruction\s+(dust|debris|clean)`,
  String.raw`\bhoard\w*`
)

const HIGH_ACCESS = p(
  String.raw`\bladders?\b`,
  String.raw`\bclimb\w*`,
  String.raw`\bskylights?\b`,
  String.raw`\b(high|vaulted|cathedral)\s+ceilings?\b`,
  String.raw`\bon\s+the\s+roof\b`
)

const BIOHAZARD = p(
  String.raw`\bblood\w*`,
  String.raw`\bvomit\w*`,
  String.raw`\bpuke\w*`,
  String.raw`\bbarf\w*`,
  String.raw`\bthrow[\s-]*up\b`,
  String.raw`\bthrew\s+up\b`,
  String.raw`\bhuman\s+(waste|feces|faeces|poop|excrement|urine)\b`,
  String.raw`(?<!pine\s)(?<!sewing\s)\bneedles?\b`,
  String.raw`\bsyringes?\b`,
  String.raw`\bsharps\b`,
  String.raw`\bsewage\b`,
  String.raw`\bsewer\b`,
  String.raw`\bseptic\b`,
  String.raw`\b(toilet|sewer|drain)\s+(overflow|back(ed)?[\s-]*up)\w*`,
  String.raw`\bchemical\s+spill`,
  String.raw`\bspilled\s+(bleach|chemicals?)\b`,
  String.raw`\bmold\s+(remediation|removal|abatement|infestation)\b`,
  String.raw`\bblack\s+mold\b`,
  String.raw`\basbestos\b`,
  String.raw`\blead\s+(dust|paint)\b`,
  String.raw`\bbiohazard\w*`,
  String.raw`\bbodily\s+fluids?\b`,
  String.raw`\bcrime\s+scene\b`
)

// Animal waste is offered ("Clean up the dog's accident"), human waste isn't.
// These words could be either, so they're only blocked when no animal is
// named. Urine near the toilet is ordinary toilet cleaning.
const WASTE = /\b(poop|poo|feces|faeces|fecal|excrement|diarrh\w*|urine|pee|piss)\b/i
const TOILET = /\b(toilets?|urinals?)\b/i

const PEST = p(
  String.raw`\bbed\s*bugs?\b`,
  String.raw`\bfleas?\b`,
  String.raw`\b(cock)?roach(es)?\b`,
  String.raw`\brodents?\b`,
  String.raw`\bmice\b`,
  String.raw`\brats?\b`,
  String.raw`\bmouse\s+(nests?|traps?|problem|droppings)\b`,
  String.raw`\b(rodent|rat)\s+droppings\b`,
  String.raw`\btermites?\b`,
  String.raw`\b(ant|ants|wasp|wasps|hornets?|bees?|bird|birds|squirrel|raccoon)\s+(nests?|hives?|infestation)\b`,
  String.raw`\bnests?\b`,
  String.raw`\bhornets?\b`,
  String.raw`\bwasps?\b`,
  String.raw`\binfest\w*`,
  String.raw`\bexterminat\w*`,
  String.raw`\bpests?\b`,
  String.raw`\bfumigat\w*`,
  String.raw`\bcarcass\w*`,
  String.raw`\bdead\s+(mouse|mice|rats?|birds?|squirrels?|animals?|raccoons?|possums?|opossums?|snakes?|bats?)\b`
)

const HEAVY_ITEM = String.raw`(furniture|couch|couches|sofas?|piano|dressers?|beds?|bed\s+frames?|mattress(es)?|fridges?|refrigerators?|freezers?|stoves?|ovens?|washers?|dryers?|washing\s+machines?|appliances?|bookcases?|wardrobes?|armoires?|cabinets?|desks?|tables?|safes?|treadmills?|tvs?)`

const HAULING = p(
  String.raw`\bjunk\b(?!\s+drawers?)`,
  String.raw`\bhaul\w*`,
  String.raw`\b(the\s+)?dump\s+run\b`,
  String.raw`\bto\s+the\s+(dump|landfill)\b`,
  String.raw`\blandfill\b`,
  String.raw`\bdonation\s+(center|drop)`,
  String.raw`\b(move|moving|lift|lifting|carry|carrying|rearrang\w*|pull\s+out|slide\s+out)\s+(the\s+|a\s+|my\s+|all\s+(the\s+)?)?(\w+\s+)?${HEAVY_ITEM}\b`,
  String.raw`\b(un)?pack(ing)?\s+(up\s+)?(the\s+|my\s+)?(boxes|house|home|apartment|kitchen|stuff|things|belongings)\b`,
  String.raw`\bunpack\w*`,
  String.raw`\bpack(ing)?\s+for\s+(the\s+|a\s+|my\s+)?move\b`,
  String.raw`\bhelp\s+(me\s+|us\s+)?move\b`,
  String.raw`\bmoving\s+(boxes|help|day)\b`
)

const REPAIRS = p(
  String.raw`\bplumb\w*`,
  String.raw`\brepair\w*`,
  String.raw`\bfix(ing|ed|es)?\s+(the\s+|a\s+|my\s+)?(\w+\s+)?(sink|toilet|faucet|tap|door|leak|pipe|drain|cabinet|hinge|drawer|light|outlet|switch|fan|appliance|dishwasher|washer|dryer|fridge|refrigerator|oven|stove|hole|wall|window|blinds?|tile|floor|roof|fence|lock|handle|shower|tub|garbage\s+disposal|disposal)s?\b`,
  String.raw`\bleak\w*`,
  String.raw`\belectric(al|ian)\b`,
  String.raw`\bwiring\b`,
  String.raw`\brewire\b`,
  String.raw`\b(re)?paint(ed)?\b`,
  String.raw`\bpainting\s+(the\s+)?(walls?|rooms?|ceilings?|doors?|trim|cabinets?|fence|house)\b`,
  String.raw`\bassembl\w*`,
  String.raw`\bput\s+together\b`,
  String.raw`\bbuild\s+(a|an|the|my|some)\b`,
  String.raw`\bmount\w*`,
  String.raw`\binstall\w*`,
  String.raw`\bhang\w*\s+(a\s+|the\s+|my\s+|some\s+)?(\w+\s+)?(tvs?|shel(f|ves)|pictures?|frames?|art|artwork|curtains?|curtain\s+rods?|blinds|mirrors?|lights?|wallpaper)\b`,
  String.raw`\bwallpaper\w*`,
  String.raw`\b(re)?caulk\w*`,
  String.raw`\bdrywall\b`,
  String.raw`\bspackl\w*`,
  String.raw`\bpatch\w*\s+(the\s+|a\s+)?(holes?|walls?|drywall)\b`,
  String.raw`\b(replace|change|swap)\w*\s+(the\s+|a\s+|all\s+(the\s+)?)?(\w+\s+)?(light\s*bulbs?|bulbs?|(air|hvac|furnace|ac|water)\s+filters?|smoke\s+detectors?|batter(y|ies)|locks?|faucets?|toilet\s+seats?)\b`,
  String.raw`\bhandyman\b`,
  String.raw`\b(home\s+)?maintenance\b`,
  String.raw`\b(unclog|snake)\w*\s+(the\s+)?(drain|toilet|sink|pipe)s?\b`
)

const STORAGE_SPACE = String.raw`(closets?|garages?|attics?|basements?|storage(\s+units?|\s+rooms?)?|sheds?|crawl\s*spaces?|whole\s+house|entire\s+house)`

const ORGANIZING = p(
  String.raw`\bdeclutter\w*`,
  String.raw`\bde-clutter\w*`,
  String.raw`\bpurg(e|ing)\b`,
  String.raw`\bkon\s*mari\b`,
  String.raw`\bwhat\s+to\s+(keep|donate|toss|throw\s+(away|out)|discard)\b`,
  String.raw`\bdonat\w*`,
  String.raw`\b(organi[sz]\w*|sort\w*|clean\s+out|clear\s+out|go\s+through|reorgani[sz]\w*)\s+(the\s+|my\s+|our\s+|all\s+(the\s+)?)?(\w+\s+)?${STORAGE_SPACE}\b`,
  String.raw`\bstorage\s+units?\b`
)

const PET_ANIMAL = String.raw`(dogs?|pupp(y|ies)|cats?|kittens?|pets?|fish|birds?|rabbits?|bunn(y|ies)|hamsters?|guinea\s+pigs?|horses?|animals?)`

const ANIMAL = new RegExp(String.raw`\b${PET_ANIMAL}\b|\b(animal|pet)\s+(waste|mess|accidents?)\b|\bdroppings\b`, 'i')

// "Wash the dog bed", "Fill the cat's water bowl": about the pet's things, not the pet.
const NOT_PET_GEAR = String.raw`(?!['’]|\s+(beds?|bedding|bowls?|toys?|crates?|hair|fur|blankets?|dish(es)?|food|leash(es)?|collars?|mats?|carriers?|gates?|doors?|towels?|tanks?|trees?|houses?))`

const PET_CARE = p(
  String.raw`\b(walk|walking)\s+(the\s+|my\s+|our\s+)?(\w+\s+)?dogs?\b`,
  String.raw`\bdog[\s-]*walk\w*`,
  String.raw`\bpet[\s-]*sit\w*`,
  String.raw`\b(dog|cat)[\s-]*sit\w*`,
  String.raw`\bfeed\w*\s+(the\s+|my\s+|our\s+)?(\w+\s+)?${PET_ANIMAL}\b${NOT_PET_GEAR}`,
  String.raw`\b(fill|refill)\w*\s+(the\s+)?(\w+\s+)?(food|water)\s+(bowls?|dish(es)?)\b`,
  String.raw`\bgroom\w*`,
  String.raw`\b(bathe|bath|wash|brush|shampoo)\s+(the\s+|my\s+|our\s+)?(\w+\s+)?${PET_ANIMAL}\b${NOT_PET_GEAR}`,
  String.raw`\b(trim|clip|cut)\w*\s+(the\s+|my\s+)?([\w'’]+\s+)?(nails|claws)\b`,
  String.raw`\b(let|take|put)\s+(the\s+|my\s+|our\s+)?(\w+\s+)?(dogs?|pupp(y|ies)|cats?|pets?)\s+(out|outside)\b`,
  String.raw`\b(catch|relocat\w*|trap|rehome|handle|handling)\s+(the\s+|a\s+|my\s+)?(\w+\s+)?(${PET_ANIMAL}|snakes?|bats?|squirrels?|raccoons?|possums?|opossums?|lizards?|frogs?)\b`
)

const PERSONAL = p(
  String.raw`\bbaby[\s-]*sit\w*`,
  String.raw`\bchild[\s-]*care\b`,
  String.raw`\bnann(y|ies)\b`,
  String.raw`\bdaycare\b`,
  String.raw`\b(watch|supervise|babysit|look\s+after|care\s+for)\s+(the\s+|my\s+|our\s+)?(kids?|children|child|baby|babies|toddlers?|son|daughter|mom|mother|dad|father|grand\w+|parents?)\b`,
  String.raw`\b(pick|drop)\s+(up|off)\s+(the\s+|my\s+|our\s+)?(kids|children|child|son|daughter)\s+(from|at)\b`,
  String.raw`\belder(ly)?[\s-]*care\b`,
  String.raw`\bsenior\s+care\b`,
  String.raw`\bcare[\s-]*giv\w*`,
  String.raw`\bcompanion(ship)?\b`,
  String.raw`\bpersonal\s+care\b`,
  String.raw`\bhelp\s+(\w+\s+){0,2}(bathe|shower|dress|get\s+dressed|use\s+the\s+(bathroom|toilet))\b`,
  String.raw`\bmedicat\w*`,
  String.raw`\bmedicine\b(?!\s+(cabinets?|cupboards?|shel(f|ves)))`,
  String.raw`\bprescriptions?\b`,
  String.raw`\bcook(?!\s*tops?\b)(?!ware)\b`,
  String.raw`\bcooking\s+(dinner|lunch|breakfast|meals?|for)\b`,
  String.raw`\bmake\s+(dinner|lunch|breakfast|meals?|food)\b`,
  String.raw`\bmeal[\s-]*prep\w*`,
  String.raw`\bbake\b`,
  String.raw`\bbaking\s+(cookies|a\s+cake|bread)\b`,
  String.raw`\bgrocer(y|ies)\b`,
  String.raw`\bshopping\b`,
  String.raw`\berrands?\b`,
  String.raw`\bpick\s+up\s+(the\s+|my\s+)?(mail|packages?|dry\s+cleaning|takeout|food)\b`,
  String.raw`\b(run|go)\s+to\s+the\s+(store|post\s+office|bank|pharmacy)\b`,
  String.raw`\bwater\s+(the\s+|my\s+)?(\w+\s+)?plants?\b`
)

const GARMENT = p(
  String.raw`\btailor\w*`,
  String.raw`\balteration\w*`,
  String.raw`\balter\s+(the\s+|my\s+)?\w+`,
  String.raw`\bhem(s|med|ming)?\b`,
  String.raw`\bsew(s|n|ed|ing)?\b`,
  String.raw`\bmend\w*`,
  String.raw`\bdarn(ing)?\s+(socks?|sweaters?)\b`,
  String.raw`\bshoe\s+(shin\w*|polish\w*|repair\w*|restor\w*)`,
  String.raw`\b(shine|polish|restore|resole|repair)\w*\s+(the\s+|my\s+)?(\w+\s+)?(shoes|boots|sneakers|heels)\b`,
  String.raw`\bleather\s+(restor\w*|repair\w*|recondition\w*|condition\w*|dye\w*)`,
  String.raw`\b(restore|recondition|condition|dye)\w*\s+(the\s+|my\s+)?(\w+\s+)?leather\b`
)

type Rule = { re: { test(s: string): boolean }; message: string; unless?: { test(s: string): boolean }[] }

// First match wins, so the order picks the message when a task fits more
// than one category ("Pick up dog poop in the backyard" is an outdoor task).
const UNSUPPORTED: Rule[] = [
  // "dry cleaning", "dry-clean my suit", "take clothes to the dry cleaners", "drycleaner"
  { re: /\bdry[\s-]*clean/i, message: UNSUPPORTED_MESSAGES.dryCleaning },
  // "Rake leaves", "Clean the gutters", "Mow the lawn", "Sweep the patio"
  { re: OUTDOOR, message: UNSUPPORTED_MESSAGES.outdoor, unless: [TRASH] },
  { re: SPECIALTY, message: UNSUPPORTED_MESSAGES.specialty },
  { re: HIGH_ACCESS, message: UNSUPPORTED_MESSAGES.highAccess },
  // "Clean the rat cage" is a pet enclosure, not pest control. Ahead of
  // biohazard so "mouse droppings" reads as pest cleanup.
  { re: PEST, message: UNSUPPORTED_MESSAGES.pest, unless: [PET_ENCLOSURE] },
  { re: BIOHAZARD, message: UNSUPPORTED_MESSAGES.biohazard },
  { re: WASTE, message: UNSUPPORTED_MESSAGES.biohazard, unless: [ANIMAL, PET_ENCLOSURE, TOILET] },
  { re: HAULING, message: UNSUPPORTED_MESSAGES.hauling },
  { re: REPAIRS, message: UNSUPPORTED_MESSAGES.repairs },
  { re: ORGANIZING, message: UNSUPPORTED_MESSAGES.organizing },
  { re: PET_CARE, message: UNSUPPORTED_MESSAGES.petCare, unless: [PET_ENCLOSURE] },
  { re: PERSONAL, message: UNSUPPORTED_MESSAGES.personal },
  { re: GARMENT, message: UNSUPPORTED_MESSAGES.garment },
]

// The message to show for a task Tydio doesn't offer, or null if it's fine.
export function unsupportedTaskMessage(name: string): string | null {
  return UNSUPPORTED.find((u) => u.re.test(name) && !u.unless?.some((x) => x.test(name)))?.message ?? null
}
