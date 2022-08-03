/* eslint-disable @typescript-eslint/ban-ts-comment */
import { FederatedPointerEvent, FederatedWheelEvent } from '@pixi/events';
import * as PIXI from 'pixi.js';
import { DiscreteEventPriority, ContinuousEventPriority, DefaultEventPriority } from 'react-reconciler/constants';
import Reconciler from 'react-reconciler';
import { unstable_IdlePriority as idlePriority, unstable_now as now, unstable_runWithPriority as run } from 'scheduler';
import { UseBoundStore } from 'zustand';

import { is } from './is';
import { RootState } from './store';

export type Root = {
  fiber: Reconciler.FiberRoot;
  store: UseBoundStore<RootState>;
};

export type EventHandlers = {
  onClick?: (event: FederatedPointerEvent) => void;
  onRightClick?: (event: FederatedPointerEvent) => void;
  onWheel?: (event: FederatedWheelEvent) => void;
  onPointerUp?: (event: FederatedPointerEvent) => void;
  onPointerDown?: (event: FederatedPointerEvent) => void;
  onPointerOver?: (event: FederatedPointerEvent) => void;
  onPointerOut?: (event: FederatedPointerEvent) => void;
  onPointerEnter?: (event: FederatedPointerEvent) => void;
  onPointerLeave?: (event: FederatedPointerEvent) => void;
  onPointerMove?: (event: FederatedPointerEvent) => void;
};

export type LocalState = {
  root: UseBoundStore<RootState>;
  objects: Instance[];
  parent: Instance | null;
  primitive?: boolean;
  handlers: Partial<EventHandlers>;
  memoizedProps: {
    [key: string]: any;
  };
};

export type ClassConstructor = {
  new (): void;
};

export type AttachFnType = (self: Instance, parent: Instance) => void;
export type AttachFnsType = [attach: string | AttachFnType, detach: string | AttachFnType];

export type BaseInstance = Omit<PIXI.DisplayObject, 'children' | 'attach' | 'addChild' | 'removeChild'> & {
  __state: LocalState;
  children: Instance[];
  attach?: string;
  attachFns?: AttachFnsType;
  addChild: (...object: Instance[]) => Instance;
  removeChild: (...object: Instance[]) => Instance;
};
export type Instance = BaseInstance & { [key: string]: any };
export type InstanceProps = {
  [key: string]: unknown;
} & {
  args?: any[];
  object?: object;
  visible?: boolean;
  destroy?: null;
  attach?: string;
};

export type DiffSet = {
  accumulative: boolean;
  memoized: { [key: string]: any };
  changes: [key: string, value: unknown, isEvent: boolean, keys: string[]][];
};
export const isDiffSet = (def: any): def is DiffSet => def && !!(def as DiffSet).memoized && !!(def as DiffSet).changes;
interface Catalogue {
  [name: string]: {
    new (...args: any): Instance;
  };
}

// Type guard to tell a store from a portal
const isStore = (def: any): def is UseBoundStore<RootState> => def && !!(def as UseBoundStore<RootState>).getState;
const getContainer = (container: UseBoundStore<RootState> | Instance, child: Instance) => ({
  // If the container is not a root-store then it must be a THREE.Object3D into which part of the
  // scene is portalled into. Now there can be two variants of this, either that object is part of
  // the regular jsx tree, in which case it already has __state with a valid root attached, or it lies
  // outside react, in which case we must take the root of the child that is about to be attached to it.
  root: isStore(container) ? container : container.__state?.root ?? child.__state.root,
  // The container is the eventual target into which objects are mounted, it has to be a THREE.Object3D
  container: isStore(container) ? (container.getState().stage as unknown as Instance) : container,
});

const DEFAULT = '__default';
const EMPTY = {};

const KeyToEventName: Record<string, string> = {
  onClick: 'click',
  onRightClick: 'rightclick',
  onWheel: 'wheel',
  onPointerUp: 'pointerup',
  onPointerDown: 'pointerdown',
  onPointerOver: 'pointerover',
  onPointerOut: 'pointerout',
  onPointerEnter: 'pointerenter',
  onPointerLeave: 'pointerleave',
  onPointerMove: 'pointermove',
};

let catalogue: Catalogue = {};
const extend = (objects: object): void => void (catalogue = { ...catalogue, ...objects });

// Shallow check arrays, but check objects atomically
function checkShallow(a: any, b: any) {
  if (is.arr(a) && is.equ(a, b)) return true;
  if (a === b) return true;
  return false;
}
// Each object in the scene carries a small LocalState descriptor
function prepare<T = PIXI.DisplayObject>(object: T, state?: Partial<LocalState>) {
  const instance = object as unknown as Instance;
  if (state?.primitive || !instance.__state) {
    instance.__state = {
      root: null as unknown as UseBoundStore<RootState>,
      memoizedProps: {},
      objects: [],
      parent: null,
      handlers: {},
      ...state,
    };
  }
  return object;
}

// *******************************
function createRenderer<TCanvas>(roots: Map<TCanvas, Root>) {
  // This function prepares a set of changes to be applied to the instance
  function diffProps(
    instance: Instance,
    { children: cN, key: kN, ref: rN, ...props }: InstanceProps,
    { children: cP, key: kP, ref: rP, ...previous }: InstanceProps = {},
    accumulative = false,
  ): DiffSet {
    const localState = (instance?.__state ?? {}) as LocalState;
    const entries = Object.entries(props);
    const changes: [key: string, value: unknown, isEvent: boolean, keys: string[]][] = [];

    // Catch removed props, prepend them so they can be reset or removed
    if (accumulative) {
      const previousKeys = Object.keys(previous);
      for (let i = 0; i < previousKeys.length; i++)
        // eslint-disable-next-line no-prototype-builtins
        if (!props.hasOwnProperty(previousKeys[i])) entries.unshift([previousKeys[i], DEFAULT + 'remove']);
    }

    entries.forEach(([key, value]) => {
      // Bail out on primitive object
      if (instance.__state?.primitive && key === 'object') return;
      // When props match bail out
      if (checkShallow(value, previous[key])) return;

      // Collect handlers and bail out
      if (/^on(Pointer|Click|RightClick|Wheel)/.test(key)) return changes.push([key, value, true, []]);

      // Split dashed props
      let entries: string[] = [];
      if (key.includes('-')) entries = key.split('-');

      changes.push([key, value, false, entries]);
    });

    const memoized: { [key: string]: any } = { ...props };
    if (localState.memoizedProps && localState.memoizedProps.args) memoized.args = localState.memoizedProps.args;
    if (localState.memoizedProps && localState.memoizedProps.attach) memoized.attach = localState.memoizedProps.attach;

    return { accumulative, memoized, changes };
  }

  function applyProps(instance: Instance, data: InstanceProps | DiffSet) {
    // Filter equals, events and reserved props
    const localState = (instance?.__state ?? {}) as LocalState;
    const root = localState.root;
    const rootState = root?.getState?.() ?? {};
    const { memoized, changes } = isDiffSet(data) ? data : diffProps(instance, data);
    // const prevHandlers = localState.eventCount;

    // Prepare memoized props
    if (instance.__state) instance.__state.memoizedProps = memoized;

    changes.forEach(([key, value, isEvent, keys]) => {
      let currentInstance = instance;
      let targetProp = currentInstance[key];

      // Revolve dashed props
      if (keys.length) {
        targetProp = keys.reduce((acc, key) => acc[key], instance);
        // If the target is atomic, it forces us to switch the root
        if (!(targetProp && targetProp.set)) {
          const [name, ...reverseEntries] = keys.reverse();
          currentInstance = reverseEntries.reverse().reduce((acc, key) => acc[key], instance);
          key = name;
        }
      }

      // https://github.com/mrdoob/three.js/issues/21209
      // HMR/fast-refresh relies on the ability to cancel out props, but threejs
      // has no means to do this. Hence we curate a small collection of value-classes
      // with their respective constructor/set arguments
      // For removed props, try to set default values, if possible
      if (value === DEFAULT + 'remove') {
        if (targetProp && targetProp.constructor) {
          // use the prop constructor to find the default it should be
          value = new targetProp.constructor(memoized.args);
        } else if (currentInstance.constructor) {
          // create a blank slate of the instance and copy the particular parameter.
          // @ts-ignore
          const defaultClassCall = new currentInstance.constructor(currentInstance.__state.memoizedProps.args);
          value = defaultClassCall[targetProp];
          // destory the instance
          if (defaultClassCall.destroy) defaultClassCall.destroy();
          // instance does not have constructor, just set it to 0
          // NOTE: 将删除的属性值直接设置为0，可能产生问题，某些默认值并不是0
        } else value = 0;
      }

      if (isEvent) {
        const eventName = KeyToEventName[key];
        const existingListener = localState.handlers[key as keyof EventHandlers];
        if (existingListener != null && existingListener !== value) {
          instance.removeEventListener(eventName, existingListener as (evt: Event) => void);
          delete localState.handlers[key as keyof EventHandlers];
        }
        if (value) {
          instance.addEventListener(eventName, value as any);
          localState.handlers[key as keyof EventHandlers] = value as any;
          // console.log('adding event listener for "' + eventName + '"');
        }
      }

      // Special treatment for objects with support for set/copy, and layers
      else if (targetProp && targetProp.set && targetProp.copy) {
        // If value is an array
        if (Array.isArray(value)) {
          if (targetProp.fromArray) targetProp.fromArray(value);
          else targetProp.set(...value);
        }
        // Test again target.copy(class) next ...
        else if (
          targetProp.copy &&
          value &&
          (value as ClassConstructor).constructor &&
          targetProp.constructor.name === (value as ClassConstructor).constructor.name
        )
          targetProp.copy(value);
        // If nothing else fits, just set the single value, ignore undefined
        // https://github.com/pmndrs/react-three-fiber/issues/274
        else if (value !== undefined) {
          // Allow setting array scalars
          if (targetProp.setScalar) targetProp.setScalar(value);
          // Otherwise just set ...
          else targetProp.set(value);
        }
        // Else, just overwrite the value
      } else {
        currentInstance[key] = value;
      }

      // 在此处调用用户提供的draw函数进行绘制
      if (key === 'draw' && typeof value === 'function') {
        value(instance);
      } else if (key === 'draw' && typeof value !== 'function') {
        instance.clear();
      }

      invalidateInstance(instance);
    });

    // Call the update lifecycle when it is being updated
    if (changes.length && instance.__state?.parent) updateInstance(instance);
    return instance;
  }

  function invalidateInstance(instance: Instance) {
    const state = instance.__state?.root?.getState?.();
    if (state && state.internal.frames === 0) state.invalidate();
  }

  function updateInstance(instance: Instance) {
    instance.onUpdate?.(instance);
  }

  function createInstance(
    type: string,
    { args = [], ...props }: InstanceProps,
    root: UseBoundStore<RootState> | Instance,
    hostContext?: any,
    internalInstanceHandle?: Reconciler.Fiber,
  ) {
    const name = `${type[0].toUpperCase()}${type.slice(1)}`;
    let instance: Instance;

    // https://github.com/facebook/react/issues/17147
    // Portals do not give us a root, they are themselves treated as a root by the reconciler
    // In order to figure out the actual root we have to climb through fiber internals :(
    if (!isStore(root) && internalInstanceHandle) {
      const fn = (node: Reconciler.Fiber): UseBoundStore<RootState> => {
        if (!node.return) return node.stateNode && node.stateNode.containerInfo;
        else return fn(node.return);
      };
      root = fn(internalInstanceHandle);
    }
    // Assert that by now we have a valid root
    if (!root || !isStore(root)) throw `No valid root for ${name}!`;

    if (type === 'primitive') {
      if (props.object === undefined) throw `Primitives without 'object' are invalid!`;
      const object = props.object as Instance;
      instance = prepare<Instance>(object, { root, primitive: true });
    } else {
      const target = catalogue[name] || (PIXI as any)[name.substring(1).replace('Shape', '')];
      if (!target)
        throw `${name} is not part of the PIXI namespace! Did you forget to extend? See: https://github.com/pmndrs/react-three-fiber/blob/master/markdown/api.md#using-3rd-party-objects-declaratively`;

      // Throw if an object or literal was passed for args
      if (!Array.isArray(args)) throw 'The args prop must be an array!';

      // Instanciate new object, link it to the root
      // Append memoized props with args so it's not forgotten
      instance = prepare(new target(...args), {
        root,
        memoizedProps: { args: args.length === 0 ? null : args },
      });
      const { gl } = root.getState();
      instance.getBoundingClientRect = () => {
        const parentRect = gl.view.getBoundingClientRect();
        const bound = instance.getBounds(true);

        const left = Math.max(bound.x + parentRect.x, parentRect.x);
        const top = Math.max(bound.y + parentRect.y, parentRect.y);
        const right = Math.min(bound.x + bound.width + parentRect.x, parentRect.right);
        const bottom = Math.min(bound.y + bound.height + parentRect.y, parentRect.bottom);
        // const right = Math.max(
        //   parentRect.right,
        //   parentRect.right - (bound.x + bound.width - parentRect.x - parentRect.width),
        // );
        // const bottom = Math.max(
        //   parentRect.bottom,
        //   parentRect.bottom - (bound.y + bound.height - parentRect.y - parentRect.height),
        // );
        return {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
          left,
          top,
          right,
          bottom,
        };
      };
    }

    // // 对于几何形状进行的绘制逻辑进行特殊处理
    // if (!('attachFns' in props)) {
    //   if (name.endsWith('Shape')) {
    //     props = {attachFns: [
    //       (self: any, parent: any) => {
    //         console.log('rerendering...')
    //         if ('lineStyle' in props) {
    //           parent.lineStyle(props['lineStyle']);
    //         }
    //         if ('fillStyle' in props) {
    //           const {color, alpha} = props['fillStyle'] as Partial<{color: number, alpha: number}>;
    //           parent.beginFill(color, alpha);
    //         }
    //         parent.drawShape(self);
    //         if ('fillStyle' in props) {
    //           parent.endFill();
    //         }
    //       },
    //       (self: any, parent: any) => { parent.clear(); }
    //     ], ...props};
    //   }
    // }

    // // Auto-attach geometries and materials
    // if (!("attachFns" in props)) {
    //   if (name.endsWith("Geometry")) {
    //     props = { attach: "geometry", ...props };
    //   } else if (name.endsWith("Material")) {
    //     props = { attach: "material", ...props };
    //   }
    // }

    // It should NOT call onUpdate on object instanciation, because it hasn't been added to the
    // view yet. If the callback relies on references for instance, they won't be ready yet, this is
    // why it passes "true" here
    applyProps(instance, props);
    return instance;
  }

  function appendChild(parentInstance: Instance, child: Instance) {
    let addedAsChild = false;
    if (child) {
      // The attach attribute implies that the object attaches itself on the parent
      if (child.attachArray) {
        if (!is.arr(parentInstance[child.attachArray])) parentInstance[child.attachArray] = [];
        parentInstance[child.attachArray].push(child);
      } else if (child.attachObject) {
        if (!is.obj(parentInstance[child.attachObject[0]])) parentInstance[child.attachObject[0]] = {};
        parentInstance[child.attachObject[0]][child.attachObject[1]] = child;
      } else if (child.attach && !is.fun(child.attach)) {
        parentInstance[child.attach] = child;
      } else if (is.arr(child.attachFns)) {
        const [attachFn] = child.attachFns as AttachFnsType;
        if (is.str(attachFn) && is.fun(parentInstance[attachFn])) {
          parentInstance[attachFn](child);
        } else if (is.fun(attachFn)) {
          attachFn(child, parentInstance);
        }
      } else if (child instanceof PIXI.DisplayObject && parentInstance instanceof PIXI.DisplayObject) {
        // add in the usual parent-child way
        parentInstance.addChild(child);
        addedAsChild = true;
      }

      if (!addedAsChild) {
        // This is for anything that used attach, and for non-Object3Ds that don't get attached to props;
        // that is, anything that's a child in React but not a child in the scenegraph.
        parentInstance.__state.objects.push(child);
      }
      if (!child.__state) {
        prepare(child, {});
      }
      child.__state.parent = parentInstance;
      updateInstance(child);
      invalidateInstance(child);
    }
  }
  function insertBefore(parentInstance: Instance, child: Instance, beforeChild: Instance) {
    let added = false;
    if (child) {
      if (child.attachArray) {
        const array = parentInstance[child.attachArray];
        if (!is.arr(array)) parentInstance[child.attachArray] = [];
        array.splice(array.indexOf(beforeChild), 0, child);
      } else if (child.attachObject || (child.attach && !is.fun(child.attach))) {
        // attach and attachObject don't have an order anyway, so just append
        return appendChild(parentInstance, child);
      } else if (child instanceof PIXI.DisplayObject && parentInstance instanceof PIXI.DisplayObject) {
        child.parent = parentInstance as unknown as PIXI.Container;
        // child.dispatchEvent({ type: "added" });
        const childExists = parentInstance.children.indexOf(child) !== -1;
        if (childExists) {
          parentInstance.removeChild(child);
        }
        const index = parentInstance.getChildIndex(beforeChild);
        parentInstance.addChildAt(child, index);
        added = true;
      }

      if (!added) {
        parentInstance.__state.objects.push(child);
      }
      if (!child.__state) {
        prepare(child, {});
      }
      child.__state.parent = parentInstance;
      updateInstance(child);
      invalidateInstance(child);
    }
  }
  function removeRecursive(array: Instance[], parent: Instance, destroy = false) {
    if (array) [...array].forEach((child) => removeChild(parent, child, destroy));
  }
  function removeChild(parentInstance: Instance, child: Instance, destroy?: boolean) {
    if (child) {
      if (child.__state) {
        child.__state.parent = null;
      }

      if (parentInstance.__state?.objects) {
        parentInstance.__state.objects = parentInstance.__state.objects.filter((x) => x !== child);
      }

      // Remove attachment
      if (child.attachArray) {
        parentInstance[child.attachArray] = parentInstance[child.attachArray].filter((x: Instance) => x !== child);
      } else if (child.attachObject) {
        delete parentInstance[child.attachObject[0]][child.attachObject[1]];
      } else if (child.attach && !is.fun(child.attach) && parentInstance[child.attach] === child) {
        parentInstance[child.attach] = null;
      } else if (is.arr(child.attachFns)) {
        const [, detachFn] = child.attachFns as AttachFnsType;
        if (is.str(detachFn) && is.fun(parentInstance[detachFn])) {
          parentInstance[detachFn](child);
        } else if (is.fun(detachFn)) {
          detachFn(child, parentInstance);
        }
      } else if (child instanceof PIXI.DisplayObject && parentInstance instanceof PIXI.DisplayObject) {
        parentInstance.removeChild(child);
        // Remove interactivity
        // if (child.__state?.root) {
        //   removeInteractivity(
        //     child.__state.root,
        //     child as unknown as PIXI.DisplayObject
        //   );
        // }
      }

      // Allow objects to bail out of recursive dispose alltogether by passing dispose={null}
      // Never dispose of primitives because their state may be kept outside of React!
      // In order for an object to be able to dispose it has to have
      //   - a dispose method,
      //   - it cannot be a <primitive object={...} />
      //   - it cannot be a THREE.Scene, because three has broken it's own api
      //
      // Since disposal is recursive, we can check the optional dispose arg, which will be undefined
      // when the reconciler calls it, but then carry our own check recursively
      const isPrimitive = child.__state?.primitive;
      const shouldDestroy = destroy === undefined ? child.destroy !== null && !isPrimitive : destroy;

      // Remove nested child objects. Primitives should not have objects and children that are
      // attached to them declaratively ...
      if (!isPrimitive) {
        removeRecursive(child.__state?.objects, child, shouldDestroy);
        removeRecursive(child.children, child, shouldDestroy);
      }

      // Remove references
      if (child.__state) {
        delete ((child as Partial<Instance>).__state as Partial<LocalState>).root;
        delete ((child as Partial<Instance>).__state as Partial<LocalState>).objects;
        delete ((child as Partial<Instance>).__state as Partial<LocalState>).memoizedProps;
        delete ((child as Partial<Instance>).__state as Partial<LocalState>).handlers;
        if (!isPrimitive) delete (child as Partial<Instance>).__state;
      }

      // destroy item whenever the reconciler feels like it
      if (shouldDestroy && child.destroy && child.type !== 'Scene') {
        run(idlePriority, () => {
          try {
            child.destroy();
          } catch (e) {
            /* ... */
          }
        });
      }

      invalidateInstance(parentInstance);
    }
  }

  function switchInstance(instance: Instance, type: string, newProps: InstanceProps, fiber: Reconciler.Fiber) {
    const parent = instance.__state?.parent;
    if (!parent) return;

    const newInstance = createInstance(type, newProps, instance.__state.root);

    // https://github.com/pmndrs/react-three-fiber/issues/1348
    // When args change the instance has to be re-constructed, which then
    // forces r3f to re-parent the children and non-scene objects
    // This can not include primitives, which should not have declarative children
    if (type !== 'primitive' && instance.children) {
      instance.children.forEach((child) => appendChild(newInstance, child));
      instance.children = [];
    }

    instance.__state.objects.forEach((child) => appendChild(newInstance, child));
    instance.__state.objects = [];

    for (const [key, value] of Object.entries(instance.__state.handlers)) {
      const eventName = KeyToEventName[key];
      instance.removeEventListener(eventName, value as (evt: Event) => void);
      newInstance.addEventListener(eventName, value as (evt: Event) => void);
    }

    removeChild(parent, instance);
    appendChild(parent, newInstance);

    // This evil hack switches the react-internal fiber node
    // https://github.com/facebook/react/issues/14983
    // https://github.com/facebook/react/pull/15021
    [fiber, fiber.alternate].forEach((fiber) => {
      if (fiber !== null) {
        fiber.stateNode = newInstance;
        if (fiber.ref) {
          if (typeof fiber.ref === 'function') (fiber as unknown as any).ref(newInstance);
          else (fiber.ref as Reconciler.RefObject).current = newInstance;
        }
      }
    });
  }

  const reconciler = Reconciler({
    now,
    createInstance,
    removeChild,
    appendChild,
    appendInitialChild: appendChild,
    insertBefore,
    warnsIfNotActing: true,
    supportsMutation: true,
    isPrimaryRenderer: false,
    // @ts-ignore
    scheduleTimeout: is.fun(setTimeout) ? setTimeout : undefined,
    // @ts-ignore
    cancelTimeout: is.fun(clearTimeout) ? clearTimeout : undefined,
    // @ts-ignore
    setTimeout: is.fun(setTimeout) ? setTimeout : undefined,
    // @ts-ignore
    clearTimeout: is.fun(clearTimeout) ? clearTimeout : undefined,
    noTimeout: -1,
    appendChildToContainer: (parentInstance: UseBoundStore<RootState> | Instance, child: Instance) => {
      const { container, root } = getContainer(parentInstance, child);
      // Link current root to the default scene
      container.__state.root = root;
      appendChild(container, child);
    },
    removeChildFromContainer: (parentInstance: UseBoundStore<RootState> | Instance, child: Instance) =>
      removeChild(getContainer(parentInstance, child).container, child),
    insertInContainerBefore: (
      parentInstance: UseBoundStore<RootState> | Instance,
      child: Instance,
      beforeChild: Instance,
    ) => insertBefore(getContainer(parentInstance, child).container, child, beforeChild),

    prepareUpdate(instance: Instance, type: string, oldProps: any, newProps: any) {
      if (instance.__state.primitive && newProps.object && newProps.object !== instance) return [true];
      else {
        // This is a data object, let's extract critical information about it
        const { args: argsNew = [], children: cN, ...restNew } = newProps;
        const { args: argsOld = [], children: cO, ...restOld } = oldProps;

        // Throw if an object or literal was passed for args
        if (!Array.isArray(argsNew)) throw 'The args prop must be an array!';
        // If it has new props or arguments, then it needs to be re-instanciated
        if (argsNew.some((value: any, index: number) => value !== argsOld[index])) return [true];
        // Create a diff-set, flag if there are any changes
        const diff = diffProps(instance, restNew, restOld, true);
        if (diff.changes.length) return [false, diff];
        // If instance was never attached, attach it
        if (instance.attach && typeof instance.attach !== 'function') {
          const localState = instance.__state;
          const parent = localState.parent;
          if (parent && parent[instance.attach] !== instance) {
            appendChild(parent, instance);
          }
        }
        // Otherwise do not touch the instance
        return null;
      }
    },
    commitUpdate(
      instance: Instance,
      [reconstruct, diff]: [boolean, DiffSet],
      type: string,
      oldProps: InstanceProps,
      newProps: InstanceProps,
      fiber: Reconciler.Fiber,
    ) {
      // Reconstruct when args or <primitive object={...} have changes
      if (reconstruct) switchInstance(instance, type, newProps, fiber);
      // Otherwise just overwrite props
      else applyProps(instance, diff);
    },
    hideInstance(instance: Instance) {
      if (instance instanceof PIXI.DisplayObject) {
        instance.visible = false;
        invalidateInstance(instance);
      }
    },
    unhideInstance(instance: Instance, props: InstanceProps) {
      if ((instance instanceof PIXI.DisplayObject && props.visible == null) || props.visible) {
        instance.visible = true;
        invalidateInstance(instance);
      }
    },
    hideTextInstance() {
      throw new Error('Text is not allowed in the R3F tree.');
    },
    getPublicInstance(instance: Instance) {
      // TODO: might fix switchInstance (?)
      return instance;
    },
    getRootHostContext(rootContainer: UseBoundStore<RootState> | Instance) {
      return EMPTY;
    },
    getChildHostContext(parentHostContext: any) {
      return parentHostContext;
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    createTextInstance() {},
    finalizeInitialChildren(instance: Instance) {
      // // https://github.com/facebook/react/issues/20271
      // // Returning true will trigger commitMount
      // const localState = (instance?.__state ?? {}) as LocalState
      // return !!localState.handlers
      return false;
    },
    commitMount(instance: Instance /*, type, props*/) {
      // https://github.com/facebook/react/issues/20271
      // This will make sure events are only added once to the central container
      // const localState = (instance?.__state ?? {}) as LocalState
      // if (instance.raycast && localState.handlers && localState.eventCount)
      //   instance.__state.root.getState().internal.interaction.push(instance as unknown as THREE.Object3D)
    },
    shouldDeprioritizeSubtree() {
      return false;
    },
    prepareForCommit() {
      return null;
    },
    preparePortalMount(containerInfo: any) {
      prepare(containerInfo);
    },
    resetAfterCommit() {
      // noop
    },
    shouldSetTextContent() {
      return false;
    },
    clearContainer() {
      return false;
    },
    getCurrentEventPriority() {
      return DefaultEventPriority;
    },
  });

  return { reconciler, applyProps };
}

export { createRenderer, extend, prepare };
