import { useState } from 'react';
import reactLogo from './assets/react.svg';
import './App.css';
import * as React from 'react';
import * as PIXI from 'pixi.js';
import { Canvas as PixiCanvas } from './renderer';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className='App'>
      <h1>Vite + React</h1>
      <div className='card'>
        <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <PixiCanvas frameloop='always'></PixiCanvas>
    </div>
  );
}

export default App;
