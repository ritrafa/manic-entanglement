import GIFEncoder from 'gifencoder';
import { createCanvas, loadImage } from 'canvas';
import blobStream from 'blob-stream';

interface Element {
  name: string;
  traits: string[];
  selectedTrait: string;
}

const elements: Element[] = [
  { name: 'Back', traits: ['None', 'Wings', 'Jetpack', 'Billhook'], selectedTrait : '' },
  { name: 'Body', traits: ['Blue', 'Gold', 'Green', 'Pink', 'Purple', 'Skeleton', 'Solana'], selectedTrait : '' },
  { name: 'Clothes', traits: ['Astronaut', 'None', 'Robe', 'Tank'], selectedTrait : '' },
  { name: 'Eye', traits: ['Asleep', 'One', 'Regular', 'Scanner', 'Zero'], selectedTrait : '' },
  { name: 'Head', traits: ['Cosmonaut', 'Cowboy', 'Crown', 'Hood', 'None'], selectedTrait : '' }
];

const getRandomTrait = (traits: string[]): string => {
  const randomIndex = Math.floor(Math.random() * traits.length);
  return traits[randomIndex];
};

const formGIF = async (selectedTraits: { [key: string]: string } = {}): Promise<Blob> => {

  const encoder = new GIFEncoder(48, 48);
  const stream = encoder.createReadStream().pipe(blobStream());

  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(150); // frame delay in ms
  encoder.setQuality(1);

  for (const element of elements) {
    if (selectedTraits[element.name]) {
      element.selectedTrait = selectedTraits[element.name];
    } else {
      const trait = getRandomTrait(element.traits);
      element.selectedTrait = trait;
    }
  }

  for (let i = 1; i <= 4; i++) {
    const canvas = createCanvas(48, 48);
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const element of elements) {
      if (element.selectedTrait !== 'None') {
        const filename = `/images/nft/${element.name}/${element.selectedTrait}${i}.png`;
        try {
          const layer = await loadImage(filename);
          ctx.drawImage(layer, 0, 0);
        } catch (error) {
          console.error(`Error loading image ${filename}`, error);
        }
      }
    }
    
    encoder.addFrame(ctx as unknown as ImageData);
  }

  encoder.finish();

  return new Promise((resolve) => {
    stream.on('finish', () => {
      const blob = stream.toBlob('image/gif');
      resolve(blob);
    });
  });
};

const handleGenerateGIF = async (selectedTraits: { [key: string]: string } = {}): Promise<string> => {
  if (typeof document !== 'undefined') {
    const blob = await formGIF(selectedTraits);
    const url = URL.createObjectURL(blob);
    console.log('GIF URL:', url);

    // Update the stylesheet to set the new background image for the player class
    const styleSheet = document.styleSheets[0];
    const rule = `.player { background-image: url(${url}) !important; background-size: cover; }`;

    if (styleSheet.insertRule) {
      styleSheet.insertRule(rule, styleSheet.cssRules.length);
    } else if (styleSheet.addRule) {
      styleSheet.addRule('.player', `background-image: url(${url}) !important; background-size: cover;`);
    }

    return url;
  }
  return '';
};

export default handleGenerateGIF;
