const fs = require('fs');
const path = 'c:/Users/THINKPAD/Desktop/Jogo/src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Nova implementação da função generatePiece
const newGeneratePiece = `  const generatePiece = useCallback((lvl = 1, boardToUpdate = null, forceMatch = false) => {
    const shapes = getAvailableShapes(lvl);
    const colors = getAvailableColors(lvl);
    const occCount = boardToUpdate ? boardToUpdate.flat().filter(x => x).length : 0;
    const occupancy = occCount / 64;

    if (boardToUpdate) {
      const shuffledShapes = [...shapes].sort(() => Math.random() - 0.5);
      const positions = [];
      for(let r=0; r<8; r++) for(let c=0; c<8; c++) positions.push({r,c});
      positions.sort(() => Math.random() - 0.5);

      let attempts = 0;
      const MAX_ATTEMPTS = occupancy > 0.8 ? 50 : 150;

      for (const pos of positions) {
        for (const shapeTemplate of shuffledShapes) {
          attempts++;
          if (forceMatch && attempts > MAX_ATTEMPTS) break;

          if (shapeTemplate.every(([sx, sy]) => {
            const tr = pos.r + sx; const tc = pos.c + sy;
            return tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && boardToUpdate[tr][tc] === null;
          })) {
            const rndColor = colors[Math.floor(Math.random() * colors.length)];
            return {
              id: Math.random().toString(36).substr(2, 9),
              shape: shapeTemplate.map(([x, y]) => ({ x, y, color: rndColor, specialty: Math.random() < 0.05 ? 'color-clear' : undefined })),
              color: rndColor,
              specialty: (Math.random() < 0.08) ? (Math.random() > 0.5 ? 'rainbow' : 'color-clear') : undefined
            };
          }
        }
        if (forceMatch && attempts > MAX_ATTEMPTS) break;
      }
    }

    const shapeTemplate = shapes[Math.floor(Math.random() * shapes.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    return {
      id: Math.random().toString(36).substr(2, 9),
      shape: shapeTemplate.map(([x, y]) => ({ x, y, color, specialty: Math.random() < 0.05 ? 'color-clear' : undefined })),
      color,
      specialty: Math.random() < 0.06 ? 'rainbow' : undefined
    };
  }, [getAvailableColors, getAvailableShapes]);`;

// Localiza e substitui generatePiece (da assinatura até o final da função)
const startRegex = /const generatePiece = useCallback\(/;
const endMarker = /const startNewGame = useCallback\(/;

const startIndex = content.search(startRegex);
const endIndex = content.search(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex);
    content = before + newGeneratePiece + "\\n\\n  " + after;
    console.log('generatePiece otimizada!');
} else {
    console.error('Não foi possível localizar o bloco generatePiece');
}

fs.writeFileSync(path, content);
