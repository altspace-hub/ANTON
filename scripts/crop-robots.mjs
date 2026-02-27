import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../pics_for_landingpage');
const DST = path.join(__dirname, '../public/robots');

// [filename, left, top, width, height]
// Crops designed so the robot lands at vertical centre of a tall portrait panel.
const crops = [
  // Close-up face — already fills portrait frame nicely, light center crop
  ['pexels-kindelmedia-8566428.jpg',  166,  222, 2800, 3733],
  // Laptop wide scene — robot is tiny in right third; crop to portrait around it
  ['pexels-kindelmedia-8566454.jpg', 2840,  513, 1600, 2133],
  // Front-facing robot — centered in landscape; extract center portrait strip
  ['pexels-kindelmedia-8566449.jpg',  228,  167, 2600, 3467],
  // Plant background — robot in lower center; drop the plant-heavy top section
  ['pexels-kindelmedia-8566437.jpg',  544, 1000, 2800, 3733],
  // Robot in hand — centered; extract portrait around hand+robot
  ['pexels-kindelmedia-8566456.jpg', 1400,  611, 2000, 2667],
  // Wide pens scene — robot small at top-center; zoom in
  ['pexels-kindelmedia-8566423.jpg',  944,  667, 2000, 2667],
];

for (const [file, left, top, width, height] of crops) {
  const src = path.join(SRC, file);
  const dst = path.join(DST, file);
  await sharp(src)
    .extract({ left, top, width, height })
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toFile(dst);
  console.log('✓', file);
}
console.log('All done.');
