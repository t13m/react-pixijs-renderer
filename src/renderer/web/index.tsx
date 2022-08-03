import { EventSystem } from '@pixi/events';
import * as PIXI from 'pixi.js';
import * as React from 'react';
import { RootTag } from 'react-reconciler';
import { UseBoundStore } from 'zustand';

import { is } from '../core/is';
import { addAfterEffect, addEffect, addTail, createLoop } from '../core/loop';
import { createRenderer, extend, Root } from '../core/renderer';
import { context, createStore, isRenderer, Renderer, RootState, Size, StoreProps } from '../core/store';
import { Canvas } from './Canvas';

const roots = new Map<Element, Root>();
const modes = ['legacy', 'blocking', 'concurrent'] as const;
const { invalidate, advance } = createLoop(roots);
const { reconciler, applyProps } = createRenderer(roots);

// Disable interaction plugin (for PixiJS 6)
// eslint-disable-next-line no-underscore-dangle
delete PIXI.Renderer.__plugins.interaction;

type Properties<T> = Pick<T, { [K in keyof T]: T[K] extends (_: any) => any ? never : K }[keyof T]>;

type GLProps = ((canvas: HTMLCanvasElement) => Renderer) | Partial<Properties<PIXI.IRenderOptions>> | undefined;

export type RenderProps<TCanvas extends Element> = Omit<StoreProps, 'gl' | 'events' | 'size'> & {
  gl?: GLProps;
  size?: Size;
  onCreated?: (state: RootState) => void;
};

const createRendererInstance = <TElement extends Element>(gl: GLProps, canvas: TElement): PIXI.Renderer => {
  const customRenderer = (typeof gl === 'function' ? gl(canvas as unknown as HTMLCanvasElement) : gl) as PIXI.Renderer;
  if (isRenderer(customRenderer)) return customRenderer;

  const renderer = new PIXI.Renderer({
    powerPreference: 'high-performance',
    view: canvas as unknown as HTMLCanvasElement,
    antialias: true,
    resolution: 2,
    autoDensity: true,
    ...gl,
  });
  // Install EventSystem, if needed (PixiJS 6 doesn't add it by default)
  if (!('events' in renderer)) {
    renderer.addSystem(EventSystem, 'events');
  }

  // Set gl props
  if (gl) applyProps(renderer as any, gl as any);

  return renderer;
};

function render<TCanvas extends Element>(
  element: React.ReactNode,
  canvas: TCanvas,
  { gl, size, onCreated, ...props }: RenderProps<TCanvas> = {},
): UseBoundStore<RootState> {
  // Allow size to take on container bounds initially
  if (!size) {
    size = {
      width: canvas.parentElement?.clientWidth ?? 0,
      height: canvas.parentElement?.clientHeight ?? 0,
    };
  }

  let root = roots.get(canvas);
  let fiber = root?.fiber;
  let store = root?.store;
  let state = store?.getState();

  if (fiber && state) {
    // When a root was found, see if any fundamental props must be changed or exchanged

    // Check size
    if (state.size.width !== size.width || state.size.height !== size.height) state.setSize(size.width, size.height);
    // Check frameloop
    if (state.frameloop !== props.frameloop) state.setFrameloop(props.frameloop);
  }

  if (!fiber) {
    // If no root has been found, make one

    // Create gl
    const glRenderer = createRendererInstance(gl, canvas);

    // Create store
    store = createStore(applyProps, invalidate, advance, { gl: glRenderer, size, ...props });
    const state = store.getState();
    // Create renderer
    fiber = reconciler.createContainer(store, 1 as RootTag, false, null);
    // Map it
    roots.set(canvas, { fiber, store });
  }

  if (store && fiber) {
    reconciler.updateContainer(
      <Provider store={store} element={element} onCreated={onCreated} target={canvas} />,
      fiber,
      null,
      () => undefined,
    );
    return store;
  } else {
    throw 'Error creating root!';
  }
}

function Provider<TElement extends Element>({
  store,
  element,
  onCreated,
  target,
}: {
  onCreated?: (state: RootState) => void;
  store: UseBoundStore<RootState>;
  element: React.ReactNode;
  target: TElement;
}) {
  React.useEffect(() => {
    const state = store.getState();
    // Flag the canvas active, rendering will now begin
    state.set((state) => ({ internal: { ...state.internal, active: true } }));
    // Notifiy that init is completed, the scene graph exists, but nothing has yet rendered
    if (onCreated) onCreated(state);
  }, []);
  return <context.Provider value={store}>{element}</context.Provider>;
}

function unmountComponentAtNode<TElement extends Element>(canvas: TElement, callback?: (canvas: TElement) => void) {
  const root = roots.get(canvas);
  const fiber = root?.fiber;
  if (fiber) {
    const state = root?.store.getState();
    if (state) state.internal.active = false;
    reconciler.updateContainer(null, fiber, null, () => {
      if (state) {
        setTimeout(() => {
          state.gl?.destroy();
          dispose(state);
          roots.delete(canvas);
          if (callback) callback(canvas);
        }, 500);
      }
    });
  }
}

function dispose<TObj extends { dispose?: () => void; type?: string; [key: string]: any }>(obj: TObj) {
  if (obj.dispose && obj.type !== 'Scene') obj.dispose();
  for (const p in obj) {
    (p as any).dispose?.();
    delete obj[p];
  }
}

const act = reconciler.act;
function createPortal(children: React.ReactNode, container: PIXI.Container): React.ReactNode {
  return reconciler.createPortal(children, container, null, null);
}

reconciler.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
  rendererPackageName: '@react-pixi/fiber',
  version: '17.0.2',
});

export * from '../core/hooks';
export {
  roots as _roots,
  act,
  addAfterEffect,
  addEffect,
  addTail,
  advance,
  applyProps,
  Canvas,
  context,
  createPortal,
  dispose,
  extend,
  invalidate,
  reconciler,
  render,
  unmountComponentAtNode,
};
