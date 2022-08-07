import * as React from 'react';
import * as PIXI from 'pixi.js';
import { pick, omit } from '../core/utils';
import { mergeRefs } from 'react-merge-refs';
import useMeasure, { Options as ResizeOptions } from 'react-use-measure';
import { ReconcilerRoot, extend, createRoot, unmountComponentAtNode, RenderProps } from '../core';

export interface Props
  extends Omit<RenderProps<HTMLCanvasElement>, 'size' | 'events'>,
    React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  fallback?: React.ReactNode;
  resize?: ResizeOptions;
  onResize?: (width: number, height: number) => void;
}

type SetBlock = false | Promise<null> | null;
type UnblockProps = {
  set: React.Dispatch<React.SetStateAction<SetBlock>>;
  children: React.ReactNode;
};

const CANVAS_PROPS: Array<keyof Props> = ['gl', 'frameloop', 'onCreated'];

function Block({ set }: Omit<UnblockProps, 'children'>) {
  React.useLayoutEffect(() => {
    set(new Promise(() => null));
    return () => set(false);
  }, [set]);
  return null;
}

class ErrorBoundary extends React.Component<
  { set: React.Dispatch<any>; children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError = () => ({ error: true });
  componentDidCatch(error: any) {
    this.props.set(error);
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}

export const Canvas = React.forwardRef<HTMLCanvasElement, Props>(function Canvas(
  { children, fallback, tabIndex, resize, id, style, className, onResize, ...props },
  forwardedRef,
) {
  const [containerRef, { width, height }] = useMeasure({
    scroll: true,
    debounce: { scroll: 50, resize: 0 },
    ...resize,
  });
  React.useMemo(() => extend(PIXI), []);
  const canvasRef = React.useRef<HTMLCanvasElement>(null!);
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null);
  const canvasProps = pick<Props>({ ...props }, CANVAS_PROPS);
  const divProps = omit<Props>({ ...props }, CANVAS_PROPS);
  const [block, setBlock] = React.useState<SetBlock>(false);
  const [error, setError] = React.useState<any>(false);
  // Suspend this component if block is a promise (2nd run)
  if (block) throw block;
  // Throw exception outwards if anything within canvas throws
  if (error) throw error;

  const root = React.useRef<ReconcilerRoot<HTMLElement>>(null!);

  if (width > 0 && height > 0 && canvas) {
    if (!root.current) root.current = createRoot<HTMLElement>(canvas);
    root.current.configure({
      ...canvasProps,
      onCreated: (state) => {
        canvasProps.onCreated?.(state);
      },
      size: { width, height },
    });
    root.current.render(
      <ErrorBoundary set={setError}>
        <React.Suspense fallback={<Block set={setBlock} />}>{children}</React.Suspense>
      </ErrorBoundary>,
    );
  }

  React.useLayoutEffect(() => {
    setCanvas(canvasRef.current);
  }, []);

  React.useEffect(() => {
    return () => unmountComponentAtNode(canvas!);
  }, [canvas]);

  return (
    <div
      ref={containerRef}
      id={id}
      className={className}
      tabIndex={tabIndex}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
      {...divProps}>
      <canvas ref={mergeRefs([canvasRef, forwardedRef])} style={{ display: 'block' }}>
        {fallback}
      </canvas>
    </div>
  );
});
