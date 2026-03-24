export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'rainbow' | 'pink' | 'cyan' | 'lime' | 'emerald' | 'amber' | 'fuchsia' | 'indigo';

export interface Block {
  id: string;
  color: Color;
  specialty?: 'star' | 'rainbow' | 'color-clear' | 'bomb' | 'color-bomb' | 'line-clear';
}

export type BoardCell = Block | null;

export interface Piece {
  id: string;
  shape: { 
    x: number; 
    y: number; 
    color: Color; 
    specialty?: 'star' | 'rainbow' | 'color-clear' | 'bomb' | 'color-bomb' | 'line-clear';
  }[];
  position?: { r: number; c: number };
}
