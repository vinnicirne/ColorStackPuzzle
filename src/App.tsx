/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Play, Info, BarChart2, Star, Volume2, VolumeX, Share2 } from 'lucide-react';
import { Color, BoardCell, Piece } from './types';
import { AdMob, InterstitialAdPluginEvents, BannerAdPosition, RewardAdPluginEvents, BannerAdSize } from '@capacitor-community/admob';
import { Device } from '@capacitor/device';
import { Share } from '@capacitor/share';
import { supabase } from './lib/supabase';

const BOARD_SIZE = 8;
const BASE_COLORS: Color[] = ['red', 'blue', 'green', 'yellow', 'purple'];

// ID dos Anúncios AdMob (Produção)
const AD_UNITS = {
  BANNER: 'ca-app-pub-2871403878275209/9050607747', // Banner no rodapé (usando ID anterior ou novo se preferir, assumindo este como banner)
  INTERSTITIAL: 'ca-app-pub-2871403878275209/6370383756',
  REWARDED: 'ca-app-pub-2871403878275209/8809545537',
  APP_OPEN: 'ca-app-pub-2871403878275209/2407088016',
  NATIVE: 'ca-app-pub-2871403878275209/2371428993'
};

// Shapes desbloqueadas por nível
const SHAPES_BY_LEVEL = [
  // Nível 1-2: formas básicas (1-3 blocos)
  [
    [[0, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1], [1, 0]],
    [[0, 0], [0, 1], [1, 1]],
  ],
  // Nível 3-5: formas médias (4 blocos)
  [
    [[0, 0], [0, 1], [1, 0], [1, 1]], // Quadrado
    [[0, 0], [0, 1], [0, 2], [0, 3]], // Linha
    [[0, 0], [1, 0], [2, 0], [3, 0]], // Coluna
    [[0, 0], [0, 1], [0, 2], [1, 1]], // T
    [[0, 0], [1, 0], [2, 0], [2, 1]], // L
    [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  ],
  // Nível 6+: formas desafiadoras (5+ blocos e formatos estranhos)
  [
    [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], // L Grande
    [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], // J Grande
    [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], // Cruz +
    [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], // Escada
    [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2]], // U (Copo)
    [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]], // S Longo
  ],
];

const COLOR_MAP: Record<Color, string> = {
  red: 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(244,63,94,0.5)]',
  blue: 'bg-gradient-to-br from-sky-300 to-sky-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(14,165,233,0.5)]',
  green: 'bg-gradient-to-br from-lime-300 to-emerald-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(16,185,129,0.5)]',
  yellow: 'bg-gradient-to-br from-yellow-100 to-yellow-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(253,224,71,0.5)]',
  purple: 'bg-gradient-to-br from-fuchsia-400 to-purple-600 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(139,92,246,0.5)]',
  orange: 'bg-gradient-to-br from-orange-500 to-red-600 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(234,88,12,0.5)]',
  pink: 'bg-gradient-to-br from-pink-400 to-rose-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(236,72,153,0.5)]',
  cyan: 'bg-gradient-to-br from-cyan-300 to-sky-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),_0_0_15px_rgba(6,182,212,0.5)]',
  rainbow: 'joker-rainbow block-shadow',
};

const LEVEL_COLORS: string[] = [
  'text-sky-400',
  'text-emerald-400',
  'text-amber-400',
  'text-violet-400',
  'text-rose-400',
  'text-orange-400',
];

type GameState = 'menu' | 'playing' | 'ad' | 'gameover' | 'levelup';

type Particle = {
  id: string;
  x: number;
  y: number;
  color: string;
  dx: number;
  dy: number;
};

// ─── Áudio Sintético via Web Audio API ───────────────────────
function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = type;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function soundPlace(ctx: AudioContext) {
  playTone(ctx, 300, 0.08, 'sine', 0.1);
}
function soundClear(ctx: AudioContext) {
  playTone(ctx, 440, 0.15, 'triangle', 0.18);
  setTimeout(() => playTone(ctx, 660, 0.15, 'triangle', 0.15), 80);
  setTimeout(() => playTone(ctx, 880, 0.2, 'triangle', 0.12), 160);
}
function soundLevelUp(ctx: AudioContext) {
  [261, 329, 392, 523].forEach((f, i) => {
    setTimeout(() => playTone(ctx, f, 0.25, 'sine', 0.18), i * 100);
  });
}
function soundGameOver(ctx: AudioContext) {
  [440, 370, 311, 220].forEach((f, i) => {
    setTimeout(() => playTone(ctx, f, 0.3, 'sawtooth', 0.12), i * 120);
  });
}
function soundGreat(ctx: AudioContext) {
  // EXTOURO (Noise)
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  for (let i = 0; i < b.length; i++) b.getChannelData(0)[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.1, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  s.connect(g); g.connect(ctx.destination); s.start();

  playTone(ctx, 110, 0.12, 'sawtooth', 0.2); 
  [523, 659, 783].forEach((f, i) => {
    setTimeout(() => playTone(ctx, f, 0.15, 'square', 0.15), i * 50);
  });
}
function soundAmazing(ctx: AudioContext) {
  // Camada 1: O "Estalo" (Noise High-Pass)
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  for (let i = 0; i < b.length; i++) b.getChannelData(0)[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  s.connect(g); g.connect(ctx.destination); s.start();

  // Camada 2: O "Rurro" (Bass Sweep)
  const os = ctx.createOscillator(); const gn = ctx.createGain();
  os.type = 'sawtooth'; os.frequency.setValueAtTime(160, ctx.currentTime);
  os.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
  gn.gain.setValueAtTime(0.2, ctx.currentTime);
  gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  os.connect(gn); gn.connect(ctx.destination); os.start(); os.stop(ctx.currentTime + 0.4);

  // Camada 3: Melodia Atômica
  [523, 659, 783, 1046, 1318].forEach((f, i) => {
    setTimeout(() => playTone(ctx, f, 0.2, 'square', 0.18), i * 40);
  });
}

// ─────────────────────────────────────────────────────────────

export default function App() {
  const [board, setBoard] = useState<BoardCell[][]>(
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))
  );
  const [currentPieces, setCurrentPieces] = useState<Piece[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [selectedPiece, setSelectedPiece] = useState<{ piece: Piece; index: number } | null>(null);
  const [draggedPiece, setDraggedPiece] = useState<{ piece: Piece; index: number } | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState({ gamesPlayed: 0, totalScore: 0, maxLevel: 1 });
  const [comboText, setComboText] = useState<string | null>(null);
  const [floatingPoints, setFloatingPoints] = useState<{ id: string; r: number; c: number; points: number }[]>([]);
  const [clearingCells, setClearingCells] = useState<Set<string>>(new Set());
  const [particles, setParticles] = useState<Particle[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pendingAfterLevel, setPendingAfterLevel] = useState<(() => void) | null>(null);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [touchFloatPos, setTouchFloatPos] = useState<{ x: number; y: number } | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [boardWidth, setBoardWidth] = useState(400);



  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchDragRef = useRef<{ piece: Piece; index: number; targetR: number; targetC: number } | null>(null);
  const touchFloatRef = useRef<HTMLDivElement | null>(null);
  // Ref para evitar setHoverCell redundante quando o dedo/cursor não mudou de célula
  const hoverCellRef = useRef<{ r: number; c: number } | null>(null);
  const cascadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setHoverCellFast = (next: { r: number; c: number } | null) => {
    if (next === null) {
      if (hoverCellRef.current !== null) { hoverCellRef.current = null; setHoverCell(null); }
    } else if (hoverCellRef.current?.r !== next.r || hoverCellRef.current?.c !== next.c) {
      hoverCellRef.current = next;
      setHoverCell(next);
    }
  };

  const getAudio = useCallback(async () => {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
    const ctx = audioCtxRef.current;
    if (ctx?.state === 'suspended') await ctx.resume();
    return ctx;
  }, [soundEnabled]);

  // ── Nível: threshold cresce com o nível ──
  const levelThreshold = (lvl: number) => lvl * 300;

  // ── Cores disponíveis por nível ──
  const getAvailableColors = (lvl: number): Color[] => {
    if (lvl >= 9) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
    if (lvl >= 7) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink'];
    if (lvl >= 5) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    if (lvl >= 3) return ['red', 'blue', 'green', 'yellow', 'purple'];
    return ['red', 'blue', 'green', 'yellow'];
  };

  // ── Formas disponíveis por nível ──
  const getAvailableShapes = (lvl: number) => {
    if (lvl >= 5) return [...SHAPES_BY_LEVEL[0], ...SHAPES_BY_LEVEL[1], ...SHAPES_BY_LEVEL[2]];
    if (lvl >= 3) return [...SHAPES_BY_LEVEL[0], ...SHAPES_BY_LEVEL[1]];
    return SHAPES_BY_LEVEL[0];
  };

  const generatePiece = useCallback((lvl: number = 1, boardToUpdate: BoardCell[][] | null = null, forceMatch: boolean = false, simplifyShapes: boolean = false): Piece => {
    const shapes = simplifyShapes ? SHAPES_BY_LEVEL[0] : getAvailableShapes(lvl);
    const colors = getAvailableColors(lvl);
    
    // Performance: Calcula ocupação uma vez por chamada de geração
    const occCount = boardToUpdate ? boardToUpdate.flat().filter(x => x).length : 0;
    const occupancy = boardToUpdate ? occCount / 64 : 0;
    const isJokerEra = occupancy > 0.8;

    const finalizeAt = (p: Piece, row: number, col: number) => {
      if (boardToUpdate) {
        p.shape.forEach(b => {
          const tr = row + b.x; const tc = col + b.y;
          if (tr >= 0 && tr < BOARD_SIZE && tc >= 0 && tc < BOARD_SIZE) {
            boardToUpdate[tr][tc] = { id: 'reserved', color: b.color };
          }
        });
      }
      return p;
    };
    
    // 1. TENTATIVA DE GERAÇÃO INTELIGENTE (RESERVA DE ESPAÇO)
    if (boardToUpdate) {
      const shuffledShapes = [...shapes].sort(() => Math.random() - 0.5);
      let firstSpotFound: { p: Piece; r: number; c: number } | null = null;
      let bestMatchFound: { p: Piece; r: number; c: number } | null = null;

      for (const shapeTemplate of shuffledShapes) {
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (shapeTemplate.every(([sx, sy]) => {
              const tr = r + sx; const tc = c + sy;
              return tr >= 0 && tr < BOARD_SIZE && tc >= 0 && tc < BOARD_SIZE && boardToUpdate[tr][tc] === null;
            })) {
              const assigned: { x: number; y: number; color: Color }[] = [];
              const pLen = shapeTemplate.length;

              if (forceMatch) {
                let bestMatchedColor: Color | null = null;
                let fallbackColor: Color | null = null;

                for (const tCol of colors) {
                  let totalClusterSize = 1; // Começa em 1 (o bloco atual que toca o vizinho)
                  const v = new Set<string>();
                  const q: {r:number, c:number}[] = [];
                  shapeTemplate.forEach(([sx,sy]) => { q.push({r:r+sx, c:c+sy}); v.add(`${r+sx}-${c+sy}`); });

                  let foundNeighbor = false;
                  while (q.length > 0) {
                    const cur = q.shift()!;
                    [{r:cur.r-1,c:cur.c},{r:cur.r+1,c:cur.c},{r:cur.r,c:cur.c-1},{r:cur.r,c:cur.c+1}].forEach(nn => {
                      if (nn.r>=0 && nn.r<BOARD_SIZE && nn.c>=0 && nn.c<BOARD_SIZE && !v.has(`${nn.r}-${nn.c}`)) {
                        const cell = boardToUpdate[nn.r][nn.c];
                        if (cell && cell.color === tCol) {
                          v.add(`${nn.r}-${nn.c}`); q.push(nn);
                          if (cell.id !== 'reserved') { totalClusterSize++; foundNeighbor = true; }
                        }
                      }
                    });
                  }
                  // Só considera Match Útil se a peça ajudar a completar (ou seja, se a soma com vizinhos for >= 3)
                  if (totalClusterSize >= 3 && foundNeighbor) { bestMatchedColor = tCol; break; }
                  if (foundNeighbor && !fallbackColor) fallbackColor = tCol;
                }

                // UPGRADE JOKER: Se em crise, chance da cor de match virar Coringa (Rainbow)
                const fCol = (forceMatch && isJokerEra && Math.random() > 0.7) 
                  ? 'rainbow' 
                  : (bestMatchedColor || fallbackColor || colors[Math.floor(Math.random() * colors.length)]);

                shapeTemplate.forEach(([sx, sy]) => {
                  let bColor = colors[Math.floor(Math.random() * colors.length)];
                  const isBridge = [{r:r+sx-1,c:c+sy},{r:r+sx+1,c:c+sy},{r:r+sx,c:c+sy-1},{r:r+sx,c:c+sy+1}]
                    .some(n => n.r>=0 && n.r<BOARD_SIZE && n.c>=0 && n.c<BOARD_SIZE && boardToUpdate[n.r][n.c]?.color === fCol);
                  if (isBridge || fCol === 'rainbow') bColor = fCol as Color;
                  assigned.push({ x: sx, y: sy, color: bColor });
                });
                const newP = { id: Math.random().toString(36).substr(2, 9), shape: assigned };
                if (bestMatchedColor) return finalizeAt(newP, r, c);
                if (!bestMatchFound) bestMatchFound = { p: newP, r, c };
              } else {
                shapeTemplate.forEach(([sx, sy]) => {
                  assigned.push({ x: sx, y: sy, color: colors[Math.floor(Math.random() * colors.length)] });
                });
                return finalizeAt({ id: Math.random().toString(36).substr(2, 9), shape: assigned }, r, c);
              }
            }
          }
        }
      }
      if (bestMatchFound) return finalizeAt(bestMatchFound.p, bestMatchFound.r, bestMatchFound.c);
      if (firstSpotFound) return finalizeAt(firstSpotFound.p, firstSpotFound.r, firstSpotFound.c);

      // 2. FALLBACK DE SOBREVIVÊNCIA (NÍVEL 1)
      if (lvl > 1) {
        const basicShapes = [...SHAPES_BY_LEVEL[0]].sort(() => Math.random() - 0.5);
        let survivalFound: { p: Piece; r: number; c: number } | null = null;

        for (const shapeTemplate of basicShapes) {
          for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
              if (shapeTemplate.every(([sx, sy]) => {
                const tr = r + sx; const tc = c + sy;
                return tr >= 0 && tr < BOARD_SIZE && tc >= 0 && tc < BOARD_SIZE && boardToUpdate[tr][tc] === null;
              })) {
                const assigned: { x: number; y: number; color: Color }[] = [];
                let bColor: Color | null = null;
                let fbColor: Color | null = null;
                const pLen = shapeTemplate.length;

                for (const [sx, sy] of shapeTemplate) {
                  const tr = r + sx; const tc = c + sy;
                  const neighbors = [{r:tr-1,c:tc},{r:tr+1,c:tc},{r:tr,c:tc-1},{r:tr,c:tc+1}].filter(n=>n.r>=0&&n.r<BOARD_SIZE&&n.c>=0&&n.c<BOARD_SIZE&&boardToUpdate[n.r][n.c]);
                  for (const tCol of colors) {
                    let totalSize = pLen; const v = new Set<string>(); const q: {r:number,c:number}[] = [];
                    shapeTemplate.forEach(([sx,sy]) => { q.push({r:r+sx,c:c+sy}); v.add(`${r+sx}-${c+sy}`); });
                    let touch = false;
                    while (q.length > 0) {
                      const cur = q.shift()!;
                      [{r:cur.r-1,c:cur.c},{r:cur.r+1,c:cur.c},{r:cur.r,c:cur.c-1},{r:cur.r,c:cur.c+1}].forEach(nn => {
                        if (nn.r>=0 && nn.r<BOARD_SIZE && nn.c>=0 && nn.c<BOARD_SIZE && !v.has(`${nn.r}-${nn.c}`)) {
                          const cell = boardToUpdate[nn.r][nn.c];
                          if (cell && cell.color === tCol) {
                            v.add(`${nn.r}-${nn.c}`); q.push(nn);
                            if (cell.id !== 'reserved') { totalSize++; touch = true; }
                          }
                        }
                      });
                    }
                    if (totalSize >= 3 && touch) { bColor = tCol; break; }
                    if (touch && !fbColor) fbColor = tCol;
                  }
                  if (bColor) break;
                }
                const sCol = bColor || fbColor || colors[Math.floor(Math.random() * colors.length)];
                shapeTemplate.forEach(([sx, sy]) => {
                  let bc = colors[Math.floor(Math.random() * colors.length)];
                  const isBridge = [{r:r+sx-1,c:c+sy},{r:r+sx+1,c:c+sy},{r:r+sx,c:c+sy-1},{r:r+sx,c:c+sy+1}]
                    .some(n => n.r>=0 && n.r<BOARD_SIZE && n.c>=0 && n.c<BOARD_SIZE && boardToUpdate[n.r][n.c]?.color === sCol);
                  if (isBridge) bc = sCol;
                  assigned.push({ x: sx, y: sy, color: bc });
                });
                const newP = { id: Math.random().toString(36).substr(2, 9), shape: assigned };
                if (bColor) return finalizeAt(newP, r, c);
                if (!survivalFound) survivalFound = { p: newP, r, c };
              }
            }
          }
        }
        if (survivalFound) return finalizeAt(survivalFound.p, survivalFound.r, survivalFound.c);
      }

      // 3. ABSOLUTE PITY (1x1 INTELIGENTE / CORINGA)
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (boardToUpdate[r][c] === null) {
            const neighbors = [{r:r-1,c:c},{r:r+1,c:c},{r:r,c:c-1},{r:r,c:c+1}]
              .filter(n=>n.r>=0&&n.r<BOARD_SIZE&&n.c>=0&&n.c<BOARD_SIZE&&boardToUpdate[n.r][n.c]);
            
            // Crie um Coringa em situações de extrema urgência baseada no cache de ocupação
            const isJoker = isJokerEra && Math.random() > 0.75;
            
            const tColor = isJoker ? 'rainbow' : (neighbors.length > 0 ? boardToUpdate[neighbors[0].r][neighbors[0].c]!.color : colors[Math.floor(Math.random() * colors.length)]);
            const p = { id: isJoker ? 'joker-' + Math.random().toString(36).substr(2, 4) : 'pity-fix', shape: [{ x: 0, y: 0, color: tColor as Color }] };
            return finalizeAt(p, r, c);
          }
        }
      }
    }

    // 4. GERAÇÃO ALEATÓRIA PADRÃO (FALLBACK GERAL)
    const shapeTemplate = shapes[Math.floor(Math.random() * shapes.length)];
    const assigned: { x: number; y: number; color: Color }[] = [];
    shapeTemplate.forEach(([x, y]) => {
      assigned.push({ x, y, color: colors[Math.floor(Math.random() * colors.length)] });
    });
    return { id: Math.random().toString(36).substr(2, 9), shape: assigned };
  }, []);

  const startNewGame = useCallback(() => {
    if (cascadeTimeoutRef.current) clearTimeout(cascadeTimeoutRef.current);
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setLevel(1);
    setScore(0);
    setCurrentPieces([generatePiece(1, null, false), generatePiece(1, null, false), generatePiece(1, null, false)]);
    setGameState('playing');
    setIsClearing(false);
    setClearingCells(new Set());
    setParticles([]);
    
    // Pre-load Intersticial para a próxima troca de fase (Evita LAG)
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false }).catch(() => {});
    }
  }, [generatePiece]);

  useEffect(() => {
    const updateWidth = () => {
      const el = document.getElementById('game-board');
      if (el) setBoardWidth(el.offsetWidth);
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const cellSize = (boardWidth - (BOARD_SIZE - 1) * 6) / BOARD_SIZE;


  useEffect(() => {
    const savedHighScore = localStorage.getItem('colorStackHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));
    
    // Carrega estatísticas e progresso ativo
    const savedStats = localStorage.getItem('colorStackStats');
    if (savedStats) setStats(JSON.parse(savedStats));
    
    const savedLevel = localStorage.getItem('colorStackLevel');
    const savedScore = localStorage.getItem('colorStackScore');
    const savedBoard = localStorage.getItem('colorStackBoard');
    const savedPieces = localStorage.getItem('colorStackPieces');
    
    if (savedLevel) setLevel(parseInt(savedLevel));
    if (savedScore) setScore(parseInt(savedScore));
    if (savedBoard) setBoard(JSON.parse(savedBoard));
    if (savedPieces) setCurrentPieces(JSON.parse(savedPieces));
    
    // Inicializa AdMob no Startup (Nativo)
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    
    const syncCloudData = async () => {
      try {
        const id = await Device.getId();
        const { data, error } = await supabase
          .from('player_stats')
          .select('high_score, max_level')
          .eq('device_id', id.identifier)
          .single();
        
        if (data) {
          if (data.high_score > (parseInt(savedHighScore) || 0)) {
            setHighScore(data.high_score);
            localStorage.setItem('colorStackHighScore', data.high_score.toString());
          }
          if (data.max_level > (parseInt(savedLevel) || 1)) {
             setLevel(data.max_level);
             localStorage.setItem('colorStackLevel', data.max_level.toString());
          }
        }
      } catch (err) {
        console.log('Cloud sync fail:', err);
      }
    };

    if (isNative) {
      syncCloudData();
      const initAdMob = async () => {
        try {
          // Inicializa AdMob para PRODUÇÃO
          await AdMob.initialize({ initializeForTesting: false });
          
          // Mostra o Banner de Produção no rodapé
          await AdMob.showBanner({
            adId: AD_UNITS.BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting: false,
            adSize: BannerAdSize.ADAPTIVE_BANNER
          });

          // PRE-LOAD & OPENING AD: Usa Intersticial como fallback (v8 plugin JS não tem App Open)
          try {
            await AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false });
            await AdMob.showInterstitial();
            // Recarrega em background para a primeira troca de fase (Evita LAG)
            AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false }).catch(() => {});
          } catch (e) {
            console.log('Opening ad skip/fail:', e);
          }
        } catch (err) {
          console.log('AdMob Startup Fail:', err);
        }
      };
      initAdMob();
    }
  }, []);

  // Grava progresso automaticamente
  useEffect(() => {
    if (gameState === 'playing' || gameState === 'levelup' || gameState === 'gameover') {
      localStorage.setItem('colorStackLevel', level.toString());
      localStorage.setItem('colorStackScore', score.toString());
      localStorage.setItem('colorStackBoard', JSON.stringify(board));
      localStorage.setItem('colorStackPieces', JSON.stringify(currentPieces));
    }
  }, [level, score, board, currentPieces, gameState]);

  const updateStats = useCallback(async (finalScore: number, finalLevel: number) => {
    let currentHighScore = parseInt(localStorage.getItem('colorStackHighScore') || '0');
    if (finalScore > currentHighScore) {
      currentHighScore = finalScore;
      localStorage.setItem('colorStackHighScore', currentHighScore.toString());
      setHighScore(currentHighScore);
    }

    setStats(prev => {
      const newStats = {
        gamesPlayed: prev.gamesPlayed + 1,
        totalScore: prev.totalScore + finalScore,
        maxLevel: Math.max(prev.maxLevel, finalLevel),
      };
      localStorage.setItem('colorStackStats', JSON.stringify(newStats));

      // Sincroniza com Supabase
      const syncToCloud = async () => {
        try {
          const id = await Device.getId();
          await supabase.from('player_stats').upsert({
            device_id: id.identifier,
            high_score: currentHighScore,
            total_score: newStats.totalScore,
            max_level: newStats.maxLevel,
            games_played: newStats.gamesPlayed,
            last_played: new Date().toISOString()
          }, { onConflict: 'device_id' });
        } catch (err) {
          console.error('Supabase sync error:', err);
        }
      };
      syncToCloud();

      return newStats;
    });
  }, []);

  const canPlacePiece = useCallback((piece: Piece, row: number, col: number, currentBoard: BoardCell[][]) => {
    return piece.shape.every(({ x, y }) => {
      const r = row + x;
      const c = col + y;
      return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && currentBoard[r][c] === null;
    });
  }, []);

  const checkGameOver = useCallback((pieces: Piece[], currentBoard: BoardCell[][]) => {
    if (pieces.length === 0) return false;
    for (const piece of pieces) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (canPlacePiece(piece, r, c, currentBoard)) return false;
        }
      }
    }
    return true;
  }, [canPlacePiece]);

  const findMatches = (currentBoard: BoardCell[][]) => {
    const matchGroups: { r: number; c: number }[][] = [];
    const visited = Array(BOARD_SIZE).fill(false).map(() => Array(BOARD_SIZE).fill(false));
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] && !visited[r][c]) {
          const color = currentBoard[r][c]!.color;
          const group: { r: number; c: number }[] = [];
          const queue = [{ r, c }];
          visited[r][c] = true;
          while (queue.length > 0) {
            const { r: currR, c: currC } = queue.shift()!;
            group.push({ r: currR, c: currC });
            const neighbors = [
              { r: currR - 1, c: currC }, { r: currR + 1, c: currC },
              { r: currR, c: currC - 1 }, { r: currR, c: currC + 1 },
            ];
            for (const n of neighbors) {
              if (n.r >= 0 && n.r < BOARD_SIZE && n.c >= 0 && n.c < BOARD_SIZE && !visited[n.r][n.c]) {
                const neighborCell = currentBoard[n.r][n.c];
                // Rainbow (Coringa) se adapta ou o nó atual é rainbow e assume o vizinho
                const colorsMatch = neighborCell?.color === color || neighborCell?.color === 'rainbow' || color === 'rainbow';
                if (neighborCell && colorsMatch) {
                  visited[n.r][n.c] = true;
                  queue.push(n);
                }
              }
            }
          }
          if (group.length >= 3) {
            // Logica Especial Coringa: Se houver um 'rainbow' ativo, expande explosão em estrela
            const hasJoker = group.some(({r:gr, c:gc}) => currentBoard[gr][gc]?.color === 'rainbow');
            if (hasJoker) {
              const jokerPos = group.find(({r:gr, c:gc}) => currentBoard[gr][gc]?.color === 'rainbow')!;
              const starRange = [];
              for (let i = 0; i < BOARD_SIZE; i++) {
                // Cross (+)
                if (currentBoard[jokerPos.r][i]) starRange.push({r: jokerPos.r, c: i});
                if (currentBoard[i][jokerPos.c]) starRange.push({r: i, c: jokerPos.c});
                // Diagonais (X)
                const dr = [+1, +1, -1, -1]; const dc = [+1, -1, +1, -1];
                for (let d = 0; d < 4; d++) {
                  const nr = jokerPos.r + i * dr[d]; const nc = jokerPos.c + i * dc[d];
                  if (nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&currentBoard[nr][nc]) starRange.push({r:nr, c:nc});
                }
              }
              starRange.forEach(cell => { 
                if (!group.some(ex => ex.r===cell.r && ex.c===cell.c)) {
                  group.push(cell);
                }
              });
            }
            matchGroups.push(group);
          }
        }
      }
    }
    return matchGroups;
  };

  const applyGravity = (currentBoard: BoardCell[][]) => {
    const newBoard = currentBoard.map(row => [...row]);
    for (let c = 0; c < BOARD_SIZE; c++) {
      let emptyRow = BOARD_SIZE - 1;
      for (let r = BOARD_SIZE - 1; r >= 0; r--) {
        if (newBoard[r][c] !== null) {
          if (r !== emptyRow) {
            newBoard[emptyRow][c] = newBoard[r][c];
            newBoard[r][c] = null;
          }
          emptyRow--;
        }
      }
    }
    return { newBoard };
  };

  const calculateMatchScore = (count: number) => {
    if (count === 3) return 10;
    if (count === 4) return 20;
    if (count >= 5) return 40;
    return 0;
  };

  // Emitir partículas ao explodir um grupo
  const spawnParticles = useCallback((group: { r: number; c: number }[], color: string) => {
    const el = document.getElementById('game-board');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cellSize = rect.width / BOARD_SIZE;

    const newParticles: Particle[] = [];
    const density = group.length >= 6 ? 6 : 4; 

    group.forEach(({ r, c }) => {
      const cx = rect.left + c * cellSize + cellSize / 2;
      const cy = rect.top + r * cellSize + cellSize / 2;
      
      for (let i = 0; i < density; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 25 + Math.random() * 45;
        // Efeito "Cores Diferentes" para o Coringa
        const particleColor = color === '#ffffff' 
          ? `hsl(${Math.random() * 360}, 100%, 70%)` 
          : color;

        newParticles.push({
          id: Math.random().toString(36).substr(2, 9),
          x: cx,
          y: cy,
          color: particleColor,
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed,
        });
      }
    });

    setParticles(prev => [...prev, ...newParticles]);
    const idsToRemove = new Set(newParticles.map(np => np.id));
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !idsToRemove.has(p.id)));
    }, 800);
  }, []);

  const PARTICLE_COLOR_MAP: Record<Color, string> = {
    red: '#fb7185',
    blue: '#38bdf8',
    green: '#4ade80',
    yellow: '#fde047',
    purple: '#c084fc',
    orange: '#ea580c',
    pink: '#ec4899',
    cyan: '#06b6d4',
    rainbow: '#ffffff',
  };

  const handlePiecePlacement = async (piece: Piece, row: number, col: number, pieceIndex: number) => {
    // Bloqueia IMEDIATAMENTE para evitar cliques simultâneos e corrupção de estado
    if (isClearing || !canPlacePiece(piece, row, col, board)) return;
    setIsClearing(true);

    const ctx = await getAudio();
    if (ctx) soundPlace(ctx);

    // 1. Gera o novo board localmente
    const activeBoard = board.map(r => [...r]);
    piece.shape.forEach(({ x, y, color }) => {
      activeBoard[row + x][col + y] = { id: Math.random().toString(36).substr(2, 9), color };
    });

    const remainingPieces = currentPieces.filter((_, i) => i !== pieceIndex);
    
    // 2. Atualiza estado imediatamente para feedback visual instantâneo
    setBoard(() => [...activeBoard]);
    setCurrentPieces(() => [...remainingPieces]);
    setSelectedPiece(null);
    setDraggedPiece(null);

    // 3. Função recursiva para processar matches e cascatas
    const runMatchCycle = (currentBoard: BoardCell[][], currentScore: number, currentLevel: number, combo: number) => {
      const matchGroups = findMatches(currentBoard);

      if (matchGroups.length > 0) {
        const toFlash = new Set<string>();
        const newFloatingPoints: { id: string; r: number; c: number; points: number }[] = [];
        let iterationScore = 0;

        matchGroups.forEach(group => {
          const groupScore = calculateMatchScore(group.length) * combo;
          iterationScore += groupScore;
          
          const center = group[Math.floor(group.length / 2)];
          newFloatingPoints.push({
            id: Math.random().toString(36).substr(2, 9),
            r: center.r,
            c: center.c,
            points: groupScore,
          });
          group.forEach(({ r, c }) => toFlash.add(`${r}-${c}`));

          const firstColor = currentBoard[group[0].r][group[0].c]?.color;
          if (firstColor) spawnParticles(group, PARTICLE_COLOR_MAP[firstColor]);
        });

        setClearingCells(toFlash);
        setFloatingPoints(prev => [...prev, ...newFloatingPoints]);
        setIsShaking(true);
        const shakeDuration = (combo > 1 || matchGroups.flat().length >= 5) ? 550 : 300;
        setTimeout(() => setIsShaking(false), shakeDuration);
        const totalMatched = matchGroups.reduce((acc, g) => acc + g.length, 0);
        let playStandardSound = true;

        if (combo > 1) {
          setComboText(`COMBO X${combo}! 🔥`);
          if (ctx) { soundAmazing(ctx); playStandardSound = false; }
        } else if (totalMatched >= 5) { // AMAZING: 5 ou mais blocos
          setComboText('AMAZING! 🔥');
          if (ctx) { soundAmazing(ctx); playStandardSound = false; }
        } else if (totalMatched >= 4) { // GREAT: 4 blocos
          setComboText('GREAT! ⭐');
          if (ctx) { soundGreat(ctx); playStandardSound = false; }
        } else {
          setComboText('CLEAR!');
        }

        if (playStandardSound && ctx) soundClear(ctx);
        
        setTimeout(() => setComboText(null), 1000);

        // Fase de Gravidade
        setTimeout(() => {
          const tempBoard = currentBoard.map(r => [...r]);
          matchGroups.forEach(group => {
            group.forEach(({ r, c }) => { tempBoard[r][c] = null; });
          });
          
          const { newBoard: boardAfterGravity } = applyGravity(tempBoard);
          const nextScore = currentScore + iterationScore;

          if (nextScore > highScore) {
            setHighScore(nextScore);
            localStorage.setItem('colorStackHighScore', nextScore.toString());
          }

          const nextLevel = Math.max(currentLevel, Math.floor(nextScore / 300) + 1);
          const finalBoard = boardAfterGravity;

          setClearingCells(new Set());
          setBoard(() => [...finalBoard]);
          setScore(nextScore);

          const idsToClean = new Set(newFloatingPoints.map(np => np.id));
          setTimeout(() => {
            setFloatingPoints(prev => prev.filter(p => !idsToClean.has(p.id)));
          }, 800);

          // Recursão para cascatas
          if (cascadeTimeoutRef.current) clearTimeout(cascadeTimeoutRef.current);
          cascadeTimeoutRef.current = setTimeout(() => runMatchCycle(finalBoard, nextScore, nextLevel, combo + 1), 150);
        }, 350);
      } else {
        // Sem mais matches, finaliza rodada
        setIsClearing(false);
        
        let actualBoard = currentBoard;
        if (currentLevel > level) {
          // Refresh no tabuleiro ao subir de nível (limpa 40% das peças para dar alívio/estratégia)
          actualBoard = currentBoard.map(row => 
            row.map(cell => (Math.random() > 0.6 ? null : cell))
          );
        }

        let finalPieces: Piece[];
        if (remainingPieces.length === 0) {
          const totalCells = BOARD_SIZE * BOARD_SIZE;
          const occupiedCount = actualBoard.flat().filter(c => c).length;
          const occupancy = occupiedCount / totalCells;
          
          const simBoard = actualBoard.map(row => [...row]);
          const pieces: Piece[] = [];
          
          const p1Match = occupancy > 0.65;
          const p2Match = occupancy > 0.8;
          const p3Match = occupancy > 0.9;
          const simplify = occupancy > 0.85;

          pieces.push(generatePiece(currentLevel, simBoard, p1Match, simplify));
          pieces.push(generatePiece(currentLevel, simBoard, p2Match, simplify));
          pieces.push(generatePiece(currentLevel, simBoard, p3Match, simplify));

          finalPieces = pieces.sort(() => Math.random() - 0.5);
        } else {
          finalPieces = remainingPieces;
        }

        setBoard(() => [...actualBoard]);
        setScore(currentScore);
        setCurrentPieces(() => [...finalPieces]);

        if (currentLevel > level) {
          if (ctx) soundLevelUp(ctx);
          setLevel(currentLevel);
          setGameState('levelup');
          
          // Troca de fase: Mostra Intersticial já pré-carregado (Sem LAG)
          const showPhaseAd = async () => {
            const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
            if (isNative) {
              try {
                await AdMob.showInterstitial();
                // Prepara o PRÓXIMO anúncio em background
                AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false }).catch(() => {});
              } catch (e) { console.error('Phase Ad fail', e); }
            }
          };
          showPhaseAd();

          setPendingAfterLevel(() => () => {
            setGameState('playing');
            if (checkGameOver(finalPieces, actualBoard)) {
              setGameState('gameover');
              updateStats(currentScore, currentLevel);
            }
          });
        } else {
          if (checkGameOver(finalPieces, actualBoard)) {
            if (ctx) soundGameOver(ctx);
            setGameState('gameover');
            updateStats(currentScore, currentLevel);
          }
        }
      }
    };

    // Delay curto para garantir que a renderização inicial da peça solta apareça
    setTimeout(() => runMatchCycle(activeBoard, score, level, 1), 50);
  };


  const showAdAndRestart = async () => {
    // ID do usuário (baseado na foto, parece ser App Open)
    const USER_AD_UNIT_ID = 'ca-app-pub-2871403878275209/9050607747';
    // ID de Teste do Google (sempre funciona)
    const TEST_AD_UNIT_ID = 'ca-app-pub-3940256099942544/1033173712';
    
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

    if (isNative) {
      try {
        // Usa o Intersticial já pré-carregado em background (Sem LAG)
        await AdMob.showInterstitial();
        
        const listener = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
          listener.remove();
          startNewGame();
          // Prepara o próximo em background
          AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false }).catch(() => {});
        });
      } catch (err) {
        console.error('Restart Ad fail:', err);
        startNewGame();
      }
    } else {
      // Fallback no browser: simula o anúncio
      setGameState('ad');
      setTimeout(() => startNewGame(), 2500);
    }
  };

  const handleCellClick = (row: number, col: number) => {
    // Impede interação se o tabuleiro estiver processando combos/explosões
    if (selectedPiece && !isClearing && gameState === 'playing') {
      const fb = selectedPiece.piece.shape[0];
      handlePiecePlacement(selectedPiece.piece, row - fb.x, col - fb.y, selectedPiece.index);
    }
  };

  const handlePieceClick = (piece: Piece, index: number) => {
    setSelectedPiece(selectedPiece?.index === index ? null : { piece, index });
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'Color Stack Puzzle',
        text: `Acabei de chegar na Fase ${level} com ${score} pontos no Color Stack Puzzle! 🚀🔥 Consegue superar minha estratégia? 🎮`,
        url: 'https://colorstackpuzzle.vercel.app/',
        dialogTitle: 'Compartilhar Conquista',
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const levelColor = LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];
  const levelProgress = Math.max(0, Math.min((score - (level - 1) * 300) / 300, 1));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black overflow-hidden font-sans">

      {/* Partículas de Explosão */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: p.x, y: p.y, scale: 1, opacity: 1 }}
          animate={{ x: p.x + p.dx, y: p.y + p.dy, scale: 0, opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ position: 'fixed', width: 10, height: 10, borderRadius: '50%', backgroundColor: p.color, pointerEvents: 'none', zIndex: 100, top: 0, left: 0 }}
        />
      ))}

      {/* Peça flutuante durante touch drag — pos atualizada direto no DOM (sem re-render) */}
      {draggedPiece && touchFloatPos && (() => {
        const fb = draggedPiece.piece.shape[0];
        return (
          <div
            ref={touchFloatRef}
            style={{
              position: 'fixed',
              left: touchFloatPos.x - (fb.y * cellSize + cellSize / 2),
              top: touchFloatPos.y - (fb.x * cellSize + cellSize / 2),
              pointerEvents: 'none',
              zIndex: 999,
              opacity: 0.9,
              transform: 'scale(1.05)',
            }}
          >
            <div
              className="grid gap-1.5"
              style={{ 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gridTemplateRows: 'repeat(5, 1fr)',
                width: cellSize * 5 + 12,
                height: cellSize * 5 + 12
              }}
            >
              {Array.from({ length: 25 }).map((_, i) => {
                const gr = Math.floor(i / 5);
                const gc = i % 5;
                const block = draggedPiece.piece.shape.find(b => b.x === gr && b.y === gc);
                return (
                  <div
                    key={i}
                    style={{ width: cellSize, height: cellSize }}
                    className={`rounded-lg ${
                      block ? `${COLOR_MAP[block.color]}` : ''
                    } relative overflow-hidden`}
                  >
                    {block && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none" />
                        <div className="absolute top-[10%] left-[10%] w-[40%] h-[25%] bg-white/40 rounded-full blur-[1px] pointer-events-none" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── MENU ─── */}
      <AnimatePresence>
        {gameState === 'menu' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-6"
          >
            <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center mb-12">
              <h1 className="text-6xl font-display font-black text-white mb-2 tracking-tighter">
                COLOR <span className="bg-gradient-to-r from-sky-400 to-fuchsia-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(14,165,233,0.3)]">STACK</span>
              </h1>
              <p className="text-zinc-500 font-medium tracking-widest uppercase text-sm">Casual Puzzle Experience</p>
            </motion.div>

            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button
                onClick={() => {
                  const hasProgress = currentPieces.length > 0 && (score > 0 || board.some(row => row.some(cell => cell !== null)));
                  if (hasProgress) {
                    setGameState('playing');
                  } else {
                    startNewGame();
                  }
                }}
                className="bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-400 hover:to-purple-500 text-white py-5 rounded-3xl font-display font-bold text-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(232,121,249,0.4)] flex items-center justify-center gap-3 relative overflow-hidden group uppercase"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <Play className="w-6 h-6 fill-current" />
                { (currentPieces.length > 0 && score > 0) ? 'CONTINUAR' : 'NOVA PARTIDA' }
              </button>

              { (currentPieces.length > 0 && score > 0) && (
                <button
                  onClick={() => {
                    if (confirm('Deseja iniciar uma nova partida? Seu progresso atual nesta fase será perdido.')) {
                      startNewGame();
                    }
                  }}
                  className="text-zinc-500 hover:text-zinc-400 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors"
                >
                  Reiniciar nível atual
                </button>
              )}
              <button
                onClick={() => setShowStats(true)}
                className="bg-white/5 hover:bg-white/10 backdrop-blur-md text-white py-4 rounded-3xl font-bold transition-all active:scale-95 border border-white/10 flex items-center justify-center gap-3"
              >
                <BarChart2 className="w-5 h-5" />
                ESTATÍSTICAS
              </button>
              <button
                onClick={() => setShowInfo(true)}
                className="bg-white/5 hover:bg-white/10 backdrop-blur-md text-white py-4 rounded-3xl font-bold transition-all active:scale-95 border border-white/10 flex items-center justify-center gap-3"
              >
                <Info className="w-5 h-5" />
                COMO JOGAR
              </button>
            </div>

            <div className="mt-12 flex flex-col items-center gap-3">
              <div className="text-zinc-600 text-xs flex items-center gap-2">
                <Trophy className="w-3 h-3" />
                MELHOR: {highScore} pts
              </div>
              <a 
                href="/privacy.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-zinc-700 text-[10px] uppercase tracking-widest hover:text-zinc-500 transition-colors"
              >
                Política de Privacidade
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── LEVEL UP ─── */}
      <AnimatePresence>
        {gameState === 'levelup' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ type: 'spring', damping: 12 }}
              className="text-center"
            >
              <div className="flex justify-center mb-4 gap-1">
                {[...Array(3)].map((_, i) => (
                  <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}>
                    <Star className={`w-10 h-10 fill-current ${levelColor}`} />
                  </motion.div>
                ))}
              </div>
              <h2 className={`text-6xl font-display font-black mb-2 ${levelColor}`}>FASE {level}!</h2>
              <p className="text-zinc-400 text-lg mb-2">Novas peças desbloqueadas!</p>
              <p className="text-zinc-500 text-sm mb-8">
                {level >= 5 ? '6 cores ativas 🟠' : level >= 3 ? '5 cores ativas 🟣' : '4 cores ativas'}
              </p>
              <button
                onClick={() => {
                  setGameState('playing');
                  if (pendingAfterLevel) {
                    pendingAfterLevel();
                    setPendingAfterLevel(null);
                  }
                }}
                className={`bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-400 hover:to-purple-500 text-white px-10 py-4 rounded-2xl font-display font-bold text-xl transition-all active:scale-95 shadow-xl shadow-fuchsia-500/20`}
              >
                CONTINUAR →
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── AD SIMULATION ─── */}
      <AnimatePresence>
        {gameState === 'ad' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-6"
          >
            <div className="glass p-8 rounded-3xl text-center max-w-xs w-full">
              <div className="text-xs text-zinc-600 mb-2 uppercase tracking-widest">Anúncio</div>
              <div className="w-16 h-16 bg-zinc-800 rounded-2xl mx-auto mb-4 animate-pulse flex items-center justify-center">
                <Play className="w-8 h-8 text-zinc-600" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Preparando o jogo...</h2>
              <p className="text-zinc-500 text-sm mb-6">Carregando próxima sessão</p>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2.5 }}
                  className="bg-sky-500 h-full"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── HEADER: STATUS CARDS ─── */}
      <div className="w-full max-w-md flex justify-between items-start mb-6 px-1 pt-4">
        {/* Card de FASE (Lado Esquerdo) */}
        <div className="relative group">
          <div className={`absolute -inset-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000`}></div>
          <div className="relative glass px-5 py-2 rounded-2xl flex flex-col items-start border border-white/10 shadow-2xl min-w-[130px]">
            <span className={`text-[10px] uppercase tracking-[0.2em] font-black mb-0.5 ${levelColor}`}>FASE ATUAL</span>
            <div className="flex items-baseline gap-2">
              <motion.span 
                key={level}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-3xl font-display font-black text-white leading-none"
              >
                {level}
              </motion.span>
              <div className="text-[10px] text-zinc-500 font-bold uppercase">MAX: {stats.maxLevel}</div>
            </div>
          </div>
        </div>

        {/* Card de SCORE (Lado Direito) */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-sky-600 to-violet-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative glass px-6 py-2 rounded-2xl flex flex-col items-end border border-white/10 shadow-2xl min-w-[130px]">
            <span className="text-[10px] uppercase tracking-[0.2em] text-sky-400/80 font-black mb-0.5 text-right w-full">PONTUAÇÃO</span>
            <div className="flex flex-col items-end">
              <motion.span 
                key={score}
                initial={{ scale: 1.2, color: '#38bdf8' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="text-3xl font-display font-black text-white leading-none"
              >
                {score}
              </motion.span>
              <div className="text-[10px] text-zinc-500 font-bold uppercase">BEST: {highScore}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de progresso do nível */}
      <div className="w-full max-w-md mb-8">
        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 px-1">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${levelColor} shadow-[0_0_8px_currentColor]`}></div>
            <span className={levelColor}>STAGE {level}</span>
          </div>
          <span className="text-sky-400/80">{Math.round(levelProgress * 100)}% TO NEXT</span>
        </div>
        <div className="w-full bg-black/40 h-3 rounded-full overflow-hidden p-0.5 border border-white/5 shadow-inner">
          <div className="w-full h-full rounded-full overflow-hidden relative">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-fuchsia-500 shadow-[0_0_15px_rgba(56,189,248,0.5)]`}
              animate={{ width: `${levelProgress * 100}%` }}
              transition={{ type: 'spring', stiffness: 50, damping: 15 }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%)] bg-[length:200%_100%] animate-shimmer" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* ─── TABULEIRO ─── */}
      <div
        className="relative"
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverCell(null); }}
        onMouseLeave={() => { if (!draggedPiece) setHoverCell(null); }}
      >
        <motion.div
          id="game-board"
          animate={{
            scale: isClearing ? [1, 1.01, 1] : 1,
            x: isShaking ? [0, -3, 3, -3, 3, 0] : 0,
            y: isShaking ? [0, 2, -2, 2, -2, 0] : 0,
            filter: isShaking ? 'brightness(1.5) contrast(1.2)' : 'brightness(1) contrast(1)',
          }}
          transition={{ 
            scale: { duration: 0.3 },
            x: { duration: 0.2 },
            y: { duration: 0.2 }
          }}
          className="bg-black/30 backdrop-blur-xl p-2.5 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10"
        >
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
              width: 'min(90vw, 400px)',
              height: 'min(90vw, 400px)',
            }}
          >
            {board.map((row, r) =>
              row.map((cell, c) => (
                <motion.div
                  key={`${r}-${c}`}
                  data-cell="true"
                  data-r={r}
                  data-c={c}
                  className={(() => {
                    const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;
                    let isGhost = false;
                    let ghostFits = false;
                    let ghostBlocked = false;

                    if (activePiece && hoverCell) {
                      const firstBlock = activePiece.shape[0]; // Simplificado: assume que o primeiro bloco é o guia
                      const anchorR = hoverCell.r - firstBlock.x;
                      const anchorC = hoverCell.c - firstBlock.y;
                      const ghostBlock = activePiece.shape.find(({ x, y }) => anchorR + x === r && anchorC + y === c);
                      if (ghostBlock) {
                        isGhost = true;
                        ghostFits = canPlacePiece(activePiece, anchorR, anchorC, board);
                        ghostBlocked = !ghostFits;
                      }
                    }

                    return [
                      'relative rounded-lg aspect-square cursor-pointer transition-all duration-75',
                      cell ? '' : 'bg-white/5 hover:bg-white/10',
                      clearingCells.has(`${r}-${c}`) ? 'scale-110 brightness-150 z-10' : '',
                      ghostFits ? 'ring-2 ring-white/30 z-20' : '',
                      ghostBlocked ? 'bg-rose-500/20' : '',
                    ].join(' ');
                  })()}
                  onClick={() => handleCellClick(r, c)}
                  onMouseEnter={() => setHoverCellFast({ r, c })}
                  onDragOver={(e) => { e.preventDefault(); setHoverCellFast({ r, c }); }}
                  onDrop={() => {
                    setHoverCell(null);
                    if (draggedPiece) {
                      const fb = draggedPiece.piece.shape[0];
                      handlePiecePlacement(draggedPiece.piece, r - fb.x, c - fb.y, draggedPiece.index);
                    }
                  }}
                >
                  {(() => {
                    const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;
                    if (!activePiece || !hoverCell) return null;
                    
                    const firstBlock = activePiece.shape[0];
                    const anchorR = hoverCell.r - firstBlock.x;
                    const anchorC = hoverCell.c - firstBlock.y;
                    const ghostBlock = activePiece.shape.find(({ x, y }) => anchorR + x === r && anchorC + y === c);
                    if (!ghostBlock) return null;
                    
                    const fits = canPlacePiece(activePiece, anchorR, anchorC, board);
                    return (
                      <div className={`absolute inset-0 rounded-lg ${COLOR_MAP[ghostBlock.color]} ${fits ? 'opacity-40 animate-pulse' : 'opacity-20 grayscale'} pointer-events-none`} />
                    );
                  })()}

                  <AnimatePresence>
                    {cell && (
                      <motion.div
                        key={cell.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0, rotate: 45 }}
                        className={`absolute inset-0 w-full h-full rounded-lg ${COLOR_MAP[cell.color]}`}
                      >
                        {/* Brilho Glossy / Candy Crush Layers */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none rounded-lg z-10" />
                        <div className="absolute top-[10%] left-[10%] w-[35%] h-[20%] bg-white/40 rounded-full blur-[1px] pointer-events-none z-20" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Floating Points */}
                  <AnimatePresence>
                    {floatingPoints.filter(p => p.r === r && p.c === c).map(p => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 0, scale: 0.5 }}
                        animate={{ opacity: 1, y: -40, scale: 1.2 }}
                        exit={{ opacity: 0, y: -60 }}
                        className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
                      >
                        <span className="text-white font-display font-black text-lg drop-shadow-md">
                          +{p.points}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* Combo Feedback */}
        <AnimatePresence mode="wait">
          {comboText && (
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.2, rotate: -10 }}
              animate={{ opacity: 1, y: -120, scale: [0.2, 2.5, 2], rotate: 0 }}
              exit={{ opacity: 0, scale: 4, filter: 'blur(20px)' }}
              transition={{ type: 'spring', damping: 10, stiffness: 100 }}
              className="absolute inset-x-0 top-1/2 text-center pointer-events-none z-50 drop-shadow-[0_0_60px_white]"
            >
              <span className="text-6xl sm:text-8xl font-display font-black text-white italic tracking-tighter uppercase block drop-shadow-2xl">
                {comboText}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over Overlay */}
        <AnimatePresence>
          {gameState === 'gameover' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-xl rounded-3xl border border-white/5"
            >
              <h2 className="text-4xl font-display font-bold text-white mb-1">Game Over</h2>
              <p className="text-zinc-400 mb-1">Score: {score} pts</p>
              <p className="text-zinc-500 text-sm mb-6">Fase {level} concluída</p>
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button
                  onClick={showAdAndRestart}
                  className="bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-sky-500/30"
                >
                  <RotateCcw className="w-5 h-5" />
                  Jogar de Novo
                </button>
                <button
                  onClick={handleShare}
                  className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
                >
                  <Share2 className="w-5 h-5" />
                  Compartilhar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── PEÇAS ─── */}
      <div className="mt-8 flex gap-4 sm:gap-8 justify-center items-center h-32">
        {currentPieces.map((piece, idx) => {
          // Memoização manual simples: só calcula se for necessário ou o board mudou
          // (No React esse componente renderiza muito, então canPlace vira um peso)
          const canPlace = isClearing ? false : checkGameOver([piece], board) === false;
          return (
            <motion.div
              key={piece.id}
              draggable
              style={{ touchAction: 'none' }}
              whileHover={canPlace ? { scale: 1.08, y: -4 } : {}}
              whileTap={canPlace ? { scale: 0.95 } : {}}
              onDragStart={(e) => {
                // Esconde a imagem padrão do browser — o ghost do board é o feedback visual
                const ghost = new Image();
                ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                e.dataTransfer.setDragImage(ghost, 0, 0);
                e.dataTransfer.setData('text/plain', '');
                setDraggedPiece({ piece, index: idx });
                setSelectedPiece(null);
              }}
              onDragEnd={() => { setDraggedPiece(null); setHoverCell(null); }}
              onTouchStart={(e) => {
                if (!canPlace) return;
                const touch = e.touches[0];
                setDraggedPiece({ piece, index: idx });
                setSelectedPiece(null);
                // Inicia já com o offset de -30 para evitar o "pulo" ao começar a mover
                setTouchFloatPos({ x: touch.clientX, y: touch.clientY - 30 });
                touchDragRef.current = { piece, index: idx, targetR: -1, targetC: -1 };
              }}
              onTouchMove={(e) => {
                if (!touchDragRef.current) return;
                e.preventDefault();
                const touch = e.touches[0];
                // Atualiza a posição do float DIRETO no DOM — sem setState — zero lag
                if (touchFloatRef.current) {
                  const fb = touchDragRef.current!.piece.shape[0];
                  // Ajuste fino de sensibilidade: centraliza levemente acima do dedo para visibilidade
                  touchFloatRef.current.style.left = `${touch.clientX - (fb.y * cellSize + cellSize / 2)}px`;
                  touchFloatRef.current.style.top  = `${touch.clientY - (fb.x * cellSize + cellSize / 2) - 30}px`;
                }
                // Detecta a célula baseada na posição DA PEÇA (30px acima), não do dedo
                const el = document.elementFromPoint(touch.clientX, touch.clientY - 30);
                const cell = el?.closest('[data-cell]');
                if (cell) {
                  const r = parseInt(cell.getAttribute('data-r') || '-1');
                  const c = parseInt(cell.getAttribute('data-c') || '-1');
                  touchDragRef.current.targetR = r;
                  touchDragRef.current.targetC = c;
                  setHoverCellFast(r >= 0 && c >= 0 ? { r, c } : null);
                } else {
                  setHoverCellFast(null);
                }
              }}
              onTouchEnd={() => {
                const state = touchDragRef.current;
                if (state && state.targetR >= 0 && state.targetC >= 0) {
                  const fb = state.piece.shape[0];
                  handlePiecePlacement(state.piece, state.targetR - fb.x, state.targetC - fb.y, state.index);
                }
                touchDragRef.current = null;
                setDraggedPiece(null);
                setHoverCell(null);
                setTouchFloatPos(null);
              }}
              onClick={() => handlePieceClick(piece, idx)}
              animate={{
                scale: selectedPiece?.index === idx ? 1.1 : 1,
                y: selectedPiece?.index === idx ? -10 : 0,
                opacity: gameState !== 'playing' ? 0.5 : canPlace ? 1 : 0.3,
              }}
              className={`cursor-grab active:cursor-grabbing transition-all p-2 rounded-xl flex items-center justify-center ${
                !canPlace ? 'grayscale pointer-events-none' : ''
              } ${
                selectedPiece?.index === idx ? 'bg-white/10 ring-2 ring-sky-500' : 'hover:bg-white/5'
              }`}
            >
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(5, 1fr)`, gridTemplateRows: `repeat(5, 1fr)` }}
              >
                {Array.from({ length: 25 }).map((_, i) => {
                  const r = Math.floor(i / 5);
                  const c = i % 5;
                  
                  // Centraliza peças no grid 5x5 do preview
                  const minX = Math.min(...piece.shape.map(b => b.x));
                  const maxX = Math.max(...piece.shape.map(b => b.x));
                  const minY = Math.min(...piece.shape.map(b => b.y));
                  const maxY = Math.max(...piece.shape.map(b => b.y));
                  const shiftX = Math.floor((5 - (maxX - minX + 1)) / 2) - minX;
                  const shiftY = Math.floor((5 - (maxY - minY + 1)) / 2) - minY;

                  const block = piece.shape.find(b => b.x + shiftX === r && b.y + shiftY === c);
                  return (
                    <div
                      key={i}
                      className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm ${
                        block ? `${COLOR_MAP[block.color]}` : 'bg-white/5 shadow-inner'
                      } relative overflow-hidden`}
                    >
                      {block && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none" />
                          <div className="absolute top-[10%] left-[10%] w-[40%] h-[25%] bg-white/40 rounded-full blur-[1px] pointer-events-none" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ─── FOOTER CONTROLS ─── */}
      <div className="mt-auto w-full max-w-md flex justify-around p-6 text-zinc-500">
        <button onClick={() => setShowInfo(true)} className="hover:text-white transition-colors"><Info className="w-6 h-6" /></button>
        <button onClick={() => setShowStats(true)} className="hover:text-white transition-colors"><BarChart2 className="w-6 h-6" /></button>
        <button onClick={() => setSoundEnabled(v => !v)} className={`transition-colors ${soundEnabled ? 'text-sky-400' : 'text-zinc-600'}`}>
          {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </button>
        <button onClick={() => setGameState('menu')} className="hover:text-white transition-colors"><RotateCcw className="w-6 h-6" /></button>
      </div>

      {/* ─── INFO MODAL ─── */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-950/90 border border-white/10 p-8 rounded-[2.5rem] max-w-sm w-full shadow-2xl backdrop-blur-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-2xl font-display font-bold text-white mb-4">Como Jogar</h3>
              <ul className="space-y-4 text-zinc-400">
                <li className="flex gap-3">
                  <span className="bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black shadow-lg shadow-fuchsia-500/30">1</span>
                  <p>Clique em uma peça para selecioná-la, depois clique no tabuleiro para colocar.</p>
                </li>
                <li className="flex gap-3">
                  <span className="bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black shadow-lg shadow-fuchsia-500/30">2</span>
                  <p>Junte <span className="text-white font-bold">3 ou mais</span> blocos da mesma cor para explodir.</p>
                </li>
                <li className="flex gap-3">
                  <span className="bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black shadow-lg shadow-fuchsia-500/30">3</span>
                  <p>A cada fase, novas cores e peças aparecem. Não deixe o board encher!</p>
                </li>
              </ul>
              <button onClick={() => setShowInfo(false)} className="w-full mt-8 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors">Entendido!</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── STATS MODAL ─── */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowStats(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-950/90 border border-white/10 p-8 rounded-[2.5rem] max-w-sm w-full shadow-2xl backdrop-blur-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-2xl font-display font-bold text-white mb-6">Suas Estatísticas</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Partidas</p>
                  <p className="text-2xl font-display font-bold text-white">{stats.gamesPlayed}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Recorde</p>
                  <p className="text-2xl font-display font-bold text-white">{highScore}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Fase Máx.</p>
                  <p className="text-2xl font-display font-bold text-white">{stats.maxLevel}</p>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <p className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Total Pts</p>
                  <p className="text-2xl font-display font-bold text-white">{stats.totalScore.toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => setShowStats(false)} className="w-full mt-8 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors">Fechar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
