/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Play, Info, BarChart2, Star, Volume2, VolumeX, Share2 } from 'lucide-react';
import { Color, BoardCell, Piece } from './types';
import { AdMob, InterstitialAdPluginEvents, BannerAdPosition, RewardAdPluginEvents, BannerAdSize } from '@capacitor-community/admob';
import { Device } from '@capacitor/device';
import { Share } from '@capacitor/share';
import { supabase } from './lib/supabase';
import PixiBoard from './components/PixiBoard';

// ─── CONFIGURAÇÕES TÉCNICAS E BALANCEAMENTO ───
const GAME_CONFIG = {
  BOARD_SIZE: 8,
  LEVEL_SCORE_INTERVAL: 1440,      // Intervalo para subir de fase (3x mais pontos para não subir rápido demais)
  JOKER_CHANCE: 0.11,
  RAINBOW_CHANCE: 0.09,
  GRAVITY_DELAY: 350,
  CASCADE_DELAY: 150,
  FLASH_DELAY: 350,
  OCCUPANCY_STRATEGIES: {
    MATCH_P1: 0.65,
    MATCH_P2: 0.8,
    MATCH_P3: 0.9,
    SIMPLIFY: 0.85,
    JOKER_ERA: 0.8,
  },
  LEVEL_UP_SURVIVAL_RATE: 0.6,
  SCORES: {
    MATCH_3: 10,
    MATCH_4: 19,                   // Granularidade fina
    MATCH_5_PLUS: 32,             // Balanceado
    COMBO_MULTIPLIER: 1.42,        // Curva de pontuação suavizada
    MAX_PARTICLES_PER_CELL: 5,
    MAX_GLOBAL_PARTICLES: 100,
  }
};

const BOARD_SIZE = GAME_CONFIG.BOARD_SIZE;
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
  red: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg shadow-rose-500/20 border border-white/10 will-change-transform',
  blue: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-lg shadow-sky-500/20 border border-white/10 will-change-transform',
  green: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20 border border-white/10 will-change-transform',
  yellow: 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-lg shadow-amber-500/20 border border-white/10 will-change-transform',
  purple: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-lg shadow-violet-500/20 border border-white/10 will-change-transform',
  orange: 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20 border border-white/10 will-change-transform',
  pink: 'bg-gradient-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/20 border border-white/10 will-change-transform',
  cyan: 'bg-gradient-to-br from-cyan-400 to-cyan-500 shadow-lg shadow-cyan-500/20 border border-white/10 will-change-transform',
  lime: 'bg-gradient-to-br from-lime-500 to-lime-600 shadow-lg shadow-lime-500/20 border border-white/10 will-change-transform',
  emerald: 'bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-700/20 border border-white/10 will-change-transform',
  amber: 'bg-gradient-to-br from-amber-600 to-amber-700 shadow-lg shadow-amber-700/20 border border-white/10 will-change-transform',
  fuchsia: 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/20 border border-white/10 will-change-transform',
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/20 border border-white/10 will-change-transform',
  rainbow: 'joker-rainbow border border-white/30 will-change-transform',
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



// ─── ÁUDIO MELHORADO - MAIS IMPACTANTE E EMOCIONAL ───────────────────────

function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const startTime = ctx.currentTime + delay;

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(freq, startTime);
  osc.type = type;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(vol, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Sons básicos melhorados
function soundPlace(ctx: AudioContext) {
  const base = 320 + Math.random() * 40;
  playTone(ctx, base, 0.08, 'sine', 0.12);
  playTone(ctx, base * 2.8, 0.025, 'square', 0.06, 0.01);
}

// CLEAR - mais "pop" e satisfatório
function soundClear(ctx: AudioContext) {
  const root = 520 + Math.random() * 60;
  playTone(ctx, root, 0.18, 'triangle', 0.22);
  playTone(ctx, root * 1.6, 0.14, 'triangle', 0.18, 0.06);
  playTone(ctx, root * 2.4, 0.22, 'sine', 0.10, 0.12);
}

// GREAT - som de "vitória leve"
function soundGreat(ctx: AudioContext) {
  const root = 680;
  playTone(ctx, root, 0.25, 'sine', 0.25);
  playTone(ctx, root * 1.45, 0.20, 'sine', 0.18, 0.08);
  playTone(ctx, root * 2.1, 0.35, 'triangle', 0.12, 0.18);

  // Noise leve para brilho
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  for (let j = 0; j < noise.length; j++) noise.getChannelData(0)[j] = Math.random() * 1.6 - 0.8;
  const nSrc = ctx.createBufferSource(); nSrc.buffer = noise;
  const nGain = ctx.createGain(); nGain.gain.value = 0.18;
  nGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  nSrc.connect(nGain).connect(ctx.destination);
  nSrc.start();
}

// AMAZING / COMBO - som épico e emocionante
function soundAmazing(ctx: AudioContext) {
  const now = ctx.currentTime;

  // Bass impactante
  const bass = ctx.createOscillator();
  bass.type = 'sawtooth';
  bass.frequency.setValueAtTime(160, now);
  bass.frequency.exponentialRampToValueAtTime(45, now + 0.55);

  const bassGain = ctx.createGain();
  bassGain.gain.setValueAtTime(0.35, now);
  bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  bass.connect(bassGain).connect(ctx.destination);
  bass.start(now);
  bass.stop(now + 0.55);

  // Camada principal (melodia triunfal)
  [620, 780, 920, 1240, 1480].forEach((f, i) => {
    playTone(ctx, f, 0.28, 'sine', 0.22, i * 0.07 + 0.08);
  });

  // Sparkle / brilho alto
  playTone(ctx, 1850, 0.35, 'square', 0.09, 0.25);
  playTone(ctx, 2100, 0.22, 'sine', 0.11, 0.32);

  // Noise burst para sensação de explosão
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.22, ctx.sampleRate);
  for (let j = 0; j < noise.length; j++) noise.getChannelData(0)[j] = Math.random() * 2.2 - 1.1;
  const nSrc = ctx.createBufferSource(); nSrc.buffer = noise;
  const nFilter = ctx.createBiquadFilter(); nFilter.type = 'highpass'; nFilter.frequency.value = 1100;
  const nGain = ctx.createGain(); 
  nGain.gain.setValueAtTime(0.45, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  nSrc.connect(nFilter).connect(nGain).connect(ctx.destination);
  nSrc.start(now);
}

// Level Up - som de conquista
function soundLevelUp(ctx: AudioContext) {
  const notes = [440, 554, 659, 880, 1100];
  notes.forEach((f, i) => {
    playTone(ctx, f, 0.42, 'sine', 0.18, i * 0.09);
  });
  playTone(ctx, 1320, 0.65, 'triangle', 0.12, 0.45);
}

// Game Over - mais dramático
function soundGameOver(ctx: AudioContext) {
  [520, 440, 360, 280].forEach((f, i) => {
    playTone(ctx, f, 0.45, 'sawtooth', 0.14, i * 0.13);
  });
}

function soundError(ctx: AudioContext) {
  playTone(ctx, 180, 0.22, 'sawtooth', 0.18);
  playTone(ctx, 120, 0.35, 'sawtooth', 0.12, 0.12);
}

// Voz mais energética e natural (inglês animado)
function speak(text: string) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.pitch = 1.15;      // mais animado
  utterance.rate = 1.08;       // um pouco mais rápido
  utterance.volume = 0.92;

  // Tenta usar vozes mais naturais (melhor no Android)
  const voices = window.speechSynthesis.getVoices();
  const goodVoice = voices.find(v => 
    v.name.includes('Samantha') || 
    v.name.includes('Karen') || 
    v.name.includes('Google') ||
    v.name.includes('Natural')
  );
  if (goodVoice) utterance.voice = goodVoice;

  window.speechSynthesis.speak(utterance);
}

// ─────────────────────────────────────────────────────────────


interface PieceItemProps {
  piece: Piece;
  idx: number;
  board: BoardCell[][];
  isClearing: boolean;
  selectedPieceIndex?: number;
  gameState: GameState;
  onPieceClick: (p: Piece, i: number) => void;
  setDraggedPiece: (p: { piece: Piece; index: number } | null) => void;
  setSelectedPiece: (p: { piece: Piece; index: number } | null) => void;
  setTouchFloatPos: (p: { x: number; y: number } | null) => void;
  setHoverCellFast: (p: { r: number; c: number } | null) => void;
  handlePiecePlacement: (p: Piece, r: number, c: number, i: number) => void;
  canPlacePiece: (piece: Piece, row: number, col: number, currentBoard: BoardCell[][]) => boolean;
  cellSize: number;
  touchDragRef: React.MutableRefObject<{ piece: Piece; index: number; targetR: number; targetC: number } | null>;
  touchFloatRef: React.MutableRefObject<HTMLDivElement | null>;
  checkGameOver: (pieces: Piece[], currentBoard: BoardCell[][]) => boolean;
}

const PieceItem = React.memo(({ 
  piece, idx, board, isClearing, selectedPieceIndex, gameState, 
  onPieceClick, setDraggedPiece, setSelectedPiece, setTouchFloatPos, 
  setHoverCellFast, handlePiecePlacement, canPlacePiece, cellSize, touchDragRef, 
  touchFloatRef, checkGameOver 
}: PieceItemProps) => {
  const canPlace = useMemo(() => isClearing ? false : checkGameOver([piece], board) === false, [piece, board, isClearing]);
  const isSelected = selectedPieceIndex === idx;

  return (
    <motion.div
      draggable
      style={{ touchAction: 'none' }}
      whileHover={canPlace ? { scale: 1.08, y: -4 } : {}}
      whileTap={canPlace ? { scale: 0.95 } : {}}
      onDragStart={(e: any) => {
        const ghost = new Image();
        ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        (e as any).dataTransfer.setDragImage(ghost, 0, 0);
        (e as any).dataTransfer.setData('text/plain', '');
        setDraggedPiece({ piece, index: idx });
        setSelectedPiece(null);
      }}
      onDragEnd={() => { setDraggedPiece(null); setHoverCellFast(null); }}
      onTouchStart={(e) => {
        if (!canPlace) return;
        const touch = e.touches[0];
        setDraggedPiece({ piece, index: idx });
        setSelectedPiece(null);
        setTouchFloatPos({ x: touch.clientX, y: touch.clientY - 30 });
        touchDragRef.current = { piece, index: idx, targetR: -1, targetC: -1 };
      }}
      onTouchMove={(e) => {
        if (!touchDragRef.current) return;
        e.preventDefault();
        const touch = e.touches[0];
        if (touchFloatRef.current) {
          const fb = touchDragRef.current!.piece.shape[0];
          touchFloatRef.current.style.left = `${touch.clientX - (fb.y * cellSize + cellSize / 2)}px`;
          touchFloatRef.current.style.top  = `${touch.clientY - (fb.x * cellSize + cellSize / 2) - 30}px`;
        }

        const boardEl = document.getElementById('game-board-inner');
        if (boardEl) {
          const rect = boardEl.getBoundingClientRect();
          const relX = touch.clientX - rect.left;
          const relY = (touch.clientY - 30) - rect.top;
          
          const c = Math.floor(relX / cellSize);
          const r = Math.floor(relY / cellSize);

          if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            touchDragRef.current.targetR = r;
            touchDragRef.current.targetC = c;
            setHoverCellFast({ r, c });
          } else {
            touchDragRef.current.targetR = -1;
            touchDragRef.current.targetC = -1;
            setHoverCellFast(null);
          }
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
        setHoverCellFast(null);
        setTouchFloatPos(null);
      }}
      onClick={() => onPieceClick(piece, idx)}
      animate={{
        scale: isSelected ? 1.1 : 1,
        y: isSelected ? -10 : 0,
        opacity: gameState !== 'playing' ? 0.5 : canPlace ? 1 : 0.3,
      }}
      className={`cursor-grab active:cursor-grabbing transition-all p-2 rounded-xl flex items-center justify-center ${
        !canPlace ? 'grayscale pointer-events-none' : ''
      } ${isSelected ? 'bg-white/10 ring-2 ring-sky-500' : 'hover:bg-white/5'}`}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(5, 1fr)`, gridTemplateRows: `repeat(5, 1fr)` }}
      >
        {Array.from({ length: 25 }).map((_, i) => {
          const r = Math.floor(i / 5);
          const c = i % 5;
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
});

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

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pendingAfterLevel, setPendingAfterLevel] = useState<(() => void) | null>(null);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [touchFloatPos, setTouchFloatPos] = useState<{ x: number; y: number } | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [boardWidth, setBoardWidth] = useState(400);
  const [revivedOnce, setRevivedOnce] = useState(false);
  const [globalTop, setGlobalTop] = useState<{ high_score: number; max_level: number }[]>([]);
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [streak, setStreak] = useState(0);
  const [dailyBonusActive, setDailyBonusActive] = useState(false);
  const [hintPosition, setHintPosition] = useState<{ r: number; c: number; pieceIndex: number } | null>(null);



  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchDragRef = useRef<{ piece: Piece; index: number; targetR: number; targetC: number } | null>(null);
  const touchFloatRef = useRef<HTMLDivElement | null>(null);
  // Ref para evitar setHoverCell redundante quando o dedo/cursor não mudou de célula
  const hoverCellRef = useRef<{ r: number; c: number } | null>(null);
  const cascadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup: Evita vazamento de memória e timers fantasmas ao desmontar
  useEffect(() => {
    return () => {
      if (cascadeTimeoutRef.current) clearTimeout(cascadeTimeoutRef.current);
    };
  }, []);

  const setHoverCellFast = (next: { r: number; c: number } | null) => {
    if (next === null) {
      if (hoverCellRef.current !== null) { hoverCellRef.current = null; setHoverCell(null); }
    } else if (hoverCellRef.current?.r !== next.r || hoverCellRef.current?.c !== next.c) {
      hoverCellRef.current = next;
      setHoverCell(next);
    }
  };

  // Global Resume Audio on Interaction (Essential for Mobile/Capacitor)
  useEffect(() => {
    const handleInteraction = () => {
      getAudio();
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
  }, []);

  const getAudio = useCallback(async (): Promise<AudioContext | null> => {
    if (!soundEnabled) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return null;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext');
      }
    }

    return ctx;
  }, [soundEnabled]);

  // ── Nível: threshold cresce com o nível ──
  const levelThreshold = (lvl: number) => lvl * GAME_CONFIG.LEVEL_SCORE_INTERVAL;

  // ── Formas disponíveis por nível ──
  const getAvailableShapes = (lvl: number) => {
    if (lvl >= 5) return [...SHAPES_BY_LEVEL[0], ...SHAPES_BY_LEVEL[1], ...SHAPES_BY_LEVEL[2]];
    if (lvl >= 3) return [...SHAPES_BY_LEVEL[0], ...SHAPES_BY_LEVEL[1]];
    return SHAPES_BY_LEVEL[0];
  };

  // ── Cores disponíveis por nível ──
  const getAvailableColors = (lvl: number): Color[] => {
    if (lvl >= 11) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'lime', 'emerald', 'amber', 'fuchsia', 'indigo'];
    if (lvl >= 9) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'lime', 'emerald', 'amber', 'fuchsia'];
    if (lvl >= 7) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'lime', 'emerald'];
    if (lvl >= 5) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
    if (lvl >= 3) return ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    return ['red', 'blue', 'green', 'yellow'];
  };

  // ── Cores de fundo dinâmicas por nível ──
  const getBoardBackgroundColor = (lvl: number): string => {
    if (lvl >= 12) return 'from-purple-950 via-indigo-950 to-black';
    if (lvl >= 9)  return 'from-rose-950 via-purple-950 to-black';
    if (lvl >= 6)  return 'from-amber-950 via-orange-950 to-black';
    if (lvl >= 4)  return 'from-emerald-950 via-cyan-950 to-black';
    return 'from-zinc-950 via-slate-950 to-black';
  };

  const generatePiece = useCallback((lvl: number = 1, boardToUpdate: BoardCell[][] | null = null): Piece => {
    const shapes = getAvailableShapes(lvl);
    const colors = getAvailableColors(lvl);
    const occupancy = boardToUpdate ? boardToUpdate.flat().filter(c => c).length / 64 : 0;
    const isJokerEra = lvl >= 7 || occupancy > 0.78;

    // ── FORÇA MATCH GARANTIDO (Misericórdia) ──
    if (boardToUpdate) {
      const shuffledShapes = [...shapes].sort(() => Math.random() - 0.5);

      for (const shapeTemplate of shuffledShapes) {
        const maxX = Math.max(...shapeTemplate.map(s => s[0]));
        const maxY = Math.max(...shapeTemplate.map(s => s[1]));

        for (let r = 0; r <= 8 - maxX - 1; r++) {
          for (let c = 0; c <= 8 - maxY - 1; c++) {
            // Verifica se cabe
            if (!shapeTemplate.every(([sx, sy]) => {
              const tr = r + sx, tc = c + sy;
              return tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && boardToUpdate[tr][tc] === null;
            })) continue;

            // Simula o placement e verifica se gera match
            const simBoard = boardToUpdate.map(row => [...row]);
            shapeTemplate.forEach(([sx, sy]) => {
              const color = colors[Math.floor(Math.random() * colors.length)];
              simBoard[r + sx][c + sy] = { id: 'sim', color: color as Color, specialty: undefined };
            });

            const matches = findMatches(simBoard);
            if (matches.length > 0) {
              // Gerou match → usa essa peça
              const assigned: any[] = [];
              const isRainbow = isJokerEra && Math.random() < 0.28;

              shapeTemplate.forEach(([sx, sy]) => {
                const color = isRainbow ? 'rainbow' : colors[Math.floor(Math.random() * colors.length)];
                assigned.push({
                  x: sx,
                  y: sy,
                  color: color as Color,
                  specialty: Math.random() < 0.22 ? 'color-clear' : undefined
                });
              });

              return {
                id: Math.random().toString(36).substr(2, 9),
                shape: assigned
              };
            }
          }
        }
      }
    }

    // ── PITY FINAL (caso não encontre) ──
    const shapeTemplate = shapes[Math.floor(Math.random() * shapes.length)];
    const assigned: any[] = [];
    const isRainbow = isJokerEra && Math.random() < 0.40; // mais coringa em fase alta

    shapeTemplate.forEach(([x, y]) => {
      const color = isRainbow ? 'rainbow' : colors[Math.floor(Math.random() * colors.length)];
      assigned.push({
        x,
        y,
        color: color as Color,
        specialty: Math.random() < 0.28 ? 'color-clear' : undefined
      });
    });

    return {
      id: Math.random().toString(36).substr(2, 9),
      shape: assigned
    };
  }, []);

  const startNewGame = useCallback(() => {
    if (cascadeTimeoutRef.current) clearTimeout(cascadeTimeoutRef.current);
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setLevel(1);
    setScore(0);
    setCurrentPieces([generatePiece(1, null, false), generatePiece(1, null, false), generatePiece(1, null, false)]);
    setGameState('playing');
    setRevivedOnce(false);
    setIsClearing(false);
    setClearingCells(new Set());

    setDailyBonusActive(false); // Consome o bônus ao iniciar novo jogo (se vier de um game over)
    
    // Pre-load Intersticial para a próxima troca de fase (Evita LAG)
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false }).catch(() => {});
    }
  }, [generatePiece]);

  useEffect(() => {
    const updateWidth = () => {
      const el = document.getElementById('game-board-inner');
      if (el) setBoardWidth(el.offsetWidth);
    };
    updateWidth();
    const timer = setTimeout(updateWidth, 100); // Garante renderização inicial
    window.addEventListener('resize', updateWidth);
    return () => {
      window.removeEventListener('resize', updateWidth);
      clearTimeout(timer);
    };
  }, []);

  const cellSize = boardWidth / BOARD_SIZE;


  useEffect(() => {
    // ── Resgate de Estado e Limpeza Absoluta ──
    const saved = localStorage.getItem('colorStackPuzzleState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Proteção Crítica: Se o board no cache não for 8x8, limpa TUDO para remover o 4x4 legado
        if (parsed.board && parsed.board.length === 8) {
          setBoard(parsed.board);
          setScore(parsed.score || 0);
          setLevel(parsed.level || 1);
          setCurrentPieces(parsed.currentPieces || []);
        } else {
          localStorage.clear();
          startNewGame();
        }
      } catch (e) {
        localStorage.clear();
        startNewGame();
      }
    } else {
      startNewGame();
    }
    const savedHighScore = localStorage.getItem('colorStackHighScore');
    if (savedHighScore) setHighScore(Number(savedHighScore) || 0);
    
    // Carrega estatísticas e progresso ativo
    const savedStats = localStorage.getItem('colorStackStats');
    if (savedStats) {
      try {
        const parsed = JSON.parse(savedStats);
        if (parsed) setStats(parsed);
      } catch (e) { console.error('Stats load fail'); }
    }
    
    // ── Limpeza de Chaves Legadas (Prevenção de 4x4) ──
    const legacyKeys = ['colorStackLevel', 'colorStackScore', 'colorStackBoard', 'colorStackPieces'];
    legacyKeys.forEach(k => localStorage.removeItem(k));
    
    // Check Daily Reward & Streak
    const lastDaily = localStorage.getItem('colorStackLastDaily');
    const todayStr = new Date().toDateString();
    const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
    const savedStreak = parseInt(localStorage.getItem('colorStackStreak') || '0') || 0;

    if (lastDaily !== todayStr) {
      localStorage.setItem('colorStackLastDaily', todayStr);
      let newStreak = 1;
      if (lastDaily === yesterdayStr) {
        newStreak = savedStreak + 1;
      }
      localStorage.setItem('colorStackStreak', newStreak.toString());
      setStreak(newStreak);
      setShowDailyModal(true);
    } else {
      setStreak(savedStreak);
    }
    
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
          const cloudScore = Number(data.high_score) || 0;
          const cloudLevel = Number(data.max_level) || 1;
          const currentHigh = Number(localStorage.getItem('colorStackHighScore')) || 0;
          const currentLevel = Number(localStorage.getItem('colorStackLevel')) || 1;

          if (cloudScore > currentHigh) {
            setHighScore(cloudScore);
            localStorage.setItem('colorStackHighScore', cloudScore.toString());
          }
          if (cloudLevel > currentLevel) {
            setLevel(cloudLevel);
            localStorage.setItem('colorStackLevel', cloudLevel.toString());
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
          // Delay maior para garantir que a UI nativa carregou totalmente em Androids lentos
          setTimeout(async () => {
            try {
              await AdMob.showBanner({
                adId: AD_UNITS.BANNER,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
                isTesting: false,
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                npa: false,
              });
            } catch (bannerErr) {
              console.log('Banner fail:', bannerErr);
            }
          }, 2500);

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

  useEffect(() => {
    if (showStats) {
      const fetchGlobal = async () => {
        try {
          const { data } = await supabase
            .from('player_stats')
            .select('high_score, max_level')
            .order('high_score', { ascending: false })
            .limit(5);
          if (data) setGlobalTop(data);
        } catch (e) { console.error('Global leaderboard fail:', e); }
      };
      fetchGlobal();
    }
  }, [showStats]);

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
    // Cache de Board para evitar cálculos pesados inúteis
    const boardHash = currentBoard.flat().reduce((acc, cell) => acc + (cell ? cell.color[0] : '0'), '');
    
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
                const colorsMatch = neighborCell?.color === color || neighborCell?.color === 'rainbow' || color === 'rainbow';
                if (neighborCell && colorsMatch) {
                  visited[n.r][n.c] = true;
                  queue.push(n);
                }
              }
            }
          }

          // Otimização: Usa um Set de strings para buscas rápidas (O(1)) dentro do grupo
          const groupSet = new Set<string>();
          group.forEach(p => groupSet.add(`${p.r}-${p.c}`));

          // Sensibilidade do Coringa: Mínimo 3 peças SEMPRE para evitar estalos involuntários de 2 blocos
          const minRequired = 3;

          // Verificamos especialidades no grupo ANTES de explodir
          const hasColorClear = group.some(({r:gr, c:gc}) => currentBoard[gr][gc]?.specialty === 'color-clear');
          const rainbowBlock = group.find(({r:gr, c:gc}) => currentBoard[gr][gc]?.color === 'rainbow');

          if (group.length >= minRequired) {
            // Lógica Rainbow (Estrela): Agora limpa uma Cruz mais balanceada (1 linha + 1 coluna)
            if (rainbowBlock) {
              const { r: jr, c: jc } = rainbowBlock;
              for (let i = 0; i < BOARD_SIZE; i++) {
                const targets = [
                  {r: jr, c: i}, {r: i, c: jc}
                ];
                targets.forEach(t => {
                  if (t.r >= 0 && t.r < BOARD_SIZE && t.c >= 0 && t.c < BOARD_SIZE && currentBoard[t.r][t.c]) {
                    const key = `${t.r}-${t.c}`;
                    if (!groupSet.has(key)) {
                      group.push({r: t.r, c: t.c});
                      groupSet.add(key);
                      visited[t.r][t.c] = true;
                    }
                  }
                });
              }
            }
            
            // Lógica Coringa de Cor (Limpeza Total): Só dispara com 3+ peças
            if (hasColorClear) {
              const targetColor = color;
              if (targetColor !== 'rainbow') { 
                for (let br = 0; br < BOARD_SIZE; br++) {
                  for (let bc = 0; bc < BOARD_SIZE; bc++) {
                    const cell = currentBoard[br][bc];
                    if (cell && cell.color === targetColor) {
                      const key = `${br}-${bc}`;
                      if (!groupSet.has(key)) {
                        group.push({r: br, c: bc});
                        groupSet.add(key);
                        visited[br][bc] = true;
                      }
                    }
                  }
                }
              }
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

  const calculateMatchScore = (groupSize: number, combo: number) => {
    let base = GAME_CONFIG.SCORES.MATCH_3;
    if (groupSize === 4) base = GAME_CONFIG.SCORES.MATCH_4;
    if (groupSize >= 5) base = GAME_CONFIG.SCORES.MATCH_5_PLUS;
    
    // Combo multiplier logic: Score = base * ratio * (multiplier^combo)
    const multiplier = Math.pow(GAME_CONFIG.SCORES.COMBO_MULTIPLIER, combo - 1);
    return Math.round(base * groupSize * multiplier);
  };



  const handlePiecePlacement = useCallback(async (piece: Piece, row: number, col: number, pieceIndex: number) => {
    // Bloqueia imediatamente para evitar cliques simultâneos
    if (isClearing || !canPlacePiece(piece, row, col, board)) {
      const ctx = await getAudio();
      if (ctx) soundError(ctx);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 250);
      return;
    }

    setIsClearing(true);

    // Garante que o AudioContext esteja ativo antes de qualquer som
    const audioCtx = await getAudio();
    if (audioCtx) soundPlace(audioCtx);

    // 1. Cria o novo board localmente
    const activeBoard = board.map(r => [...r]);
    piece.shape.forEach(({ x, y, color, specialty }) => {
      activeBoard[row + x][col + y] = {
        id: Math.random().toString(36).substr(2, 9),
        color,
        specialty
      };
    });

    // Remove a peça usando ID (mais seguro que índice)
    const remainingPieces = currentPieces.filter(p => p.id !== piece.id);

    // 2. Atualiza o estado imediatamente
    setBoard(activeBoard);
    setCurrentPieces(remainingPieces);
    setDraggedPiece(null);

    // Auto-seleciona a próxima peça (melhora o fluxo)
    if (remainingPieces.length > 0) {
      setSelectedPiece({ piece: remainingPieces[0], index: 0 });
    } else {
      setSelectedPiece(null);
    }

    // 3. Processa matches e cascatas
    const runMatchCycle = async (currentBoard: BoardCell[][], currentScore: number, currentLevel: number, combo: number) => {
      const matchGroups = findMatches(currentBoard);

      if (matchGroups.length > 0) {
        const toFlash = new Set<string>();
        const newFloatingPoints: { id: string; r: number; c: number; points: number }[] = [];
        let iterationScore = 0;

        matchGroups.forEach(group => {
          const groupScore = calculateMatchScore(group.length, combo);
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
          if (firstColor) {
            (window as any).triggerPixiExplosion?.(group, firstColor);
          }
        });

        setClearingCells(toFlash);
        setFloatingPoints(prev => [...prev, ...newFloatingPoints]);
        setIsShaking(true);

        const shakeDuration = (combo > 1 || matchGroups.flat().length >= 5) ? 550 : 300;
        setTimeout(() => setIsShaking(false), shakeDuration);

        const totalMatched = matchGroups.reduce((acc, g) => acc + g.length, 0);

        // ====================== SOM DOS COMBOS ======================
        const audioCtx = await getAudio();   // Garante áudio antes de tocar

        if (combo > 1) {
          setComboText(`COMBO X${combo}! 🔥`);
          if (audioCtx) soundAmazing(audioCtx);
          speak(`Combo ${combo}`);
        } else if (totalMatched >= 5) {
          setComboText('AMAZING! 🔥');
          if (audioCtx) soundAmazing(audioCtx);
          speak('Amazing');
        } else if (totalMatched >= 4) {
          setComboText('GREAT! ⭐');
          if (audioCtx) soundGreat(audioCtx);
          speak('Great');
        } else {
          setComboText('CLEAR!');
          if (audioCtx) soundClear(audioCtx);
        }

        setTimeout(() => setComboText(null), 1000);

        // Fase de Gravidade + Cascata
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

          const nextLevel = Math.max(currentLevel, Math.floor(nextScore / GAME_CONFIG.LEVEL_SCORE_INTERVAL) + 1);
          const finalBoard = boardAfterGravity;

          setClearingCells(new Set());
          setBoard(() => [...finalBoard]);
          setScore(nextScore);

          const idsToClean = new Set(newFloatingPoints.map(np => np.id));
          setTimeout(() => {
            setFloatingPoints(prev => prev.filter(p => !idsToClean.has(p.id)));
          }, 800);

          if (cascadeTimeoutRef.current) clearTimeout(cascadeTimeoutRef.current);
          cascadeTimeoutRef.current = setTimeout(
            () => runMatchCycle(finalBoard, nextScore, nextLevel, combo + 1),
            GAME_CONFIG.CASCADE_DELAY
          );
        }, GAME_CONFIG.FLASH_DELAY);

      } else {
        // Sem mais matches → finaliza rodada
        setIsClearing(false);

        let actualBoard = currentBoard.map(row => [...row]);

        if (currentLevel > level) {
          const newColors = getAvailableColors(currentLevel);
          actualBoard = actualBoard.map(row =>
            row.map(cell => {
              if (!cell) return null;
              if (Math.random() >= GAME_CONFIG.LEVEL_UP_SURVIVAL_RATE) return null;
              return { ...cell, color: newColors[Math.floor(Math.random() * newColors.length)] };
            })
          );

          const audioCtx = await getAudio();
          if (audioCtx) soundLevelUp(audioCtx);
        }

        let finalPieces: Piece[];
        if (remainingPieces.length === 0) {
          const occupancy = actualBoard.flat().filter(c => c).length / (BOARD_SIZE * BOARD_SIZE);
          const simBoard = actualBoard.map(row => [...row]);

          const p1Match = occupancy > GAME_CONFIG.OCCUPANCY_STRATEGIES.MATCH_P1;
          const p2Match = occupancy > GAME_CONFIG.OCCUPANCY_STRATEGIES.MATCH_P2;
          const p3Match = occupancy > GAME_CONFIG.OCCUPANCY_STRATEGIES.MATCH_P3;

          const pieces: Piece[] = [
            generatePiece(currentLevel, simBoard, p1Match),
            generatePiece(currentLevel, simBoard, p2Match),
            generatePiece(currentLevel, simBoard, p3Match)
          ];
          finalPieces = pieces.sort(() => Math.random() - 0.5);
        } else {
          finalPieces = remainingPieces;
        }

        setBoard(() => [...actualBoard]);
        setScore(currentScore);
        setCurrentPieces(() => [...finalPieces]);

        if (currentLevel > level) {
          const audioCtx = await getAudio();
          if (audioCtx) soundLevelUp(audioCtx);

          setLevel(currentLevel);
          setGameState('levelup');

          const showPhaseAd = async () => {
            const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
            if (isNative) {
              try {
                await AdMob.showInterstitial();
                AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting: false }).catch(() => {});
              } catch (e) {
                console.error('Phase Ad fail', e);
              }
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
            const audioCtx = await getAudio();
            if (audioCtx) soundGameOver(audioCtx);
            setGameState('gameover');
            updateStats(currentScore, currentLevel);
          }
        }
      }
    };

    // Inicia o ciclo de matches
    setTimeout(() => runMatchCycle(activeBoard, score, level, 1), 50);

  }, [
    isClearing,
    canPlacePiece,
    board,
    currentPieces,
    score,
    level,
    checkGameOver,
    generatePiece,
    updateStats,
    getAudio
  ]);


  const performRevive = useCallback(async () => {
    // 1. Limpa peças aleatoriamente (Libera espaço)
    const newBoard = board.map(row => row.map(cell => {
      return (cell && Math.random() < 0.5) ? null : cell;
    }));
    
    // 2. Garante 3 novas peças que caibam (Smarter pieces)
    const pieces: Piece[] = [
      generatePiece(level, newBoard, true),
      generatePiece(level, newBoard, true),
      generatePiece(level, newBoard, true)
    ];

    setBoard(newBoard);
    setCurrentPieces(pieces);
    setGameState('playing');
    setRevivedOnce(true);
    const audioCtx = await getAudio();
    if (audioCtx) soundLevelUp(audioCtx);
    speak('Revived! Good luck.');
  }, [board, level, generatePiece, getAudio]);

  const handleRevive = async () => {
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    await getAudio();

    if (isNative) {
      try {
        await AdMob.prepareRewardVideoAd({ adId: AD_UNITS.REWARDED, isTesting: false });
        await AdMob.showRewardVideoAd();
        
        const listener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          listener.remove();
          performRevive();
        });
      } catch (err) {
        console.error('Revive fail:', err);
        const audioCtx = await getAudio();
        if (audioCtx) soundError(audioCtx);
      }
    } else {
      // Browser logic: Fake ad 1.5s
      setGameState('ad');
      setTimeout(() => {
        performRevive();
      }, 1500);
    }
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

  const handleCellClick = useCallback(async (row: number, col: number) => {
    if (isClearing || gameState !== 'playing') return;
    
    // Resume audio context on interaction
    const ctx = await getAudio();
    
    if (board[row][col]) {
      if (ctx) soundError(ctx);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 300);
      return;
    }
    if (selectedPiece && !isClearing && gameState === 'playing') {
      const fb = selectedPiece.piece.shape[0];
      handlePiecePlacement(selectedPiece.piece, row - fb.x, col - fb.y, selectedPiece.index);
    }
  }, [board, isClearing, gameState, selectedPiece, handlePiecePlacement]);

  const onCellClick = useCallback((r: number, c: number) => {
    handleCellClick(r, c);
  }, [handleCellClick]);

  const onCellHover = useCallback((r: number, c: number) => {
    setHoverCellFast({ r, c });
  }, [setHoverCellFast]);

  const onCellDrop = useCallback((r: number, c: number) => {
    setHoverCell(null);
    if (draggedPiece) {
      const fb = draggedPiece.piece.shape[0];
      handlePiecePlacement(draggedPiece.piece, r - fb.x, c - fb.y, draggedPiece.index);
    }
  }, [draggedPiece, handlePiecePlacement]);

  const handlePieceClick = (piece: Piece, index: number) => {
    setSelectedPiece(selectedPiece?.index === index ? null : { piece, index });
  };

  const showHint = useCallback(() => {
    if (isClearing || gameState !== 'playing' || currentPieces.length === 0) return;

    for (let i = 0; i < currentPieces.length; i++) {
      const piece = currentPieces[i];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (canPlacePiece(piece, r, c, board)) {
            // Simula o match
            const simBoard = board.map(row => [...row]);
            piece.shape.forEach(({ x, y, color }) => {
              simBoard[r + x][c + y] = { id: 'hint', color: color as Color, specialty: undefined };
            });
            if (findMatches(simBoard).length > 0) {
              setHintPosition({ r, c, pieceIndex: i });
              // Remove o hint automaticamente depois de 4 segundos
              setTimeout(() => setHintPosition(null), 4000);
              return;
            }
          }
        }
      }
    }
  }, [board, currentPieces, canPlacePiece, isClearing, gameState]);

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
  const safeScore = Number(score) || 0;
  const safeLevel = Number(level) || 1;
  const levelProgress = Math.max(0, Math.min((safeScore - (safeLevel - 1) * GAME_CONFIG.LEVEL_SCORE_INTERVAL) / GAME_CONFIG.LEVEL_SCORE_INTERVAL, 1)) || 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black overflow-hidden font-sans pt-8 pb-12">

      {/* UI Layers above the board */}

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
                onClick={async () => {
                  await getAudio();
                  const hasProgress = currentPieces.length > 0 && (score > 0 || board.some(row => row.some(cell => cell !== null)));
                  if (hasProgress) {
                    setIsClearing(false); // Destrava qualquer lock de animação ao voltar
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
                {level >= 11 ? '13 cores ativas! 💎' : level >= 9 ? '12 cores ativas 🌈' : level >= 7 ? '10 cores ativas 🌸' : level >= 5 ? '8 cores ativas 🟠' : level >= 3 ? '6 cores ativas 🟣' : '4 cores ativas'}
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
      <div className="w-full max-w-md flex justify-between items-start mb-4 px-1 pt-2">
        {/* Card de FASE (Lado Esquerdo) */}
        <div className="relative group">
          <div className={`absolute -inset-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000`}></div>
          <div className="relative glass px-3 py-1.5 rounded-xl flex flex-col items-start border border-white/10 shadow-2xl min-w-[110px]">
            <span className={`text-[9px] uppercase tracking-[0.2em] font-black mb-0.5 ${levelColor}`}>FASE</span>
            <div className="flex items-baseline gap-2">
              <motion.span 
                key={level}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-2xl font-display font-black text-white leading-none"
              >
                {level}
              </motion.span>
              <div className="text-[9px] text-zinc-500 font-bold uppercase">MAX: {stats.maxLevel}</div>
            </div>
          </div>
        </div>

        {/* Card de SCORE (Lado Direito) */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-sky-600 to-violet-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative glass px-4 py-1.5 rounded-xl flex flex-col items-end border border-white/10 shadow-2xl min-w-[110px]">
            <span className="text-[9px] uppercase tracking-[0.2em] text-sky-400/80 font-black mb-0.5 text-right w-full">SCORE</span>
            <div className="flex flex-col items-end">
              <motion.span 
                key={score}
                initial={{ scale: 1.2, color: '#38bdf8' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="text-2xl font-display font-black text-white leading-none"
              >
                {score}
              </motion.span>
              <div className="text-[9px] text-zinc-500 font-bold uppercase">BEST: {highScore}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de progresso do nível */}
      <div className="w-full max-w-md mb-8">
        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 px-1">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${levelColor} shadow-[0_0_8px_currentColor]`}></div>
            <span className={levelColor}>FASE {level}</span>
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
          className={`bg-gradient-to-b ${getBoardBackgroundColor(level)} p-3 rounded-[2rem] shadow-2xl border border-white/10`}
        >
          <div
            id="game-board-inner"
            ref={(el) => {
              if (el && boardWidth !== el.offsetWidth) {
                setBoardWidth(el.offsetWidth);
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const r = Math.floor((e.clientY - rect.top) / cellSize);
              const c = Math.floor((e.clientX - rect.left) / cellSize);
              if (r >= 0 && r < 8 && c >= 0 && c < 8) setHoverCellFast({ r, c });
              else setHoverCellFast(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedPiece) {
                const rect = e.currentTarget.getBoundingClientRect();
                const r = Math.floor((e.clientY - rect.top) / cellSize);
                const c = Math.floor((e.clientX - rect.left) / cellSize);
                const fb = draggedPiece.piece.shape[0];
                handlePiecePlacement(draggedPiece.piece, r - fb.x, c - fb.y, draggedPiece.index);
              }
              setDraggedPiece(null);
              setHoverCellFast(null);
            }}
            className="flex items-center justify-center overflow-hidden rounded-[1.8rem] relative"
            style={{
              width: 'min(78vw, 300px)',
              height: 'min(78vw, 300px)',
            }}
          >
            <PixiBoard
              board={board}
              containerWidth={Math.min(boardWidth, 300)} // Limita a 300 para manter peças proporcionais
              hoverCell={hoverCell}
              draggedPiece={draggedPiece}
              selectedPiece={selectedPiece}
              clearingCells={clearingCells}
              floatingPoints={floatingPoints}
              hintPosition={hintPosition}
              onCellClick={onCellClick}
              onExplosion={(group, color) => {
                // O PixiBoard já dispara as partículas internamente
              }}
            />

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
              <p className="text-fuchsia-500 font-bold text-sm mb-6">FASE {level} CONCLUÍDA</p>
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button
                  onClick={showAdAndRestart}
                  className="bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-sky-500/30"
                >
                  <RotateCcw className="w-5 h-5" />
                  Jogar de Novo
                </button>

                {!revivedOnce && (
                  <button
                    onClick={handleRevive}
                    className="bg-gradient-to-r from-amber-400 to-orange-600 hover:from-amber-300 hover:to-orange-500 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-500/30 border border-white/20"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    Reviver (Ad)
                  </button>
                )}

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
      <div className="mt-4 flex gap-3 sm:gap-6 justify-center items-center h-28">
        {currentPieces.map((piece, idx) => (
          <PieceItem 
            key={piece.id} 
            piece={piece} 
            idx={idx} 
            board={board} 
            isClearing={isClearing}
            selectedPieceIndex={selectedPiece?.index}
            gameState={gameState}
            onPieceClick={handlePieceClick}
            setDraggedPiece={setDraggedPiece}
            setSelectedPiece={setSelectedPiece}
            setTouchFloatPos={setTouchFloatPos}
            setHoverCellFast={setHoverCellFast}
            handlePiecePlacement={handlePiecePlacement}
            canPlacePiece={canPlacePiece}
            cellSize={cellSize}
            touchDragRef={touchDragRef}
            touchFloatRef={touchFloatRef}
            checkGameOver={checkGameOver}
          />
        ))}
      </div>
      


      {/* ─── FOOTER CONTROLS ─── */}
      <div className="mt-auto w-full max-w-md flex justify-around p-3 text-zinc-500 pb-4">
        <button onClick={() => setShowInfo(true)} className="hover:text-white transition-colors"><Info className="w-5 h-5" /></button>
        <button onClick={() => setShowStats(true)} className="hover:text-white transition-colors"><BarChart2 className="w-5 h-5" /></button>
        
        {/* Botão de Hint */}
        <button 
          onClick={showHint}
          className="hover:text-amber-400 transition-colors flex items-center gap-1"
          title="Mostrar dica"
        >
          <span className="text-amber-400">💡</span>
        </button>

        <button onClick={() => setSoundEnabled(v => !v)} className={`transition-colors ${soundEnabled ? 'text-sky-400' : 'text-zinc-600'}`}>
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
        <button onClick={() => {
          setIsClearing(false);
          if (cascadeTimeoutRef.current) clearTimeout(cascadeTimeoutRef.current);
          setGameState('menu');
        }} className="hover:text-white transition-colors"><RotateCcw className="w-5 h-5" /></button>
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

              <div className="mt-8 border-t border-white/5 pt-6">
                <h4 className="text-xs uppercase tracking-[0.2em] text-zinc-600 font-black mb-4 flex items-center gap-2">
                  <Trophy className="w-3 h-3" />
                  Global Top 5
                </h4>
                <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
                  {globalTop.length > 0 ? (
                    globalTop.map((player, i) => (
                      <div key={i} className="flex justify-between items-center text-sm font-display">
                        <div className="flex items-center gap-3">
                          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black ${i === 0 ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                            {i + 1}
                          </span>
                          <span className="text-zinc-300 font-bold uppercase tracking-widest text-[9px]">Player</span>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-black">{player.high_score.toLocaleString()} <span className="text-sky-400">pts</span></div>
                          <div className="text-[9px] text-zinc-600 font-bold">FASE {player.max_level}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-zinc-700 py-4 italic text-xs">Conectando ao ranking...</div>
                  )}
                </div>
              </div>

              <button onClick={() => setShowStats(false)} className="w-full mt-8 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors">Fechar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Daily Reward Modal */}
        <AnimatePresence>
          {showDailyModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }}
                className="bg-zinc-900 border border-amber-500/30 p-8 rounded-[2.5rem] max-w-xs w-full text-center shadow-[0_0_50px_rgba(245,158,11,0.2)]"
              >
                <div className="w-16 h-16 bg-amber-500/20 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <Star className="w-10 h-10 text-amber-500 fill-current" />
                </div>
                <h3 className="text-2xl font-display font-black text-white mb-2 uppercase italic tracking-tighter">Bônus Diário!</h3>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                  Dia {streak} do seu streak! <br/>
                  <span className="text-amber-400 font-bold">SORTE ATIVADA:</span> Mais chances de Coringas e Rainbows na primeira partida de hoje!
                </p>
                <button
                  onClick={() => {
                    setShowDailyModal(false);
                    setDailyBonusActive(true);
                  }}
                  className="w-full bg-gradient-to-r from-amber-400 to-orange-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-orange-600/20 active:scale-95 transition-all"
                >
                  COLETAR SORTE
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
}
