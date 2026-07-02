"use client"

import { Store } from "@tanstack/store"

export type StateUpdater<TValue> = TValue | ((current: TValue) => TValue)
export interface AppStore<TState extends object> extends Store<TState> {
  getState: () => TState
}
type StoreSetState<TState extends object> = (
  partial: Partial<TState> | ((state: TState) => Partial<TState>),
) => void

function applyStateUpdate<TState extends object>(
  state: TState,
  partial: Partial<TState> | ((state: TState) => Partial<TState>),
): TState {
  const partialState = typeof partial === "function" ? partial(state) : partial

  if (partialState == null || partialState === state) {
    return state
  }

  let hasChanges = false
  let nextState: TState | null = null

  for (const key in partialState) {
    if (!Object.prototype.hasOwnProperty.call(partialState, key)) {
      continue
    }

    const typedKey = key as keyof TState
    const value = partialState[typedKey]

    if (!Object.is(state[typedKey], value)) {
      if (nextState === null) {
        nextState = { ...state }
      }

      nextState[typedKey] = value as TState[keyof TState]
      hasChanges = true
    }
  }

  return hasChanges && nextState !== null ? nextState : state
}

function resolveStateUpdater<TValue>(
  value: StateUpdater<TValue>,
  current: TValue,
): TValue {
  if (typeof value === "function") {
    return (value as (current: TValue) => TValue)(current)
  }

  return value
}

export function createAppStore<TState extends object>(
  createState: (set: StoreSetState<TState>) => TState,
): AppStore<TState> {
  let store: AppStore<TState> | null = null
  const pendingUpdates: Array<
    Partial<TState> | ((state: TState) => Partial<TState>)
  > = []

  const set: StoreSetState<TState> = (partial) => {
    if (store === null) {
      pendingUpdates.push(partial)
      return
    }

    store.setState((state) => applyStateUpdate(state, partial))
  }

  const initialState = pendingUpdates.reduce<TState>(
    (state, partial) => applyStateUpdate(state, partial),
    createState(set),
  )
  pendingUpdates.length = 0

  store = new Store<TState>(initialState) as AppStore<TState>
  store.getState = store.get.bind(store)

  return store
}

export function createFieldSetter<
  TState extends object,
  TKey extends keyof TState,
>(
  set: StoreSetState<TState>,
  key: TKey,
): (value: StateUpdater<TState[TKey]>) => void {
  return (value) => {
    set((state): Partial<TState> => {
      const next = { [key]: resolveStateUpdater(value, state[key]) } as unknown
      return next as Partial<TState>
    })
  }
}
