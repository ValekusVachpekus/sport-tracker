import type { Workout, WorkoutExercise } from './model'

export type Draft = { workout: Workout; previous: Record<string, WorkoutExercise> }
export type LocalState = { draft: Draft | null; queue: Workout[] }
export const emptyLocal: LocalState = { draft: null, queue: [] }

const dbName = `sport-tracker:${import.meta.env.BASE_URL}`
let connection: Promise<IDBDatabase> | undefined
function openDb() {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('journal')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Закрой другие вкладки с журналом и обнови страницу.'))
    }).catch(error => {
      connection = undefined
      throw error
    })
  }
  return connection
}

export async function readLocal(owner: string): Promise<LocalState> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction('journal').objectStore('journal').get(owner)
    request.onsuccess = () => resolve(request.result ?? emptyLocal)
    request.onerror = () => reject(request.error)
  })
}

export async function changeLocal(owner: string, update: (current: LocalState) => LocalState): Promise<LocalState> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('journal', 'readwrite')
    const store = tx.objectStore('journal')
    const request = store.get(owner)
    let next: LocalState
    let failure: unknown
    request.onsuccess = () => {
      try {
        next = update(request.result ?? emptyLocal)
        store.put(next, owner)
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(next)
    tx.onabort = () => reject(failure ?? tx.error)
  })
}
