/**
 * PixiBoard.tsx - Versão ESTÁVEL e OTIMIZADA PixiJS v8
 * Uso de Container + RenderGroup para máxima performance sem instabilidade.
 */
import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { Application, extend } from '@pixi/react';
import {
  Container,
  Graphics,
  Text,
  TextStyle,
  GraphicsContext,
} from 'pixi.js';
import { BoardCell, Piece, Color } from '../types';

// Registra apenas o essencial
extend({ Container, Graphics, Text });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      pixiContainer: any;
      pixiGraphics: any;
      pixiText: any;
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
  const explosionContainerRef = useRef<any>(null);

  const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;

  // Estilo de texto pré-calculado
  const specialtyStyle = useMemo(() => new TextStyle({ 
    fontSize: Math.floor(cellSize * 0.5), 
    fontWeight: 'bold', 
    fill: '#ffffff',
    dropShadow: { color: '#000000', alpha: 0.4, blur: 4, distance: 2 }
  }), [cellSize]);

  const floatPointStyle = useMemo(() => new TextStyle({
    fontFamily: 'system-ui', fontSize: Math.floor(cellSize * 0.55), fontWeight: '950', fill: '#ffffff',
    dropShadow: { color: '#000000', alpha: 0.6, blur: 10, distance: 4 }
  }), [cellSize]);

  const cellContext = useMemo(() => {
    const ctx = new GraphicsContext();
    ctx.roundRect(1, 1, cellSize - 2, cellSize - 2, 12);
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

  // Explosão (Uso de Graphics + manual ticker para evitar dependência ParticleContainer instável)
  const triggerExplosion = useCallback((group: { r: number; c: number }[], colorHex: number) => {
    if (!appRef.current || group.length === 0) return;
    const app = appRef.current;
    
    // Ponto médio do match
    const cx = (group.reduce((acc,g)=>acc+g.c,0)/group.length + 0.5) * cellSize;
    const cy = (group.reduce((acc,g)=>acc+g.r,0)/group.length + 0.5) * cellSize;
    
    const count = 15 + group.length * 4;
    for (let i = 0; i < count; i++) {
        const p = new Graphics();
        p.circle(0, 0, 3 + Math.random() * 5).fill({ color: colorHex });
        p.x = cx; p.y = cy;
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 300;
        (p as any).vx = Math.cos(angle) * speed;
        (p as any).vy = Math.sin(angle) * speed - 150;
        (p as any).life = 1.0;
        app.stage.addChild(p);
        
        const remove = () => { if (p.parent) p.parent.removeChild(p); ticker.remove(move); };
        const move = (delta: number) => {
           const dt = delta * 0.016;
           p.x += (p as any).vx * dt;
           p.y += (p as any).vy * dt;
           (p as any).vy += 500 * dt;
           (p as any).life -= 2.0 * dt;
           p.alpha = (p as any).life;
           p.scale.set((p as any).life);
           if ((p as any).life <= 0) remove();
        };
        const ticker = app.ticker;
        ticker.add(move);
    }
  }, [cellSize]);

  useEffect(() => {
    (window as any).triggerPixiExplosion = (group: any[], color: Color) => {
      triggerExplosion(group, colorToHex[color] || 0xffffff);
    };
    return () => { delete (window as any).triggerPixiExplosion; };
  }, [triggerExplosion]);

  const drawBoard = useCallback((g: Graphics) => {
    g.clear();
    for (let r = 0; r < B_SIZE; r++) {
      for (let c = 0; c < B_SIZE; c++) {
        const x = c * cellSize, y = r * cellSize;
        const cell = board[r]?.[c];
        if (cell) {
          const hex = colorToHex[cell.color] || 0x888888;
          // Base do bloco
          g.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 12).fill({ color: hex, alpha: 1 });
          // Highlight (Gloss) - A deformação ocorria por erro no ciclo de fill anterior
          g.roundRect(x + 4, y + 4, cellSize - 8, cellSize * 0.35, 8).fill({ color: 0xffffff, alpha: 0.22 });
          
          if (clearingCells.has(`${r}-${c}`)) {
            g.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 12)
              .stroke({ color: 0xffffff, width: 4, alpha: 0.9 });
          }
        } else {
          g.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 12).fill({ color: 0xffffff, alpha: 0.06 });
        }
      }
    }
  }, [board, cellSize, clearingCells]);

  return (
    <Application
      ref={appRef}
      width={width}
      height={height}
      backgroundAlpha={0}
      resolution={1}
    >
      <pixiContainer {...({ isRenderGroup: true } as any)}>
        {/* Background Ambient Particles (Sinusoidal simples) */}
        <pixiContainer>
           {Array.from({ length: 12 }).map((_, i) => (
             <pixiGraphics key={i} draw={(g: Graphics) => {
                const off = (i * 0.5);
                g.clear().circle(Math.random()*width, Math.random()*height + Math.sin(Date.now()/1000 + off)*20, 2).fill({ color: theme.particleColor, alpha: 0.15 });
             }} />
           ))}
        </pixiContainer>

        <pixiGraphics draw={drawBoard} {...({ cacheAsTexture: true } as any)} />

        {/* Specialty Icons */}
        <pixiContainer>
          {board.map((row, r) => row.map((cell, c) => (
            cell?.specialty && (
              <pixiText
                key={`${r}-${c}`}
                x={(c + 0.5) * cellSize}
                y={(r + 0.5) * cellSize}
                anchor={0.5}
                text={cell.specialty === 'bomb' ? '💣' : cell.specialty === 'color-bomb' ? '🌀' : cell.specialty === 'line-clear' ? '⚡' : cell.specialty === 'star' ? '⭐' : '✨'}
                style={specialtyStyle}
              />
            )
          )))}
        </pixiContainer>

        {/* Ghost piece */}
        {ghostData && (
          <pixiGraphics
            {...({ cacheAsTexture: true } as any)}
            draw={(g: Graphics) => {
              g.clear();
              ghostData.shape.forEach(({ x, y, color }) => {
                const gx = (ghostData.anchorC + y) * cellSize, gy = (ghostData.anchorR + x) * cellSize;
                g.roundRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4, 12).fill({ color: colorToHex[color], alpha: 0.45 });
              });
            }}
          />
        )}

        {/* Floating Points */}
        {floatingPoints.map(p => (
          <pixiText
            key={p.id}
            text={`+${p.points}`}
            x={(p.c + 0.5) * cellSize}
            y={(p.r + 0.5) * cellSize - 30}
            anchor={0.5}
            style={floatPointStyle}
          />
        ))}

        {/* Interação */}
        <pixiContainer>
          {Array.from({ length: 64 }).map((_, i) => {
            const r = Math.floor(i / 8), c = i % 8;
            return (
              <pixiGraphics
                key={i}
                x={c * cellSize} y={r * cellSize}
                interactive={true} cursor="pointer"
                onPointerDown={() => onCellClick(r, c)}
                draw={(g: Graphics) => { g.clear().rect(0, 0, cellSize, cellSize).fill({ color: 0, alpha: 0.001 }); }}
              />
            );
          })}
        </pixiContainer>
      </pixiContainer>
    </Application>
  );
};

export default PixiBoard;
