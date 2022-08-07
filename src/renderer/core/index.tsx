import * as PIXI from 'pixi.js';
import * as React from 'react';
// @ts-ignore
import { ConcurrentRoot } from 'react-reconciler/constants';
import create, { UseBoundStore } from 'zustand';

import { Renderer, createStore, StoreProps, isRenderer, context, RootState, Size } from './store';
import { createRenderer, extend, Root } from './renderer';
import { createLoop, addEffect, addAfterEffect, addTail } from './loop';
import { is, dispose, EquConfig, getRootState } from './utils';
import { useStore } from './hooks';

const roots = new Map<Element, Root>();
const { invalidate, advance } = createLoop(roots);
const { reconciler, applyProps } = createRenderer(roots);
const shallowLoose = { objects: 'shallow', strict: false } as EquConfig;

type Properties<T> = Pick<T, { [K in keyof T]: T[K] extends (_: any) => any ? never : K }[keyof T]>;

type GLProps =
  | Renderer
  | ((canvas: HTMLCanvasElement) => Renderer)
  | Partial<Properties<PIXI.IRenderOptions>>
  | undefined;

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
    ...gl,
  });
  if (gl) applyProps(renderer as any, gl as any);
  return renderer;
};

export type ReconcilerRoot<TCanvas extends Element> = {
  configure: (config?: RenderProps<TCanvas>) => ReconcilerRoot<TCanvas>;
  render: (element: React.ReactNode) => UseBoundStore<RootState>;
  unmount: () => void;
};

function createRoot<TCanvas extends Element>(canvas: TCanvas): ReconcilerRoot<TCanvas> {
  // Check against mistaken use of createRoot
  const prevRoot = roots.get(canvas);
  const prevFiber = prevRoot?.fiber;
  const prevStore = prevRoot?.store;

  if (prevRoot) console.warn('PIXI createRoot should only be called once!');

  // Create store
  const store = prevStore || createStore(invalidate, advance);
  // Create renderer
  // @ts-ignore
  const fiber = prevFiber || reconciler.createContainer(store, ConcurrentRoot, false, null);
  // Map it
  if (!prevRoot) roots.set(canvas, { fiber, store });

  // Locals
  let onCreated: ((state: RootState) => void) | undefined;
  let configured = false;

  return {
    configure(props: RenderProps<TCanvas> = {}) {
      // eslint-disable-next-line prefer-const
      let { gl: glConfig, size, onCreated: onCreatedCallback, frameloop = 'always' } = props;

      const state = store.getState();

      // Set up renderer (one time only!)
      let gl = state.gl;
      if (!state.gl) state.set({ gl: (gl = createRendererInstance(glConfig, canvas)) });

      // Set gl props
      if (glConfig && !is.fun(glConfig) && !isRenderer(glConfig) && !is.equ(glConfig, gl, shallowLoose))
        applyProps(gl as any, glConfig as any);

      // Check pixelratio
      // if (dpr && state.viewport.dpr !== calculateDpr(dpr)) state.setDpr(dpr);
      // Check size, allow it to take on container bounds initially
      size = size || { width: canvas.parentElement?.clientWidth ?? 0, height: canvas.parentElement?.clientHeight ?? 0 };
      if (!is.equ(size, state.size, shallowLoose)) state.setSize(size.width, size.height);
      // Check frameloop
      if (state.frameloop !== frameloop) state.setFrameloop(frameloop);

      // Set locals
      onCreated = onCreatedCallback;
      configured = true;

      return this;
    },
    render(children: React.ReactNode) {
      // The root has to be configured before it can be rendered
      if (!configured) this.configure();

      reconciler.updateContainer(
        // eslint-disable-next-line react/no-children-prop
        <Provider store={store} children={children} onCreated={onCreated} rootElement={canvas} />,
        fiber,
        null,
        () => undefined,
      );
      return store;
    },
    unmount() {
      unmountComponentAtNode(canvas);
    },
  };
}

function render<TCanvas extends Element>(
  children: React.ReactNode,
  canvas: TCanvas,
  config: RenderProps<TCanvas>,
): UseBoundStore<RootState> {
  console.warn('R3F.render is no longer supported in React 18. Use createRoot instead!');
  const root = createRoot(canvas);
  root.configure(config);
  return root.render(children);
}

function Provider<TElement extends Element>({
  store,
  children,
  onCreated,
  rootElement,
}: {
  onCreated?: (state: RootState) => void;
  store: UseBoundStore<RootState>;
  children: React.ReactNode;
  rootElement: TElement;
  parent?: React.MutableRefObject<TElement | undefined>;
}) {
  React.useLayoutEffect(() => {
    const state = store.getState();
    // Flag the canvas active, rendering will now begin
    state.set((state) => ({ internal: { ...state.internal, active: true } }));
    // Notifiy that init is completed, the scene graph exists, but nothing has yet rendered
    if (onCreated) onCreated(state);
    // Connect events to the targets parent, this is done to ensure events are registered on
    // a shared target, and not on the canvas itself
    // if (!store.getState().events.connected) state.events.connect?.(rootElement);
  }, []);
  return <context.Provider value={store}>{children}</context.Provider>;
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
          try {
            // state.events.disconnect?.();
            // state.gl?.renderLists?.dispose?.();
            // state.gl?.forceContextLoss?.();
            // if (state.gl?.xr) state.xr.disconnect();
            dispose(state);
            roots.delete(canvas);
            if (callback) callback(canvas);
          } catch (e) {
            /* ... */
          }
        }, 500);
      }
    });
  }
}

export type InjectState = Partial<
  Omit<
    RootState,
    | 'set'
    | 'get'
    | 'setSize'
    | 'setFrameloop'
    | 'setDpr'
    | 'events'
    | 'invalidate'
    | 'advance'
    | 'performance'
    | 'internal'
  >
>;

function createPortal(children: React.ReactNode, container: PIXI.Container, state?: InjectState): React.ReactNode {
  // eslint-disable-next-line react/no-children-prop
  return <Portal children={children} container={container} state={state} />;
}

function Portal({
  state = {},
  children,
  container,
}: {
  children: React.ReactNode;
  state?: InjectState;
  container: PIXI.Container;
}) {
  /** This has to be a component because it would not be able to call useThree/useStore otherwise since
   *  if this is our environment, then we are not in r3f's renderer but in react-dom, it would trigger
   *  the "R3F hooks can only be used within the Canvas component!" warning:
   *  <Canvas>
   *    {createPortal(...)} */

  const { ...rest } = state;
  const previousRoot = useStore();

  const inject = React.useCallback(
    (state: RootState, injectState?: RootState) => {
      const intersect: Partial<RootState> = { ...state };

      if (injectState) {
        // Only the fields of "state" that do not differ from injectState
        Object.keys(state).forEach((key) => {
          if (
            // Some props should be off-limits
            !['size', 'viewport', 'internal', 'performance'].includes(key) &&
            // Otherwise filter out the props that are different and let the inject layer take precedence
            state[key as keyof RootState] !== injectState[key as keyof RootState]
          )
            delete intersect[key as keyof RootState];
        });
      }

      return {
        ...intersect,
        previousRoot,
        ...rest,
      } as RootState;
    },
    [state],
  );

  const [useInjectStore] = React.useState(() => {
    const store = create<RootState>((set, get) => ({ ...inject(previousRoot.getState()), set, get }));
    previousRoot.subscribe((state) => useInjectStore.setState((injectState) => inject(state, injectState)));
    return store;
  });

  React.useEffect(() => {
    useInjectStore.setState((injectState) => inject(previousRoot.getState(), injectState));
  }, [inject]);

  return (
    <>
      {reconciler.createPortal(
        <context.Provider value={useInjectStore}>{children}</context.Provider>,
        useInjectStore,
        null,
      )}
    </>
  );
}

reconciler.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
  rendererPackageName: '@react-three/fiber',
  version: '18.0.0',
});

const act = (React as any).unstable_act;

export * from './hooks';
export {
  context,
  render,
  createRoot,
  unmountComponentAtNode,
  createPortal,
  reconciler,
  applyProps,
  dispose,
  invalidate,
  advance,
  extend,
  addEffect,
  addAfterEffect,
  addTail,
  getRootState,
  act,
  roots as _roots,
};
