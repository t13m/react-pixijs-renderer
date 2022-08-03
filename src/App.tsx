import { useState } from 'react';
import reactLogo from './assets/react.svg';
import './App.css';
import * as React from 'react';
import * as PIXI from 'pixi.js';
import { Canvas as PCanvas } from './renderer';

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
      <PCanvas frameloop='always'></PCanvas>
    </div>
  );
}

export default App;
