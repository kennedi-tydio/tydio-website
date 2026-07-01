export type DirtLevel = 'light' | 'standard' | 'heavy'

export type TidyTask = {
  id: string
  name: string
  notes: string
  room: string
  dirtLevel: DirtLevel | null
  unusual: string[]
  completed: boolean
}
