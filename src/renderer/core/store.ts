import * as PIXI from 'pixi.js';
import * as React from 'react';
import create, { GetState, SetState, UseBoundStore } from 'zustand';

import { Instance, InstanceProps, prepare } from './renderer';

export type Subscription = {
  ref: React.MutableRefObject<RenderCallback>;
  priority: number;
};

export type Size = { width: number; height: number };
export type RenderCallback = (state: RootState, delta: number) => void;

export type Renderer = { render: (stage: PIXI.Container) => any };

export const isRenderer = (def: Renderer) => !!def?.render;

export type InternalState = {
  active: boolean;
  priority: number;
  frames: number;
  lastProps: StoreProps;

  subscribers: Subscription[];

  subscribe: (callback: React.MutableRefObject<RenderCallback>, priority?: number) => () => void;
};
export type RootState = {
  gl: PIXI.Renderer;
  stage: PIXI.Container;
  ticker: PIXI.Ticker;
  frameloop: 'always' | 'demand' | 'never';
  size: Size;
  set: SetState<RootState>;
  get: GetState<RootState>;
  invalidate: () => void;
  advance: (timestamp: number, runGlobalEffects?: boolean) => void;
  setSize: (width: number, height: number) => void;
  setFrameloop: (frameloop?: 'always' | 'demand' | 'never') => void;
  internal: InternalState;
};

export type StoreProps = {
  gl: PIXI.Renderer;
  size: Size;
  frameloop?: 'always' | 'demand' | 'never';
  ticker?: PIXI.Ticker;
};

export type ApplyProps = (instance: Instance, newProps: InstanceProps) => void;

const context = React.createContext<UseBoundStore<RootState>>(null!);

const createStore = (
  applyProps: ApplyProps,
  invalidate: (state?: RootState) => void,
  advance: (timestamp: number, runGlobalEffects?: boolean, state?: RootState) => void,
  props: StoreProps,
): UseBoundStore<RootState> => {
  const { gl, size, frameloop = 'always', ticker = PIXI.Ticker.shared } = props;
  if (frameloop === 'never') {
    ticker.autoStart = false;
    ticker.stop();
  }

  const rootState = create<RootState>((set, get) => {
    return {
      gl,
      set,
      get,
      invalidate: () => invalidate(get()),
      advance: (timestamp: number, runGlobalEffects?: boolean) => advance(timestamp, runGlobalEffects, get()),
      stage: prepare(new PIXI.Container()),
      ticker,
      frameloop,
      size: { width: 0, height: 0 },
      setSize: (width: number, height: number) => {
        const size = { width, height };
        set((state) => ({ size }));
      },
      setFrameloop: (frameloop: 'always' | 'demand' | 'never' = 'always') => set(() => ({ frameloop })),
      internal: {
        active: false,
        priority: 0,
        frames: 0,
        lastProps: props,
        subscribers: [],
        subscribe: (ref: React.MutableRefObject<RenderCallback>, priority = 0) => {
          set(({ internal }) => ({
            internal: {
              ...internal,
              // If this subscription was given a priority, it takes rendering into its own hands
              // For that reason we switch off automatic rendering and increase the manual flag
              // As long as this flag is positive there can be no internal rendering at all
              // because there could be multiple render subscriptions
              priority: internal.priority + (priority > 0 ? 1 : 0),
              // Register subscriber and sort layers from lowest to highest, meaning,
              // highest priority renders last (on top of the other frames)
              subscribers: [...internal.subscribers, { ref, priority }].sort((a, b) => a.priority - b.priority),
            },
          }));
          return () => {
            set(({ internal }) => ({
              internal: {
                ...internal,
                // Decrease manual flag if this subscription had a priority
                priority: internal.priority - (priority > 0 ? 1 : 0),
                // Remove subscriber from list
                subscribers: internal.subscribers.filter((s) => s.ref !== ref),
              },
            }));
          };
        },
      },
    };
  });

  const state = rootState.getState();

  let oldSize = state.size;

  rootState.subscribe(() => {
    const { size } = rootState.getState();
    if (size !== oldSize) {
      gl.resize(size.width, size.height);
      oldSize = size;
    }
  });

  if (size) state.setSize(size.width, size.height);
  rootState.subscribe((state) => invalidate(state));
  return rootState;
};
export { context, createStore };
