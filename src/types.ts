export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export interface Block {
  id: string;
  color: Color;
}

export type BoardCell = Block | null;

export interface Piece {
  id: string;
  shape: { x: number; y: number; color: Color }[];
}
