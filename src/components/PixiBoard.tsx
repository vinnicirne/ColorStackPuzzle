/**
 * PixiBoard.tsx - Versão ESTABILIZADA PixiJS v8 + @pixi/react v8
 * Resolve: Runtime Crash no mount, Performance Mobile e Visual.
 */
import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BoardCell, Piece, Color } from '../types';

// PixiJS v8 registration bridge
extend({ 
  pixiContainer: Container, 
  pixiGraphics: Graphics, 
  pixiText: Text 
});

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
  board, containerWidth, hoverCell, draggedPiece, selectedPiece,
  clearingCells, floatingPoints, hintPosition, theme, onCellClick
}) => {
  const cellSize = Math.floor(containerWidth / B_SIZE);
  const width = cellSize * B_SIZE;
  const height = cellSize * B_SIZE;

  const appRef = useRef<any>(null);
  const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;

  // Background Particles
  const bgParticles = useMemo(() => {
    return Array.from({ length: Math.floor(20 * theme.intensity) }).map((_, i) => ({
      id: i,
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1 + Math.random() * 3,
      alpha: 0.1 + Math.random() * 0.2,
    }));
  }, [theme, width, height]);

  const specialtyStyle = useMemo(() => new TextStyle({ 
    fontFamily: 'Arial, Helvetica, sans-serif', // v8 font fallback
    fontSize: Math.floor(cellSize * 0.5), 
    fontWeight: 'bold', 
    fill: '#ffffff',
    dropShadow: { color: '#000000', alpha: 0.5, blur: 4, distance: 2 } 
  }), [cellSize]);

  const ghostData = useMemo(() => {
    if (!activePiece || !hoverCell) return null;
    const first = activePiece.shape[0];
    const anchorR = hoverCell.r - first.x, anchorC = hoverCell.c - first.y;
    const fits = activePiece.shape.every(({ x, y }) => {
      const tr = anchorR + x, tc = anchorC + y;
      return tr >= 0 && tr < B_SIZE && tc >= 0 && tc < B_SIZE && !board[tr]?.[tc];
    });
    return { anchorR, anchorC, fits, shape: activePiece.shape };
  }, [activePiece, hoverCell, board]);

  // STABLE TICKER EXPLOSIONS
  const triggerExplosion = useCallback((group: { r: number; c: number }[], colorHex: number) => {
    if (!appRef.current || group.length === 0) return;
    const app = appRef.current;
    const center = group[0];
    const cx = (center.c + 0.5) * cellSize, cy = (center.r + 0.5) * cellSize;
    
    for (let i = 0; i < 25; i++) {
        const p = new Graphics();
        p.circle(0, 0, 3 + Math.random() * 5).fill({ color: colorHex });
        p.x = cx; p.y = cy;
        const angle = Math.random() * Math.PI * 2, speed = 100 + Math.random() * 300;
        const vx = Math.cos(angle) * speed, vyInit = Math.sin(angle) * speed - 120;
        let vy = vyInit, life = 1.0;
        app.stage.addChild(p);

        const update = (time: any) => {
            const dt = (typeof time === 'number' ? time : time.deltaTime) * 0.016;
            p.x += vx * dt; p.y += vy * dt; vy += 750 * dt; life -= 2.4 * dt;
            p.alpha = life; p.scale.set(life);
            if (life <= 0) {
                app.ticker.remove(update);
                if (p.parent) p.parent.removeChild(p);
            }
        };
        app.ticker.add(update);
    }
  }, [cellSize]);

  useEffect(() => {
    (window as any).triggerPixiExplosion = (group: any[], color: Color) => 
      triggerExplosion(group, colorToHex[color] || 0xffffff);
    return () => { delete (window as any).triggerPixiExplosion; };
  }, [triggerExplosion]);

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
      <pixiContainer {...({ isRenderGroup: true } as any)}>
        {/* BG Particles */}
        {bgParticles.map(p => (
           <pixiGraphics key={p.id} draw={(g: Graphics) => {
              g.clear().circle(p.x, p.y, p.size).fill({ color: theme.particleColor, alpha: p.alpha });
           }} />
        ))}
        
        {/* Tabuleiro Base */}
        <pixiGraphics draw={(g: Graphics) => {
          g.clear();
          for (let r = 0; r < B_SIZE; r++) {
            for (let c = 0; c < B_SIZE; c++) {
              const cell = board[r]?.[c], x = c * cellSize, y = r * cellSize;
              if (cell) {
                g.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 12).fill({ color: colorToHex[cell.color] });
                g.roundRect(x + 5, y + 4, cellSize - 10, cellSize * 0.35, 8).fill({ color: 0xffffff, alpha: 0.22 });
                if (clearingCells.has(`${r}-${c}`)) g.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 12).stroke({ color: 0xffffff, width: 4.5 });
              } else g.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 12).fill({ color: 0xffffff, alpha: 0.06 });
            }
          }
        }} />

        {/* Emojis Specialty */}
        {board.map((row, r) => row.map((cell, c) =>  cell?.specialty && (
           <pixiText key={`${r}-${c}`} x={(c + 0.5) * cellSize} y={(r + 0.5) * cellSize} anchor={0.5} style={specialtyStyle}
              text={cell.specialty === 'bomb' ? '💣' : cell.specialty === 'color-bomb' ? '🌀' : cell.specialty === 'line-clear' ? '⚡' : cell.specialty === 'star' ? '⭐' : '✨'}
           />
        )))}

        {/* Piece Ghost */}
        {ghostData && (
          <pixiGraphics draw={(g: Graphics) => {
             g.clear();
             ghostData.shape.forEach(({ x, y, color }) => {
                const gx = (ghostData.anchorC + y) * cellSize, gy = (ghostData.anchorR + x) * cellSize;
                g.roundRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4, 12).fill({ color: colorToHex[color], alpha: 0.42 });
             });
          }} />
        )}

        {/* Feedback de Pontos */}
        {floatingPoints.map(pt => (
          <pixiText key={pt.id} text={`+${pt.points}`} x={(pt.c + 0.5) * cellSize} y={(pt.r + 0.5) * cellSize - 20} anchor={0.5} 
              style={{ fontFamily: 'Arial, sans-serif', fontSize: Math.floor(cellSize * 0.5), fontWeight: '900', fill: '#ffffff', dropShadow: { color: '#000000', alpha: 0.7, blur: 5 } }} 
          />
        ))}
      </pixiContainer>

      {/* Camada de Cliques Interativos (Importante para rodar independentemente) */}
      <pixiContainer>
          {Array.from({ length: 64 }).map((_, i) => {
            const r = Math.floor(i / 8), c = i % 8;
            return <pixiGraphics key={i} x={c * cellSize} y={r * cellSize} interactive={true} cursor="pointer" onPointerDown={() => onCellClick(r, c)} draw={(g: Graphics) => g.clear().rect(0, 0, cellSize, cellSize).fill({ color: 0, alpha: 0.001 })} />;
          })}
      </pixiContainer>
    </Application>
  );
};

export default PixiBoard;
