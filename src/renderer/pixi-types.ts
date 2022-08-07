/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */
import * as PIXI from 'pixi.js';
import * as React from 'react';

import { EventHandlers } from './core/renderer';

export type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
export type Overwrite<T, O> = Omit<T, NonFunctionKeys<O>> & O;

type Args<T> = T extends new (...args: any) => any ? ConstructorParameters<T> : T;

export type Matrix = PIXI.Matrix | Parameters<PIXI.Matrix['set']>;
export type Point = PIXI.Point | Parameters<PIXI.Point['set']>;

export type AttachCallback = string | ((child: any, parentInstance: any) => void);

export interface NodeProps<T, P> {
  /** Attaches this class onto the parent under the given name and nulls it on unmount */
  attach?: string;
  /** Appends this class to an array on the parent under the given name and removes it on unmount */
  attachArray?: string;
  /** Adds this class to an object on the parent under the given name and deletes it on unmount */
  attachObject?: [target: string, name: string];
  /**
   * Appends and removes this class to the parent by calling a callback function
   * or when the given name is a string by calling a method on the parent
   */
  attachFns?: [AttachCallback, AttachCallback];
  /** Constructor arguments */
  args?: Args<P>;
  children?: React.ReactNode;
  ref?: React.RefCallback<T> | React.RefObject<React.ReactNode> | null;
  key?: React.Key;
  onUpdate?: (self: T) => void;
}

export type Node<T, P> = Overwrite<Partial<T>, NodeProps<TemplateStringsArray, P>>;
export type PixiNode<T, P> = Overwrite<
  Node<T, P>,
  {
    matrix?: Matrix;
  }
> &
  EventHandlers;
export type PixiShapeNode<T, P> = PixiNode<T, P> & {
  draw?: (g: PIXI.Graphics) => void;
};

export type RectangleProps = Node<PIXI.Rectangle, typeof PIXI.Rectangle>;
export type GeometryProps = Node<PIXI.Geometry, typeof PIXI.Geometry>;
export type BufferProps = Node<PIXI.Buffer, typeof PIXI.Buffer>;
export type PixiProps = PixiNode<PIXI.DisplayObject, typeof PIXI.DisplayObject>;
export type GraphicsProps = PixiShapeNode<PIXI.Graphics, typeof PIXI.Graphics>;
export type TextProps = PixiNode<PIXI.Text, typeof PIXI.Text>;
export type ContainerProps = PixiNode<PIXI.Container, typeof PIXI.Container>;
export type ShaderProps = PixiNode<PIXI.Shader, typeof PIXI.Shader>;
export type ProgramProps = PixiNode<PIXI.Program, typeof PIXI.Program>;
export type MeshProps = PixiNode<PIXI.Mesh, typeof PIXI.Mesh>;
export type AttributeProps = PixiNode<PIXI.Attribute, typeof PIXI.Attribute>;

export type PrimitiveProps = { object: any } & { [properties: string]: any };

declare global {
  namespace JSX {
    interface IntrinsicElements {
      pixiGraphics: GraphicsProps;
      pixiText: TextProps;
      pixiContainer: ContainerProps;
      pixiShader: ShaderProps;
      pixiMesh: MeshProps;
      pixiGeometry: GeometryProps;
      pixiProgram: ProgramProps;
      pixiBuffer: BufferProps;
      pixiAttribute: AttributeProps;
      pixiRectangle: RectangleProps;
    }
  }
}
