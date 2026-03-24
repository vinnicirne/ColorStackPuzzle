/**
 * PixiBoard.tsx - Versão FINAL ESTÁVEL e FUNCIONAL para @pixi/react v8
 * Integrando Estabilidade (Ticker), Performance (RenderGroup) e Gameplay (Icons/Cliques).
 */
import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BoardCell, Piece, Color } from '../types';

// Extensões essenciais v8
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
  onExplosion?: (group: { r: number; c: number }[], color: string) => void;
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
  onCellClick, // Essencial para gameplay
}) => {
  const cellSize = Math.floor(containerWidth / B_SIZE);
  const width = cellSize * B_SIZE;
  const height = cellSize * B_SIZE;

  const appRef = useRef<any>(null);

  const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;

  // Estilos pré-calculados (Estabilidade React)
  const specialtyStyle = useMemo(() => new TextStyle({
    fontFamily: 'system-ui', fontSize: Math.floor(cellSize * 0.5), fontWeight: 'bold', fill: '#ffffff',
    dropShadow: { color: '#000000', alpha: 0.5, blur: 5, distance: 2 }
  }), [cellSize]);

  const floatPointStyle = useMemo(() => new TextStyle({
    fontFamily: 'system-ui', fontSize: Math.floor(cellSize * 0.55), fontWeight: '950', fill: '#ffffff',
    dropShadow: { color: '#000000', alpha: 0.7, blur: 10, distance: 4 }
  }), [cellSize]);

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

  // EXPLOSÃO ESTÁVEL (Graphics + ticker central)
  const triggerExplosion = useCallback((group: { r: number; c: number }[], colorHex: number) => {
    if (!appRef.current || group.length === 0) return;
    const app = appRef.current;
    const centerX = (group[0].c + 0.5) * cellSize;
    const centerY = (group[0].r + 0.5) * cellSize;
    const count = Math.min(60, 20 + group.length * 4);

    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      g.circle(0, 0, 3 + Math.random() * 5.5).fill({ color: colorHex });
      g.x = centerX + (Math.random() - 0.5) * 32;
      g.y = centerY + (Math.random() - 0.5) * 32;

      const vx = (Math.random() - 0.5) * 400;
      let vy = (Math.random() - 0.5) * 350 - 110;

      app.stage.addChild(g);
      let life = 1.0;

      const update = (delta: number) => {
        const dt = delta * 0.016;
        g.x += vx * dt;
        g.y += vy * dt;
        vy += 500 * dt;
        life -= 2.2 * dt;
        g.alpha = life;
        g.scale.set(life);
        if (life <= 0) {
          app.ticker.remove(update);
          if (g.parent) g.parent.removeChild(g);
        }
      };
      app.ticker.add(update);
    }
  }, [cellSize]);

  useEffect(() => {
    (window as any).triggerPixiExplosion = (group: any[], color: Color) => {
      const hex = colorToHex[color] || 0xffffff;
      triggerExplosion(group, hex);
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
          g.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 12).fill({ color: hex });
          g.roundRect(x + 4, y + 4, cellSize - 8, cellSize * 0.33, 8).fill({ color: 0xffffff, alpha: 0.25 });
          if (clearingCells.has(`${r}-${c}`)) {
            g.roundRect(x + 5, y + 5, cellSize - 10, cellSize - 10, 12).stroke({ color: 0xffffff, width: 5, alpha: 0.9 });
          }
        } else {
          g.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 12).fill({ color: 0xffffff, alpha: 0.055 });
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
      antialias={true}
      resolution={1}
    >
      <pixiContainer {...({ isRenderGroup: true } as any)}>
        {/* Background Particles (Fundo Vivo) */}
        <pixiContainer>
           {Array.from({ length: 12 }).map((_, i) => (
             <pixiGraphics key={i} draw={(g: Graphics) => {
                const off = (i * 0.45);
                g.clear().circle(Math.random()*width, Math.random()*height + Math.sin(Date.now()/1200 + off)*15, 2).fill({ color: theme.particleColor, alpha: 0.1 });
             }} />
           ))}
        </pixiContainer>

        <pixiGraphics draw={drawBoard} />
        
        {/* Ghost piece */}
        {ghostData && (
          <pixiGraphics
            draw={(g: Graphics) => {
              g.clear();
              ghostData.shape.forEach(({ x, y, color }) => {
                const gx = (ghostData.anchorC + y) * cellSize, gy = (ghostData.anchorR + x) * cellSize;
                g.roundRect(gx + 3, gy + 3, cellSize - 6, cellSize - 6, 10).fill({ color: colorToHex[color], alpha: 0.42 });
              });
            }}
          />
        )}

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

        {/* Floating points */}
        {floatingPoints.map((pt) => (
          <pixiText
            key={pt.id}
            text={`+${pt.points}`}
            x={(pt.c + 0.5) * cellSize}
            y={(pt.r + 0.5) * cellSize - 25}
            anchor={0.5}
            style={floatPointStyle}
          />
        ))}

        {/* Hint */}
        {hintPosition && (
          <pixiGraphics
            draw={(g: Graphics) => {
              g.clear().rect(hintPosition.c * cellSize + 4, hintPosition.r * cellSize + 4, cellSize - 8, cellSize - 8).stroke({ color: 0xfff700, width: 4, alpha: 0.85 });
            }}
          />
        )}

        {/* Camada de Interação (Cliques) */}
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
