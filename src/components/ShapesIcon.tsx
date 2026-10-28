import { Canvas, Circle, Path, Rect, Skia } from '@shopify/react-native-skia';

/**
 * A triangle over a circle and a square: the custom token's icon (shapes to cut a picture to). There's no SF Symbol
 * like it, so it's drawn, sized and tinted as a symbol is.
 */
export function ShapesIcon({ size, color }: { size: number; color: string }) {
  const u = size / 24;
  const triangle = Skia.Path.Make();
  triangle.moveTo(12 * u, 2 * u);
  triangle.lineTo(17.5 * u, 11 * u);
  triangle.lineTo(6.5 * u, 11 * u);
  triangle.close();
  return (
    <Canvas style={{ width: size, height: size, pointerEvents: 'none' }}>
      <Path path={triangle} color={color} />
      <Circle cx={7 * u} cy={17.5 * u} r={4.5 * u} color={color} />
      <Rect x={13.5 * u} y={13 * u} width={9 * u} height={9 * u} color={color} />
    </Canvas>
  );
}
