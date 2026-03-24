import * as PIXI from 'pixi.js';
console.log('Keys in PIXI:', Object.keys(PIXI).filter(k => k.toLowerCase().includes('particle') || k.toLowerCase().includes('rendergroup')));
