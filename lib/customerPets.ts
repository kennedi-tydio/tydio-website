// The pets a customer has at home (Profile → Pets). Customers have to answer
// before they can book: add at least one pet, or say they have none. Each pet
// needs a type; the name, notes and photo are optional.
//
// Pure and dependency-free so client components can import it.

export const CUSTOMER_PET_PHOTOS_BUCKET = 'customer-pet-photos'

export const PET_TYPES = ['Dog', 'Cat', 'Bird', 'Fish', 'Reptile', 'Rabbit', 'Hamster / guinea pig', 'Other'] as const

export const MAX_PETS = 20
export const MAX_PET_NAME_LENGTH = 50
export const MAX_PET_TYPE_LENGTH = 50
export const MAX_PET_NOTES_LENGTH = 500

export const PETS_PATH = '/dashboard/profile/pets'
// Where /book sends a customer who hasn't answered yet.
export const PETS_REQUIRED_PATH = `${PETS_PATH}?required=1`
// Where a new customer lands right after signing up.
export const PETS_ONBOARDING_PATH = `${PETS_PATH}?onboarding=1`

export const PETS_REQUIRED_MESSAGE =
  'Tell us about any pets in your home (or that you have none) in Profile → Pets before booking.'

export type CustomerPet = {
  id: string
  name: string | null
  petType: string
  notes: string | null
  photoPath: string | null
}

export type PetInput = {
  name: string
  petType: string
  notes: string
}

export type CleanPetInput = {
  name: string | null
  petType: string
  notes: string | null
}

// Trims and checks what the customer typed. Returns the cleaned values or the
// first thing they need to fix.
export function validatePetInput(input: PetInput): { pet: CleanPetInput } | { error: string } {
  const name = input.name.trim()
  const petType = input.petType.trim()
  const notes = input.notes.trim()
  if (!petType) return { error: 'Choose what kind of pet this is.' }
  if (petType.length > MAX_PET_TYPE_LENGTH) return { error: `Pet type must be ${MAX_PET_TYPE_LENGTH} characters or fewer.` }
  if (name.length > MAX_PET_NAME_LENGTH) return { error: `Name must be ${MAX_PET_NAME_LENGTH} characters or fewer.` }
  if (notes.length > MAX_PET_NOTES_LENGTH) return { error: `Notes must be ${MAX_PET_NOTES_LENGTH} characters or fewer.` }
  return { pet: { name: name || null, petType, notes: notes || null } }
}

// Answered = at least one pet saved, or "I don't have any pets" chosen.
export function hasAnsweredPets(hasNoPets: boolean, petCount: number): boolean {
  return petCount > 0 || hasNoPets
}

// One line per pet, saved on the booking when it's requested so the Tidy Pro
// sees the pets as they were at booking time (bookings.pets).
export function petsSummary(pets: Pick<CustomerPet, 'name' | 'petType' | 'notes'>[], hasNoPets: boolean): string | null {
  if (pets.length === 0) return hasNoPets ? 'No pets' : null
  return pets
    .map((p) => {
      const label = p.name ? `${p.name} (${p.petType})` : p.petType
      return p.notes ? `${label}: ${p.notes}` : label
    })
    .join('\n')
}

// Photo paths are "<profile id>/<file>", so this keeps a customer from pointing
// a pet at someone else's upload.
export function isOwnPetPhotoPath(path: string, profileId: string): boolean {
  return path.startsWith(`${profileId}/`) && !path.includes('..') && path.split('/').length === 2
}
