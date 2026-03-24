/**
 * PixiBoard.tsx - Versão ULTRA-OTIMIZADA PixiJS v8
 * RenderGroup + ParticleContainer nativo + Pooling + Specialty Icons
 */
import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { Application, extend } from '@pixi/react';
import {
  Container,
  Graphics,
  Text,
  TextStyle,
  ParticleContainer,
  Particle,
  GraphicsContext,
  Texture,
} from 'pixi.js';
import { BoardCell, Piece, Color } from '../types';

// Registra as extensões do v8
extend({ Container, Graphics, Text, ParticleContainer, Particle });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      pixiContainer: any;
      pixiGraphics: any;
      pixiText: any;
      pixiParticleContainer: any;
    }
  }
}

interface PixiBoardProps {
  board: BoardCell[][];
  containerWidth: number;
  hoverCell: { r: number; c: number } | null;
  draggedPiece: { piece: Piece; index: number } | null;
  selectedPiece: { piece: Piece; index: number } | null;
  clearingCells: Set<string>;
  floatingPoints: { id: string; r: number; c: number; points: number }[];
  hintPosition: { r: number; c: number; pieceIndex: number } | null;
  theme: { particleColor: string; intensity: number };
  onCellClick: (r: number, c: number) => void;
}

const colorToHex: Record<Color, number> = {
  red: 0xff4d4d, blue: 0x4d94ff, green: 0x4dff4d, yellow: 0xffdd4d,
  purple: 0xb366ff, orange: 0xffa64d, pink: 0xff4db3, cyan: 0x4dffff,
  lime: 0xb3ff4d, emerald: 0x4dff99, amber: 0xffb34d, fuchsia: 0xff4dff,
  indigo: 0x6666ff, rainbow: 0xffffff,
};

const B_SIZE = 8;

const PixiBoard: React.FC<PixiBoardProps> = ({
  board,
  containerWidth,
  hoverCell,
  draggedPiece,
  selectedPiece,
  clearingCells,
  floatingPoints,
  hintPosition,
  theme,
  onCellClick,
}) => {
  const cellSize = Math.floor(containerWidth / B_SIZE);
  const width = cellSize * B_SIZE;
  const height = cellSize * B_SIZE;

  const appRef = useRef<any>(null);
  const explosionPoolRef = useRef<Particle[]>([]);
  const explosionContainerRef = useRef<any>(null);

  const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;

  // Contexto reutilizável para células (geometria pré-computada)
  const cellContext = useMemo(() => {
    const ctx = new GraphicsContext();
    ctx.roundRect(2, 2, cellSize - 4, cellSize - 4, 12);
    return ctx;
  }, [cellSize]);

  const ghostData = useMemo(() => {
    if (!activePiece || !hoverCell) return null;
    const first = activePiece.shape[0];
    const anchorR = hoverCell.r - first.x;
    const anchorC = hoverCell.c - first.y;
    const fits = activePiece.shape.every(({ x, y }) => {
      const tr = anchorR + x, tc = anchorC + y;
      return tr >= 0 && tr < B_SIZE && tc >= 0 && tc < B_SIZE && !board[tr]?.[tc];
    });
    return { anchorR, anchorC, fits, shape: activePiece.shape };
  }, [activePiece, hoverCell, board]);

  // Trigger de explosão (Object Pooling + v8 Particles)
  const triggerExplosion = useCallback((group: { r: number; c: number }[], colorHex: number) => {
    if (!explosionContainerRef.current || group.length === 0) return;
    const container = explosionContainerRef.current;
    const centerX = (group[0].c + 0.5) * cellSize;
    const centerY = (group[0].r + 0.5) * cellSize;
    const pCount = Math.min(60, 20 + group.length * 5);

    for (let i = 0; i < pCount; i++) {
      let p = explosionPoolRef.current.pop();
      if (!p) p = new Particle({ texture: Texture.WHITE });
      
      p.x = centerX + (Math.random() - 0.5) * 35;
      p.y = centerY + (Math.random() - 0.5) * 35;
      p.tint = colorHex;
      p.alpha = 1;
      p.scale = 0.5 + Math.random();
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 250;
      (p as any).vx = Math.cos(angle) * speed;
      (p as any).vy = Math.sin(angle) * speed - 100;
      
      container.addParticle(p);
    }
  }, [cellSize]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const ticker = app.ticker;
    const update = (delta: number) => {
      const container = explosionContainerRef.current;
      if (!container) return;
      const particles = container.particles;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const dt = delta * 0.016;
        p.x += (p as any).vx * dt;
        p.y += (p as any).vy * dt;
        (p as any).vy += 450 * dt; // Gravidade
        p.alpha -= 2.0 * dt;
        p.scale *= 0.96;
        if (p.alpha <= 0) {
          container.removeParticle(p);
          explosionPoolRef.current.push(p);
        }
      }
    };
    ticker.add(update);
    return () => ticker.remove(update);
  }, []);

  useEffect(() => {
    (window as any).triggerPixiExplosion = (group: any[], color: Color) => {
      triggerExplosion(group, colorToHex[color] || 0xffffff);
    };
    return () => delete (window as any).triggerPixiExplosion;
  }, [triggerExplosion]);

  const drawBoard = useCallback((g: Graphics) => {
    g.clear();
    for (let r = 0; r < B_SIZE; r++) {
      for (let c = 0; c < B_SIZE; c++) {
        const x = c * cellSize, y = r * cellSize;
        const cell = board[r]?.[c];
        if (cell) {
          g.context = cellContext;
          g.fill({ color: colorToHex[cell.color] || 0x888888, alpha: 1 });
          g.roundRect(x + 4, y + 4, cellSize - 8, cellSize * 0.35, 8).fill({ color: 0xffffff, alpha: 0.28 });
          if (clearingCells.has(`${r}-${c}`)) {
            g.roundRect(x + 6, y + 6, cellSize - 12, cellSize - 12, 12).stroke({ color: 0xffffff, width: 4, alpha: 1 });
          }
        } else {
          g.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 12).fill({ color: 0xffffff, alpha: 0.06 });
        }
      }
    }
  }, [board, cellSize, clearingCells, cellContext]);

  return (
    <Application
      ref={appRef}
      width={width}
      height={height}
      backgroundAlpha={0}
      antialias={true}
      resolution={1}
      powerPreference="high-performance"
    >
      <pixiContainer isRenderGroup={true}>
        {/* Background Particles Container */}
        <pixiParticleContainer maxSize={100} dynamicProperties={{ position: true, alpha: true }} />

        {/* Board principal */}
        <pixiGraphics draw={drawBoard} cacheAsTexture={true} />

        {/* Specialty Icons */}
        <pixiContainer>
          {board.map((row, r) => row.map((cell, c) => (
            cell?.specialty && (
              <pixiText
                key={`${r}-${c}`}
                x={(c + 0.5) * cellSize}
                y={(r + 0.5) * cellSize}
                anchor={0.5}
                text={cell.specialty === 'bomb' ? '💣' : cell.specialty === 'color-bomb' ? '🌀' : cell.specialty === 'line-clear' ? '⚡' : '✨'}
                style={new TextStyle({ fontSize: cellSize * 0.5, fontWeight: 'bold' })}
              />
            )
          )))}
        </pixiContainer>

        {/* Ghost piece */}
        {ghostData && (
          <pixiGraphics
            cacheAsTexture={true}
            draw={(g: Graphics) => {
              g.clear();
              ghostData.shape.forEach(({ x, y, color }) => {
                const gx = (ghostData.anchorC + y) * cellSize, gy = (ghostData.anchorR + x) * cellSize;
                g.roundRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4, 12).fill({ color: colorToHex[color], alpha: 0.45 });
              });
            }}
          />
        )}

        {/* Explosões Container */}
        <pixiParticleContainer
          ref={explosionContainerRef}
          maxSize={800}
          dynamicProperties={{ position: true, alpha: true, scale: true }}
        />

        {/* Floating Points */}
        {floatingPoints.map(p => (
          <pixiText
            key={p.id}
            text={`+${p.points}`}
            x={(p.c + 0.5) * cellSize}
            y={(p.r + 0.5) * cellSize - 25}
            anchor={0.5}
            style={new TextStyle({
              fontFamily: 'system-ui', fontSize: cellSize * 0.5, fontWeight: '900', fill: '#ffffff',
              dropShadow: { color: '#000000', alpha: 0.6, blur: 8, distance: 4 }
            })}
          />
        ))}

        {/* Camada de Interação (Cliques) */}
        <pixiContainer>
          {board.map((row, r) => row.map((_, c) => (
            <pixiGraphics
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              interactive={true}
              cursor="pointer"
              onPointerDown={() => onCellClick(r, c)}
              draw={(g: Graphics) => { g.clear().rect(0, 0, cellSize, cellSize).fill({ color: 0x000000, alpha: 0.001 }); }}
            />
          )))}
        </pixiContainer>
      </pixiContainer>
    </Application>
  );
};

export default PixiBoard;
