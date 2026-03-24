/**
 * PixiBoard.tsx - Tabuleiro com PixiJS v8 + Partículas Explosivas
 * Compatível com @pixi/react v8
 */
import React, { useCallback, useMemo, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { 
  Container, 
  Graphics, 
  Text, 
  TextStyle, 
  Texture
} from 'pixi.js';
import { Emitter, upgradeConfig } from '@pixi/particle-emitter';
import { BoardCell, Piece, Color } from '../types';

// Registra os componentes do PixiJS no ecossistema React do @pixi/react v8
extend({ Container, Graphics, Text });

// Atalhos para os tipos intrínsecos do @pixi/react v8
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
  containerWidth: number;     // Largura real do container (Passada do App.tsx)
  hoverCell: { r: number; c: number } | null;
  draggedPiece: { piece: Piece; index: number } | null;
  selectedPiece: { piece: Piece; index: number } | null;
  clearingCells: Set<string>;
  floatingPoints: { id: string; r: number; c: number; points: number }[];
  hintPosition: { r: number; c: number; pieceIndex: number } | null; // ← Nova prop
  onCellClick: (r: number, c: number) => void;
  onExplosion?: (group: { r: number; c: number }[], color: string) => void;
}

const colorToHex: Record<Color, number> = {
  red: 0xff4d4d, blue: 0x4d94ff, green: 0x4dff4d, yellow: 0xffdd4d,
  purple: 0xb366ff, orange: 0xffa64d, pink: 0xff4db3, cyan: 0x4dffff,
  lime: 0xb3ff4d, emerald: 0x4dff99, amber: 0xffb34d, fuchsia: 0xff4dff,
  indigo: 0x6666ff, rainbow: 0xffffff,
};

const toHexStr = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const PixiBoard: React.FC<PixiBoardProps> = ({
  board,
  containerWidth,
  hoverCell,
  draggedPiece,
  selectedPiece,
  clearingCells,
  floatingPoints,
  hintPosition,
  onCellClick,
  onExplosion,
}) => {
  // Cálculo DETERMINÍSTICO da célula baseado na largura passada
  const B_SIZE = 8;
  const cellSize = Math.floor(containerWidth / B_SIZE);
  const width = cellSize * B_SIZE;
  const height = cellSize * B_SIZE;

  const appRef = useRef<any>(null);
  const emitterRef = useRef<Emitter | null>(null);

  const activePiece = draggedPiece?.piece ?? selectedPiece?.piece ?? null;

  // Ghost Preview
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

  // Sistema de partículas compatível com PixiJS v8
  const triggerExplosion = useCallback((group: { r: number; c: number }[], colorHex: number) => {
    if (!appRef.current || group.length === 0) return;

    const centerX = (group[0].c + 0.5) * cellSize;
    const centerY = (group[0].r + 0.5) * cellSize;

    if (emitterRef.current) {
        emitterRef.current.destroy();
    }

    const emitterConfig = upgradeConfig({
      alpha: { start: 1, end: 0 },
      scale: { start: 0.8, end: 0.05, minimumScaleMultiplier: 0.5 },
      color: { start: toHexStr(colorHex), end: '#ffffff' },
      speed: { start: 250, end: 50 },
      acceleration: { x: 0, y: 150 },
      startRotation: { min: 0, max: 360 },
      rotationSpeed: { min: -150, max: 150 },
      lifetime: { min: 0.35, max: 0.75 },
      frequency: 0.015,
      emitterLifetime: 0.3,
      maxParticles: 100,
      pos: { x: centerX, y: centerY },
      addAtBack: false,
      spawnType: 'circle',
      spawnCircle: { x: 0, y: 0, r: 20 }
    }, [Texture.WHITE]);

    emitterRef.current = new Emitter(appRef.current.stage, emitterConfig);
    emitterRef.current.emit = true;

    setTimeout(() => {
      if (emitterRef.current) {
        emitterRef.current.destroy();
        emitterRef.current = null;
      }
    }, 1000);
  }, [cellSize]);

  // Hook para ligar ao sistema global de explosões do App.tsx
  React.useEffect(() => {
    (window as any).triggerPixiExplosion = (group: any[], color: Color) => {
      const hex = colorToHex[color] || 0xffffff;
      triggerExplosion(group, hex);
    };
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
          // Desenho de Peça (V8)
          g.roundRect(xPos + 2, yPos + 2, cellSize - 4, cellSize - 4, 12).fill({ color: hex, alpha: 1 });
          // Brilho/Highlights
          g.roundRect(xPos + 4, yPos + 4, cellSize - 8, cellSize * 0.35, 8).fill({ color: 0xffffff, alpha: 0.28 });

          if (clearingCells.has(`${r}-${c}`)) {
            g.roundRect(xPos + 6, yPos + 6, cellSize - 12, cellSize - 12, 12)
             .stroke({ color: 0xffffff, width: 4, alpha: 0.9 });
          }
        } else {
          // Espaço vazio (Grid)
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
      resolution={1} // Crucial para consistência no Android
      hello={false}
    >
      <pixiGraphics draw={drawBoard} />

      {/* Ghost Preview */}
      {ghostData && (
        <pixiContainer alpha={ghostData.fits ? 0.55 : 0.25}>
          {ghostData.shape.map((block, i) => {
            const gx = (ghostData.anchorC + block.y) * cellSize;
            const gy = (ghostData.anchorR + block.x) * cellSize;
            return (
              <pixiGraphics
                key={i}
                draw={(g: Graphics) => {
                  g.clear()
                   .roundRect(gx + 2, gy + 2, cellSize - 4, cellSize - 4, 12)
                   .fill({ color: colorToHex[block.color] || 0xffffff, alpha: 0.75 });
                }}
              />
            );
          })}
        </pixiContainer>
      )}

      {/* Hint Visual Layer */}
      {hintPosition && (
        <pixiContainer alpha={0.7}>
          <pixiGraphics
            draw={(g: Graphics) => {
              g.clear()
               .roundRect(
                 hintPosition.c * cellSize + 4,
                 hintPosition.r * cellSize + 4,
                 cellSize - 8,
                 cellSize - 8,
                 14
               )
               .stroke({ color: 0xffeb3b, width: 6, alpha: 1 }); // Amarelo brilhante
            }}
          />
        </pixiContainer>
      )}

      {/* Floating Points */}
      {floatingPoints.map((p) => (
        <pixiContainer key={p.id} x={(p.c + 0.5) * cellSize} y={(p.r + 0.3) * cellSize}>
          <pixiText
            ref={(node: Text) => { 
              if (node) { 
                node.text = `+${p.points}`;
                node.anchor.set(0.5); 
                node.style = new TextStyle({
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: Math.floor(cellSize * 0.48),
                  fontWeight: '900',
                  fill: '#ffffff',
                  stroke: { color: '#000000', width: 6 },
                  dropShadow: {
                    color: '#000000',
                    alpha: 0.5,
                    blur: 8,
                    distance: 4,
                  },
                });
              } 
            }}
          />
        </pixiContainer>
      ))}

      {/* Camada de Interação (Cliques) */}
      <pixiContainer>
        {board.map((row, r) =>
          row.map((_, c) => (
            <pixiGraphics
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              interactive={true}
              cursor="pointer"
              onPointerDown={() => onCellClick(r, c)}
              draw={(g: Graphics) => {
                g.clear()
                 .rect(0, 0, cellSize, cellSize)
                 .fill({ color: 0x000000, alpha: 0.001 });
              }}
            />
          ))
        )}
      </pixiContainer>
    </Application>
  );
};

export default PixiBoard;
