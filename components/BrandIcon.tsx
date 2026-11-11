import { ImageResponse } from 'next/og';

/** The NV mark as a PNG (favicon, home-screen and install icons share it). */
export function brandIcon(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3ddc97', color: '#04140c', fontSize: size * 0.42, fontWeight: 800, borderRadius: size * 0.22 }}>
        NV
      </div>
    ),
    { width: size, height: size },
  );
}
