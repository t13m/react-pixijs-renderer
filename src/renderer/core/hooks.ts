import * as React from 'react';
import * as PIXI from 'pixi.js';
import { suspend, preload, clear } from 'suspend-react';
import { EqualityChecker, StateSelector } from 'zustand';

import { context, RenderCallback, RootState } from './store';
import { is } from './utils';

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

export type Extensions = (loader: PIXI.Loader) => void;
export type ILoaderInput = Array<{ name: string; url: string }>;
export type ILoaderOutput = Record<string, PIXI.Texture>;

function loadingFn(extensions?: Extensions) {
  return function (providedLoader?: PIXI.Loader, ...input: ILoaderInput) {
    // Construct new loader and run extensions
    const loader = providedLoader ?? PIXI.Loader.shared;
    if (extensions) extensions(loader);
    // Go through the urls and load them
    return new Promise((resolve, reject) => {
      loader.onError.once((e, l, r) => {
        reject(`Error: failed to load resource, ${r}`);
      });
      loader.load((loader, resources) => {
        const data = input.map(({ name }) => ({
          [name]: resources[name].texture,
        }));
        resolve(data);
      });
      input.forEach((i) => {
        loader.add(i);
      });
    });
  };
}

/**
 * Synchronously loads and caches assets with a three loader.
 *
 * Note: this hook's caller must be wrapped with `React.Suspense`
 * @see https://docs.pmnd.rs/react-three-fiber/api/hooks#useloader
 */
export function useLoader(input: ILoaderInput, extensions?: Extensions): ILoaderOutput {
  // Use suspense to load async assets
  const results = suspend(loadingFn(extensions), [undefined, ...input], { equal: is.equ });
  // Return the object/s
  return results as ILoaderOutput;
}

/**
 * Preloads an asset into cache as a side-effect.
 */
useLoader.preload = function (input: ILoaderInput, extensions?: Extensions) {
  return preload(loadingFn(extensions), [undefined, ...input]);
};

/**
 * Removes a loaded asset from cache.
 */
useLoader.clear = function (input: ILoaderInput) {
  return clear([undefined, ...input]);
};
