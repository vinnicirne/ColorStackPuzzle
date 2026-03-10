/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Play, Info, BarChart2, Star, Volume2, VolumeX } from 'lucide-react';
import { Color, BoardCell, Piece } from './types';
import { AdMob, InterstitialAdPluginEvents } from '@capacitor-community/admob';

const BOARD_SIZE = 8;
const BASE_COLORS: Color[] = ['red', 'blue', 'green', 'yellow', 'purple'];

// Shapes desbloqueadas por nível
const SHAPES_BY_LEVEL = [
  // Nível 1-2: formas simples
  [
    [[0, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
  ],
  // Nível 3-4: formas médias
  [
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [1, 1]],
  ],
  // Nível 5+: formas avançadas
  [
    [[0, 0], [0, 1], [0, 2], [1, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
];

const COLOR_MAP: Record<Color, string> = {
  red: 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.4)]',
  blue: 'bg-gradient-to-br from-sky-300 to-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.4)]',
  green: 'bg-gradient-to-br from-lime-300 to-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]',
  yellow: 'bg-gradient-to-br from-yellow-200 to-amber-500 shadow-[0_0_15px_rgba(251,191,36,0.4)]',
  purple: 'bg-gradient-to-br from-fuchsia-400 to-purple-600 shadow-[0_0_15px_rgba(139,92,246,0.4)]',
  orange: 'bg-gradient-to-br from-orange-300 to-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.4)]',
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


  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchDragRef = useRef<{ piece: Piece; index: number; targetR: number; targetC: number } | null>(null);
  const touchFloatRef = useRef<HTMLDivElement | null>(null);
  // Ref para evitar setHoverCell redundante quando o dedo/cursor não mudou de célula
  const hoverCellRef = useRef<{ r: number; c: number } | null>(null);
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

  const generatePiece = useCallback((lvl: number = 1): Piece => {
    const shapes = getAvailableShapes(lvl);
    const colors = getAvailableColors(lvl);
    const shapeTemplate = shapes[Math.floor(Math.random() * shapes.length)];
    // Atribui cores evitando que blocos adjacentes na mesma peça tenham a mesma cor
    // Isso previne auto-combinações (self-match) ao soltar a peça no tabuleiro
    const assigned: { x: number; y: number; color: Color }[] = [];
    for (const [x, y] of shapeTemplate) {
      const neighborColors = new Set(
        assigned
          .filter(b => Math.abs(b.x - x) + Math.abs(b.y - y) === 1)
          .map(b => b.color)
      );
      const available = colors.filter(c => !neighborColors.has(c));
      const pool = available.length > 0 ? available : colors;
      const color = pool[Math.floor(Math.random() * pool.length)];
      assigned.push({ x, y, color });
    }
    return {
      id: Math.random().toString(36).substr(2, 9),
      shape: assigned,
    };
  }, []);

  const startNewGame = useCallback(() => {
    setBoard(Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)));
    setLevel(1);
    setScore(0);
    setCurrentPieces([generatePiece(1), generatePiece(1), generatePiece(1)]);
    setGameState('playing');
    setIsClearing(false);
    setSelectedPiece(null);
    setClearingCells(new Set());
    setParticles([]);
  }, [generatePiece]);

  useEffect(() => {
    const savedHighScore = localStorage.getItem('colorStackHighScore');
    if (savedHighScore) setHighScore(parseInt(savedHighScore));
    const savedStats = localStorage.getItem('colorStackStats');
    if (savedStats) setStats(JSON.parse(savedStats));
  }, []);

  const updateStats = useCallback((finalScore: number, finalLevel: number) => {
    setStats(prev => {
      const newStats = {
        gamesPlayed: prev.gamesPlayed + 1,
        totalScore: prev.totalScore + finalScore,
        maxLevel: Math.max(prev.maxLevel, finalLevel),
      };
      localStorage.setItem('colorStackStats', JSON.stringify(newStats));
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
              if (n.r >= 0 && n.r < BOARD_SIZE && n.c >= 0 && n.c < BOARD_SIZE &&
                !visited[n.r][n.c] && currentBoard[n.r][n.c]?.color === color) {
                visited[n.r][n.c] = true;
                queue.push(n);
              }
            }
          }
          if (group.length >= 3) matchGroups.push(group);
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
    const cellSize = Math.min(window.innerWidth * 0.9, 400) / BOARD_SIZE;
    const boardLeft = (window.innerWidth - Math.min(window.innerWidth * 0.9, 400)) / 2;
    const boardTop = 140; // estimativa

    const newParticles: Particle[] = [];
    const center = group[Math.floor(group.length / 2)];
    const cx = boardLeft + center.c * cellSize + cellSize / 2;
    const cy = boardTop + center.r * cellSize + cellSize / 2;

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      newParticles.push({
        id: Math.random().toString(36).substr(2, 9),
        x: cx,
        y: cy,
        color,
        dx: Math.cos(angle) * (30 + Math.random() * 40),
        dy: Math.sin(angle) * (30 + Math.random() * 40),
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
    }, 600);
  }, []);

  const PARTICLE_COLOR_MAP: Record<Color, string> = {
    red: '#fb7185',
    blue: '#38bdf8',
    green: '#4ade80',
    yellow: '#fbbf24',
    purple: '#c084fc',
    orange: '#fb923c',
  };

  const handlePiecePlacement = async (piece: Piece, row: number, col: number, pieceIndex: number) => {
    // Bloqueia se já estiver processando ou se a posição for inválida
    if (isClearing || !canPlacePiece(piece, row, col, board)) return;

    const ctx = await getAudio();
    if (ctx) soundPlace(ctx);

    // 1. Coloca a peça no board
    let activeBoard = board.map(r => [...r]);
    piece.shape.forEach(({ x, y, color }) => {
      activeBoard[row + x][col + y] = { id: Math.random().toString(36).substr(2, 9), color };
    });

    const remainingPieces = currentPieces.filter((_, i) => i !== pieceIndex);

    // Função interna para rodar os ciclos de explosão/gravidade (Combo System)
    const runMatchCycle = (currentBoard: BoardCell[][], currentScore: number, currentLevel: number, combo: number) => {
      const matchGroups = findMatches(currentBoard);

      if (matchGroups.length > 0) {
        setIsClearing(true);
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

        // Efeito visual e sonoro de match
        setClearingCells(toFlash);
        setFloatingPoints(prev => [...prev, ...newFloatingPoints]);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 300);
        if (ctx) soundClear(ctx);

        if (combo > 1) setComboText(`COMBO X${combo}! 🔥`);
        else {
          const totalMatched = matchGroups.reduce((acc, g) => acc + g.length, 0);
          if (totalMatched > 5) setComboText('AMAZING! 🔥');
          else if (totalMatched > 3) setComboText('GREAT! ⭐');
          else setComboText('CLEAR!');
        }
        
        setTimeout(() => setComboText(null), 1000);

        // Fase 2: Remover peças e aplicar gravidade
        setTimeout(() => {
          const tempBoard = currentBoard.map(r => [...r]);
          matchGroups.forEach(group => {
            group.forEach(({ r, c }) => { tempBoard[r][c] = null; });
          });
          
          const { newBoard: boardAfterGravity } = applyGravity(tempBoard);
          const nextScore = currentScore + iterationScore;

          // Atualiza scores e High Score
          if (nextScore > highScore) {
            setHighScore(nextScore);
            localStorage.setItem('colorStackHighScore', nextScore.toString());
          }

          const nextLevel = Math.floor(nextScore / levelThreshold(currentLevel)) >= 1 
            ? currentLevel + 1 
            : currentLevel;

          setClearingCells(new Set());
          setBoard(boardAfterGravity);
          setScore(nextScore);

          setTimeout(() => {
            setFloatingPoints(prev => prev.filter(p => !newFloatingPoints.find(np => np.id === p.id)));
          }, 800);

          // Chamada RECURSIVA para checar se a queda gerou novos matches
          // Usamos um delay curto (100ms) para as peças "assentarem" visualmente
          setTimeout(() => {
            runMatchCycle(boardAfterGravity, nextScore, nextLevel, combo + 1);
          }, 150); 
        }, 350); // Flash de explosão ligeiramente mais rápido (era 400)

      } else {
        // Fim da cadeia de combos
        setIsClearing(false);
        const finalPieces = remainingPieces.length === 0
          ? [generatePiece(currentLevel), generatePiece(currentLevel), generatePiece(currentLevel)]
          : remainingPieces;

        // Atualiza o estado final
        setBoard(currentBoard);
        setScore(currentScore);
        setCurrentPieces(finalPieces);
        setSelectedPiece(null);
        setDraggedPiece(null);

        // Se subiu de nível, processa agora
        if (currentLevel > level) {
          if (ctx) soundLevelUp(ctx);
          setLevel(currentLevel);
          setGameState('levelup');
          setPendingAfterLevel(() => () => {
            setGameState('playing');
            if (checkGameOver(finalPieces, currentBoard)) {
              setGameState('gameover');
              updateStats(currentScore, currentLevel);
            }
          });
        } else {
          // Se não subiu de nível, apenas verifica Game Over
          if (checkGameOver(finalPieces, currentBoard)) {
            if (ctx) soundGameOver(ctx);
            setGameState('gameover');
            updateStats(currentScore, currentLevel);
          }
        }
      }
    };

    // Inicia o ciclo
    runMatchCycle(activeBoard, score, level, 1);
  };

  const showAdAndRestart = async () => {
    const AD_UNIT_ID = 'ca-app-pub-2871403878275209/9050607747';
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

    if (isNative) {
      try {
        await AdMob.initialize({ initializeForTesting: false });
        await AdMob.prepareInterstitial({ adId: AD_UNIT_ID });
        await AdMob.showInterstitial();
        // Escuta o evento de fechamento do anúncio para reiniciar
        AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
          startNewGame();
        });
      } catch {
        // Se falhar (sem conectividade, etc.), reinicia direto
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
      const fb = [...selectedPiece.piece.shape].sort((a, b) => a.x - b.x || a.y - b.y)[0];
      handlePiecePlacement(selectedPiece.piece, row - fb.x, col - fb.y, selectedPiece.index);
    }
  };

  const handlePieceClick = (piece: Piece, index: number) => {
    setSelectedPiece(selectedPiece?.index === index ? null : { piece, index });
  };

  const levelColor = LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];
  const levelProgress = Math.min((score - (level - 1) * 300) / 300, 1);

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
        const CELL = 32;
        const fb = [...draggedPiece.piece.shape].sort((a, b) => a.x - b.x || a.y - b.y)[0];
        return (
          <div
            ref={touchFloatRef}
            style={{
              position: 'fixed',
              left: touchFloatPos.x - (fb.y * CELL + CELL / 2),
              top: touchFloatPos.y - (fb.x * CELL + CELL / 2),
              pointerEvents: 'none',
              zIndex: 999,
              opacity: 0.85,
              transform: 'scale(1.15)',
            }}
          >
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}
            >
              {Array.from({ length: 9 }).map((_, i) => {
                const gr = Math.floor(i / 3);
                const gc = i % 3;
                const block = draggedPiece.piece.shape.find(b => b.x === gr && b.y === gc);
                return (
                  <div
                    key={i}
                    className={`w-7 h-7 rounded-md ${
                      block ? `${COLOR_MAP[block.color]} block-shadow` : ''
                    }`}
                  />
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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 p-6"
          >
            <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center mb-12">
              <h1 className="text-6xl font-display font-black text-white mb-2 tracking-tighter">
                COLOR <span className="text-sky-500">STACK</span>
              </h1>
              <p className="text-zinc-500 font-medium tracking-widest uppercase text-sm">Casual Puzzle Experience</p>
            </motion.div>

            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button
                onClick={startNewGame}
                className="bg-sky-500 hover:bg-sky-400 text-white py-5 rounded-3xl font-display font-bold text-xl transition-all active:scale-95 shadow-xl shadow-sky-500/20 flex items-center justify-center gap-3"
              >
                <Play className="w-6 h-6 fill-current" />
                JOGAR
              </button>
              <button
                onClick={() => setShowStats(true)}
                className="bg-zinc-900 hover:bg-zinc-800 text-white py-4 rounded-3xl font-bold transition-all active:scale-95 border border-white/5 flex items-center justify-center gap-3"
              >
                <BarChart2 className="w-5 h-5" />
                ESTATÍSTICAS
              </button>
              <button
                onClick={() => setShowInfo(true)}
                className="bg-zinc-900 hover:bg-zinc-800 text-white py-4 rounded-3xl font-bold transition-all active:scale-95 border border-white/5 flex items-center justify-center gap-3"
              >
                <Info className="w-5 h-5" />
                COMO JOGAR
              </button>
            </div>

            <div className="mt-12 text-zinc-600 text-xs flex items-center gap-2">
              <Trophy className="w-3 h-3" />
              MELHOR: {highScore} pts
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
                className={`bg-sky-500 hover:bg-sky-400 text-white px-10 py-4 rounded-2xl font-display font-bold text-xl transition-all active:scale-95 shadow-xl`}
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

      {/* ─── HEADER ─── */}
      <div className="w-full max-w-md flex justify-between items-end mb-6">
        <div className="flex flex-col">
          <h1 className="text-4xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-sky-400 to-sky-600 tracking-tighter leading-none mb-1">
            Color Stack
          </h1>
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold px-1">
            <Trophy className="w-3.5 h-3.5 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
            <span className="opacity-80">BEST: {highScore}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="relative group">
            {/* Glow effect behind score */}
            <div className="absolute -inset-1 bg-gradient-to-r from-sky-600 to-violet-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative glass px-6 py-2 rounded-2xl flex flex-col items-center border border-white/10 shadow-2xl">
              <span className="text-[10px] uppercase tracking-[0.2em] text-sky-400/80 font-black mb-0.5">SCORE</span>
              <motion.span 
                key={score}
                initial={{ scale: 1.2, color: '#38bdf8' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="text-3xl font-display font-black text-white leading-none"
              >
                {score}
              </motion.span>
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
          animate={{
            scale: isClearing ? [1, 1.01, 1] : 1,
            x: isShaking ? [0, -3, 3, -3, 3, 0] : 0,
            y: isShaking ? [0, 2, -2, 2, -2, 0] : 0,
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
                  whileTap={{ scale: 0.92 }}
                  className={(() => {
                    const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;
                    // Ancora no primeiro bloco visível (leitura: cima->baixo, esq->dir)
                    // Garante que o cursor fica SOBRE um bloco real, não sobre espaço vazio
                    const firstBlock = activePiece
                      ? [...activePiece.shape].sort((a, b) => a.x - b.x || a.y - b.y)[0]
                      : { x: 0, y: 0 };
                    const anchorR = hoverCell ? hoverCell.r - firstBlock.x : -1;
                    const anchorC = hoverCell ? hoverCell.c - firstBlock.y : -1;
                    const isGhost = activePiece && hoverCell &&
                      activePiece.shape.some(({ x, y }) => anchorR + x === r && anchorC + y === c);
                    const ghostFits = isGhost && canPlacePiece(activePiece!, anchorR, anchorC, board);
                    const ghostBlocked = isGhost && !ghostFits;
                    return [
                      'relative rounded-lg aspect-square cursor-pointer',
                      cell ? '' : 'bg-zinc-800/50 hover:bg-zinc-700/50',
                      clearingCells.has(`${r}-${c}`) ? 'scale-110 brightness-200' : '',
                      ghostFits ? 'bg-emerald-500/30 ring-2 ring-emerald-400/60 ring-inset' : '',
                      ghostBlocked ? 'bg-rose-500/30 ring-2 ring-rose-400/60 ring-inset' : '',
                    ].join(' ');
                  })()}
                  onClick={() => handleCellClick(r, c)}
                  onMouseEnter={() => setHoverCellFast({ r, c })}
                  onDragOver={(e) => { e.preventDefault(); setHoverCellFast({ r, c }); }}
                  onDrop={() => {
                    setHoverCell(null);
                    if (draggedPiece) {
                      const fb = [...draggedPiece.piece.shape].sort((a, b) => a.x - b.x || a.y - b.y)[0];
                      handlePiecePlacement(draggedPiece.piece, r - fb.x, c - fb.y, draggedPiece.index);
                    }
                  }}
                >
                  <AnimatePresence>
                    {cell && (
                      <motion.div
                        key={cell.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0, rotate: 45 }}
                        className={`absolute inset-0 rounded-lg ${COLOR_MAP[cell.color]} relative overflow-hidden`}
                      >
                        {/* Brilho Glossy estilo Candy Crush */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none" />
                        <div className="absolute top-[10%] left-[10%] w-[40%] h-[25%] bg-white/40 rounded-full blur-[1px] pointer-events-none" />
                        <div className="absolute bottom-[5%] right-[5%] w-[20%] h-[20%] bg-black/10 rounded-full pointer-events-none" />
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
        <AnimatePresence>
          {comboText && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.5 }}
              animate={{ opacity: 1, y: -40, scale: 1.5 }}
              exit={{ opacity: 0, scale: 2 }}
              className="absolute inset-x-0 top-1/2 text-center pointer-events-none z-20"
            >
              <span className="text-3xl font-display font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] italic">
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
              className="absolute inset-0 z-10 flex flex-col items-center justify-center glass rounded-3xl"
            >
              <h2 className="text-4xl font-display font-bold text-white mb-1">Game Over</h2>
              <p className="text-zinc-400 mb-1">Score: {score} pts</p>
              <p className="text-zinc-500 text-sm mb-6">Fase {level} concluída</p>
              <button
                onClick={showAdAndRestart}
                className="bg-sky-500 hover:bg-sky-400 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-sky-500/20"
              >
                <RotateCcw className="w-5 h-5" />
                Jogar de Novo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── PEÇAS ─── */}
      <div className="mt-8 flex gap-4 sm:gap-8 justify-center items-center h-32">
        {currentPieces.map((piece, idx) => {
          const canPlace = board.some((row, r) => row.some((_, c) => canPlacePiece(piece, r, c, board)));
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
                setTouchFloatPos({ x: touch.clientX, y: touch.clientY });
                touchDragRef.current = { piece, index: idx, targetR: -1, targetC: -1 };
              }}
              onTouchMove={(e) => {
                if (!touchDragRef.current) return;
                e.preventDefault();
                const touch = e.touches[0];
                // Atualiza a posição do float DIRETO no DOM — sem setState — zero lag
                if (touchFloatRef.current) {
                  const CELL = 32;
                  const fb = [...touchDragRef.current!.piece.shape].sort((a, b) => a.x - b.x || a.y - b.y)[0];
                  touchFloatRef.current.style.left = `${touch.clientX - (fb.y * CELL + CELL / 2)}px`;
                  touchFloatRef.current.style.top  = `${touch.clientY - (fb.x * CELL + CELL / 2)}px`;
                }
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
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
                  const fb = [...state.piece.shape].sort((a, b) => a.x - b.x || a.y - b.y)[0];
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
                style={{ gridTemplateColumns: `repeat(3, 1fr)`, gridTemplateRows: `repeat(3, 1fr)` }}
              >
                {Array.from({ length: 9 }).map((_, i) => {
                  const r = Math.floor(i / 3);
                  const c = i % 3;
                  const block = piece.shape.find(b => b.x === r && b.y === c);
                  return (
                    <div
                      key={i}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md ${
                        block ? `${COLOR_MAP[block.color]} block-shadow` : 'bg-transparent'
                      }`}
                    />
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
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-2xl font-display font-bold text-white mb-4">Como Jogar</h3>
              <ul className="space-y-4 text-zinc-400">
                <li className="flex gap-3">
                  <span className="bg-sky-500/20 text-sky-500 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">1</span>
                  <p>Clique em uma peça para selecioná-la, depois clique no tabuleiro para colocar.</p>
                </li>
                <li className="flex gap-3">
                  <span className="bg-sky-500/20 text-sky-500 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">2</span>
                  <p>Junte <span className="text-white font-bold">3 ou mais</span> blocos da mesma cor para explodir.</p>
                </li>
                <li className="flex gap-3">
                  <span className="bg-sky-500/20 text-sky-500 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">3</span>
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
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-sm w-full shadow-2xl"
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
