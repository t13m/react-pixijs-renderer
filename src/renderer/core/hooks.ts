import * as React from 'react';
import { EqualityChecker, StateSelector } from 'zustand';

import { context, RenderCallback, RootState } from './store';

export function useStore() {
  const store = React.useContext(context);
  if (!store) throw `PIXI hooks can only be used within the Canvas component!`;
  return store;
}
export function usePixi<T = RootState>(
  selector: StateSelector<RootState, T> = (state) => state as unknown as T,
  equalityFn?: EqualityChecker<T>,
) {
  return useStore()(selector, equalityFn);
}
export function useFrame(callback: RenderCallback, renderPriority = 0): null {
  const subscribe = useStore().getState().internal.subscribe;
  // Update ref
  const ref = React.useRef<RenderCallback>(callback);
  React.useLayoutEffect(() => void (ref.current = callback), [callback]);
  // Subscribe on mount, unsubscribe on unmount
  React.useLayoutEffect(() => subscribe(ref, renderPriority), [renderPriority, subscribe]);
  return null;
}
