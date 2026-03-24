/**
 * PixiBoard.tsx - Tabuleiro com PixiJS v8 + Partículas Explosivas (ESTÁVEL)
 * Versão corrigida para compatibilidade total com PixiJS v8
 */
import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BoardCell, Piece, Color } from '../types';

// Registra apenas o que vamos usar no v8
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
  const B_SIZE = 8;
  const cellSize = Math.floor(containerWidth / B_SIZE);
  const width = cellSize * B_SIZE;
  const height = cellSize * B_SIZE;

  const appRef = useRef<any>(null);

  const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;

  // Background Particles (Ambiente Procedural)
  const bgParticles = useMemo(() => {
    return Array.from({ length: Math.floor(15 * theme.intensity) }).map((_, i) => ({
      id: i,
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1.5 + Math.random() * 2.5,
      alpha: 0.1 + Math.random() * 0.25,
      offset: Math.random() * Math.PI * 2,
    }));
  }, [theme.intensity, width, height]);

  const ghostData = useMemo(() => {
    if (!activePiece || !hoverCell) return null;
    const first = activePiece.shape[0];
    const anchorR = hoverCell.r - first.x;
    const anchorC = hoverCell.c - first.y;

    const fits = activePiece.shape.every(({ x, y }) => {
      const tr = anchorR + x;
      const tc = anchorC + y;
      return tr >= 0 && tr < B_SIZE && tc >= 0 && tc < B_SIZE && !board[tr]?.[tc];
    });

    return { anchorR, anchorC, fits, shape: activePiece.shape };
  }, [activePiece, hoverCell, board]);

  // Explosão Manual (Pixi v8 estável sem dependências problemáticas)
  const triggerExplosion = useCallback((group: { r: number; c: number }[], colorHex: number) => {
    if (!appRef.current || group.length === 0) return;

    const app = appRef.current;
    const centerX = (group[0].c + 0.5) * cellSize;
    const centerY = (group[0].r + 0.5) * cellSize;

    const particleContainer = new Container();
    app.stage.addChild(particleContainer);

    const particleCount = Math.min(40, 15 + group.length * 3);

    for (let i = 0; i < particleCount; i++) {
      const g = new Graphics();
      const size = 3 + Math.random() * 5;
      g.circle(0, 0, size).fill({ color: colorHex, alpha: 0.9 });

      g.x = centerX + (Math.random() - 0.5) * 30;
      g.y = centerY + (Math.random() - 0.5) * 30;

      let vx = (Math.random() - 0.5) * 400;
      let vy = (Math.random() - 0.5) * 400 - 100;

      particleContainer.addChild(g);

      const startTime = Date.now();
      const lifetime = 400 + Math.random() * 300;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / lifetime;

        if (progress > 1) {
          particleContainer.removeChild(g);
          if (particleContainer.children.length === 0) app.stage.removeChild(particleContainer);
          return;
        }

        g.x += vx * 0.016;
        g.y += vy * 0.016;
        vy += 300 * 0.016; // Gravidade fake

        g.alpha = 1 - progress;
        g.scale.set(1 - progress * 0.8);
        requestAnimationFrame(animate);
      };
      animate();
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
        const xPos = c * cellSize;
        const yPos = r * cellSize;
        const cell = board[r]?.[c];
        if (cell) {
          const hex = colorToHex[cell.color] || 0x888888;
          g.roundRect(xPos + 2, yPos + 2, cellSize - 4, cellSize - 4, 12).fill({ color: hex, alpha: 1 });
          g.roundRect(xPos + 4, yPos + 4, cellSize - 8, cellSize * 0.35, 8).fill({ color: 0xffffff, alpha: 0.28 });
          if (clearingCells.has(`${r}-${c}`)) {
            g.roundRect(xPos + 6, yPos + 6, cellSize - 12, cellSize - 12, 12).stroke({ color: 0xffffff, width: 4, alpha: 0.9 });
          }
        } else {
          g.roundRect(xPos + 1, yPos + 1, cellSize - 2, cellSize - 2, 12).fill({ color: 0xffffff, alpha: 0.06 });
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
      hello={false}
    >
      <pixiContainer>
        {bgParticles.map(p => (
          <pixiGraphics
            key={p.id}
            draw={(g: Graphics) => {
              g.clear().circle(p.x, p.y + Math.sin(Date.now() / 900 + p.offset) * 10, p.size).fill({ color: theme.particleColor, alpha: p.alpha });
            }}
          />
        ))}
      </pixiContainer>

      <pixiGraphics draw={drawBoard} />

      {/* Specialty Icons */}
      <pixiContainer>
        {board.map((row, r) => row.map((cell, c) => (
          cell?.specialty && (
            <pixiText
              key={`${r}-${c}`}
              x={(c + 0.5) * cellSize}
              y={(r + 0.5) * cellSize}
              ref={(node: any) => {
                if (node) {
                  node.anchor.set(0.5);
                  node.text = cell.specialty === 'bomb' ? '💣' : 
                              cell.specialty === 'color-bomb' ? '🌀' : 
                              cell.specialty === 'line-clear' ? '⚡' : 
                              cell.specialty === 'color-clear' ? '✨' : '⭐';
                  node.style = new TextStyle({ fontSize: cellSize * 0.5 });
                }
              }}
            />
          )
        )))}
      </pixiContainer>

      {ghostData && (
        <pixiContainer alpha={ghostData.fits ? 0.55 : 0.25}>
          {ghostData.shape.map((block, i) => {
            const gx = (ghostData.anchorC + block.y) * cellSize;
            const gy = (ghostData.anchorR + block.x) * cellSize;
            return (
              <pixiGraphics key={i} draw={(g: Graphics) => {
                g.clear().roundRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4, 12).fill({ color: colorToHex[block.color], alpha: 0.75 });
              }} />
            );
          })}
        </pixiContainer>
      )}

      {hintPosition && (
        <pixiGraphics draw={(g: Graphics) => {
          g.clear().roundRect(hintPosition.c * cellSize + 4, hintPosition.r * cellSize + 4, cellSize - 8, cellSize - 8, 14).stroke({ color: 0xffeb3b, width: 6, alpha: 1 });
        }} />
      )}

      {floatingPoints.map((p) => (
        <pixiText
          key={p.id}
          text={`+${p.points}`}
          x={(p.c + 0.5) * cellSize}
          y={(p.r + 0.3) * cellSize}
          anchor={0.5}
          style={new TextStyle({
            fontFamily: 'system-ui, sans-serif', fontSize: Math.floor(cellSize * 0.48), fontWeight: '900', fill: '#ffffff', stroke: { color: '#000000', width: 6 },
            dropShadow: { color: '#000000', alpha: 0.5, blur: 8, distance: 4 },
          })}
        />
      ))}

      {/* Camada de Interação (Cliques) */}
      <pixiContainer>
        {board.map((row, r) => row.map((_, c) => (
          <pixiGraphics key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} interactive={true} cursor="pointer" onPointerDown={() => onCellClick(r, c)}
            draw={(g: Graphics) => { g.clear().rect(0, 0, cellSize, cellSize).fill({ color: 0x000000, alpha: 0.001 }); }}
          />
        )))}
      </pixiContainer>
    </Application>
  );
};

export default PixiBoard;
